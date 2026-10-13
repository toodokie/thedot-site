-- Durable client/agency alerts. activity_log is the single mutation funnel (its RPC is the only
-- writer), so an after-insert trigger enqueues notification_outbox rows transactionally. Comments do
-- not funnel through activity_log, so they get their own trigger. Email is drained by a fenced
-- service-role consumer; in-app unread is read under RLS by the recipient. No existing RPC is rewritten.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.activity_log') is null
     or pg_catalog.to_regclass('public.comments') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null then
    raise exception '0014/base portal objects must exist before applying 0015';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice9_security;
revoke all on function public.assert_portal_slice9_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice9_security() to service_role;

-- ── durable outbox ───────────────────────────────────────────────────────────
create sequence if not exists public.notification_claim_token_seq;

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('client','agency')),
  channel text not null check (channel in ('email','in_app')),
  event_key text not null,
  source_kind text not null check (source_kind in ('activity','comment')),
  source_activity_id uuid,
  subject text not null,
  body text not null,
  related_url text,
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','abandoned','skipped')),
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  claim_token bigint,
  claimed_by text,
  claim_expires_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  unique (channel, event_key)
);
create index notification_outbox_pending
  on public.notification_outbox (status, next_attempt_at, created_at) where channel = 'email';
create index notification_outbox_unread
  on public.notification_outbox (client_id, recipient_kind, seen_at) where channel = 'in_app';

alter table public.notification_outbox enable row level security;
create policy notification_outbox_client_read on public.notification_outbox
  for select to authenticated
  using (channel = 'in_app' and recipient_kind = 'client'
         and client_id in (select public.my_client_ids()));

-- ── routing ──────────────────────────────────────────────────────────────────
create or replace function public.portal_notification_recipient(p_actor_type text)
returns text language sql immutable set search_path = '' as $$
  select case when p_actor_type = 'client' then 'agency' else 'client' end
$$;

create or replace function public.portal_enqueue_notification(
  p_client_id uuid, p_recipient_kind text, p_channel text, p_source_kind text,
  p_source_id uuid, p_subject text, p_body text, p_related_url text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  v_key := p_source_kind || ':' || coalesce(p_source_id::text,'') || ':' || p_recipient_kind || ':' || p_channel;
  insert into public.notification_outbox (
    client_id, recipient_kind, channel, event_key, source_kind, source_activity_id,
    subject, body, related_url, status, next_attempt_at, completed_at
  ) values (
    p_client_id, p_recipient_kind, p_channel, v_key, p_source_kind,
    case when p_source_kind = 'activity' then p_source_id else null end,
    p_subject, p_body, p_related_url,
    -- in_app rows have no delivery lifecycle (read in place via seen_at), so they are terminal at
    -- enqueue and never sit 'pending' forever. Only email rows enter the fenced-consumer lifecycle.
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
  -- Comments are notified through portal_comment_notify. A comment writes BOTH a comment row and a
  -- comment_added/agency_comment_added activity, so skip the activity mirror here to avoid duplicates.
  if new.event_type in ('comment_added','agency_comment_added') then
    return new;
  end if;
  v_recipient := public.portal_notification_recipient(new.actor_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'activity', new.id,
    new.title, coalesce(new.summary,''), new.related_url);
  -- email is push-only for the agency (not watching the portal). The client is alerted in-app; no
  -- unprompted client email in v1, matching the pre-portal system that only ever emailed The Dot.
  if v_recipient = 'agency' then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  end if;
  return new;
end;
$$;
create trigger portal_activity_notify_ain
  after insert on public.activity_log
  for each row execute function public.portal_activity_notify();

create or replace function public.portal_comment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_recipient text;
begin
  v_recipient := public.portal_notification_recipient(new.author_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'comment', new.id,
    new.author_name || ' commented', pg_catalog.left(new.body, 280), null);
  -- email only to the agency (client is alerted in-app), consistent with the activity trigger
  if v_recipient = 'agency' then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'comment', new.id,
      new.author_name || ' commented', pg_catalog.left(new.body, 280), null);
  end if;
  return new;
end;
$$;
create trigger portal_comment_notify_ain
  after insert on public.comments
  for each row execute function public.portal_comment_notify();

-- ── fenced email consumer (service_role only) ────────────────────────────────
create or replace function public.claim_notification_batch(p_worker text, p_limit int, p_claim_seconds int)
returns setof public.notification_outbox language plpgsql security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'invalid p_limit'; end if;
  if p_claim_seconds is null or p_claim_seconds < 1 or p_claim_seconds > 3600 then
    raise exception 'invalid p_claim_seconds'; end if;
  return query
  update public.notification_outbox n set
    status = 'processing',
    claim_token = pg_catalog.nextval('public.notification_claim_token_seq'::pg_catalog.regclass),
    claimed_by = p_worker,
    claim_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_claim_seconds),
    attempts = n.attempts + 1
  where n.id in (
    select c.id from public.notification_outbox c
    where c.channel = 'email'
      and (
        (c.status = 'pending' and (c.next_attempt_at is null or c.next_attempt_at <= pg_catalog.now()))
        or (c.status = 'processing' and c.claim_expires_at < pg_catalog.now())
      )
    order by c.created_at
    limit p_limit
    for update skip locked
  )
  returning n.*;
end;
$$;

create or replace function public.mark_notification_succeeded(p_id uuid, p_claim_token bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_outbox set
    status = 'succeeded', completed_at = pg_catalog.now(),
    claim_token = null, claimed_by = null, claim_expires_at = null
  where id = p_id and claim_token = p_claim_token and status = 'processing';
end;
$$;

create or replace function public.mark_notification_failed(p_id uuid, p_claim_token bigint, p_error text, p_max_attempts int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 100 then
    raise exception 'invalid p_max_attempts'; end if;
  update public.notification_outbox n set
    status = case when n.attempts >= p_max_attempts then 'abandoned' else 'pending' end,
    last_error = p_error,
    next_attempt_at = case when n.attempts >= p_max_attempts then null
      else pg_catalog.now() + pg_catalog.make_interval(
        secs => least(3600, (30 * pg_catalog.power(2, n.attempts))::int)) end,
    claim_token = null, claimed_by = null, claim_expires_at = null
  where n.id = p_id and n.claim_token = p_claim_token and n.status = 'processing';
end;
$$;

-- ── client mark-seen (RLS-scoped) ────────────────────────────────────────────
create or replace function public.mark_notification_seen(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_outbox set seen_at = pg_catalog.now()
  where id = p_id and channel = 'in_app' and recipient_kind = 'client'
    and client_id in (select public.my_client_ids()) and seen_at is null;
end;
$$;

-- ── grants ───────────────────────────────────────────────────────────────────
revoke all on public.notification_outbox from public,anon,authenticated;
grant select(id,client_id,recipient_kind,channel,subject,body,related_url,seen_at,created_at)
  on public.notification_outbox to authenticated;
grant select on public.notification_outbox to service_role;

revoke all on function
  public.claim_notification_batch(text,int,int),
  public.mark_notification_succeeded(uuid,bigint),
  public.mark_notification_failed(uuid,bigint,text,int)
  from public,anon,authenticated;
grant execute on function
  public.claim_notification_batch(text,int,int),
  public.mark_notification_succeeded(uuid,bigint),
  public.mark_notification_failed(uuid,bigint,text,int)
  to service_role;

revoke all on function public.mark_notification_seen(uuid) from public,anon,authenticated;
grant execute on function public.mark_notification_seen(uuid) to authenticated,service_role;

revoke all on function
  public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text),
  public.portal_activity_notify(), public.portal_comment_notify()
  from public,anon,authenticated;
grant execute on function public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text) to service_role;

revoke all on function public.portal_notification_recipient(text) from public,anon,authenticated;
grant execute on function public.portal_notification_recipient(text) to service_role,authenticated;

-- ── in-migration security assertion ──────────────────────────────────────────
create or replace function public.assert_portal_notifications_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_actual text[]; v_expected text[];
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid='public.notification_outbox'::pg_catalog.regclass) then
    raise exception 'notification_outbox RLS disabled'; end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
    from information_schema.column_privileges cp where cp.table_schema='public'
      and cp.table_name='notification_outbox' and cp.grantee='authenticated'
      and cp.privilege_type='SELECT';
  v_expected := array['body','channel','client_id','created_at','id','recipient_kind',
    'related_url','seen_at','subject'];
  if v_actual is distinct from v_expected then
    raise exception 'unsafe notification grants: %', v_actual; end if;

  if pg_catalog.has_table_privilege('authenticated','public.notification_outbox','INSERT,UPDATE,DELETE') then
    raise exception 'direct authenticated notification write detected'; end if;

  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('portal_enqueue_notification','portal_activity_notify',
      'portal_comment_notify','claim_notification_batch','mark_notification_succeeded',
      'mark_notification_failed','mark_notification_seen')
      and (not p.prosecdef or not(coalesce(p.proconfig,'{}'::text[])@>array['search_path=""']))) then
    raise exception 'notification function is not hardened'; end if;

  if pg_catalog.has_function_privilege('authenticated','public.claim_notification_batch(text,integer,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.claim_notification_batch(text,integer,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.mark_notification_succeeded(uuid,bigint)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.mark_notification_failed(uuid,bigint,text,integer)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.claim_notification_batch(text,integer,integer)','EXECUTE') then
    raise exception 'unsafe notification consumer privilege'; end if;

  -- exact ACL: anon is fully locked out of the table and every RPC; service_role holds the full set
  if pg_catalog.has_table_privilege('anon','public.notification_outbox','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_function_privilege('anon','public.mark_notification_seen(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.mark_notification_succeeded(uuid,bigint)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.mark_notification_failed(uuid,bigint,text,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)','EXECUTE')
     or not pg_catalog.has_table_privilege('service_role','public.notification_outbox','SELECT')
     or not pg_catalog.has_function_privilege('service_role','public.mark_notification_succeeded(uuid,bigint)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.mark_notification_failed(uuid,bigint,text,integer)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)','EXECUTE') then
    raise exception 'unsafe notification ACL'; end if;

  if not pg_catalog.has_function_privilege('authenticated','public.mark_notification_seen(uuid)','EXECUTE') then
    raise exception 'client cannot mark notifications seen'; end if;

  if not exists(select 1 from pg_catalog.pg_trigger where tgname='portal_activity_notify_ain' and not tgisinternal)
     or not exists(select 1 from pg_catalog.pg_trigger where tgname='portal_comment_notify_ain' and not tgisinternal) then
    raise exception 'notification trigger missing'; end if;
end;
$$;
revoke all on function public.assert_portal_notifications_security() from public,anon,authenticated;
grant execute on function public.assert_portal_notifications_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice9_security();
  perform public.assert_portal_notifications_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
