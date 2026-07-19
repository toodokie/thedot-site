-- Slice 5: resilient two-way Google Calendar coordination.
-- Supabase remains authoritative. Calendar events never prove provider scheduling/publication.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_schedule_targets') is null
     or pg_catalog.to_regclass('public.content_publication_targets') is null then
    raise exception '0009 publication objects must exist before applying 0010';
  end if;
end;
$$;
select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice4_security;
revoke all on function public.assert_portal_slice4_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice4_security() to service_role;

insert into public.activity_event_types(event_type) values
  ('calendar_event_changed'), ('calendar_event_deleted'), ('calendar_sync_conflict')
on conflict (event_type) do nothing;

-- OAuth refresh tokens are envelope-encrypted by the application. The key is environment-only.
create table public.calendar_credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ciphertext text not null check (pg_catalog.char_length(ciphertext) between 40 and 8192),
  iv text not null check (pg_catalog.char_length(iv) between 16 and 64),
  auth_tag text not null check (pg_catalog.char_length(auth_tag) between 16 and 64),
  key_version smallint not null default 1 check (key_version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  rotated_at timestamptz,
  unique (id, client_id)
);

create table public.calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  credential_id uuid not null,
  provider text not null default 'google' check (provider = 'google'),
  calendar_id text not null check (pg_catalog.char_length(calendar_id) between 3 and 1024),
  display_name text not null check (pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 200),
  timezone text not null default 'America/Toronto' check (timezone = 'America/Toronto'),
  owner_email text not null check (owner_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  access_role text not null check (access_role in ('owner','writer')),
  status text not null default 'active' check (status in ('active','reauth_required','disabled','deleted')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (provider, calendar_id),
  foreign key (credential_id, client_id)
    references public.calendar_credentials(id, client_id) on delete restrict
);

create table public.calendar_sync_state (
  integration_id uuid primary key,
  client_id uuid not null,
  sync_token text,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  last_reconciled_at timestamptz,
  next_reconcile_at timestamptz,
  health text not null default 'setup_required'
    check (health in ('setup_required','healthy','degraded','reauth_required','acl_drift','calendar_missing','disabled')),
  consecutive_failures int not null default 0 check (consecutive_failures >= 0),
  last_error text check (last_error is null or pg_catalog.char_length(last_error) <= 1000),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (integration_id, client_id)
    references public.calendar_integrations(id, client_id) on delete cascade
);

create table public.calendar_watch_channels (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  client_id uuid not null,
  channel_id text not null unique check (pg_catalog.char_length(channel_id) between 16 and 200),
  resource_id text not null check (pg_catalog.char_length(resource_id) between 8 and 500),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  stopped_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (integration_id, client_id)
    references public.calendar_integrations(id, client_id) on delete cascade,
  check (expires_at > created_at)
);
create index calendar_watch_channels_active
  on public.calendar_watch_channels(integration_id, expires_at) where stopped_at is null;

create table public.calendar_event_mappings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  integration_id uuid not null,
  content_id uuid not null,
  content_version int not null check (content_version > 0),
  schedule_target_id uuid,
  event_role text not null check (event_role in ('editorial_plan','schedule_summary')),
  stable_key text not null check (stable_key ~ '^portal:[0-9a-f-]{36}:[0-9a-f-]{36}:(editorial|schedule:[a-z]+)$'),
  event_id text not null check (pg_catalog.char_length(event_id) between 1 and 1024),
  event_etag text not null check (pg_catalog.char_length(event_etag) between 1 and 1024),
  event_updated_at timestamptz not null,
  event_html_link text check (event_html_link is null or event_html_link ~ '^https://(calendar\.google\.com|www\.google\.com/calendar)/'),
  event_start_date date,
  event_start_at timestamptz,
  event_end_at timestamptz,
  portal_projection_revision bigint not null check (portal_projection_revision >= 0),
  last_confirmed_revision bigint not null check (last_confirmed_revision >= 0),
  sync_status text not null default 'pending'
    check (sync_status in ('pending','confirmed','conflicted','failed','unlinked','deleted')),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_reconciled_at timestamptz,
  last_error text check (last_error is null or pg_catalog.char_length(last_error) <= 1000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (integration_id, stable_key),
  unique (integration_id, event_id),
  foreign key (integration_id, client_id)
    references public.calendar_integrations(id, client_id) on delete cascade,
  foreign key (content_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade,
  foreign key (schedule_target_id, client_id)
    references public.content_schedule_targets(id, client_id) on delete cascade,
  check ((event_role = 'editorial_plan' and schedule_target_id is null)
      or (event_role = 'schedule_summary' and schedule_target_id is not null)),
  check ((event_start_date is not null and event_start_at is null and event_end_at is null)
      or (event_start_date is null and event_start_at is not null and event_end_at > event_start_at)),
  check (last_confirmed_revision <= portal_projection_revision)
);
create unique index calendar_mapping_active_editorial
  on public.calendar_event_mappings(integration_id, content_id, event_role)
  where event_role='editorial_plan' and sync_status <> 'deleted';

create table public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  client_id uuid not null,
  job_type text not null check (job_type in ('outbound','incremental','full','renew_watch','reconcile','acl_check')),
  dedupe_key text not null check (pg_catalog.char_length(dedupe_key) between 8 and 300),
  payload jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(payload)='object'),
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','abandoned')),
  attempts int not null default 0 check (attempts >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default pg_catalog.now(),
  last_error text check (last_error is null or pg_catalog.char_length(last_error) <= 1000),
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  unique (integration_id, dedupe_key),
  foreign key (integration_id, client_id)
    references public.calendar_integrations(id, client_id) on delete cascade,
  check ((status='processing') = (lease_token is not null and lease_expires_at is not null)),
  check ((status='succeeded') = (completed_at is not null) or status <> 'succeeded')
);
create index calendar_sync_jobs_ready
  on public.calendar_sync_jobs(status,next_attempt_at,created_at);

create table public.calendar_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null,
  message_number bigint not null check (message_number >= 0),
  resource_state text not null check (resource_state in ('sync','exists','not_exists')),
  received_at timestamptz not null default pg_catalog.now(),
  unique (channel_id, message_number),
  foreign key (channel_id) references public.calendar_watch_channels(channel_id) on delete cascade
);

create table public.calendar_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  integration_id uuid not null,
  mapping_id uuid not null,
  conflict_key text not null,
  kind text not null check (kind in ('simultaneous_edit','delete_with_commitment','ambiguous_time','mapping_integrity','acl_drift','unmapped_event')),
  portal_revision bigint not null check (portal_revision >= 0),
  google_etag text,
  google_start_date date,
  google_deleted boolean not null default false,
  safe_summary text not null check (pg_catalog.char_length(safe_summary) between 1 and 500),
  status text not null default 'open' check (status in ('open','resolved_portal','resolved_google','dismissed')),
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or pg_catalog.char_length(resolution_note) <= 1000),
  unique (integration_id, conflict_key),
  foreign key (integration_id, client_id)
    references public.calendar_integrations(id, client_id) on delete cascade,
  foreign key (mapping_id, client_id)
    references public.calendar_event_mappings(id, client_id) on delete cascade,
  check ((status='open') = (resolved_at is null))
);

create table public.calendar_unmapped_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  client_id uuid not null,
  event_id text not null check (pg_catalog.char_length(event_id) between 1 and 1024),
  event_etag text,
  event_updated_at timestamptz,
  event_summary text check (event_summary is null or pg_catalog.char_length(event_summary) <= 500),
  event_start_date date,
  event_start_at timestamptz,
  event_end_at timestamptz,
  reason text not null check (reason in ('missing_private_key','invalid_private_key','wrong_integration','unknown_mapping')),
  status text not null default 'open' check (status in ('open','ignored','resolved')),
  resolution_note text check (resolution_note is null or pg_catalog.char_length(resolution_note) <= 1000),
  first_seen_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  unique (integration_id,event_id),
  foreign key (integration_id,client_id)
    references public.calendar_integrations(id,client_id) on delete cascade
);

create table public.calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  requested_calendar_id text not null check (pg_catalog.char_length(requested_calendar_id) between 3 and 1024),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  check (expires_at > created_at)
);

-- Only event mappings have a deliberately narrow client read boundary. All sync/OAuth/credential
-- state is service-only, including calendar IDs, Google event IDs, webhook tokens, and errors.
alter table public.calendar_credentials enable row level security;
alter table public.calendar_integrations enable row level security;
alter table public.calendar_sync_state enable row level security;
alter table public.calendar_watch_channels enable row level security;
alter table public.calendar_event_mappings enable row level security;
alter table public.calendar_sync_jobs enable row level security;
alter table public.calendar_webhook_receipts enable row level security;
alter table public.calendar_sync_conflicts enable row level security;
alter table public.calendar_unmapped_events enable row level security;
alter table public.calendar_oauth_states enable row level security;

create policy calendar_mappings_read on public.calendar_event_mappings for select
  using (client_id in (select public.my_client_ids()));

create view public.calendar_events_client
with (security_invoker=true) as
select m.id,m.client_id,m.content_id,m.content_version,m.event_role,m.schedule_target_id,
  m.event_html_link,m.event_start_date,m.event_start_at,m.event_end_at,m.sync_status,
  m.last_reconciled_at,
  case when m.sync_status='conflicted' then 'Agency reconciliation required'
       when m.sync_status='deleted' then 'Calendar hold removed'
       when m.sync_status='confirmed' then 'Synced with the shared calendar'
       else 'Calendar synchronization pending' end as sync_label
from public.calendar_event_mappings m;

revoke all on table public.calendar_credentials,public.calendar_integrations,
  public.calendar_sync_state,public.calendar_watch_channels,public.calendar_event_mappings,
  public.calendar_sync_jobs,public.calendar_webhook_receipts,public.calendar_sync_conflicts,
  public.calendar_unmapped_events,public.calendar_oauth_states,public.calendar_events_client
  from public,anon,authenticated,service_role;
grant select(id,client_id,content_id,content_version,event_role,schedule_target_id,event_html_link,
  event_start_date,event_start_at,event_end_at,sync_status,last_reconciled_at)
  on public.calendar_event_mappings to authenticated;
grant select on public.calendar_events_client to authenticated;
grant all on table public.calendar_credentials,public.calendar_integrations,
  public.calendar_sync_state,public.calendar_watch_channels,public.calendar_event_mappings,
  public.calendar_sync_jobs,public.calendar_webhook_receipts,public.calendar_sync_conflicts,
  public.calendar_unmapped_events,public.calendar_oauth_states to service_role;
grant select on public.calendar_events_client to service_role;

-- Fast webhook validation and durable enqueue. The raw token is compared by digest and never stored.
create or replace function public.accept_calendar_webhook(
  p_channel_id text,p_resource_id text,p_channel_token text,p_message_number bigint,p_resource_state text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_channel public.calendar_watch_channels%rowtype;
begin
  if p_message_number < 0 or p_resource_state not in ('sync','exists','not_exists') then return false; end if;
  select * into v_channel from public.calendar_watch_channels c
  where c.channel_id=p_channel_id and c.resource_id=p_resource_id and c.stopped_at is null
    and c.expires_at > pg_catalog.now() - interval '5 minutes'
    and c.token_hash=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_channel_token,'UTF8'),'sha256'),'hex');
  if not found then return false; end if;
  insert into public.calendar_webhook_receipts(channel_id,message_number,resource_state)
    values(p_channel_id,p_message_number,p_resource_state) on conflict do nothing;
  insert into public.calendar_sync_jobs(integration_id,client_id,job_type,dedupe_key,payload)
    values(v_channel.integration_id,v_channel.client_id,'incremental',
      'webhook:'||p_channel_id||':'||p_message_number::text,
      pg_catalog.jsonb_build_object('channel_id',p_channel_id,'message_number',p_message_number))
    on conflict(integration_id,dedupe_key) do nothing;
  return true;
end; $$;

create or replace function public.claim_calendar_sync_jobs(p_limit int,p_lease_seconds int)
returns setof public.calendar_sync_jobs language plpgsql security definer set search_path='' as $$
begin
  if p_limit not between 1 and 25 or p_lease_seconds not between 30 and 900 then
    raise exception 'invalid lease request'; end if;
  return query
  with selected as (
    select candidate.id from public.calendar_integrations i
    cross join lateral (
      select j.id from public.calendar_sync_jobs j
      where j.integration_id=i.id
        and (j.status='pending' or (j.status='processing' and j.lease_expires_at < pg_catalog.now()))
        and j.next_attempt_at <= pg_catalog.now()
        and not exists(select 1 from public.calendar_sync_jobs active
          where active.integration_id=i.id and active.status='processing'
            and active.lease_expires_at >= pg_catalog.now() and active.id<>j.id)
      order by j.created_at for update skip locked limit 1
    ) candidate
    where i.status='active' limit p_limit
  )
  update public.calendar_sync_jobs j set status='processing',attempts=j.attempts+1,
    lease_token=gen_random_uuid(),lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>p_lease_seconds)
  from selected where j.id=selected.id returning j.*;
end; $$;

create or replace function public.finish_calendar_sync_job(
  p_job_id uuid,p_lease_token uuid,p_succeeded boolean,p_error text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_attempts int;
begin
  update public.calendar_sync_jobs j set
    status=case when p_succeeded then 'succeeded' when j.attempts>=8 then 'abandoned' else 'pending' end,
    completed_at=case when p_succeeded then pg_catalog.now() else null end,
    next_attempt_at=case when p_succeeded then j.next_attempt_at
      else pg_catalog.now()+pg_catalog.make_interval(secs=>least(3600,30*(2^least(j.attempts,7))::int)) end,
    last_error=case when p_succeeded then null else pg_catalog.left(coalesce(p_error,'calendar job failed'),1000) end,
    lease_token=null,lease_expires_at=null
  where j.id=p_job_id and j.status='processing' and j.lease_token=p_lease_token
  returning attempts into v_attempts;
  return found;
end; $$;

create or replace function public.record_calendar_unmapped_event(
  p_integration_id uuid,p_event_id text,p_event_etag text,p_event_updated_at timestamptz,
  p_event_summary text,p_event_start_date date,p_event_start_at timestamptz,p_event_end_at timestamptz,
  p_reason text
) returns void language plpgsql security definer set search_path='' as $$
declare v_i public.calendar_integrations%rowtype;
begin
  select * into v_i from public.calendar_integrations where id=p_integration_id and status='active';
  if not found or p_reason not in ('missing_private_key','invalid_private_key','wrong_integration','unknown_mapping') then
    raise exception 'invalid unmapped event'; end if;
  insert into public.calendar_unmapped_events(integration_id,client_id,event_id,event_etag,
    event_updated_at,event_summary,event_start_date,event_start_at,event_end_at,reason)
  values(v_i.id,v_i.client_id,p_event_id,p_event_etag,p_event_updated_at,
    pg_catalog.left(pg_catalog.regexp_replace(coalesce(p_event_summary,''),'[[:cntrl:]]','','g'),500),
    p_event_start_date,p_event_start_at,p_event_end_at,p_reason)
  on conflict(integration_id,event_id) do update set event_etag=excluded.event_etag,
    event_updated_at=excluded.event_updated_at,event_summary=excluded.event_summary,
    event_start_date=excluded.event_start_date,event_start_at=excluded.event_start_at,
    event_end_at=excluded.event_end_at,reason=excluded.reason,last_seen_at=pg_catalog.now(),status='open';
end; $$;

create or replace function public.link_calendar_unmapped_event(
  p_unmapped_id uuid,p_content_id uuid,p_content_version int,p_note text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_u public.calendar_unmapped_events%rowtype; v_ci public.content_items%rowtype;
  v_stable text; v_mapping uuid;
begin
  if p_note is null or pg_catalog.char_length(pg_catalog.btrim(p_note)) not between 3 and 1000
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,128}$' then raise exception 'invalid reviewed calendar mapping'; end if;
  select * into v_u from public.calendar_unmapped_events where id=p_unmapped_id for update;
  if not found then raise exception 'unmapped calendar event not found'; end if;
  select * into v_ci from public.content_items where id=p_content_id and client_id=v_u.client_id for update;
  if not found or not v_ci.client_visible or v_ci.client_visible_version is distinct from p_content_version
     or v_ci.archived_at is not null then raise exception 'content is not eligible for calendar mapping'; end if;
  v_stable:='portal:'||v_u.integration_id::text||':'||v_ci.id::text||':editorial';
  insert into public.calendar_event_mappings(client_id,integration_id,content_id,content_version,event_role,
    stable_key,event_id,event_etag,event_updated_at,event_start_date,event_start_at,event_end_at,
    portal_projection_revision,last_confirmed_revision,sync_status,last_inbound_at,last_error)
  values(v_ci.client_id,v_u.integration_id,v_ci.id,p_content_version,'editorial_plan',v_stable,
    v_u.event_id,coalesce(v_u.event_etag,'reviewed-unmapped'),coalesce(v_u.event_updated_at,pg_catalog.now()),
    v_u.event_start_date,v_u.event_start_at,v_u.event_end_at,v_ci.projection_revision,
    v_ci.projection_revision,'pending',pg_catalog.now(),'Awaiting reviewed outbound reconciliation')
  returning id into v_mapping;
  update public.calendar_unmapped_events set status='resolved',last_seen_at=pg_catalog.now() where id=v_u.id;
  insert into public.calendar_sync_jobs(integration_id,client_id,job_type,dedupe_key,payload)
  values(v_u.integration_id,v_ci.client_id,'outbound','link:'||p_idempotency_key,
    pg_catalog.jsonb_build_object('content_id',v_ci.id,'content_version',p_content_version,
      'portal_revision',v_ci.projection_revision,'review_note',pg_catalog.btrim(p_note)))
  on conflict(integration_id,dedupe_key) do nothing;
  return v_mapping;
exception when unique_violation then raise exception 'calendar event or content already mapped';
end; $$;

create or replace function public.record_calendar_sync_failure(
  p_integration_id uuid,p_health text,p_error text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_health not in ('degraded','reauth_required','calendar_missing','acl_drift') then
    raise exception 'invalid calendar health'; end if;
  update public.calendar_sync_state set health=p_health,consecutive_failures=consecutive_failures+1,
    last_error=pg_catalog.left(coalesce(p_error,'calendar synchronization failed'),1000),
    updated_at=pg_catalog.now() where integration_id=p_integration_id;
  if p_health='reauth_required' then update public.calendar_integrations set status='reauth_required',
    updated_at=pg_catalog.now() where id=p_integration_id; end if;
end; $$;

create or replace function public.ignore_calendar_unmapped_event(p_unmapped_id uuid,p_note text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_note is null or pg_catalog.char_length(pg_catalog.btrim(p_note)) not between 3 and 1000 then
    raise exception 'ignore reason is required'; end if;
  update public.calendar_unmapped_events set status='ignored',resolution_note=pg_catalog.btrim(p_note),
    last_seen_at=pg_catalog.now() where id=p_unmapped_id and status='open';
  if not found then raise exception 'open unmapped event not found'; end if;
end; $$;

-- Outbound success/adoption is committed atomically. Matching is tenant-bound by the integration;
-- provider IDs and private properties never select a tenant themselves.
create or replace function public.confirm_calendar_projection(
  p_integration_id uuid,p_content_id uuid,p_content_version int,p_schedule_target_id uuid,
  p_event_role text,p_stable_key text,p_event_id text,p_event_etag text,p_event_updated_at timestamptz,
  p_event_html_link text,p_event_start_date date,p_event_start_at timestamptz,p_event_end_at timestamptz,
  p_portal_revision bigint
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_i public.calendar_integrations%rowtype; v_id uuid;
begin
  select * into v_i from public.calendar_integrations where id=p_integration_id and status='active';
  if not found then raise exception 'calendar integration unavailable'; end if;
  if not exists(select 1 from public.content_item_versions v where v.content_item_id=p_content_id
    and v.client_id=v_i.client_id and v.version=p_content_version) then raise exception 'wrong tenant content'; end if;
  if p_event_role='editorial_plan'
     and p_stable_key is distinct from 'portal:'||p_integration_id::text||':'||p_content_id::text||':editorial'
    then raise exception 'invalid editorial mapping key'; end if;
  if (p_event_role='editorial_plan' and p_schedule_target_id is not null)
     or (p_event_role='schedule_summary' and not exists(select 1 from public.content_schedule_targets t
       where t.id=p_schedule_target_id and t.client_id=v_i.client_id and t.content_id=p_content_id
         and t.content_version=p_content_version)) then raise exception 'invalid calendar mapping role'; end if;
  insert into public.calendar_event_mappings(client_id,integration_id,content_id,content_version,
    schedule_target_id,event_role,stable_key,event_id,event_etag,event_updated_at,event_html_link,
    event_start_date,event_start_at,event_end_at,portal_projection_revision,last_confirmed_revision,
    sync_status,last_outbound_at,last_reconciled_at)
  values(v_i.client_id,v_i.id,p_content_id,p_content_version,p_schedule_target_id,p_event_role,
    p_stable_key,p_event_id,p_event_etag,p_event_updated_at,p_event_html_link,p_event_start_date,
    p_event_start_at,p_event_end_at,p_portal_revision,p_portal_revision,'confirmed',pg_catalog.now(),pg_catalog.now())
  on conflict(integration_id,stable_key) do update set
    content_version=excluded.content_version,schedule_target_id=excluded.schedule_target_id,
    event_role=excluded.event_role,event_id=excluded.event_id,event_etag=excluded.event_etag,event_updated_at=excluded.event_updated_at,
    event_html_link=excluded.event_html_link,event_start_date=excluded.event_start_date,
    event_start_at=excluded.event_start_at,event_end_at=excluded.event_end_at,
    portal_projection_revision=excluded.portal_projection_revision,
    last_confirmed_revision=excluded.last_confirmed_revision,sync_status='confirmed',
    last_error=null,last_outbound_at=pg_catalog.now(),last_reconciled_at=pg_catalog.now(),updated_at=pg_catalog.now()
  returning id into v_id;
  return v_id;
end; $$;

-- Inbound all-day changes may update an uncommitted editorial date. They never invent provider
-- times. A simultaneous portal edit, deletion, or a move after provider confirmation becomes a
-- visible conflict and leaves Supabase/provider state untouched.
create or replace function public.apply_calendar_editorial_event(
  p_integration_id uuid,p_event_id text,p_event_etag text,p_event_updated_at timestamptz,
  p_event_start_date date,p_deleted boolean
) returns text language plpgsql security definer set search_path='' as $$
declare v_m public.calendar_event_mappings%rowtype; v_ci public.content_items%rowtype;
  v_conflict_kind text; v_key text; v_title text;
begin
  select m.* into v_m from public.calendar_event_mappings m
  where m.integration_id=p_integration_id and m.event_id=p_event_id for update;
  if not found or v_m.event_role<>'editorial_plan' then raise exception 'unknown calendar mapping'; end if;
  if v_m.event_etag=p_event_etag then return 'unchanged'; end if;
  select * into v_ci from public.content_items ci
    where ci.id=v_m.content_id and ci.client_id=v_m.client_id for update;
  if not found or v_ci.client_visible_version is distinct from v_m.content_version
     or v_ci.archived_at is not null then raise exception 'mapped content is no longer eligible'; end if;
  if v_ci.projection_revision<>v_m.last_confirmed_revision then v_conflict_kind:='simultaneous_edit'; end if;
  if p_deleted then v_conflict_kind:='delete_with_commitment'; end if;
  if p_event_start_date is null and not p_deleted then v_conflict_kind:='ambiguous_time'; end if;
  if v_conflict_kind is null and exists(select 1 from public.content_schedule_targets t
      where t.client_id=v_ci.client_id and t.content_id=v_ci.id and t.content_version=v_m.content_version
        and t.scheduled_at is not null and t.verified_at is not null) then
    v_conflict_kind:='simultaneous_edit';
  end if;
  if v_conflict_kind is not null then
    v_key:=v_m.id::text||':'||coalesce(p_event_etag,'deleted')||':'||v_ci.projection_revision::text;
    insert into public.calendar_sync_conflicts(client_id,integration_id,mapping_id,conflict_key,kind,
      portal_revision,google_etag,google_start_date,google_deleted,safe_summary)
    values(v_ci.client_id,v_m.integration_id,v_m.id,v_key,v_conflict_kind,v_ci.projection_revision,
      p_event_etag,p_event_start_date,p_deleted,case when p_deleted then 'A shared-calendar hold was removed; agency review is required.'
        else 'The portal and shared calendar changed concurrently; agency review is required.' end)
    on conflict(integration_id,conflict_key) do nothing;
    update public.calendar_event_mappings set sync_status='conflicted',last_inbound_at=pg_catalog.now(),
      last_error='agency reconciliation required',updated_at=pg_catalog.now() where id=v_m.id;
    insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,title,
      summary,actor_type,actor_name) values(v_ci.client_id,v_ci.id,v_m.content_version,
      'calendar_sync_conflict','calendar-conflict:'||v_key,'Calendar synchronization needs review',
      'The shared calendar and portal were not automatically reconciled.','agent','Google Calendar')
      on conflict do nothing;
    return 'conflicted';
  end if;
  if p_event_start_date < (pg_catalog.now() at time zone 'America/Toronto')::date - 365
     or p_event_start_date > (pg_catalog.now() at time zone 'America/Toronto')::date + 730 then
    raise exception 'calendar date is out of range'; end if;
  update public.content_items set planned_date=p_event_start_date,
    projection_revision=projection_revision+1,updated_at=pg_catalog.now() where id=v_ci.id
    returning projection_revision into v_ci.projection_revision;
  select v.title into v_title from public.content_item_versions v where v.content_item_id=v_ci.id
    and v.client_id=v_ci.client_id and v.version=v_m.content_version;
  insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,title,summary,actor_type,actor_name)
  values(v_ci.client_id,v_ci.id,v_m.content_version,'calendar_event_changed',
    'calendar:'||v_m.id::text||':'||p_event_etag,'Calendar date updated: '||v_title,
    'Editorial plan: '||p_event_start_date::text,'agent','Google Calendar') on conflict do nothing;
  update public.calendar_event_mappings set event_etag=p_event_etag,event_updated_at=p_event_updated_at,
    event_start_date=p_event_start_date,event_start_at=null,event_end_at=null,
    portal_projection_revision=v_ci.projection_revision,last_confirmed_revision=v_ci.projection_revision,
    sync_status='confirmed',last_inbound_at=pg_catalog.now(),last_reconciled_at=pg_catalog.now(),
    last_error=null,updated_at=pg_catalog.now() where id=v_m.id;
  return 'updated';
end; $$;

create or replace function public.resolve_calendar_sync_conflict(
  p_conflict_id uuid,p_resolution text,p_note text,p_idempotency_key text
) returns text language plpgsql security definer set search_path='' as $$
declare v_c public.calendar_sync_conflicts%rowtype; v_m public.calendar_event_mappings%rowtype;
  v_ci public.content_items%rowtype; v_request_id uuid; v_snapshot jsonb; v_fingerprint text;
begin
  if p_resolution not in ('portal','google') or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,128}$'
     or p_note is null or pg_catalog.char_length(pg_catalog.btrim(p_note)) not between 3 and 1000 then
    raise exception 'invalid conflict resolution'; end if;
  select * into v_c from public.calendar_sync_conflicts where id=p_conflict_id for update;
  if not found then raise exception 'calendar conflict not found'; end if;
  if v_c.status<>'open' then return v_c.status; end if;
  select * into v_m from public.calendar_event_mappings where id=v_c.mapping_id and client_id=v_c.client_id for update;
  select * into v_ci from public.content_items where id=v_m.content_id and client_id=v_m.client_id for update;
  if not found or v_ci.client_visible_version is distinct from v_m.content_version or v_ci.archived_at is not null
    then raise exception 'mapped content is no longer eligible'; end if;
  if p_resolution='portal' then
    update public.calendar_sync_conflicts set status='resolved_portal',resolved_at=pg_catalog.now(),
      resolution_note=pg_catalog.btrim(p_note) where id=v_c.id;
    update public.calendar_event_mappings set sync_status='pending',last_error=null,updated_at=pg_catalog.now()
      where id=v_m.id;
    insert into public.calendar_sync_jobs(integration_id,client_id,job_type,dedupe_key,payload)
    values(v_m.integration_id,v_m.client_id,'outbound','resolve:'||p_idempotency_key,
      pg_catalog.jsonb_build_object('content_id',v_m.content_id,'content_version',v_m.content_version,
        'portal_revision',v_ci.projection_revision)) on conflict(integration_id,dedupe_key) do nothing;
    return 'resolved_portal';
  end if;
  if v_c.kind='mapping_integrity' then
    raise exception 'invalid calendar identity fields cannot be accepted as authoritative';
  end if;
  if v_c.google_deleted then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('target_id',t.id,
      'destination',t.destination,'status',t.status,'scheduled_at',t.scheduled_at,'verified_at',t.verified_at)
      order by t.destination),'[]'::jsonb) into v_snapshot from public.content_schedule_targets t
      where t.client_id=v_ci.client_id and t.content_id=v_ci.id and t.content_version=v_m.content_version and t.required;
    v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.concat_ws('|',
      'calendar_cancel',v_m.id::text,v_c.google_etag),'UTF8'),'sha256'),'hex');
    begin
      insert into public.content_schedule_requests(client_id,content_id,content_version,request_kind,
        target_snapshot,actor_name,idempotency_key,request_fingerprint,source_type,provenance)
      values(v_ci.client_id,v_ci.id,v_m.content_version,'cancel',v_snapshot,'Google Calendar',
        p_idempotency_key,v_fingerprint,'calendar',pg_catalog.jsonb_build_object('mapping_id',v_m.id,
          'event_etag',v_c.google_etag)) returning id into v_request_id;
    exception when unique_violation then
      raise exception 'schedule_request_already_pending';
    end;
    insert into public.content_schedule_request_attempts(client_id,request_id,schedule_target_id,
      destination,previous_scheduled_at) select t.client_id,v_request_id,t.id,t.destination,t.scheduled_at
      from public.content_schedule_targets t where t.client_id=v_ci.client_id and t.content_id=v_ci.id
        and t.content_version=v_m.content_version and t.required;
    update public.content_schedule_targets set status=case when scheduled_at is not null then 'cancel_pending'
      else status end,updated_at=pg_catalog.now() where client_id=v_ci.client_id and content_id=v_ci.id
      and content_version=v_m.content_version and required;
    update public.calendar_event_mappings set sync_status='deleted',event_etag=v_c.google_etag,
      last_confirmed_revision=v_ci.projection_revision,last_reconciled_at=pg_catalog.now(),last_error=null,
      updated_at=pg_catalog.now() where id=v_m.id;
  else
    if v_c.google_start_date is null then raise exception 'calendar date is unavailable'; end if;
    if exists(select 1 from public.content_schedule_targets t where t.client_id=v_ci.client_id
      and t.content_id=v_ci.id and t.content_version=v_m.content_version and t.verified_at is not null) then
      raise exception 'provider commitments require explicit rescheduling in the portal'; end if;
    update public.content_items set planned_date=v_c.google_start_date,projection_revision=projection_revision+1,
      updated_at=pg_catalog.now() where id=v_ci.id returning projection_revision into v_ci.projection_revision;
    update public.calendar_event_mappings set event_etag=v_c.google_etag,event_start_date=v_c.google_start_date,
      event_start_at=null,event_end_at=null,portal_projection_revision=v_ci.projection_revision,
      last_confirmed_revision=v_ci.projection_revision,sync_status='confirmed',last_reconciled_at=pg_catalog.now(),
      last_error=null,updated_at=pg_catalog.now() where id=v_m.id;
  end if;
  update public.calendar_sync_conflicts set status='resolved_google',resolved_at=pg_catalog.now(),
    resolution_note=pg_catalog.btrim(p_note) where id=v_c.id;
  return 'resolved_google';
end; $$;

create or replace function public.complete_calendar_sync(
  p_integration_id uuid,p_sync_token text,p_full boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.calendar_integrations where id=p_integration_id and status='active')
    then raise exception 'calendar integration unavailable'; end if;
  if p_sync_token is null or pg_catalog.char_length(p_sync_token)>8192 then raise exception 'invalid sync token'; end if;
  update public.calendar_sync_state set sync_token=p_sync_token,
    last_full_sync_at=case when p_full then pg_catalog.now() else last_full_sync_at end,
    last_incremental_sync_at=pg_catalog.now(),last_reconciled_at=pg_catalog.now(),
    next_reconcile_at=pg_catalog.now()+interval '6 hours',health='healthy',consecutive_failures=0,
    last_error=null,updated_at=pg_catalog.now() where integration_id=p_integration_id;
  if not found then raise exception 'calendar sync state missing'; end if;
end; $$;

-- Every portal projection revision queues an outbound reconciliation for each active tenant integration.
create or replace function public.enqueue_calendar_projection()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.client_visible and new.client_visible_version is not null and new.archived_at is null
     and (tg_op='INSERT' or new.projection_revision is distinct from old.projection_revision
       or new.client_visible_version is distinct from old.client_visible_version
       or new.planned_date is distinct from old.planned_date) then
    insert into public.calendar_sync_jobs(integration_id,client_id,job_type,dedupe_key,payload)
    select i.id,new.client_id,'outbound','content:'||new.id::text||':r'||new.projection_revision::text,
      pg_catalog.jsonb_build_object('content_id',new.id,'content_version',new.client_visible_version,
        'portal_revision',new.projection_revision)
    from public.calendar_integrations i where i.client_id=new.client_id and i.status='active'
    on conflict(integration_id,dedupe_key) do nothing;
  end if;
  return new;
end; $$;
create trigger content_items_calendar_projection after insert or update of projection_revision,
  client_visible_version,client_visible,planned_date,archived_at on public.content_items
  for each row execute function public.enqueue_calendar_projection();

revoke all on function public.accept_calendar_webhook(text,text,text,bigint,text),
  public.claim_calendar_sync_jobs(int,int),public.finish_calendar_sync_job(uuid,uuid,boolean,text),
  public.record_calendar_unmapped_event(uuid,text,text,timestamptz,text,date,timestamptz,timestamptz,text),
  public.link_calendar_unmapped_event(uuid,uuid,int,text,text),
  public.ignore_calendar_unmapped_event(uuid,text),
  public.record_calendar_sync_failure(uuid,text,text),
  public.confirm_calendar_projection(uuid,uuid,int,uuid,text,text,text,text,timestamptz,text,date,timestamptz,timestamptz,bigint),
  public.apply_calendar_editorial_event(uuid,text,text,timestamptz,date,boolean),
  public.resolve_calendar_sync_conflict(uuid,text,text,text),
  public.complete_calendar_sync(uuid,text,boolean),public.enqueue_calendar_projection()
  from public,anon,authenticated,service_role;
grant execute on function public.accept_calendar_webhook(text,text,text,bigint,text),
  public.claim_calendar_sync_jobs(int,int),public.finish_calendar_sync_job(uuid,uuid,boolean,text),
  public.record_calendar_unmapped_event(uuid,text,text,timestamptz,text,date,timestamptz,timestamptz,text),
  public.link_calendar_unmapped_event(uuid,uuid,int,text,text),
  public.ignore_calendar_unmapped_event(uuid,text),
  public.record_calendar_sync_failure(uuid,text,text),
  public.confirm_calendar_projection(uuid,uuid,int,uuid,text,text,text,text,timestamptz,text,date,timestamptz,timestamptz,bigint),
  public.apply_calendar_editorial_event(uuid,text,text,timestamptz,date,boolean),
  public.resolve_calendar_sync_conflict(uuid,text,text,text),
  public.complete_calendar_sync(uuid,text,boolean) to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_actual text[]; v_expected text[];
begin
  perform public.assert_portal_slice4_security();
  if exists(select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('calendar_credentials','calendar_integrations','calendar_sync_state',
      'calendar_watch_channels','calendar_sync_jobs','calendar_webhook_receipts','calendar_sync_conflicts',
      'calendar_unmapped_events','calendar_oauth_states') and tp.grantee in ('PUBLIC','anon','authenticated'))
    then raise exception 'calendar sync internals exposed'; end if;
  if exists(select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('calendar_event_mappings','calendar_events_client')
    and tp.grantee in ('PUBLIC','anon')) then raise exception 'calendar client surface exposed to anon'; end if;
  if exists(select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('calendar_event_mappings','calendar_events_client')
    and tp.grantee='authenticated' and tp.privilege_type<>'SELECT')
    then raise exception 'calendar client write grant detected'; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp where cp.table_schema='public'
    and cp.table_name='calendar_event_mappings' and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  v_expected:=array['client_id','content_id','content_version','event_end_at','event_html_link',
    'event_role','event_start_at','event_start_date','id','last_reconciled_at','schedule_target_id','sync_status'];
  if v_actual is distinct from v_expected then raise exception 'unsafe calendar mapping grant set: %',v_actual; end if;
  if exists(select 1 from pg_catalog.pg_class c where c.oid='public.calendar_events_client'::pg_catalog.regclass
    and not(coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true']))
    then raise exception 'calendar client view must be security_invoker'; end if;
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('accept_calendar_webhook','claim_calendar_sync_jobs',
      'finish_calendar_sync_job','record_calendar_unmapped_event','link_calendar_unmapped_event',
      'ignore_calendar_unmapped_event',
      'record_calendar_sync_failure','confirm_calendar_projection',
      'apply_calendar_editorial_event','resolve_calendar_sync_conflict','complete_calendar_sync') and (not p.prosecdef
        or not(coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""'])))
    then raise exception 'calendar writer is not hardened security definer'; end if;
  if pg_catalog.has_function_privilege('anon','public.accept_calendar_webhook(text,text,text,bigint,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.accept_calendar_webhook(text,text,text,bigint,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.accept_calendar_webhook(text,text,text,bigint,text)','EXECUTE')
    then raise exception 'unexpected calendar webhook privilege'; end if;
end; $$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
