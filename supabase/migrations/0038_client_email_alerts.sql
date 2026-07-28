-- Client email alerts. The existing durable outbox and fenced consumer remain the delivery path.
-- Agency mail continues to resolve to AGENCY_EMAIL; client mail captures the tenant's primary
-- decider address at enqueue time, while that address stays outside authenticated grants.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_feature_enabled(uuid,text)') is null
     or pg_catalog.to_regclass('public.notification_outbox') is null
     or pg_catalog.to_regclass('public.client_users') is null then
    raise exception '0037/base notification and access objects must exist before applying 0038';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice31_security;
revoke all on function public.assert_portal_slice31_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice31_security() to service_role;

alter table public.notification_outbox
  add column if not exists recipient_email text;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_recipient_email_lower,
  add constraint notification_outbox_recipient_email_lower
    check (recipient_email is null or recipient_email = pg_catalog.lower(pg_catalog.btrim(recipient_email)));

create or replace function public.portal_client_alert_email(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.lower(pg_catalog.btrim(cu.email))
  from public.client_users cu
  where cu.client_id = p_client_id
    and cu.can_decide
    and pg_catalog.btrim(coalesce(cu.email, '')) <> ''
  order by cu.id
  limit 1
$$;

create or replace function public.portal_enqueue_notification(
  p_client_id uuid, p_recipient_kind text, p_channel text, p_source_kind text,
  p_source_id uuid, p_subject text, p_body text, p_related_url text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_recipient_email text;
  v_related_url text;
begin
  if p_recipient_kind = 'client' and p_channel = 'email' then
    if not public.portal_feature_enabled(p_client_id, 'client_alerts') then
      return;
    end if;
    v_recipient_email := public.portal_client_alert_email(p_client_id);
    if v_recipient_email is null then
      raise exception 'client alert recipient is not configured';
    end if;
  end if;

  -- Never put an agency/admin URL into a client email. Client links are optional; the event
  -- remains useful as text if an upstream writer did not provide a client-safe link.
  v_related_url := case
    when p_recipient_kind = 'client'
      and p_related_url ~ '^https://www[.]thedotcreative[.]co/client(/|$)' then p_related_url
    when p_recipient_kind = 'client' then null
    else p_related_url
  end;

  v_key := p_source_kind || ':' || coalesce(p_source_id::text,'') || ':' || p_recipient_kind || ':' || p_channel;
  insert into public.notification_outbox (
    client_id, recipient_kind, recipient_email, channel, event_key, source_kind, source_activity_id,
    subject, body, related_url, status, next_attempt_at, completed_at
  ) values (
    p_client_id, p_recipient_kind, v_recipient_email, p_channel, v_key, p_source_kind,
    case when p_source_kind = 'activity' then p_source_id else null end,
    p_subject, p_body, v_related_url,
    case when p_channel = 'email' then 'pending' else 'succeeded' end,
    case when p_channel = 'email' then pg_catalog.now() else null end,
    case when p_channel = 'email' then null else pg_catalog.now() end
  )
  on conflict (channel, event_key) do nothing;
end;
$$;

create or replace function public.portal_activity_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_recipient text;
begin
  if new.event_type in ('comment_added','agency_comment_added') then
    return new;
  end if;
  v_recipient := public.portal_notification_recipient(new.actor_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'activity', new.id,
    new.title, coalesce(new.summary,''), new.related_url);
  if v_recipient = 'agency' then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  elsif public.portal_feature_enabled(new.client_id, 'client_alerts') then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  end if;
  return new;
end;
$$;

-- Preserve the comment-target URL behavior from 0036 while adding the client email leg.
create or replace function public.portal_comment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text;
  v_content_key text;
  v_related_url text;
begin
  v_recipient := public.portal_notification_recipient(new.author_type);
  select ci.content_id into v_content_key
  from public.content_items ci
  where ci.id = new.content_id and ci.client_id = new.client_id;
  if v_recipient = 'agency' and v_content_key is not null then
    v_related_url := 'https://www.thedotcreative.co/admin/portal/pieces/' || v_content_key;
  end if;
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'comment', new.id,
    new.author_name || ' commented', pg_catalog.left(new.body, 280), v_related_url);
  if v_recipient = 'agency' then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'comment', new.id,
      new.author_name || ' commented', pg_catalog.left(new.body, 280), v_related_url);
  elsif public.portal_feature_enabled(new.client_id, 'client_alerts') then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'comment', new.id,
      new.author_name || ' commented', pg_catalog.left(new.body, 280), null);
  end if;
  return new;
end;
$$;

revoke all on function public.portal_client_alert_email(uuid) from public, anon, authenticated, service_role;
grant execute on function public.portal_client_alert_email(uuid) to service_role;

-- Authenticated users retain exactly the old safe columns. recipient_email is service-only.
revoke all on public.notification_outbox from public, anon, authenticated, service_role;
grant select(id, client_id, recipient_kind, channel, subject, body, related_url, seen_at, created_at)
  on public.notification_outbox to authenticated;
grant select on public.notification_outbox to service_role;

revoke all on function public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text),
  public.portal_activity_notify(), public.portal_comment_notify()
  from public, anon, authenticated, service_role;
grant execute on function public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)
  to service_role;

create or replace function public.assert_portal_client_email_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actual text[];
  v_expected text[] := array['body','channel','client_id','created_at','id','recipient_kind',
    'related_url','seen_at','subject'];
  v_def text;
begin
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'notification_outbox'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  if v_actual is distinct from v_expected then
    raise exception 'unsafe client notification grants: %', v_actual;
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.notification_outbox','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('anon','public.notification_outbox','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)','EXECUTE')
     or not pg_catalog.has_table_privilege('service_role','public.notification_outbox','SELECT')
     or not pg_catalog.has_function_privilege('service_role','public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)','EXECUTE') then
    raise exception 'unsafe client notification ACL';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.portal_client_alert_email(uuid)'::pg_catalog.regprocedure
      and p.prosecdef and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then raise exception 'client recipient resolver is not hardened'; end if;
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
  from pg_catalog.pg_proc p
  where p.oid = 'public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)'::pg_catalog.regprocedure;
  if v_def is null or v_def not ilike '%portal_feature_enabled%'
     or v_def not ilike '%portal_client_alert_email%' then
    raise exception 'client notification enqueue does not enforce switch and recipient resolution';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger where tgname='portal_activity_notify_ain' and not tgisinternal)
     or not exists (select 1 from pg_catalog.pg_trigger where tgname='portal_comment_notify_ain' and not tgisinternal) then
    raise exception 'notification triggers missing';
  end if;
end;
$$;
revoke all on function public.assert_portal_client_email_security() from public, anon, authenticated;
grant execute on function public.assert_portal_client_email_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice31_security();
  perform public.assert_portal_client_email_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
