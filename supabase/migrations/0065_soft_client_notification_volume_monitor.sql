-- Replace the hard client-email ceiling with a soft internal monitor. Important review,
-- invoice, and direct-reply emails must never be silently held because a count was reached.
-- Quiet event routing remains the noise control; volume at three opens an agency-only Ops task.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_client_email_volume_limit()') is null
     or pg_catalog.to_regprocedure('public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.add_ops_task(uuid,text,text,date,text,text,text,text,text)') is null then
    raise exception '0065 requires client notification volume monitoring';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice64_security;
revoke all on function public.assert_portal_slice64_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice64_security() to service_role;

create function public.portal_client_email_volume_review_threshold()
returns int
language sql
immutable
set search_path = ''
as $$ select 3 $$;

create or replace function public.portal_enqueue_notification(
  p_client_id uuid, p_recipient_kind text, p_channel text, p_source_kind text,
  p_source_id uuid, p_subject text, p_body text, p_related_url text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_recipient_email text;
  v_related_url text;
  v_recent_count int := 0;
  v_notification_id uuid;
  v_local_date date := (pg_catalog.now() at time zone 'America/Toronto')::date;
begin
  if p_recipient_kind = 'client' and p_channel = 'email' then
    if not public.portal_feature_enabled(p_client_id, 'client_alerts') then
      return;
    end if;
    v_recipient_email := public.portal_client_alert_email(p_client_id);
    if v_recipient_email is null then
      raise exception 'client alert recipient is not configured';
    end if;

    select pg_catalog.count(*)::int into v_recent_count
    from public.notification_outbox n
    where n.client_id = p_client_id
      and n.recipient_kind = 'client'
      and n.channel = 'email'
      and n.created_at > pg_catalog.now() - interval '24 hours'
      and n.status not in ('abandoned','skipped');
  end if;

  v_related_url := case
    when p_recipient_kind = 'client'
      and p_related_url ~ '^https://www[.]thedotcreative[.]co/client(/|$)' then p_related_url
    when p_recipient_kind = 'client' then null
    else p_related_url
  end;

  v_key := p_source_kind || ':' || coalesce(p_source_id::text,'') || ':' || p_recipient_kind || ':' || p_channel;
  insert into public.notification_outbox (
    client_id, recipient_kind, recipient_email, channel, event_key, source_kind, source_activity_id,
    subject, body, related_url, status, next_attempt_at, last_error, completed_at
  ) values (
    p_client_id, p_recipient_kind, v_recipient_email, p_channel, v_key, p_source_kind,
    case when p_source_kind = 'activity' then p_source_id else null end,
    p_subject, p_body, v_related_url,
    case when p_channel = 'email' then 'pending' else 'succeeded' end,
    case when p_channel = 'email' then pg_catalog.now() else null end,
    null,
    case when p_channel = 'email' then null else pg_catalog.now() end
  )
  on conflict (channel, event_key) do nothing
  returning id into v_notification_id;

  if v_notification_id is not null
     and p_recipient_kind = 'client'
     and p_channel = 'email'
     and v_recent_count + 1 >= public.portal_client_email_volume_review_threshold() then
    perform public.add_ops_task(
      p_client_id,
      'Review client notification volume',
      'portal',
      v_local_date,
      'Client email volume reached the three-message rolling 24-hour review threshold. Important email remains enabled. Review the notification audit before creating more client alerts.',
      'agent',
      'Automatic soft portal notification monitor, migration 0065',
      'thedot-admin',
      'notification-volume-soft:' || p_client_id::text || ':' || v_local_date::text
    );
  end if;
end;
$$;

-- Replace the assertion used inside the preserved 0063 security chain so it proves
-- that the old hard-stop behavior is gone.
create or replace function public.assert_portal_client_notification_volume_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if public.portal_client_email_volume_review_threshold() <> 3
     or v_def is null
     or v_def not ilike '%interval ''24 hours''%'
     or v_def not ilike '%Review client notification volume%'
     or v_def not ilike '%v_recent_count + 1 >= public.portal_client_email_volume_review_threshold()%'
     or v_def ilike '%v_status = ''skipped''%' then
    raise exception 'soft client notification volume monitor drifted';
  end if;
end;
$$;

drop function public.portal_client_email_volume_limit();

revoke all on function public.portal_client_email_volume_review_threshold(),
  public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.portal_client_email_volume_review_threshold(),
  public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)
  to service_role;

create function public.assert_portal_soft_client_notification_monitor_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.to_regprocedure('public.portal_client_email_volume_limit()') is not null
     or pg_catalog.has_function_privilege('anon','public.portal_client_email_volume_review_threshold()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_client_email_volume_review_threshold()','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_client_email_volume_review_threshold()','EXECUTE') then
    raise exception 'soft client notification monitor grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_soft_client_notification_monitor_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_soft_client_notification_monitor_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice64_security();
  perform public.assert_portal_soft_client_notification_monitor_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
