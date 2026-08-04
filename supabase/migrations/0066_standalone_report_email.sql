-- Queue one explicit, dedicated email when a complete standalone monthly report is ready.
-- Platform snapshot writes remain portal-only so a multi-platform report cannot generate a burst.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_client_activity_email_required(text)') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null
     or pg_catalog.to_regclass('public.notification_outbox') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null then
    raise exception '0066 requires the existing portal notification system';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice65_security;
revoke all on function public.assert_portal_slice65_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice65_security() to service_role;

insert into public.activity_event_types(event_type)
values ('monthly_report_ready')
on conflict do nothing;

alter table public.notification_outbox
  add column template_key text not null default 'generic'
  check (template_key in ('generic','report'));

create or replace function public.portal_client_activity_email_required(p_event_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_event_type in (
    'needs_review',
    'plan_cycle_submitted',
    'proposal_submitted',
    'proposal_revised',
    'invoice_issued',
    'request_replied',
    'proposal_message',
    'monthly_report_ready'
  )
$$;

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
  v_activity_event_type text;
  v_template_key text := 'generic';
begin
  if p_source_kind = 'activity' and p_source_id is not null then
    select a.event_type into v_activity_event_type
    from public.activity_log a
    where a.id = p_source_id and a.client_id = p_client_id;
    if v_activity_event_type = 'monthly_report_ready' then
      v_template_key := 'report';
    end if;
  end if;

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
    subject, body, related_url, template_key, status, next_attempt_at, last_error, completed_at
  ) values (
    p_client_id, p_recipient_kind, v_recipient_email, p_channel, v_key, p_source_kind,
    case when p_source_kind = 'activity' then p_source_id else null end,
    p_subject, p_body, v_related_url, v_template_key,
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

create function public.notify_portal_report_ready(
  p_client_id uuid,
  p_report_key text,
  p_period_label text,
  p_recipient_name text,
  p_subject text,
  p_body text,
  p_report_url text,
  p_actor_key text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_client_slug text;
  v_expected_url text;
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_activity_id uuid;
begin
  select * into v_actor
  from public.agency_actors
  where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;

  select c.slug into v_client_slug from public.clients c where c.id = p_client_id;
  if v_client_slug is null then raise exception 'client not found'; end if;

  v_expected_url := 'https://www.thedotcreative.co/client/' || v_client_slug || '/reports/' || p_report_key;
  if p_report_key !~ '^[a-z0-9][a-z0-9-]{0,99}$'
     or pg_catalog.char_length(pg_catalog.btrim(p_period_label)) not between 1 and 80
     or pg_catalog.char_length(pg_catalog.btrim(p_recipient_name)) not between 1 and 80
     or p_period_label ~ '[\r\n]'
     or p_recipient_name ~ '[\r\n]'
     or pg_catalog.char_length(pg_catalog.btrim(p_subject)) not between 1 and 300
     or pg_catalog.char_length(pg_catalog.btrim(p_body)) not between 1 and 2000
     or not public.portal_client_summary_shape_valid(p_period_label)
     or not public.portal_client_summary_shape_valid(p_recipient_name)
     or not public.portal_client_summary_shape_valid(p_subject)
     or not public.portal_client_summary_shape_valid(p_body)
     or p_report_url <> v_expected_url
     or pg_catalog.char_length(pg_catalog.btrim(p_idempotency_key)) not between 1 and 200 then
    raise exception 'invalid report notification';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'report_key', p_report_key,
      'period_label', p_period_label,
      'recipient_name', p_recipient_name,
      'subject', p_subject,
      'body', p_body,
      'report_url', p_report_url
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  select * into v_receipt
  from public.portal_command_receipts
  where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'notify_report_ready'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return (v_receipt.response->>'activity_id')::uuid;
  end if;

  insert into public.activity_log(
    client_id, event_type, event_key, title, summary, actor_type, actor_name, related_url
  ) values (
    p_client_id,
    'monthly_report_ready',
    'agency:report-ready:' || p_report_key,
    pg_catalog.btrim(p_subject),
    pg_catalog.btrim(p_body),
    'anastasia',
    v_actor.display_name,
    p_report_url
  ) returning id into v_activity_id;

  insert into public.portal_command_receipts(
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    p_client_id,
    'notify_report_ready',
    p_idempotency_key,
    v_fingerprint,
    pg_catalog.jsonb_build_object('activity_id', v_activity_id)
  );

  return v_activity_id;
end;
$$;

revoke all on function public.portal_client_activity_email_required(text),
  public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text),
  public.notify_portal_report_ready(uuid,text,text,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.portal_client_activity_email_required(text),
  public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text),
  public.notify_portal_report_ready(uuid,text,text,text,text,text,text,text,text)
  to service_role;

create function public.assert_portal_standalone_report_email_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enqueue_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)'::pg_catalog.regprocedure
  ) into v_enqueue_def;

  if not public.portal_client_activity_email_required('monthly_report_ready')
     or public.portal_client_activity_email_required('monthly_report_added')
     or v_enqueue_def is null
     or v_enqueue_def not ilike '%monthly_report_ready%'
     or v_enqueue_def not ilike '%v_template_key := ''report''%' then
    raise exception 'standalone report email routing drifted';
  end if;

  if pg_catalog.has_function_privilege('anon','public.notify_portal_report_ready(uuid,text,text,text,text,text,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.notify_portal_report_ready(uuid,text,text,text,text,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.notify_portal_report_ready(uuid,text,text,text,text,text,text,text,text)','EXECUTE') then
    raise exception 'standalone report email grants are unsafe';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.notify_portal_report_ready(uuid,text,text,text,text,text,text,text,text)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'standalone report email function is not hardened';
  end if;
end;
$$;

revoke all on function public.assert_portal_standalone_report_email_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_standalone_report_email_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice65_security();
  perform public.assert_portal_standalone_report_email_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
