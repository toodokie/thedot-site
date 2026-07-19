-- Slice 3: destination-level scheduling intent and durable reschedule requests.
-- External schedule confirmation remains unavailable until Slice 4 adds immutable evidence and
-- the agency-admin manual-verification boundary. A planned/requested time is never provider truth.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.record_content_decision(uuid,integer,text,text)') is null then
    raise exception '0007 release-quality objects must exist before applying 0008';
  end if;
end;
$$;

-- Verify the reviewed Slice 2 boundary before this migration intentionally replaces its view.
select public.assert_portal_security();

-- Stable activity vocabulary. Existing rows are checked before the old enumerated CHECK is
-- replaced; an unknown production value blocks rather than being deleted or coerced.
create table public.activity_event_types (
  event_type text primary key check (event_type ~ '^[a-z][a-z0-9_]{1,63}$')
);

insert into public.activity_event_types (event_type) values
  ('needs_review'), ('approved'), ('change_requested'), ('comment_added'),
  ('agency_comment_added'), ('edit_requested'), ('create_requested'), ('archive_requested'),
  ('request_prepared'), ('request_applied'), ('request_rejected'), ('request_conflicted'),
  ('planned_date_changed'), ('reschedule_requested'), ('unschedule_requested'),
  ('schedule_target_confirmed'), ('schedule_target_failed'), ('fully_scheduled'), ('unscheduled'),
  ('publication_target_live'), ('publication_target_failed'), ('publication_target_unavailable'),
  ('publication_target_removed'), ('publication_content_changed'), ('fully_posted'),
  ('scheduled'), ('posted'), ('recommendation_added'), ('monthly_report_added'),
  ('meeting_email_note_added'), ('idea_captured');

do $$
begin
  if exists (
    select 1 from public.activity_log a
    left join public.activity_event_types t on t.event_type = a.event_type
    where t.event_type is null
  ) then raise exception 'unknown legacy activity event blocks scheduling migration'; end if;
end;
$$;

alter table public.activity_log drop constraint if exists activity_log_event_type_check;
alter table public.activity_log
  add constraint activity_log_event_type_fk foreign key (event_type)
  references public.activity_event_types(event_type);
alter table public.activity_log add column event_key text;
create unique index activity_log_event_key_unique
  on public.activity_log (client_id, event_key) where event_key is not null;

alter table public.content_items
  add column projection_revision bigint not null default 0 check (projection_revision >= 0);

create table public.content_schedule_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_id uuid not null,
  content_version int not null check (content_version > 0),
  destination text not null check (destination in ('instagram','facebook','youtube','squarespace','other')),
  required boolean not null default true,
  external_id text,
  external_url text,
  scheduled_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending','scheduled','reschedule_pending','cancel_pending','cancelled','failed')),
  verified_at timestamptz,
  source_type text check (source_type is null or source_type in ('manual','api')),
  evidence_id uuid,
  verifier_actor_id uuid,
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (client_id, content_id, content_version, destination),
  foreign key (content_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade,
  -- A pending reschedule/cancellation retains the last verified provider commitment until the
  -- agency resolves it. Only the positive scheduled claim requires confirmation fields.
  check (status <> 'scheduled' or (scheduled_at is not null and verified_at is not null)),
  check (verified_at is null or source_type is not null),
  check (external_url is null or pg_catalog.char_length(external_url) <= 2048),
  check (external_id is null or pg_catalog.char_length(external_id) <= 500),
  check (last_error is null or pg_catalog.char_length(last_error) <= 1000)
);
create index content_schedule_targets_by_content
  on public.content_schedule_targets (client_id, content_id, content_version, destination);

create table public.content_schedule_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_id uuid not null,
  content_version int not null check (content_version > 0),
  request_kind text not null check (request_kind in ('reschedule','cancel')),
  requested_for timestamptz,
  requested_local timestamp without time zone,
  requested_timezone text not null default 'America/Toronto',
  requested_utc_offset_minutes smallint,
  target_snapshot jsonb not null check (pg_catalog.jsonb_typeof(target_snapshot) = 'array'),
  status text not null default 'pending'
    check (status in ('pending','applying','partially_applied','applied','conflicted','rejected')),
  requested_by uuid references auth.users(id),
  actor_name text not null,
  idempotency_key text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  source_type text not null default 'client' check (source_type in ('client','agency','calendar')),
  provenance jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(provenance) = 'object'),
  resolution_code text,
  client_message text,
  resolved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (client_id, idempotency_key),
  foreign key (content_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade,
  check (
    (request_kind = 'reschedule' and requested_for is not null and requested_local is not null
      and requested_utc_offset_minutes is not null)
    or (request_kind = 'cancel' and requested_for is null and requested_local is null
      and requested_utc_offset_minutes is null)
  ),
  check (requested_timezone = 'America/Toronto'),
  check (pg_catalog.char_length(idempotency_key) between 8 and 128),
  check (actor_name <> '' and pg_catalog.char_length(actor_name) <= 300),
  check (client_message is null or pg_catalog.char_length(client_message) <= 1000),
  check ((resolved_at is null) = (status in ('pending','applying','partially_applied')))
);
create unique index content_schedule_requests_one_active
  on public.content_schedule_requests (client_id, content_id, content_version)
  where status in ('pending','applying','partially_applied');
create index content_schedule_requests_by_content
  on public.content_schedule_requests (client_id, content_id, content_version, created_at desc);

create table public.content_schedule_request_attempts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  request_id uuid not null,
  schedule_target_id uuid not null,
  destination text not null check (destination in ('instagram','facebook','youtube','squarespace','other')),
  attempt_no int not null default 1 check (attempt_no > 0),
  status text not null default 'pending'
    check (status in ('pending','applying','succeeded','failed','conflicted')),
  requested_for timestamptz,
  previous_scheduled_at timestamptz,
  result_scheduled_at timestamptz,
  source_type text check (source_type is null or source_type in ('manual','api')),
  external_id text,
  external_url text,
  evidence_id uuid,
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  unique (request_id, destination, attempt_no),
  foreign key (request_id, client_id)
    references public.content_schedule_requests(id, client_id) on delete cascade,
  foreign key (schedule_target_id, client_id)
    references public.content_schedule_targets(id, client_id) on delete cascade,
  check (last_error is null or pg_catalog.char_length(last_error) <= 1000)
);
create index content_schedule_attempts_by_request
  on public.content_schedule_request_attempts (client_id, request_id, destination, attempt_no);

-- Generic durable side-effect records introduced with the first new client workflow command.
create table public.portal_command_receipts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid references auth.users(id),
  command_type text not null,
  idempotency_key text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  unique (client_id, idempotency_key)
);

create table public.portal_inbox_events (
  seq bigint generated always as identity primary key,
  id uuid not null unique default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  object_type text not null,
  object_id uuid,
  actor_type text not null check (actor_type in ('client','anastasia','agent','system')),
  actor_name text not null,
  payload jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(payload) = 'object'),
  requires_reconciliation boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  unique (client_id, event_key)
);
create index portal_inbox_events_by_client_seq
  on public.portal_inbox_events (client_id, seq);

create table public.projection_outbox (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  event_key text not null,
  destination text not null check (destination = 'notion'),
  operation text not null check (operation in ('upsert','archive','reconcile')),
  object_type text not null,
  object_key text not null,
  object_revision bigint not null check (object_revision > 0),
  payload jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','reconcile','abandoned')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  unique (destination, event_key),
  unique (destination, object_type, object_key, object_revision)
);
create index projection_outbox_pending
  on public.projection_outbox (status, next_attempt_at, created_at);

-- Convert a canonical platform to the one independent provider destination it controls.
create or replace function public.portal_schedule_destination(p_platform text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.lower(pg_catalog.btrim(p_platform))
    when 'instagram' then 'instagram'
    when 'facebook' then 'facebook'
    when 'youtube' then 'youtube'
    when 'youtube shorts' then 'youtube'
    when 'youtube_shorts' then 'youtube'
    when 'youtube-shorts' then 'youtube'
    when 'squarespace' then 'squarespace'
    when 'website' then 'squarespace'
    when 'blog' then 'squarespace'
    when 'other' then 'other'
    else null
  end
$$;

create or replace function public.portal_ensure_schedule_targets(
  p_content_id uuid,
  p_content_version int
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_platform text;
  v_destination text;
  v_count int;
begin
  select cv.client_id into v_client_id
  from public.content_item_versions cv
  join public.content_items ci
    on ci.id = cv.content_item_id and ci.client_id = cv.client_id
  where cv.content_item_id = p_content_id and cv.version = p_content_version
    and ci.client_visible_version = p_content_version and ci.archived_at is null
  for share of ci;
  if not found then raise exception 'released content snapshot not found'; end if;

  for v_platform in
    select distinct pg_catalog.lower(pg_catalog.btrim(p.value))
    from public.content_item_versions cv,
      unnest(cv.platforms) p(value)
    where cv.content_item_id = p_content_id
      and cv.client_id = v_client_id
      and cv.version = p_content_version
  loop
    v_destination := public.portal_schedule_destination(v_platform);
    if v_destination is null then
      raise exception 'unsupported scheduling platform: %', v_platform;
    end if;
    insert into public.content_schedule_targets (
      client_id, content_id, content_version, destination, required
    ) values (
      v_client_id, p_content_id, p_content_version, v_destination, true
    ) on conflict (client_id, content_id, content_version, destination) do nothing;
  end loop;

  select pg_catalog.count(*)::int into v_count
  from public.content_schedule_targets t
  where t.client_id = v_client_id and t.content_id = p_content_id
    and t.content_version = p_content_version and t.required;
  return v_count;
end;
$$;

-- A local wall time is accepted only with an explicit UTC offset that is actually valid in
-- America/Toronto at that instant. This rejects spring-forward gaps and makes fall-back ambiguity
-- an explicit EDT (-240) versus EST (-300) choice.
create or replace function public.portal_resolve_schedule_time(
  p_local timestamp without time zone,
  p_timezone text,
  p_utc_offset_minutes int
) returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_instant timestamptz;
  v_actual_offset int;
begin
  if p_timezone is distinct from 'America/Toronto' then
    raise exception 'unsupported schedule timezone';
  end if;
  if p_utc_offset_minutes not in (-240, -300) then
    raise exception 'invalid Toronto UTC offset';
  end if;
  v_instant := (
    p_local - pg_catalog.make_interval(mins => p_utc_offset_minutes)
  ) at time zone 'UTC';
  if (v_instant at time zone p_timezone) is distinct from p_local then
    raise exception 'invalid or nonexistent Toronto local time';
  end if;
  v_actual_offset := (
    extract(epoch from (
      (v_instant at time zone p_timezone) - (v_instant at time zone 'UTC')
    )) / 60
  )::int;
  if v_actual_offset is distinct from p_utc_offset_minutes then
    raise exception 'Toronto UTC offset does not match requested local time';
  end if;
  return v_instant;
end;
$$;

create or replace function public.portal_content_schedule_state(
  p_content_id uuid,
  p_content_version int
) returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_state text;
begin
  if exists (
    select 1 from public.content_schedule_requests r
    where r.content_id = p_content_id and r.content_version = p_content_version
      and r.request_kind = 'cancel'
      and r.status in ('pending','applying','partially_applied')
  ) then return 'cancel_pending'; end if;
  if exists (
    select 1 from public.content_schedule_requests r
    where r.content_id = p_content_id and r.content_version = p_content_version
      and r.request_kind = 'reschedule'
      and r.status in ('pending','applying','partially_applied')
  ) then return 'reschedule_pending'; end if;
  if exists (
    select 1 from public.content_schedule_targets t
    where t.content_id = p_content_id and t.content_version = p_content_version
      and t.required and t.status = 'failed'
  ) then return 'failed'; end if;
  if not exists (
    select 1 from public.content_schedule_targets t
    where t.content_id = p_content_id and t.content_version = p_content_version and t.required
  ) then return 'unverified'; end if;
  if not exists (
    select 1 from public.content_schedule_targets t
    where t.content_id = p_content_id and t.content_version = p_content_version and t.required
      and not (
        t.status = 'scheduled' and t.scheduled_at is not null and t.verified_at is not null
        and t.source_type = 'manual'
      )
  ) then return 'scheduled'; end if;
  if exists (
    select 1 from public.content_schedule_targets t
    where t.content_id = p_content_id and t.content_version = p_content_version and t.required
      and t.status = 'scheduled' and t.verified_at is not null and t.source_type = 'manual'
  ) then return 'partially_scheduled'; end if;
  select 'unverified' into v_state;
  return v_state;
end;
$$;

revoke all on function public.portal_schedule_destination(text) from public, anon, authenticated, service_role;
revoke all on function public.portal_ensure_schedule_targets(uuid,int) from public, anon, authenticated, service_role;
revoke all on function public.portal_resolve_schedule_time(timestamp,text,int) from public, anon, authenticated, service_role;
revoke all on function public.portal_content_schedule_state(uuid,int) from public, anon;
grant execute on function public.portal_content_schedule_state(uuid,int) to authenticated, service_role;

-- Upgrade existing approved/scheduled rows to explicit destination targets. A legacy internal
-- scheduled flag is not provider proof, so it becomes approved + unverified pending targets.
do $$
declare
  v_row record;
begin
  for v_row in
    select ci.id, ci.client_visible_version
    from public.content_items ci
    where ci.client_visible_version is not null and ci.archived_at is null
      and ci.status in ('approved','scheduled')
  loop
    perform public.portal_ensure_schedule_targets(v_row.id, v_row.client_visible_version);
  end loop;
  update public.content_items
  set status = 'approved', updated_at = pg_catalog.now()
  where status = 'scheduled' and archived_at is null;
end;
$$;

-- Client-visible read models contain only safe scheduling fields. Provider management URLs,
-- evidence IDs, verifier IDs, errors, snapshots, provenance, and idempotency material stay private.
alter table public.content_schedule_targets enable row level security;
alter table public.content_schedule_requests enable row level security;
alter table public.content_schedule_request_attempts enable row level security;
alter table public.portal_command_receipts enable row level security;
alter table public.portal_inbox_events enable row level security;
alter table public.projection_outbox enable row level security;

create policy schedule_targets_read on public.content_schedule_targets for select
  using (client_id in (select public.my_client_ids()));
create policy schedule_requests_read on public.content_schedule_requests for select
  using (client_id in (select public.my_client_ids()));
create policy schedule_attempts_read on public.content_schedule_request_attempts for select
  using (client_id in (select public.my_client_ids()));

create view public.content_schedule_targets_client
with (security_invoker = true)
as
select
  t.id, t.client_id, t.content_id, t.content_version, t.destination, t.required,
  t.scheduled_at, t.status, t.verified_at,
  case
    when t.status = 'scheduled' and t.source_type = 'manual' and t.verified_at is not null
      then 'manually verified by The Dot'
    else 'not yet verified'
  end::text as verification_label,
  t.created_at, t.updated_at
from public.content_schedule_targets t;

create view public.content_schedule_requests_client
with (security_invoker = true)
as
select
  r.id, r.client_id, r.content_id, r.content_version, r.request_kind,
  r.requested_for, r.requested_local, r.requested_timezone, r.requested_utc_offset_minutes,
  r.status, r.client_message, r.created_at, r.updated_at, r.resolved_at
from public.content_schedule_requests r;

create view public.content_schedule_attempts_client
with (security_invoker = true)
as
select
  a.id, a.client_id, a.request_id, a.schedule_target_id, a.destination,
  a.attempt_no, a.status, a.requested_for, a.previous_scheduled_at,
  a.result_scheduled_at, a.created_at, a.resolved_at
from public.content_schedule_request_attempts a;

-- Replace the released content view so editorial intent and external commitment are no longer
-- conflated. planned_date is a date; schedule_state is derived from per-destination verification.
drop view public.content_with_state;
create view public.content_with_state
with (security_invoker = true)
as
select
  ci.id,
  ci.content_id,
  ci.client_id,
  v.title,
  v.format,
  v.pillar,
  v.platforms,
  ci.status,
  ci.planned_date,
  schedule.schedule_state,
  v.canva_url,
  v.drive_url,
  v.version,
  v.fact_check,
  v.fact_check_scope,
  v.fact_check_exemption,
  v.fact_check_ledger,
  v.client_body,
  v.copy_blocks,
  v.synced_at as updated_at,
  ci.review_ready_at,
  ci.revision_in_progress,
  ci.archived_at,
  decision.state as current_decision,
  case
    when ci.archived_at is not null then 'archived'
    when ci.status = 'posted' then 'live'
    when schedule.schedule_state = 'cancel_pending'
      then 'cancel_pending'
    when decision.state = 'change_requested' or ci.revision_in_progress then 'with_dot'
    when schedule.schedule_state = 'reschedule_pending'
      then 'reschedule_pending'
    when schedule.schedule_state = 'failed'
      then 'schedule_failed'
    when schedule.schedule_state = 'partially_scheduled'
      then 'partially_scheduled'
    when schedule.schedule_state = 'scheduled'
      then 'scheduled'
    when ci.status = 'approved' then 'approved'
    when ci.status = 'draft' and ci.review_ready_at is not null then 'needs_review'
    else 'with_dot'
  end::text as client_state
from public.content_items ci
join public.content_item_versions v
  on v.content_item_id = ci.id and v.client_id = ci.client_id
 and v.version = ci.client_visible_version
cross join lateral (
  select public.portal_content_schedule_state(
    ci.id, ci.client_visible_version
  ) as schedule_state
) schedule
left join lateral (
  select a.state
  from public.approvals a
  where a.content_id = ci.id and a.client_id = ci.client_id
    and a.content_version = ci.client_visible_version
  order by a.created_at desc, a.id desc
  limit 1
) decision on true;

-- Immediate editorial-plan update for an approved piece with no external targets.
create or replace function public.set_content_plan(
  p_content_id uuid,
  p_content_version int,
  p_planned_date date,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ci public.content_items%rowtype;
  v_actor text;
  v_title text;
  v_decision text;
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_revision bigint;
  v_response jsonb;
  v_today date := (pg_catalog.now() at time zone 'America/Toronto')::date;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,128}$' then raise exception 'invalid idempotency key'; end if;
  select ci.*
    into v_ci
  from public.content_items ci
  join public.client_users cu on cu.client_id = ci.client_id and cu.auth_user_id = v_uid
  where ci.id = p_content_id
  for update of ci;
  if not found then raise exception 'not authorized for this content'; end if;
  select coalesce(cu.name, cu.email) into v_actor
  from public.client_users cu
  where cu.client_id = v_ci.client_id and cu.auth_user_id = v_uid
  limit 1;

  v_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.concat_ws('|', 'set_content_plan', p_content_id::text,
      p_content_version::text, p_planned_date::text), 'UTF8'), 'sha256'
  ), 'hex');
  select * into v_receipt from public.portal_command_receipts r
  where r.client_id = v_ci.client_id and r.idempotency_key = v_key;
  if found then
    if v_receipt.command_type <> 'set_content_plan'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_receipt.response;
  end if;

  if p_planned_date is null or p_planned_date < v_today
     or p_planned_date > v_today + 730 then raise exception 'planned date is out of range'; end if;

  if v_ci.archived_at is not null or v_ci.status <> 'approved'
     or not v_ci.client_visible or v_ci.client_visible_version is distinct from p_content_version
     or v_ci.revision_in_progress or v_ci.review_ready_at is null then
    raise exception 'content is not eligible for a plan change';
  end if;
  select a.state into v_decision from public.approvals a
  where a.content_id = v_ci.id and a.client_id = v_ci.client_id
    and a.content_version = p_content_version
  order by a.created_at desc, a.id desc limit 1;
  if v_decision is distinct from 'approved' then raise exception 'content is not approved'; end if;
  if exists (
    select 1 from public.content_schedule_targets t
    where t.client_id = v_ci.client_id and t.content_id = v_ci.id
      and t.content_version = p_content_version and t.required
  ) then raise exception 'external schedule targets require a reschedule request'; end if;
  select cv.title into v_title from public.content_item_versions cv
  where cv.content_item_id = v_ci.id and cv.client_id = v_ci.client_id
    and cv.version = p_content_version;

  if v_ci.planned_date is not distinct from p_planned_date then
    v_response := pg_catalog.jsonb_build_object(
      'content_id', v_ci.id, 'planned_date', p_planned_date, 'outcome', 'unchanged'
    );
  else
    update public.content_items
    set planned_date = p_planned_date, projection_revision = projection_revision + 1,
        updated_at = pg_catalog.now()
    where id = v_ci.id returning projection_revision into v_revision;

    insert into public.activity_log (
      client_id, content_id, content_version, event_type, event_key,
      title, summary, actor_type, actor_name
    ) values (
      v_ci.client_id, v_ci.id, p_content_version, 'planned_date_changed',
      'plan:' || v_ci.client_id::text || ':' || v_key,
      'Plan updated: ' || v_title, 'Editorial plan: ' || p_planned_date::text,
      'client', v_actor
    );
    insert into public.portal_inbox_events (
      client_id, event_key, event_type, object_type, object_id,
      actor_type, actor_name, payload, requires_reconciliation
    ) values (
      v_ci.client_id, 'plan:' || v_ci.client_id::text || ':' || v_key,
      'planned_date_changed', 'content', v_ci.id, 'client', v_actor,
      pg_catalog.jsonb_build_object('content_version', p_content_version,
        'planned_date', p_planned_date), false
    );
    insert into public.projection_outbox (
      client_id, event_key, destination, operation, object_type, object_key,
      object_revision, payload
    ) values (
      v_ci.client_id, 'plan:' || v_ci.client_id::text || ':' || v_key,
      'notion', 'upsert', 'content', v_ci.id::text, v_revision,
      pg_catalog.jsonb_build_object('reason', 'planned_date_changed')
    );
    v_response := pg_catalog.jsonb_build_object(
      'content_id', v_ci.id, 'planned_date', p_planned_date, 'outcome', 'updated'
    );
  end if;

  insert into public.portal_command_receipts (
    client_id, auth_user_id, command_type, idempotency_key,
    request_fingerprint, response
  ) values (
    v_ci.client_id, v_uid, 'set_content_plan', v_key, v_fingerprint, v_response
  );
  return v_response;
end;
$$;

-- Durable reschedule request. The old committed target times remain untouched; each target gets a
-- pending attempt that Slice 4's evidence-backed agency boundary will resolve independently.
create or replace function public.request_content_reschedule(
  p_content_id uuid,
  p_content_version int,
  p_requested_local timestamp without time zone,
  p_timezone text,
  p_utc_offset_minutes int,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ci public.content_items%rowtype;
  v_actor text;
  v_title text;
  v_decision text;
  v_requested_for timestamptz;
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_fingerprint text;
  v_existing public.content_schedule_requests%rowtype;
  v_request_id uuid;
  v_snapshot jsonb;
  v_revision bigint;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,128}$' then raise exception 'invalid idempotency key'; end if;
  v_requested_for := public.portal_resolve_schedule_time(
    p_requested_local, p_timezone, p_utc_offset_minutes
  );
  select ci.*
    into v_ci
  from public.content_items ci
  join public.client_users cu on cu.client_id = ci.client_id and cu.auth_user_id = v_uid
  where ci.id = p_content_id
  for update of ci;
  if not found then raise exception 'not authorized for this content'; end if;
  select coalesce(cu.name, cu.email) into v_actor
  from public.client_users cu
  where cu.client_id = v_ci.client_id and cu.auth_user_id = v_uid
  limit 1;

  v_fingerprint := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.concat_ws('|', 'request_content_reschedule',
      p_content_id::text, p_content_version::text, p_requested_local::text,
      p_timezone, p_utc_offset_minutes::text), 'UTF8'), 'sha256'
  ), 'hex');
  select * into v_existing from public.content_schedule_requests r
  where r.client_id = v_ci.client_id and r.idempotency_key = v_key;
  if found then
    if v_existing.request_kind <> 'reschedule'
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency_key_conflict';
    end if;
    return v_existing.id;
  end if;

  if v_requested_for <= pg_catalog.now() + interval '5 minutes'
     or v_requested_for > pg_catalog.now() + interval '730 days' then
    raise exception 'requested schedule time is out of range';
  end if;

  if v_ci.archived_at is not null or v_ci.status not in ('approved','scheduled')
     or not v_ci.client_visible or v_ci.client_visible_version is distinct from p_content_version
     or v_ci.revision_in_progress or v_ci.review_ready_at is null then
    raise exception 'content is not eligible for rescheduling';
  end if;
  select a.state into v_decision from public.approvals a
  where a.content_id = v_ci.id and a.client_id = v_ci.client_id
    and a.content_version = p_content_version
  order by a.created_at desc, a.id desc limit 1;
  if v_decision is distinct from 'approved' then raise exception 'content is not approved'; end if;
  if not exists (
    select 1 from public.content_schedule_targets t
    where t.client_id = v_ci.client_id and t.content_id = v_ci.id
      and t.content_version = p_content_version and t.required
  ) then raise exception 'content has no external schedule targets'; end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'target_id', t.id, 'destination', t.destination, 'status', t.status,
    'scheduled_at', t.scheduled_at, 'verified_at', t.verified_at
  ) order by t.destination), '[]'::jsonb) into v_snapshot
  from public.content_schedule_targets t
  where t.client_id = v_ci.client_id and t.content_id = v_ci.id
    and t.content_version = p_content_version and t.required;

  begin
    insert into public.content_schedule_requests (
      client_id, content_id, content_version, request_kind,
      requested_for, requested_local, requested_timezone, requested_utc_offset_minutes,
      target_snapshot, requested_by, actor_name, idempotency_key,
      request_fingerprint, source_type
    ) values (
      v_ci.client_id, v_ci.id, p_content_version, 'reschedule',
      v_requested_for, p_requested_local, p_timezone, p_utc_offset_minutes,
      v_snapshot, v_uid, v_actor, v_key, v_fingerprint, 'client'
    ) returning id into v_request_id;
  exception when unique_violation then
    raise exception 'schedule_request_already_pending';
  end;

  insert into public.content_schedule_request_attempts (
    client_id, request_id, schedule_target_id, destination,
    requested_for, previous_scheduled_at
  )
  select t.client_id, v_request_id, t.id, t.destination,
    v_requested_for, t.scheduled_at
  from public.content_schedule_targets t
  where t.client_id = v_ci.client_id and t.content_id = v_ci.id
    and t.content_version = p_content_version and t.required;

  update public.content_schedule_targets
  set status = case when scheduled_at is not null then 'reschedule_pending' else status end,
      updated_at = pg_catalog.now()
  where client_id = v_ci.client_id and content_id = v_ci.id
    and content_version = p_content_version and required;
  update public.content_items
  set projection_revision = projection_revision + 1, updated_at = pg_catalog.now()
  where id = v_ci.id returning projection_revision into v_revision;

  select cv.title into v_title from public.content_item_versions cv
  where cv.content_item_id = v_ci.id and cv.client_id = v_ci.client_id
    and cv.version = p_content_version;
  insert into public.activity_log (
    client_id, content_id, content_version, event_type, event_key,
    title, summary, actor_type, actor_name
  ) values (
    v_ci.client_id, v_ci.id, p_content_version, 'reschedule_requested',
    'reschedule:' || v_ci.client_id::text || ':' || v_key,
    'Reschedule requested: ' || v_title,
    'Requested for ' || p_requested_local::text || ' ' || p_timezone,
    'client', v_actor
  );
  insert into public.portal_inbox_events (
    client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation
  ) values (
    v_ci.client_id, 'reschedule:' || v_ci.client_id::text || ':' || v_key,
    'reschedule_requested', 'content_schedule_request', v_request_id,
    'client', v_actor,
    pg_catalog.jsonb_build_object('content_id', v_ci.id,
      'content_version', p_content_version, 'requested_for', v_requested_for,
      'timezone', p_timezone), true
  );
  insert into public.projection_outbox (
    client_id, event_key, destination, operation, object_type, object_key,
    object_revision, payload
  ) values (
    v_ci.client_id, 'reschedule:' || v_ci.client_id::text || ':' || v_key,
    'notion', 'upsert', 'content', v_ci.id::text, v_revision,
    pg_catalog.jsonb_build_object('reason', 'reschedule_requested',
      'schedule_request_id', v_request_id)
  );
  return v_request_id;
end;
$$;

revoke all on function public.set_content_plan(uuid,int,date,text) from public, anon;
revoke all on function public.request_content_reschedule(uuid,int,timestamp,text,int,text)
  from public, anon;
grant execute on function public.set_content_plan(uuid,int,date,text) to authenticated;
grant execute on function public.request_content_reschedule(uuid,int,timestamp,text,int,text)
  to authenticated;

-- Approval now creates one independent required target per released platform. Unsupported platforms
-- fail the approval transaction; they must receive reviewed mapping/configuration first.
create or replace function public.record_content_decision(
  p_content_id uuid, p_content_version int, p_decision text, p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ci public.content_items%rowtype;
  v_title text;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_actor text;
  v_approval uuid;
  v_existing_state text;
  v_existing_note text;
  v_schedule_request_id uuid;
  v_revision bigint;
  v_decision_event_key text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_decision not in ('approved','change_requested') then
    raise exception 'invalid decision: %', p_decision;
  end if;
  if p_decision = 'change_requested' and v_note is null then
    raise exception 'change request note is required';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 2000 then
    raise exception 'decision note is too long';
  end if;

  select ci.* into v_ci
  from public.content_items ci
  join public.client_users cu
    on cu.client_id = ci.client_id and cu.auth_user_id = v_uid
  where ci.id = p_content_id
  for update of ci;
  if not found then raise exception 'not authorized for this content'; end if;

  select a.id, a.state, a.note into v_approval, v_existing_state, v_existing_note
  from public.approvals a
  where a.content_id = p_content_id and a.content_version = p_content_version
    and a.decided_by = v_uid;
  if found and v_existing_state = p_decision
     and v_existing_note is not distinct from v_note then return v_approval; end if;

  if not v_ci.client_visible or v_ci.client_visible_version is distinct from p_content_version then
    raise exception 'stale or unreleased content version';
  end if;
  if v_ci.archived_at is not null or v_ci.status = 'posted' then
    raise exception 'this piece is not open for review';
  end if;
  if p_decision = 'approved' then
    if v_ci.status <> 'draft' or v_ci.review_ready_at is null or v_ci.revision_in_progress
       or v_ci.working_version is distinct from v_ci.client_visible_version then
      raise exception 'this piece is not open for approval';
    end if;
  else
    if v_ci.status not in ('draft','approved','scheduled') or v_ci.review_ready_at is null then
      raise exception 'this piece is not open for a change request';
    end if;
  end if;

  select cv.title into v_title from public.content_item_versions cv
  where cv.content_item_id = v_ci.id and cv.client_id = v_ci.client_id
    and cv.version = p_content_version;
  if not found then raise exception 'released content snapshot not found'; end if;
  select coalesce(cu.name, cu.email) into v_actor from public.client_users cu
  where cu.auth_user_id = v_uid and cu.client_id = v_ci.client_id limit 1;

  insert into public.approvals (content_id, client_id, content_version, state, note, decided_by)
  values (p_content_id, v_ci.client_id, p_content_version, p_decision, v_note, v_uid)
  on conflict (content_id, content_version, decided_by)
  do update set state = excluded.state, note = excluded.note, created_at = pg_catalog.now()
  returning id into v_approval;

  if p_decision = 'approved' then
    update public.content_items
    set status = 'approved', revision_in_progress = false,
        projection_revision = projection_revision + 1, updated_at = pg_catalog.now()
    where id = v_ci.id returning projection_revision into v_revision;
    perform public.portal_ensure_schedule_targets(v_ci.id, p_content_version);
  else
    if v_ci.status = 'scheduled' or exists (
      select 1 from public.content_schedule_targets t
      where t.client_id = v_ci.client_id and t.content_id = v_ci.id
        and t.content_version = p_content_version and t.required
        and t.scheduled_at is not null and t.status in ('scheduled','reschedule_pending')
    ) then
      -- Slice 4 resolves this evidence-backed cancellation. Preserve committed times meanwhile.
      update public.content_schedule_request_attempts a
      set status = 'conflicted', last_error = 'Superseded by client change request',
          resolved_at = pg_catalog.now()
      from public.content_schedule_requests r
      where r.id = a.request_id and r.client_id = a.client_id
        and r.client_id = v_ci.client_id and r.content_id = v_ci.id
        and r.content_version = p_content_version
        and r.status in ('pending','applying','partially_applied')
        and a.status in ('pending','applying');
      update public.content_schedule_requests
      set status = 'rejected', resolution_code = 'superseded_by_change_request',
          client_message = 'Superseded by a content change request.',
          resolved_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where client_id = v_ci.client_id and content_id = v_ci.id
        and content_version = p_content_version
        and status in ('pending','applying','partially_applied');

      v_schedule_request_id := gen_random_uuid();
      insert into public.content_schedule_requests (
        id, client_id, content_id, content_version, request_kind, target_snapshot,
        requested_by, actor_name, idempotency_key, request_fingerprint, source_type
      )
      select v_schedule_request_id, v_ci.client_id, v_ci.id, p_content_version, 'cancel',
        coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'target_id', t.id, 'destination', t.destination, 'status', t.status,
          'scheduled_at', t.scheduled_at, 'verified_at', t.verified_at
        ) order by t.destination), '[]'::jsonb),
        v_uid, v_actor, 'decision-cancel:' || v_schedule_request_id::text,
        pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
          'decision-cancel|' || v_schedule_request_id::text, 'UTF8'), 'sha256'), 'hex'), 'client'
      from public.content_schedule_targets t
      where t.client_id = v_ci.client_id and t.content_id = v_ci.id
        and t.content_version = p_content_version and t.required
      returning id into v_schedule_request_id;
      insert into public.content_schedule_request_attempts (
        client_id, request_id, schedule_target_id, destination, previous_scheduled_at
      )
      select t.client_id, v_schedule_request_id, t.id, t.destination, t.scheduled_at
      from public.content_schedule_targets t
      where t.client_id = v_ci.client_id and t.content_id = v_ci.id
        and t.content_version = p_content_version and t.required;
      update public.content_schedule_targets
      set status = 'cancel_pending', updated_at = pg_catalog.now()
      where client_id = v_ci.client_id and content_id = v_ci.id
        and content_version = p_content_version and required;
      update public.content_items
      set review_ready_at = null, revision_in_progress = true,
          projection_revision = projection_revision + 1, updated_at = pg_catalog.now()
      where id = v_ci.id returning projection_revision into v_revision;

      insert into public.activity_log (
        client_id, content_id, content_version, event_type, event_key,
        title, summary, actor_type, actor_name
      ) values (
        v_ci.client_id, v_ci.id, p_content_version, 'unschedule_requested',
        'unschedule:' || v_schedule_request_id::text,
        'Unschedule requested: ' || v_title,
        'A content change requires cancellation of existing schedule commitments.',
        'client', coalesce(v_actor, 'Client')
      );
      insert into public.portal_inbox_events (
        client_id, event_key, event_type, object_type, object_id,
        actor_type, actor_name, payload, requires_reconciliation
      ) values (
        v_ci.client_id, 'unschedule:' || v_schedule_request_id::text,
        'unschedule_requested', 'content_schedule_request', v_schedule_request_id,
        'client', coalesce(v_actor, 'Client'),
        pg_catalog.jsonb_build_object('content_id', v_ci.id,
          'content_version', p_content_version), true
      );
    else
      update public.content_schedule_targets
      set status = 'cancelled', updated_at = pg_catalog.now()
      where client_id = v_ci.client_id and content_id = v_ci.id
        and content_version = p_content_version and required and scheduled_at is null;
      update public.content_items
      set status = 'draft', review_ready_at = null, revision_in_progress = true,
          projection_revision = projection_revision + 1, updated_at = pg_catalog.now()
      where id = v_ci.id returning projection_revision into v_revision;
    end if;
  end if;

  v_decision_event_key := 'decision:' || gen_random_uuid()::text;
  insert into public.activity_log (
    client_id, content_id, content_version, event_type, event_key,
    title, summary, actor_type, actor_name
  ) values (
    v_ci.client_id, p_content_id, p_content_version, p_decision, v_decision_event_key,
    case when p_decision = 'approved' then 'Approved: ' else 'Change requested: ' end || v_title,
    v_note, 'client', coalesce(v_actor, 'Client')
  );
  insert into public.portal_inbox_events (
    client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation
  ) values (
    v_ci.client_id, v_decision_event_key, p_decision, 'content', v_ci.id,
    'client', coalesce(v_actor, 'Client'),
    pg_catalog.jsonb_build_object('content_version', p_content_version,
      'decision', p_decision, 'schedule_request_id', v_schedule_request_id),
    v_schedule_request_id is not null
  );
  insert into public.projection_outbox (
    client_id, event_key, destination, operation, object_type, object_key,
    object_revision, payload
  ) values (
    v_ci.client_id, v_decision_event_key, 'notion', 'upsert', 'content', v_ci.id::text,
    v_revision, pg_catalog.jsonb_build_object('reason', p_decision,
      'content_version', p_content_version, 'schedule_request_id', v_schedule_request_id)
  );
  return v_approval;
end;
$$;

revoke all on function public.record_content_decision(uuid,int,text,text) from public, anon;
grant execute on function public.record_content_decision(uuid,int,text,text) to authenticated;

-- Relation grants: authenticated receives only safe read columns; all writes remain RPC-only.
revoke all on public.activity_event_types, public.content_schedule_targets,
  public.content_schedule_requests, public.content_schedule_request_attempts,
  public.portal_command_receipts, public.portal_inbox_events, public.projection_outbox,
  public.content_schedule_targets_client, public.content_schedule_requests_client,
  public.content_schedule_attempts_client, public.content_with_state
  from public, anon, authenticated, service_role;

grant select (
  id, client_id, content_id, content_version, destination, required,
  scheduled_at, status, verified_at, source_type, created_at, updated_at
) on public.content_schedule_targets to authenticated;
grant select (
  id, client_id, content_id, content_version, request_kind, requested_for,
  requested_local, requested_timezone, requested_utc_offset_minutes,
  status, client_message, created_at, updated_at, resolved_at
) on public.content_schedule_requests to authenticated;
grant select (
  id, client_id, request_id, schedule_target_id, destination, attempt_no,
  status, requested_for, previous_scheduled_at, result_scheduled_at, created_at, resolved_at
) on public.content_schedule_request_attempts to authenticated;
grant select on public.content_schedule_targets_client,
  public.content_schedule_requests_client, public.content_schedule_attempts_client,
  public.content_with_state to authenticated;

grant select on public.content_schedule_targets, public.content_schedule_requests,
  public.content_schedule_request_attempts, public.content_schedule_targets_client,
  public.content_schedule_requests_client, public.content_schedule_attempts_client,
  public.content_with_state to service_role;

-- Extend the cumulative assertion without weakening the reviewed 0007 checks.
alter function public.assert_portal_security() rename to assert_portal_slice2_security;
revoke all on function public.assert_portal_slice2_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice2_security() to service_role;

-- The prior cumulative assertion remains authoritative for every pre-Slice-3 object. Adjust only
-- its exact safe-view column expectation to the intentional planned_date/schedule_state refactor.
do $adjust_prior_assertion$
declare
  v_definition text;
  v_adjusted text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.assert_portal_slice2_security()'::pg_catalog.regprocedure
  ) into v_definition;
  v_adjusted := pg_catalog.replace(
    v_definition,
    '''scheduled_date'',',
    '''planned_date'',''schedule_state'','
  );
  if v_adjusted = v_definition then
    raise exception 'could not update prior content_with_state assertion';
  end if;
  execute v_adjusted;
end;
$adjust_prior_assertion$;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual text[];
  v_expected text[];
  v_columns text[];
begin
  perform public.assert_portal_slice2_security();

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'content_schedule_targets'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array[
    'client_id','content_id','content_version','created_at','destination','id','required',
    'scheduled_at','source_type','status','updated_at','verified_at'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated schedule-target grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'content_schedule_requests'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array[
    'client_id','client_message','content_id','content_version','created_at','id','request_kind',
    'requested_for','requested_local','requested_timezone','requested_utc_offset_minutes',
    'resolved_at','status','updated_at'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated schedule-request grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'content_schedule_request_attempts'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array[
    'attempt_no','client_id','created_at','destination','id','previous_scheduled_at',
    'request_id','requested_for','resolved_at','result_scheduled_at','schedule_target_id','status'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated schedule-attempt grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(a.attname::text order by a.attnum) into v_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.content_with_state'::pg_catalog.regclass
    and a.attnum > 0 and not a.attisdropped;
  v_expected := array[
    'id','content_id','client_id','title','format','pillar','platforms','status','planned_date',
    'schedule_state','canva_url','drive_url','version','fact_check','fact_check_scope',
    'fact_check_exemption','fact_check_ledger','client_body','copy_blocks','updated_at',
    'review_ready_at','revision_in_progress','archived_at','current_decision','client_state'
  ];
  if v_columns is distinct from v_expected then
    raise exception 'unsafe or missing scheduling content view columns: %', v_columns;
  end if;

  if exists (
    select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name in (
        'activity_event_types','content_schedule_targets','content_schedule_requests',
        'content_schedule_request_attempts','portal_command_receipts','portal_inbox_events',
        'projection_outbox','content_schedule_targets_client','content_schedule_requests_client',
        'content_schedule_attempts_client'
      )
      and tp.grantee in ('PUBLIC','anon')
  ) then raise exception 'public/anon scheduling relation privilege detected'; end if;

  if exists (
    select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name in (
        'content_schedule_targets','content_schedule_requests',
        'content_schedule_request_attempts','content_schedule_targets_client',
        'content_schedule_requests_client','content_schedule_attempts_client'
      )
      and tp.grantee in ('authenticated','service_role') and tp.privilege_type <> 'SELECT'
  ) then raise exception 'unexpected scheduling relation write privilege'; end if;

  if exists (
    select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name in (
        'activity_event_types','portal_command_receipts','portal_inbox_events','projection_outbox'
      )
      and tp.grantee in ('authenticated','service_role')
  ) then raise exception 'internal scheduling relation privilege detected'; end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'content_schedule_targets','content_schedule_requests',
        'content_schedule_request_attempts','portal_command_receipts',
        'portal_inbox_events','projection_outbox'
      )
      and not c.relrowsecurity
  ) then raise exception 'scheduling relation without RLS detected'; end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (
        'content_schedule_targets','content_schedule_requests',
        'content_schedule_request_attempts'
      )
      and p.cmd = 'SELECT'
      and p.policyname in ('schedule_targets_read','schedule_requests_read','schedule_attempts_read')
  ) <> 3 or (
    select pg_catalog.count(*)
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (
        'content_schedule_targets','content_schedule_requests',
        'content_schedule_request_attempts','portal_command_receipts',
        'portal_inbox_events','projection_outbox'
      )
  ) <> 3 or exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (
        'content_schedule_targets','content_schedule_requests',
        'content_schedule_request_attempts','portal_command_receipts',
        'portal_inbox_events','projection_outbox'
      )
      and p.cmd <> 'SELECT'
  ) then raise exception 'unexpected scheduling RLS policy set'; end if;

  if exists (
    select 1 from pg_catalog.pg_class c
    where c.oid in (
      'public.content_schedule_targets_client'::pg_catalog.regclass,
      'public.content_schedule_requests_client'::pg_catalog.regclass,
      'public.content_schedule_attempts_client'::pg_catalog.regclass
    )
      and not (coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true'])
  ) then raise exception 'scheduling client view must be security_invoker'; end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'portal_ensure_schedule_targets','set_content_plan',
        'request_content_reschedule','record_content_decision'
      )
      and (not p.prosecdef
        or not (coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']))
  ) then raise exception 'scheduling writer/helper is not hardened SECURITY DEFINER'; end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('portal_resolve_schedule_time','portal_content_schedule_state')
      and (p.prosecdef
        or not (coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']))
  ) then raise exception 'scheduling reader/helper privilege mode is wrong'; end if;

  if not pg_catalog.has_function_privilege(
       'authenticated','public.set_content_plan(uuid,integer,date,text)','EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated','public.request_content_reschedule(uuid,integer,timestamp without time zone,text,integer,text)','EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated','public.portal_content_schedule_state(uuid,integer)','EXECUTE')
     or pg_catalog.has_function_privilege(
       'authenticated','public.portal_ensure_schedule_targets(uuid,integer)','EXECUTE')
     or pg_catalog.has_function_privilege(
       'authenticated','public.portal_resolve_schedule_time(timestamp without time zone,text,integer)','EXECUTE')
     or pg_catalog.has_function_privilege(
       'anon','public.set_content_plan(uuid,integer,date,text)','EXECUTE')
     or pg_catalog.has_function_privilege(
       'anon','public.request_content_reschedule(uuid,integer,timestamp without time zone,text,integer,text)','EXECUTE') then
    raise exception 'unexpected scheduling function execution privilege';
  end if;

  if exists (
    select 1 from public.content_items ci
    where ci.status = 'scheduled' and ci.archived_at is null
      and public.portal_content_schedule_state(ci.id, ci.client_visible_version) <> 'scheduled'
  ) then raise exception 'internal scheduled status lacks all-target manual verification'; end if;
end;
$$;

revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

create or replace function public.assert_portal_slice1_security()
returns void language sql security definer set search_path = ''
as $$ select public.assert_portal_security() $$;
revoke all on function public.assert_portal_slice1_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice1_security() to service_role;

select public.assert_portal_security();

commit;
