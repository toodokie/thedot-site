-- Slice 4: evidence-backed provider schedule/publication truth and immutable observations.
-- V1 is manual: a planned time, elapsed time, Notion status, or Calendar event is never proof.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.content_schedule_targets') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0008 scheduling objects must exist before applying 0009';
  end if;
end;
$$;

select public.assert_portal_security();

-- Agency attestations are deliberately separate from primary-source citations. Existing authored
-- files omit source_type and are normalized to primary_source by the parser; stored rows are
-- upgraded atomically and checksums are recomputed so exact sync retries remain exact retries.
alter table public.content_item_versions
  drop constraint if exists content_item_versions_fact_check_shape;

update public.content_item_versions cv
set fact_check_ledger = coalesce((
  select pg_catalog.jsonb_agg(
    case when e.value ? 'source_type' then e.value
      else e.value || '{"source_type":"primary_source"}'::jsonb end
    order by e.ordinality
  )
  from pg_catalog.jsonb_array_elements(cv.fact_check_ledger) with ordinality e(value, ordinality)
), '[]'::jsonb);

create or replace function public.portal_fact_check_ledger_shape_valid(
  p_ledger jsonb, p_scope text, p_exemption text
) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v_entry jsonb;
  v_keys text[];
  v_checked_at date;
begin
  if p_scope not in ('required','not_applicable') or p_ledger is null
     or pg_catalog.jsonb_typeof(p_ledger) <> 'array' then return false; end if;
  if p_scope = 'required' then
    if p_exemption is not null or pg_catalog.jsonb_array_length(p_ledger) = 0 then return false; end if;
  elsif p_exemption is null
     or pg_catalog.char_length(pg_catalog.btrim(p_exemption)) not between 10 and 300
     or pg_catalog.jsonb_array_length(p_ledger) <> 0 then return false;
  end if;

  for v_entry in select value from pg_catalog.jsonb_array_elements(p_ledger)
  loop
    if pg_catalog.jsonb_typeof(v_entry) <> 'object' then return false; end if;
    select pg_catalog.array_agg(k order by k) into v_keys
      from pg_catalog.jsonb_object_keys(v_entry) k;
    if v_keys is distinct from array[
      'checked_at','checked_by_role','claim','claim_key','source_title','source_type',
      'source_url','status'
    ]::text[] then return false; end if;
    if pg_catalog.jsonb_typeof(v_entry->'claim_key') <> 'string'
       or (v_entry->>'claim_key') !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
       or pg_catalog.jsonb_typeof(v_entry->'claim') <> 'string'
       or pg_catalog.char_length(pg_catalog.btrim(v_entry->>'claim')) not between 1 and 500
       or (v_entry->>'status') not in ('confirmed','needs-confirm','flagged')
       or (v_entry->>'source_type') not in ('primary_source','agency_attested')
       or (v_entry->>'checked_by_role') not in ('agency_fact_checker','agency_owner')
       or pg_catalog.jsonb_typeof(v_entry->'checked_at') <> 'string'
       or (v_entry->>'checked_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;
    end if;
    begin v_checked_at := (v_entry->>'checked_at')::date;
    exception when others then return false; end;
    if pg_catalog.to_char(v_checked_at, 'YYYY-MM-DD') <> v_entry->>'checked_at' then return false; end if;
    if pg_catalog.jsonb_typeof(v_entry->'source_url') not in ('string','null')
       or pg_catalog.jsonb_typeof(v_entry->'source_title') not in ('string','null') then return false; end if;
    if pg_catalog.jsonb_typeof(v_entry->'source_title') = 'string'
       and pg_catalog.char_length(pg_catalog.btrim(v_entry->>'source_title')) not between 1 and 300
      then return false; end if;

    if v_entry->>'source_type' = 'primary_source' then
      if (pg_catalog.jsonb_typeof(v_entry->'source_url') = 'string') <>
         (pg_catalog.jsonb_typeof(v_entry->'source_title') = 'string') then return false; end if;
      if pg_catalog.jsonb_typeof(v_entry->'source_url') = 'string' and (
        pg_catalog.char_length(v_entry->>'source_url') not between 1 and 2048
        or (v_entry->>'source_url') !~ '^https://[^[:space:][:cntrl:]]+$'
        or (v_entry->>'source_url') ~ '^https://[^/?#]*@'
      ) then return false; end if;
      if v_entry->>'status' = 'confirmed'
         and (pg_catalog.jsonb_typeof(v_entry->'source_url') <> 'string'
           or pg_catalog.jsonb_typeof(v_entry->'source_title') <> 'string') then return false; end if;
    else
      if pg_catalog.jsonb_typeof(v_entry->'source_url') <> 'null'
         or pg_catalog.jsonb_typeof(v_entry->'source_title') <> 'string'
         or v_entry->>'checked_by_role' <> 'agency_owner' then return false; end if;
    end if;
  end loop;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_ledger) e(value)
    group by e.value->>'claim_key' having pg_catalog.count(*) > 1
  ) then return false; end if;
  return true;
end;
$$;

create or replace function public.portal_fact_check_ledger_release_valid(
  p_ledger jsonb, p_scope text, p_exemption text
) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_entry jsonb;
  v_authority text;
  v_host text;
begin
  if not public.portal_fact_check_ledger_shape_valid(p_ledger,p_scope,p_exemption) then return false; end if;
  for v_entry in select value from pg_catalog.jsonb_array_elements(p_ledger)
  loop
    if (v_entry->>'checked_at')::date > current_date then return false; end if;
    if v_entry->>'source_type' = 'primary_source'
       and pg_catalog.jsonb_typeof(v_entry->'source_url') = 'string' then
      v_authority := pg_catalog.substring(v_entry->>'source_url', '^https://([^/?#]+)');
      if v_authority is null or v_authority ~ '@' then return false; end if;
      v_host := pg_catalog.lower(pg_catalog.rtrim(
        pg_catalog.regexp_replace(v_authority, ':[0-9]+$', ''), '.'
      ));
      if not exists (
        select 1 from public.portal_primary_source_hosts h
        where v_host = h.hostname or v_host like '%.' || h.hostname
      ) then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.portal_fact_check_ledger_shape_valid(jsonb,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.portal_fact_check_ledger_release_valid(jsonb,text,text)
  from public, anon, authenticated, service_role;

alter table public.content_item_versions add constraint content_item_versions_fact_check_shape
  check (public.portal_fact_check_ledger_shape_valid(
    fact_check_ledger, fact_check_scope, fact_check_exemption
  )) not valid;
alter table public.content_item_versions validate constraint content_item_versions_fact_check_shape;

update public.content_item_versions cv
set content_checksum = public.portal_content_checksum(
  cv.title, cv.format, cv.pillar, cv.platforms, cv.canva_url, cv.drive_url,
  cv.fact_check, cv.fact_check_scope, cv.fact_check_exemption, cv.fact_check_ledger,
  cv.client_body, cv.copy_blocks
);

create table public.agency_actors (
  id uuid primary key,
  actor_key text not null unique check (actor_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
  display_name text not null check (pg_catalog.char_length(pg_catalog.btrim(display_name)) between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, actor_key)
);
insert into public.agency_actors (id, actor_key, display_name) values
  ('00000000-0000-4000-8000-000000000001', 'thedot-admin', 'The Dot');

create table public.admin_login_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempts int not null check (attempts > 0),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.publication_evidence (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  actor_id uuid not null references public.agency_actors(id),
  evidence_kind text not null check (evidence_kind in (
    'screenshot','pdf','reviewed_link','agency_attestation','yt_check'
  )),
  object_key text,
  evidence_url text,
  attestation_note text,
  captured_at timestamptz not null,
  sha256 text,
  mime_type text,
  byte_length bigint,
  storage_verified_at timestamptz,
  idempotency_key text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  deleted_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (client_id, idempotency_key),
  check (pg_catalog.char_length(idempotency_key) between 8 and 128),
  check (object_key is null or (
    pg_catalog.char_length(object_key) between 1 and 1000 and object_key !~ '[[:cntrl:]]'
  )),
  check (evidence_url is null or (
    pg_catalog.char_length(evidence_url) between 1 and 2048
    and evidence_url ~ '^https://[^[:space:][:cntrl:]]+$'
    and evidence_url !~ '^https://[^/?#]*@'
  )),
  check (attestation_note is null or pg_catalog.char_length(pg_catalog.btrim(attestation_note)) between 10 and 1000),
  check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  check (byte_length is null or byte_length between 1 and 10485760),
  check (
    (evidence_kind in ('screenshot','pdf') and object_key is not null and evidence_url is null
      and sha256 is not null and mime_type is not null and byte_length is not null
      and storage_verified_at is not null)
    or (evidence_kind in ('reviewed_link','yt_check') and object_key is null and evidence_url is not null)
    or (evidence_kind = 'agency_attestation' and object_key is null and evidence_url is null
      and attestation_note is not null)
  )
);

do $$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
    values ('portal-publication-evidence','portal-publication-evidence',false,10485760,
      array['image/png','image/jpeg','image/webp','application/pdf']::text[])
    on conflict (id) do update set public=false,file_size_limit=10485760,
      allowed_mime_types=excluded.allowed_mime_types;
    -- PostgreSQL RLS policies are OR-combined: a pre-existing broad authenticated storage policy
    -- could defeat this feature's private bucket even if we add a narrower policy. Fail closed and
    -- require an explicit catalog review instead of assuming a shared-project storage policy is safe.
    if exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname='storage' and p.tablename='objects'
        and p.roles && array['public','anon','authenticated']::name[]
    ) then
      raise exception 'review existing authenticated storage.objects policies before creating portal evidence bucket';
    end if;
  end if;
end;
$$;

create table public.content_publication_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_id uuid not null,
  content_version int not null check (content_version > 0),
  destination text not null check (destination in ('instagram','facebook','youtube','squarespace','other')),
  required boolean not null default true,
  expected_visibility text not null default 'public' check (expected_visibility in ('public','unlisted','other')),
  status text not null default 'pending' check (status in ('pending','live','removed','unavailable','failed')),
  external_id text,
  live_url text,
  published_at timestamptz,
  first_verified_at timestamptz,
  last_verified_at timestamptz,
  current_observation_id uuid,
  source_type text check (source_type is null or source_type in ('manual','api','imported')),
  evidence_id uuid,
  verifier_actor_id uuid,
  verification_note text,
  last_error text,
  reconciliation_status text not null default 'pending'
    check (reconciliation_status in ('pending','verified','unverified','conflicted')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (client_id, content_id, content_version, destination),
  foreign key (content_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade,
  foreign key (evidence_id, client_id) references public.publication_evidence(id, client_id),
  foreign key (verifier_actor_id) references public.agency_actors(id),
  check (live_url is null or pg_catalog.char_length(live_url) <= 2048),
  check (external_id is null or pg_catalog.char_length(external_id) <= 500),
  check (verification_note is null or pg_catalog.char_length(verification_note) <= 1000),
  check (last_error is null or pg_catalog.char_length(last_error) <= 1000),
  check (status <> 'live' or (
    published_at is not null and (
      live_url is not null or (source_type = 'imported' and reconciliation_status = 'unverified')
    )
  ))
);

create table public.content_publication_observations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  publication_target_id uuid not null,
  provider_object_id text,
  provider_etag_or_version text,
  provider_state text not null check (provider_state in ('live','removed','unavailable','failed')),
  provider_updated_at timestamptz,
  observed_at timestamptz not null,
  published_at timestamptz,
  observed_title text,
  observed_text text,
  observed_text_hash text,
  permalink text,
  visibility text check (visibility is null or visibility in ('public','unlisted','other')),
  media_fingerprint text,
  canonical_version_checksum text not null check (canonical_version_checksum ~ '^[0-9a-f]{64}$'),
  source_type text not null check (source_type in ('manual','api','imported')),
  reconciliation_status text not null check (reconciliation_status in ('verified','unverified','conflicted')),
  observation_key text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  evidence_id uuid not null,
  verifier_actor_id uuid not null,
  supersedes_observation_id uuid,
  sanitized_provider_metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(sanitized_provider_metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (client_id, observation_key),
  foreign key (publication_target_id, client_id)
    references public.content_publication_targets(id, client_id) on delete cascade,
  foreign key (evidence_id, client_id) references public.publication_evidence(id, client_id),
  foreign key (verifier_actor_id) references public.agency_actors(id),
  foreign key (supersedes_observation_id, client_id)
    references public.content_publication_observations(id, client_id),
  check (pg_catalog.char_length(observation_key) between 8 and 128),
  check (provider_object_id is null or pg_catalog.char_length(provider_object_id) <= 500),
  check (provider_etag_or_version is null or pg_catalog.char_length(provider_etag_or_version) <= 500),
  check (observed_title is null or pg_catalog.char_length(observed_title) <= 500),
  check (observed_text is null or pg_catalog.char_length(observed_text) <= 10000),
  check (observed_text_hash is null or observed_text_hash ~ '^[0-9a-f]{64}$'),
  check (permalink is null or pg_catalog.char_length(permalink) <= 2048),
  check (media_fingerprint is null or pg_catalog.char_length(media_fingerprint) <= 500),
  check (provider_state <> 'live' or (
    published_at is not null and (
      permalink is not null or (source_type = 'imported' and reconciliation_status = 'unverified')
    )
  ))
);

alter table public.content_publication_targets add constraint publication_target_current_observation_fk
  foreign key (current_observation_id, client_id)
  references public.content_publication_observations(id, client_id);

create table public.historical_publication_import_batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_ref text not null check (pg_catalog.char_length(source_ref) between 1 and 300
    and source_ref !~ '[[:cntrl:]]'),
  payload_checksum text not null check (payload_checksum ~ '^[0-9a-f]{64}$'),
  item_count int not null check (item_count between 1 and 500),
  status text not null check (status in ('applying','completed')),
  approved_by_actor_id uuid not null references public.agency_actors(id),
  approved_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  unique (client_id,payload_checksum)
);

create table public.historical_publication_import_entries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.historical_publication_import_batches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  piece_label text not null check (pg_catalog.char_length(piece_label) between 1 and 500),
  destination text not null check (destination in ('instagram','facebook','youtube','squarespace','other')),
  publication_target_id uuid not null,
  evidence_id uuid not null,
  observation_id uuid not null,
  provenance text not null check (provenance in ('yt_check','public_url','legacy_unverified')),
  created_at timestamptz not null default pg_catalog.now(),
  unique (batch_id,piece_label,destination),
  foreign key (publication_target_id,client_id)
    references public.content_publication_targets(id,client_id),
  foreign key (evidence_id,client_id) references public.publication_evidence(id,client_id),
  foreign key (observation_id,client_id)
    references public.content_publication_observations(id,client_id)
);

alter table public.content_items
  add column publication_locked_version int,
  add column first_live_at timestamptz,
  add column first_live_observation_id uuid,
  add constraint content_items_publication_lock_pair check (
    (publication_locked_version is null and first_live_at is null and first_live_observation_id is null)
    or (publication_locked_version is not null and first_live_at is not null and first_live_observation_id is not null)
  );

create index publication_targets_by_content on public.content_publication_targets
  (client_id, content_id, content_version, destination);
create index publication_observations_by_target on public.content_publication_observations
  (client_id, publication_target_id, created_at desc);

create or replace function public.portal_reject_immutable_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable publication history cannot be changed';
end;
$$;
create trigger publication_evidence_immutable before update or delete on public.publication_evidence
  for each row execute function public.portal_reject_immutable_history_mutation();
create trigger publication_observations_immutable before update or delete on public.content_publication_observations
  for each row execute function public.portal_reject_immutable_history_mutation();

create or replace function public.portal_enforce_publication_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.publication_locked_version is not null and (
    new.working_version is distinct from old.working_version
    or new.client_visible_version is distinct from old.client_visible_version
    or new.revision_in_progress is distinct from old.revision_in_progress
  ) then raise exception 'published content is frozen; create a linked correction work item'; end if;
  return new;
end;
$$;
create trigger content_items_publication_lock before update on public.content_items
  for each row execute function public.portal_enforce_publication_lock();

-- Purpose-aware URL validation. Schedule-management links may point at Meta Business Suite or
-- YouTube Studio; live permalinks must point at the actual destination. URLs never select tenant,
-- content, destination, or version and are never fetched by SQL.
create or replace function public.portal_provider_url_valid(
  p_destination text, p_url text, p_purpose text
) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v_authority text;
  v_host text;
begin
  if p_destination not in ('instagram','facebook','youtube','squarespace','other')
     or p_purpose not in ('schedule','live') or p_url is null
     or pg_catalog.char_length(p_url) not between 1 and 2048
     or p_url !~ '^https://[^[:space:][:cntrl:]]+$'
     or p_url ~ '^https://[^/?#]*@' then return false; end if;
  v_authority := pg_catalog.substring(p_url, '^https://([^/?#]+)');
  if v_authority is null or v_authority ~ '@' then return false; end if;
  v_host := pg_catalog.lower(pg_catalog.rtrim(
    pg_catalog.regexp_replace(v_authority, ':[0-9]+$', ''), '.'
  ));
  if p_destination = 'instagram' then
    return v_host in ('instagram.com','www.instagram.com')
      or (p_purpose = 'schedule' and v_host in ('facebook.com','www.facebook.com','business.facebook.com'));
  elsif p_destination = 'facebook' then
    return v_host in ('facebook.com','www.facebook.com','business.facebook.com','fb.watch');
  elsif p_destination = 'youtube' then
    return v_host in ('youtube.com','www.youtube.com','studio.youtube.com','youtu.be');
  elsif p_destination = 'squarespace' then
    return v_host = 'kanset.com' or v_host like '%.kanset.com';
  else
    return v_host in ('linkedin.com','www.linkedin.com');
  end if;
end;
$$;

create or replace function public.portal_publication_state(
  p_content_id uuid, p_content_version int
) returns text
language plpgsql stable set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.content_publication_targets t
    where t.content_id = p_content_id and t.content_version = p_content_version and t.required
  ) then return 'unverified'; end if;
  if not exists (
    select 1 from public.content_publication_targets t
    where t.content_id = p_content_id and t.content_version = p_content_version and t.required
      and not (t.status = 'live' and t.source_type = 'manual'
        and t.reconciliation_status = 'verified' and t.last_verified_at is not null)
  ) then return 'live'; end if;
  if exists (
    select 1 from public.content_publication_targets t
    where t.content_id = p_content_id and t.content_version = p_content_version and t.required
      and t.status = 'live'
  ) then return 'partially_live'; end if;
  if exists (
    select 1 from public.content_publication_targets t
    where t.content_id = p_content_id and t.content_version = p_content_version and t.required
      and t.status = 'failed'
  ) then return 'failed'; end if;
  if exists (
    select 1 from public.content_publication_targets t
    where t.content_id = p_content_id and t.content_version = p_content_version and t.required
      and t.status in ('unavailable','removed')
  ) then return 'unavailable'; end if;
  return 'unverified';
end;
$$;

create or replace function public.portal_sync_publication_target()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.content_publication_targets (
    client_id, content_id, content_version, destination, required
  ) values (new.client_id, new.content_id, new.content_version, new.destination, new.required)
  on conflict (client_id, content_id, content_version, destination)
  do update set required = excluded.required, updated_at = pg_catalog.now()
  where public.content_publication_targets.current_observation_id is null;
  return new;
end;
$$;
create trigger schedule_target_publication_target
  after insert or update of required on public.content_schedule_targets
  for each row execute function public.portal_sync_publication_target();

insert into public.content_publication_targets (
  client_id, content_id, content_version, destination, required
)
select t.client_id, t.content_id, t.content_version, t.destination, t.required
from public.content_schedule_targets t
on conflict (client_id, content_id, content_version, destination) do nothing;

create or replace function public.register_publication_evidence(
  p_client_id uuid,
  p_actor_key text,
  p_evidence_kind text,
  p_object_key text,
  p_evidence_url text,
  p_attestation_note text,
  p_captured_at timestamptz,
  p_sha256 text,
  p_mime_type text,
  p_byte_length bigint,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_existing public.publication_evidence%rowtype;
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_fingerprint text;
  v_id uuid;
begin
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;
  select * into v_actor from public.agency_actors a
  where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'agency actor is unavailable'; end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,128}$' then raise exception 'invalid idempotency key'; end if;
  if p_captured_at is null or p_captured_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'invalid evidence capture time';
  end if;
  if p_evidence_kind in ('screenshot','pdf') then
    if p_object_key is null or p_sha256 !~ '^[0-9a-f]{64}$'
       or p_byte_length not between 1 and 10485760
       or (p_evidence_kind = 'screenshot' and p_mime_type not in ('image/png','image/jpeg','image/webp'))
       or (p_evidence_kind = 'pdf' and p_mime_type <> 'application/pdf') then
      raise exception 'invalid uploaded evidence metadata';
    end if;
    if p_object_key !~ ('^' || p_client_id::text || '/[0-9a-f-]{36}/[a-z0-9._-]+$') then
      raise exception 'evidence object is outside the tenant prefix';
    end if;
  end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.concat_ws('|','evidence',p_client_id::text,p_actor_key,p_evidence_kind,
      p_object_key,p_evidence_url,p_attestation_note,p_captured_at::text,p_sha256,
      p_mime_type,p_byte_length::text), 'UTF8'), 'sha256'), 'hex');
  select * into v_existing from public.publication_evidence e
  where e.client_id = p_client_id and e.idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then raise exception 'idempotency_key_conflict'; end if;
    return v_existing.id;
  end if;
  insert into public.publication_evidence (
    client_id, actor_id, evidence_kind, object_key, evidence_url, attestation_note,
    captured_at, sha256, mime_type, byte_length, storage_verified_at,
    idempotency_key, request_fingerprint
  ) values (
    p_client_id, v_actor.id, p_evidence_kind, nullif(pg_catalog.btrim(p_object_key),''),
    nullif(pg_catalog.btrim(p_evidence_url),''), nullif(pg_catalog.btrim(p_attestation_note),''),
    p_captured_at, nullif(pg_catalog.btrim(p_sha256),''), nullif(pg_catalog.btrim(p_mime_type),''),
    p_byte_length, case when p_evidence_kind in ('screenshot','pdf') then pg_catalog.now() end,
    v_key, v_fingerprint
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.check_admin_login_rate_limit(
  p_key_hash text, p_limit int default 5, p_window_seconds int default 900
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.admin_login_rate_limits%rowtype;
  v_now timestamptz := pg_catalog.now();
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_limit not between 1 and 20
     or p_window_seconds not between 60 and 86400 then raise exception 'invalid rate-limit input'; end if;
  insert into public.admin_login_rate_limits (key_hash,window_started_at,attempts)
  values (p_key_hash,v_now,1)
  on conflict (key_hash) do update set
    window_started_at=case when public.admin_login_rate_limits.window_started_at
      + pg_catalog.make_interval(secs=>p_window_seconds) <= v_now then v_now
      else public.admin_login_rate_limits.window_started_at end,
    attempts=case when public.admin_login_rate_limits.window_started_at
      + pg_catalog.make_interval(secs=>p_window_seconds) <= v_now then 1
      else public.admin_login_rate_limits.attempts+1 end,
    updated_at=v_now
  returning * into v_row;
  return pg_catalog.jsonb_build_object(
    'allowed',v_row.attempts <= p_limit,
    'remaining',pg_catalog.greatest(0,p_limit-v_row.attempts),
    'reset_at',v_row.window_started_at + pg_catalog.make_interval(secs=>p_window_seconds)
  );
end;
$$;

-- Service-only manual scheduling confirmation. It resolves the latest pending attempt for this
-- destination and never infers success merely from the requested time.
create or replace function public.confirm_schedule_target(
  p_schedule_target_id uuid,
  p_scheduled_at timestamptz,
  p_external_url text,
  p_external_id text,
  p_evidence_id uuid,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.content_schedule_targets%rowtype;
  v_ci public.content_items%rowtype;
  v_actor public.agency_actors%rowtype;
  v_evidence public.publication_evidence%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_fingerprint text;
  v_response jsonb;
  v_title text;
  v_revision bigint;
  v_fully_scheduled boolean;
begin
  select * into v_target from public.content_schedule_targets t
  where t.id = p_schedule_target_id for update;
  if not found then raise exception 'schedule target not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'agency actor is unavailable'; end if;
  select * into v_evidence from public.publication_evidence e
  where e.id = p_evidence_id and e.client_id = v_target.client_id and e.deleted_at is null;
  if not found then raise exception 'valid same-tenant evidence is required'; end if;
  if v_evidence.actor_id <> v_actor.id then raise exception 'evidence actor mismatch'; end if;
  if v_evidence.evidence_kind = 'agency_attestation' then
    raise exception 'manual schedule confirmation requires screenshot, PDF, or reviewed link evidence';
  end if;
  select * into v_ci from public.content_items ci where ci.id = v_target.content_id for update;
  if not found or v_ci.client_id <> v_target.client_id
     or v_ci.client_visible_version is distinct from v_target.content_version
     or v_ci.status not in ('approved','scheduled') or v_ci.revision_in_progress then
    raise exception 'schedule target is not eligible for confirmation';
  end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,128}$' then raise exception 'invalid idempotency key'; end if;
  if p_scheduled_at is null or p_scheduled_at < pg_catalog.now() - interval '10 years'
     or p_scheduled_at > pg_catalog.now() + interval '2 years' then raise exception 'scheduled time is out of range'; end if;
  if not public.portal_provider_url_valid(v_target.destination,p_external_url,'schedule') then
    raise exception 'provider schedule URL is not allowed for destination';
  end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.concat_ws('|','confirm_schedule',v_target.id::text,p_scheduled_at::text,
      p_external_url,p_external_id,p_evidence_id::text,p_actor_key), 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts r
  where r.client_id = v_target.client_id and r.idempotency_key = v_key;
  if found then
    if v_receipt.command_type <> 'confirm_schedule_target'
       or v_receipt.request_fingerprint <> v_fingerprint then raise exception 'idempotency_key_conflict'; end if;
    return v_receipt.response;
  end if;
  update public.content_schedule_targets set
    scheduled_at = p_scheduled_at, status = 'scheduled', verified_at = pg_catalog.now(),
    source_type = 'manual', external_url = p_external_url,
    external_id = nullif(pg_catalog.btrim(p_external_id),''), evidence_id = p_evidence_id,
    verifier_actor_id = v_actor.id, last_error = null, updated_at = pg_catalog.now()
  where id = v_target.id;
  update public.content_schedule_request_attempts a set
    status = 'succeeded', result_scheduled_at = p_scheduled_at, source_type = 'manual',
    external_url = p_external_url, external_id = nullif(pg_catalog.btrim(p_external_id),''),
    evidence_id = p_evidence_id, resolved_at = pg_catalog.now(), last_error = null
  where a.schedule_target_id = v_target.id and a.status in ('pending','applying');
  update public.content_schedule_requests r set
    status = case
      when exists (select 1 from public.content_schedule_request_attempts a
        where a.request_id = r.id and a.status in ('pending','applying')) then 'partially_applied'
      when exists (select 1 from public.content_schedule_request_attempts a
        where a.request_id = r.id and a.status in ('failed','conflicted')) then 'conflicted'
      else 'applied' end,
    resolution_code = 'agency_verified', client_message = 'The Dot verified the provider schedule.',
    resolved_at = case when not exists (select 1 from public.content_schedule_request_attempts a
      where a.request_id = r.id and a.status in ('pending','applying')) then pg_catalog.now() end,
    updated_at = pg_catalog.now()
  where r.id in (select a.request_id from public.content_schedule_request_attempts a
    where a.schedule_target_id = v_target.id);
  v_fully_scheduled := public.portal_content_schedule_state(
    v_target.content_id,v_target.content_version) = 'scheduled';
  update public.content_items set status = case when v_fully_scheduled then 'scheduled' else status end,
    projection_revision = projection_revision + 1, updated_at = pg_catalog.now()
  where id = v_target.content_id returning projection_revision into v_revision;
  select cv.title into v_title from public.content_item_versions cv
  where cv.content_item_id = v_target.content_id and cv.client_id = v_target.client_id
    and cv.version = v_target.content_version;
  insert into public.activity_log (client_id,content_id,content_version,event_type,event_key,
    title,summary,actor_type,actor_name) values (
    v_target.client_id,v_target.content_id,v_target.content_version,'schedule_target_confirmed',
    'schedule-confirm:' || v_target.client_id::text || ':' || v_key,
    'Schedule confirmed: ' || v_title,
    v_target.destination || ' · provider time ' || p_scheduled_at::text,
    'anastasia',v_actor.display_name);
  if v_fully_scheduled then
    insert into public.activity_log (client_id,content_id,content_version,event_type,event_key,
      title,summary,actor_type,actor_name) values (
      v_target.client_id,v_target.content_id,v_target.content_version,'fully_scheduled',
      'fully-scheduled:' || v_target.content_id::text || ':' || v_target.content_version::text,
      'Fully scheduled: ' || v_title,'Every required destination was manually verified.',
      'anastasia',v_actor.display_name) on conflict (client_id,event_key) where event_key is not null do nothing;
  end if;
  v_response := pg_catalog.jsonb_build_object('target_id',v_target.id,'outcome','confirmed',
    'fully_scheduled',v_fully_scheduled);
  insert into public.portal_command_receipts (client_id,command_type,idempotency_key,
    request_fingerprint,response) values (
    v_target.client_id,'confirm_schedule_target',v_key,v_fingerprint,v_response);
  insert into public.portal_inbox_events (client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation) values (
    v_target.client_id,'schedule-confirm:' || v_target.client_id::text || ':' || v_key,
    'schedule_target_confirmed','content_schedule_target',v_target.id,'anastasia',v_actor.display_name,
    pg_catalog.jsonb_build_object('content_id',v_target.content_id,
      'content_version',v_target.content_version,'destination',v_target.destination),false);
  insert into public.projection_outbox (client_id,event_key,destination,operation,object_type,
    object_key,object_revision,payload) values (
    v_target.client_id,'schedule-confirm:' || v_target.client_id::text || ':' || v_key,
    'notion','upsert','content',v_target.content_id::text,v_revision,
    pg_catalog.jsonb_build_object('reason','schedule_target_confirmed'));
  return v_response;
end;
$$;

create or replace function public.mark_schedule_target_failed(
  p_schedule_target_id uuid,
  p_error text,
  p_evidence_id uuid,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.content_schedule_targets%rowtype;
  v_actor public.agency_actors%rowtype;
  v_evidence public.publication_evidence%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_error text := pg_catalog.btrim(p_error);
  v_fingerprint text;
  v_response jsonb;
  v_title text;
  v_revision bigint;
begin
  select * into v_target from public.content_schedule_targets t
    where t.id=p_schedule_target_id for update;
  if not found then raise exception 'schedule target not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'agency actor is unavailable'; end if;
  select * into v_evidence from public.publication_evidence e where e.id=p_evidence_id
    and e.client_id=v_target.client_id and e.actor_id=v_actor.id and e.deleted_at is null;
  if not found then raise exception 'valid same-tenant evidence is required'; end if;
  if v_evidence.evidence_kind = 'agency_attestation' then
    raise exception 'manual schedule failure requires screenshot, PDF, or reviewed link evidence';
  end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,128}$' or pg_catalog.char_length(v_error) not between 3 and 1000 then
    raise exception 'invalid schedule failure record'; end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.concat_ws('|','schedule_failed',v_target.id::text,v_error,p_evidence_id::text,p_actor_key),
    'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts r where r.client_id=v_target.client_id
    and r.idempotency_key=v_key;
  if found then
    if v_receipt.command_type <> 'mark_schedule_target_failed'
       or v_receipt.request_fingerprint <> v_fingerprint then raise exception 'idempotency_key_conflict'; end if;
    return v_receipt.response;
  end if;
  update public.content_schedule_targets set status='failed',source_type='manual',
    verified_at=pg_catalog.now(),evidence_id=p_evidence_id,verifier_actor_id=v_actor.id,
    last_error=v_error,updated_at=pg_catalog.now() where id=v_target.id;
  update public.content_schedule_request_attempts set status='failed',source_type='manual',
    evidence_id=p_evidence_id,last_error=v_error,resolved_at=pg_catalog.now()
  where schedule_target_id=v_target.id and status in ('pending','applying');
  update public.content_schedule_requests r set status='conflicted',resolution_code='provider_failure',
    client_message='The provider schedule could not be confirmed.',resolved_at=pg_catalog.now(),
    updated_at=pg_catalog.now() where r.id in (select a.request_id
      from public.content_schedule_request_attempts a where a.schedule_target_id=v_target.id);
  update public.content_items set projection_revision=projection_revision+1,updated_at=pg_catalog.now()
    where id=v_target.content_id returning projection_revision into v_revision;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id=v_target.content_id and cv.client_id=v_target.client_id
      and cv.version=v_target.content_version;
  insert into public.activity_log (client_id,content_id,content_version,event_type,event_key,title,
    summary,actor_type,actor_name) values (v_target.client_id,v_target.content_id,
    v_target.content_version,'schedule_target_failed','schedule-failed:'||v_target.client_id::text||':'||v_key,
    'Schedule issue: '||v_title,
    v_target.destination||' · provider schedule could not be confirmed.',
    'anastasia',v_actor.display_name);
  v_response := pg_catalog.jsonb_build_object('target_id',v_target.id,'outcome','failed');
  insert into public.portal_command_receipts (client_id,command_type,idempotency_key,
    request_fingerprint,response) values (v_target.client_id,'mark_schedule_target_failed',v_key,
    v_fingerprint,v_response);
  insert into public.portal_inbox_events (client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation) values (v_target.client_id,
    'schedule-failed:'||v_target.client_id::text||':'||v_key,'schedule_target_failed',
    'content_schedule_target',v_target.id,'anastasia',v_actor.display_name,
    pg_catalog.jsonb_build_object('content_id',v_target.content_id,
      'content_version',v_target.content_version,'destination',v_target.destination),true);
  insert into public.projection_outbox (client_id,event_key,destination,operation,object_type,
    object_key,object_revision,payload) values (v_target.client_id,
    'schedule-failed:'||v_target.client_id::text||':'||v_key,'notion','upsert','content',
    v_target.content_id::text,v_revision,pg_catalog.jsonb_build_object('reason','schedule_target_failed'));
  return v_response;
end;
$$;

create or replace function public.record_publication_observation(
  p_publication_target_id uuid,
  p_provider_state text,
  p_live_url text,
  p_published_at timestamptz,
  p_visibility text,
  p_evidence_id uuid,
  p_actor_key text,
  p_source_type text,
  p_reconciliation_status text,
  p_provider_object_id text,
  p_observed_title text,
  p_observed_text text,
  p_observation_key text,
  p_supersedes_observation_id uuid default null,
  p_verification_note text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.content_publication_targets%rowtype;
  v_ci public.content_items%rowtype;
  v_actor public.agency_actors%rowtype;
  v_evidence public.publication_evidence%rowtype;
  v_existing public.content_publication_observations%rowtype;
  v_current public.content_publication_observations%rowtype;
  v_checksum text;
  v_title text;
  v_key text := pg_catalog.btrim(p_observation_key);
  v_fingerprint text;
  v_text_hash text;
  v_observation_id uuid;
  v_before_state text;
  v_after_state text;
  v_revision bigint;
  v_event_type text;
begin
  select * into v_target from public.content_publication_targets t
  where t.id = p_publication_target_id for update;
  if not found then raise exception 'publication target not found'; end if;
  select * into v_ci from public.content_items ci where ci.id = v_target.content_id for update;
  if not found or v_ci.client_id <> v_target.client_id
     or v_ci.client_visible_version is distinct from v_target.content_version then
    raise exception 'publication target is not the released version';
  end if;
  if v_ci.status not in ('approved','scheduled','posted') or v_ci.revision_in_progress
     or not exists (
       select 1 from public.approvals a where a.content_id = v_ci.id
         and a.client_id = v_ci.client_id and a.content_version = v_target.content_version
         and a.state = 'approved'
         and not exists (select 1 from public.approvals newer
           where newer.content_id = a.content_id and newer.client_id = a.client_id
             and newer.content_version = a.content_version
             and (newer.created_at,newer.id) > (a.created_at,a.id))
     ) then raise exception 'content is not approved for publication'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'agency actor is unavailable'; end if;
  select * into v_evidence from public.publication_evidence e
  where e.id = p_evidence_id and e.client_id = v_target.client_id and e.deleted_at is null;
  if not found then raise exception 'valid same-tenant evidence is required'; end if;
  if v_evidence.actor_id <> v_actor.id then raise exception 'evidence actor mismatch'; end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,128}$' then raise exception 'invalid observation key'; end if;
  if p_provider_state not in ('live','removed','unavailable','failed')
     or p_source_type not in ('manual','imported')
     or p_reconciliation_status not in ('verified','unverified','conflicted')
     or p_visibility not in ('public','unlisted','other') then raise exception 'invalid publication observation'; end if;
  if p_source_type = 'manual' and p_reconciliation_status <> 'verified' then
    raise exception 'manual confirmations must be verified';
  end if;
  if p_provider_state = 'live' then
    if p_published_at is null or p_published_at > pg_catalog.now() + interval '5 minutes'
       or p_published_at < pg_catalog.now() - interval '20 years' then
      raise exception 'published time is out of range';
    end if;
    if p_live_url is null and not (
      p_source_type = 'imported' and p_reconciliation_status = 'unverified'
    ) then raise exception 'live URL is required for a verified publication'; end if;
    if p_live_url is not null
       and not public.portal_provider_url_valid(v_target.destination,p_live_url,'live') then
      raise exception 'live URL is not allowed for destination';
    end if;
  elsif p_live_url is not null
     and not public.portal_provider_url_valid(v_target.destination,p_live_url,'live') then
    raise exception 'provider URL is not allowed for destination';
  end if;
  if p_source_type = 'manual' and v_evidence.evidence_kind = 'agency_attestation' then
    raise exception 'new manual publication confirmation requires screenshot, PDF, or reviewed link evidence';
  end if;
  if p_observed_title is not null and pg_catalog.char_length(p_observed_title) > 500 then
    raise exception 'observed title is too long'; end if;
  if p_observed_text is not null and pg_catalog.char_length(p_observed_text) > 10000 then
    raise exception 'observed text is too long'; end if;
  if p_verification_note is not null and pg_catalog.char_length(p_verification_note) > 1000 then
    raise exception 'verification note is too long'; end if;
  select cv.content_checksum, cv.title into v_checksum, v_title
  from public.content_item_versions cv where cv.content_item_id = v_target.content_id
    and cv.client_id = v_target.client_id and cv.version = v_target.content_version;
  if not found then raise exception 'released snapshot not found'; end if;
  v_text_hash := case when p_observed_text is null then null else pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_observed_text,'UTF8'),'sha256'),'hex') end;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.concat_ws('|','publication',v_target.id::text,p_provider_state,p_live_url,
      p_published_at::text,p_visibility,p_evidence_id::text,p_actor_key,p_source_type,
      p_reconciliation_status,p_provider_object_id,p_observed_title,v_text_hash,
      p_supersedes_observation_id::text,p_verification_note), 'UTF8'), 'sha256'), 'hex');
  select * into v_existing from public.content_publication_observations o
  where o.client_id = v_target.client_id and o.observation_key = v_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then raise exception 'observation_key_conflict'; end if;
    return v_existing.id;
  end if;
  if v_target.current_observation_id is null then
    if p_supersedes_observation_id is not null then raise exception 'first observation cannot supersede another'; end if;
  else
    select * into v_current from public.content_publication_observations o
      where o.id = v_target.current_observation_id and o.client_id = v_target.client_id;
    if p_supersedes_observation_id is distinct from v_current.id then
      raise exception 'correction must supersede the current observation';
    end if;
  end if;
  v_before_state := public.portal_publication_state(v_target.content_id,v_target.content_version);
  insert into public.content_publication_observations (
    client_id,publication_target_id,provider_object_id,provider_state,observed_at,published_at,
    observed_title,observed_text,observed_text_hash,permalink,visibility,
    canonical_version_checksum,source_type,reconciliation_status,observation_key,
    request_fingerprint,evidence_id,verifier_actor_id,supersedes_observation_id
  ) values (
    v_target.client_id,v_target.id,nullif(pg_catalog.btrim(p_provider_object_id),''),p_provider_state,
    pg_catalog.now(),p_published_at,nullif(pg_catalog.btrim(p_observed_title),''),
    nullif(p_observed_text,''),v_text_hash,nullif(pg_catalog.btrim(p_live_url),''),p_visibility,
    v_checksum,p_source_type,p_reconciliation_status,v_key,v_fingerprint,p_evidence_id,v_actor.id,
    p_supersedes_observation_id
  ) returning id into v_observation_id;
  update public.content_publication_targets set
    status = p_provider_state,
    external_id = coalesce(nullif(pg_catalog.btrim(p_provider_object_id),''),external_id),
    live_url = coalesce(nullif(pg_catalog.btrim(p_live_url),''),live_url),
    published_at = coalesce(p_published_at,published_at),
    first_verified_at = case when p_provider_state = 'live' and p_reconciliation_status = 'verified'
      then coalesce(first_verified_at,pg_catalog.now()) else first_verified_at end,
    last_verified_at = case when p_reconciliation_status = 'verified' then pg_catalog.now() else last_verified_at end,
    current_observation_id = v_observation_id, source_type = p_source_type,
    evidence_id = p_evidence_id, verifier_actor_id = v_actor.id,
    verification_note = nullif(pg_catalog.btrim(p_verification_note),''),
    reconciliation_status = p_reconciliation_status,
    last_error = case when p_provider_state = 'failed' then coalesce(nullif(pg_catalog.btrim(p_verification_note),''),'Provider confirmation failed') else null end,
    updated_at = pg_catalog.now()
  where id = v_target.id;
  if p_provider_state = 'live' and p_reconciliation_status = 'verified'
     and v_ci.publication_locked_version is null then
    update public.content_items set publication_locked_version = v_target.content_version,
      first_live_at = p_published_at, first_live_observation_id = v_observation_id,
      projection_revision = projection_revision + 1, updated_at = pg_catalog.now()
    where id = v_ci.id returning projection_revision into v_revision;
  else
    update public.content_items set projection_revision = projection_revision + 1,
      updated_at = pg_catalog.now() where id = v_ci.id returning projection_revision into v_revision;
  end if;
  v_after_state := public.portal_publication_state(v_target.content_id,v_target.content_version);
  update public.content_items set status = case
    when v_after_state = 'live' then 'posted'
    when status = 'posted' then 'scheduled'
    else status end, updated_at = pg_catalog.now()
  where id = v_ci.id;
  v_event_type := case p_provider_state when 'live' then 'publication_target_live'
    when 'removed' then 'publication_target_removed'
    when 'unavailable' then 'publication_target_unavailable'
    else 'publication_target_failed' end;
  insert into public.activity_log (client_id,content_id,content_version,event_type,event_key,
    title,summary,actor_type,actor_name) values (
    v_target.client_id,v_target.content_id,v_target.content_version,v_event_type,
    'publication:' || v_observation_id::text,
    case p_provider_state when 'live' then 'Live: ' when 'removed' then 'Removed: '
      when 'unavailable' then 'Unavailable: ' else 'Publication issue: ' end || v_title,
    v_target.destination || case when p_source_type = 'imported'
      then ' · pre-portal record' else ' · manually verified by The Dot' end,
    'anastasia',v_actor.display_name);
  if v_before_state <> 'live' and v_after_state = 'live' then
    insert into public.activity_log (client_id,content_id,content_version,event_type,event_key,
      title,summary,actor_type,actor_name) values (
      v_target.client_id,v_target.content_id,v_target.content_version,'fully_posted',
      'fully-posted:' || v_target.content_id::text || ':' || v_target.content_version::text,
      'Published everywhere: ' || v_title,
      'Every required destination was manually verified live.','anastasia',v_actor.display_name)
    on conflict (client_id,event_key) where event_key is not null do nothing;
  end if;
  insert into public.portal_inbox_events (client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation) values (
    v_target.client_id,'publication:' || v_observation_id::text,v_event_type,
    'content_publication_target',v_target.id,'anastasia',v_actor.display_name,
    pg_catalog.jsonb_build_object('content_id',v_target.content_id,
      'content_version',v_target.content_version,'destination',v_target.destination,
      'provider_state',p_provider_state,'source_type',p_source_type,
      'reconciliation_status',p_reconciliation_status),false);
  insert into public.projection_outbox (client_id,event_key,destination,operation,object_type,
    object_key,object_revision,payload) values (
    v_target.client_id,'publication:' || v_observation_id::text,'notion','upsert','content',
    v_target.content_id::text,v_revision,
    pg_catalog.jsonb_build_object('reason',v_event_type,'observation_id',v_observation_id));
  return v_observation_id;
end;
$$;

-- Read-only preview uses the same SQL boundary inside a subtransaction that is always rolled back.
-- It proves the exact operation without leaving rows, activity, pointers, or outbox work behind.
create or replace function public.preview_publication_observation(
  p_publication_target_id uuid,
  p_provider_state text,
  p_live_url text,
  p_published_at timestamptz,
  p_visibility text,
  p_evidence_id uuid,
  p_actor_key text,
  p_source_type text,
  p_reconciliation_status text,
  p_provider_object_id text,
  p_observed_title text,
  p_observed_text text,
  p_observation_key text,
  p_supersedes_observation_id uuid default null,
  p_verification_note text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  begin
    v_id := public.record_publication_observation(
      p_publication_target_id,p_provider_state,p_live_url,p_published_at,p_visibility,
      p_evidence_id,p_actor_key,p_source_type,p_reconciliation_status,p_provider_object_id,
      p_observed_title,p_observed_text,p_observation_key,p_supersedes_observation_id,
      p_verification_note
    );
    raise exception using errcode = 'P0001', message = '__portal_preview_rollback__' || v_id::text;
  exception when sqlstate 'P0001' then
    if sqlerrm like '__portal_preview_rollback__%' then
      return pg_catalog.jsonb_build_object('valid',true,'would_create_observation_id',
        pg_catalog.substr(sqlerrm,29));
    end if;
    raise;
  end;
end;
$$;

create or replace function public.preview_historical_publication_import(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_evidence_id uuid;
  v_observation_id uuid;
begin
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid import payload'; end if;
  begin
    v_evidence_id := public.register_publication_evidence(
      (p_payload->>'client_id')::uuid,'thedot-admin',p_payload->>'evidence_kind',null,
      nullif(p_payload->>'evidence_url',''),nullif(p_payload->>'attestation_note',''),
      (p_payload->>'captured_at')::timestamptz,null,null,null,
      p_payload->>'evidence_idempotency_key'
    );
    v_observation_id := public.record_publication_observation(
      (p_payload->>'publication_target_id')::uuid,'live',nullif(p_payload->>'live_url',''),
      (p_payload->>'published_at')::timestamptz,
      coalesce(nullif(p_payload->>'visibility',''),'public'),v_evidence_id,'thedot-admin',
      'imported',p_payload->>'reconciliation_status',nullif(p_payload->>'provider_object_id',''),
      nullif(p_payload->>'observed_title',''),nullif(p_payload->>'observed_text',''),
      p_payload->>'observation_key',null,nullif(p_payload->>'verification_note','')
    );
    raise exception using errcode='P0001',message='__portal_import_preview__'||v_observation_id::text;
  exception when sqlstate 'P0001' then
    if sqlerrm like '__portal_import_preview__%' then
      return pg_catalog.jsonb_build_object('valid',true,'zero_write',true);
    end if;
    raise;
  end;
end;
$$;

create or replace function public.preview_historical_publication_batch(
  p_client_id uuid,p_source_ref text,p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_count int := 0;
  v_checksum text;
begin
  if not exists (select 1 from public.clients c where c.id=p_client_id)
     or p_source_ref is null or pg_catalog.char_length(pg_catalog.btrim(p_source_ref)) not between 1 and 300
     or p_source_ref ~ '[[:cntrl:]]' or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'invalid historical import batch';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_items) e(value)
    group by e.value->>'evidence_idempotency_key' having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_items) e(value)
      group by e.value->>'observation_key' having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_items) e(value)
      group by e.value->>'publication_target_id' having pg_catalog.count(*) > 1) then
    raise exception 'historical import contains duplicate keys or targets';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    if (v_item->>'client_id')::uuid is distinct from p_client_id then
      raise exception 'historical import tenant mismatch'; end if;
    perform public.preview_historical_publication_import(v_item);
    v_count := v_count+1;
  end loop;
  v_checksum := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(p_items::text,'UTF8'),'sha256'),'hex');
  return pg_catalog.jsonb_build_object('valid',true,'zero_write',true,
    'item_count',v_count,'approved_checksum',v_checksum,'source_ref',p_source_ref);
end;
$$;

create or replace function public.apply_historical_publication_batch(
  p_client_id uuid,p_source_ref text,p_items jsonb,p_approved_checksum text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_actor public.agency_actors%rowtype;
  v_existing public.historical_publication_import_batches%rowtype;
  v_batch_id uuid;
  v_evidence_id uuid;
  v_observation_id uuid;
  v_checksum text;
begin
  if pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) not between 1 and 500
     or p_source_ref is null or pg_catalog.char_length(pg_catalog.btrim(p_source_ref)) not between 1 and 300
     or p_source_ref ~ '[[:cntrl:]]' then raise exception 'invalid historical import batch'; end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_items) e(value)
    group by e.value->>'evidence_idempotency_key' having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_items) e(value)
      group by e.value->>'observation_key' having pg_catalog.count(*) > 1)
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_items) e(value)
      group by e.value->>'publication_target_id' having pg_catalog.count(*) > 1) then
    raise exception 'historical import contains duplicate keys or targets';
  end if;
  v_checksum := pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(p_items::text,'UTF8'),'sha256'),'hex');
  if p_approved_checksum is distinct from v_checksum then raise exception 'approved batch checksum mismatch'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key='thedot-admin' and a.active;
  if not found then raise exception 'agency actor is unavailable'; end if;
  select * into v_existing from public.historical_publication_import_batches b
    where b.client_id=p_client_id and b.payload_checksum=v_checksum;
  if found then
    if v_existing.status <> 'completed' then raise exception 'historical import batch is incomplete'; end if;
    return v_existing.id;
  end if;
  insert into public.historical_publication_import_batches (
    client_id,source_ref,payload_checksum,item_count,status,approved_by_actor_id,approved_at
  ) values (p_client_id,p_source_ref,v_checksum,pg_catalog.jsonb_array_length(p_items),
    'applying',v_actor.id,pg_catalog.now()) returning id into v_batch_id;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    if (v_item->>'client_id')::uuid is distinct from p_client_id then
      raise exception 'historical import tenant mismatch'; end if;
    v_evidence_id := public.register_publication_evidence(
      p_client_id,'thedot-admin',v_item->>'evidence_kind',null,
      nullif(v_item->>'evidence_url',''),nullif(v_item->>'attestation_note',''),
      (v_item->>'captured_at')::timestamptz,null,null,null,
      v_item->>'evidence_idempotency_key'
    );
    v_observation_id := public.record_publication_observation(
      (v_item->>'publication_target_id')::uuid,'live',nullif(v_item->>'live_url',''),
      (v_item->>'published_at')::timestamptz,
      coalesce(nullif(v_item->>'visibility',''),'public'),v_evidence_id,'thedot-admin',
      'imported',v_item->>'reconciliation_status',nullif(v_item->>'provider_object_id',''),
      nullif(v_item->>'observed_title',''),nullif(v_item->>'observed_text',''),
      v_item->>'observation_key',null,nullif(v_item->>'verification_note','')
    );
    insert into public.historical_publication_import_entries (
      batch_id,client_id,piece_label,destination,publication_target_id,
      evidence_id,observation_id,provenance
    ) values (v_batch_id,p_client_id,v_item->>'piece_label',v_item->>'destination',
      (v_item->>'publication_target_id')::uuid,v_evidence_id,v_observation_id,
      v_item->>'provenance');
  end loop;
  update public.historical_publication_import_batches set status='completed',
    completed_at=pg_catalog.now() where id=v_batch_id;
  return v_batch_id;
end;
$$;

alter table public.content_items
  add constraint content_items_first_live_version_fk
    foreign key (id,client_id,publication_locked_version)
    references public.content_item_versions(content_item_id,client_id,version),
  add constraint content_items_first_live_observation_fk
    foreign key (first_live_observation_id,client_id)
    references public.content_publication_observations(id,client_id);

alter table public.agency_actors enable row level security;
alter table public.admin_login_rate_limits enable row level security;
alter table public.publication_evidence enable row level security;
alter table public.content_publication_targets enable row level security;
alter table public.content_publication_observations enable row level security;
alter table public.historical_publication_import_batches enable row level security;
alter table public.historical_publication_import_entries enable row level security;

create policy publication_targets_read on public.content_publication_targets for select
  using (client_id in (select public.my_client_ids()));
create policy publication_observations_read on public.content_publication_observations for select
  using (client_id in (select public.my_client_ids()));

create view public.content_publication_targets_client
with (security_invoker = true)
as
select
  t.id,t.client_id,t.content_id,t.content_version,t.destination,t.required,
  t.expected_visibility,t.status,t.live_url,t.published_at,t.first_verified_at,
  t.last_verified_at,t.reconciliation_status,
  case
    when t.source_type = 'manual' and t.reconciliation_status = 'verified'
      then 'manually verified by The Dot'
    when t.source_type = 'imported' and t.reconciliation_status = 'verified'
      then 'verified pre-portal record'
    when t.source_type = 'imported'
      then 'posted pre-portal, not independently verified'
    else 'not yet verified'
  end::text as verification_label,
  o.provider_state as current_provider_state,
  o.visibility as current_visibility,
  o.created_at as observed_at,
  t.created_at,t.updated_at
from public.content_publication_targets t
left join public.content_publication_observations o
  on o.id = t.current_observation_id and o.client_id = t.client_id;

drop view public.content_with_state;
create view public.content_with_state
with (security_invoker = true)
as
select
  ci.id,ci.content_id,ci.client_id,v.title,v.format,v.pillar,v.platforms,ci.status,
  ci.planned_date,schedule.schedule_state,publication.publication_state,
  v.canva_url,v.drive_url,v.version,v.fact_check,v.fact_check_scope,
  v.fact_check_exemption,v.fact_check_ledger,v.client_body,v.copy_blocks,
  v.synced_at as updated_at,ci.review_ready_at,ci.revision_in_progress,ci.archived_at,
  decision.state as current_decision,
  case
    when ci.archived_at is not null then 'archived'
    when publication.publication_state = 'live' then 'live'
    when schedule.schedule_state = 'cancel_pending' then 'cancel_pending'
    when decision.state = 'change_requested' or ci.revision_in_progress then 'with_dot'
    when publication.publication_state = 'partially_live' then 'partially_live'
    when publication.publication_state = 'failed' then 'publish_failed'
    when schedule.schedule_state = 'reschedule_pending' then 'reschedule_pending'
    when schedule.schedule_state = 'failed' then 'schedule_failed'
    when schedule.schedule_state = 'partially_scheduled' then 'partially_scheduled'
    when schedule.schedule_state = 'scheduled' then 'scheduled'
    when ci.status = 'approved' then 'approved'
    when ci.status = 'draft' and ci.review_ready_at is not null then 'needs_review'
    else 'with_dot'
  end::text as client_state
from public.content_items ci
join public.content_item_versions v on v.content_item_id = ci.id
  and v.client_id = ci.client_id and v.version = ci.client_visible_version
cross join lateral (select public.portal_content_schedule_state(
  ci.id,ci.client_visible_version) as schedule_state) schedule
cross join lateral (select public.portal_publication_state(
  ci.id,ci.client_visible_version) as publication_state) publication
left join lateral (
  select a.state from public.approvals a where a.content_id = ci.id
    and a.client_id = ci.client_id and a.content_version = ci.client_visible_version
  order by a.created_at desc,a.id desc limit 1
) decision on true;

revoke all on public.agency_actors,public.admin_login_rate_limits,public.publication_evidence,
  public.historical_publication_import_batches,public.historical_publication_import_entries,
  public.content_publication_targets,public.content_publication_observations,
  public.content_publication_targets_client,public.content_with_state
  from public,anon,authenticated,service_role;

grant select (
  id,client_id,content_id,content_version,destination,required,expected_visibility,status,
  live_url,published_at,first_verified_at,last_verified_at,reconciliation_status,
  current_observation_id,source_type,created_at,updated_at
) on public.content_publication_targets to authenticated;
grant select (
  id,client_id,publication_target_id,provider_state,observed_at,published_at,
  permalink,visibility,source_type,reconciliation_status,created_at
) on public.content_publication_observations to authenticated;
grant select on public.content_publication_targets_client,public.content_with_state to authenticated;

grant select on public.agency_actors,public.publication_evidence,
  public.historical_publication_import_batches,public.historical_publication_import_entries,
  public.content_publication_targets,public.content_publication_observations,
  public.content_publication_targets_client,public.content_with_state to service_role;

revoke all on function public.portal_reject_immutable_history_mutation() from public,anon,authenticated,service_role;
revoke all on function public.portal_enforce_publication_lock() from public,anon,authenticated,service_role;
revoke all on function public.portal_sync_publication_target() from public,anon,authenticated,service_role;
revoke all on function public.portal_provider_url_valid(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.portal_publication_state(uuid,int) from public,anon;
revoke all on function public.register_publication_evidence(uuid,text,text,text,text,text,timestamptz,text,text,bigint,text)
  from public,anon,authenticated;
revoke all on function public.check_admin_login_rate_limit(text,int,int)
  from public,anon,authenticated;
revoke all on function public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.mark_schedule_target_failed(uuid,text,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.record_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)
  from public,anon,authenticated;
revoke all on function public.preview_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)
  from public,anon,authenticated;
revoke all on function public.preview_historical_publication_import(jsonb)
  from public,anon,authenticated;
revoke all on function public.preview_historical_publication_batch(uuid,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.apply_historical_publication_batch(uuid,text,jsonb,text)
  from public,anon,authenticated;

grant execute on function public.portal_publication_state(uuid,int) to authenticated,service_role;
grant execute on function public.register_publication_evidence(uuid,text,text,text,text,text,timestamptz,text,text,bigint,text)
  to service_role;
grant execute on function public.check_admin_login_rate_limit(text,int,int) to service_role;
grant execute on function public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)
  to service_role;
grant execute on function public.mark_schedule_target_failed(uuid,text,uuid,text,text)
  to service_role;
grant execute on function public.record_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)
  to service_role;
grant execute on function public.preview_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)
  to service_role;
grant execute on function public.preview_historical_publication_import(jsonb) to service_role;
grant execute on function public.preview_historical_publication_batch(uuid,text,jsonb) to service_role;
grant execute on function public.apply_historical_publication_batch(uuid,text,jsonb,text) to service_role;

-- Preserve the prior reviewed assertion chain. The only intentional prior-object change is the
-- extra safe publication_state column, so update that exact view expectation and rerun the chain.
alter function public.assert_portal_security() rename to assert_portal_slice3_security;
revoke all on function public.assert_portal_slice3_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice3_security() to service_role;
do $adjust_prior_assertions$
declare
  v_signature text;
  v_definition text;
  v_adjusted text;
begin
  foreach v_signature in array array[
    'public.assert_portal_slice2_security()',
    'public.assert_portal_slice3_security()'
  ]
  loop
    select pg_catalog.pg_get_functiondef(v_signature::pg_catalog.regprocedure) into v_definition;
    v_adjusted := pg_catalog.replace(
      v_definition,
      '''schedule_state'',',
      '''schedule_state'',''publication_state'','
    );
    if v_adjusted = v_definition then
      raise exception 'could not update prior safe-view assertion: %',v_signature;
    end if;
    execute v_adjusted;
  end loop;
  perform public.assert_portal_slice3_security();
end;
$adjust_prior_assertions$;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actual text[];
  v_expected text[];
  v_columns text[];
begin
  perform public.assert_portal_slice3_security();
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp where cp.table_schema='public'
    and cp.table_name='content_publication_targets' and cp.grantee='authenticated'
    and cp.privilege_type='SELECT';
  v_expected := array['client_id','content_id','content_version','created_at','current_observation_id',
    'destination','expected_visibility','first_verified_at','id','last_verified_at','live_url',
    'published_at','reconciliation_status','required','source_type','status','updated_at'];
  if v_actual is distinct from v_expected then raise exception 'unsafe publication-target grant set: %',v_actual; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp where cp.table_schema='public'
    and cp.table_name='content_publication_observations' and cp.grantee='authenticated'
    and cp.privilege_type='SELECT';
  v_expected := array['client_id','created_at','id','observed_at','permalink','provider_state',
    'publication_target_id','published_at','reconciliation_status','source_type','visibility'];
  if v_actual is distinct from v_expected then raise exception 'unsafe publication-observation grant set: %',v_actual; end if;
  if exists (select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('agency_actors','admin_login_rate_limits','publication_evidence',
      'historical_publication_import_batches','historical_publication_import_entries')
    and tp.grantee in ('PUBLIC','anon','authenticated')) then
    raise exception 'internal actor/evidence relation exposed'; end if;
  if exists (select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('content_publication_targets','content_publication_observations',
      'content_publication_targets_client') and tp.grantee in ('authenticated','service_role')
    and tp.privilege_type <> 'SELECT') then raise exception 'publication relation write grant detected'; end if;
  if exists (select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('content_publication_targets','content_publication_observations',
      'content_publication_targets_client','publication_evidence','agency_actors','admin_login_rate_limits',
      'historical_publication_import_batches','historical_publication_import_entries')
    and tp.grantee in ('PUBLIC','anon')) then raise exception 'public/anon publication grant detected'; end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p where p.schemaname='public'
    and p.tablename in ('content_publication_targets','content_publication_observations')
    and p.cmd='SELECT' and p.policyname in ('publication_targets_read','publication_observations_read')) <> 2
    or exists (select 1 from pg_catalog.pg_policies p where p.schemaname='public'
      and p.tablename in ('agency_actors','publication_evidence','content_publication_targets',
        'content_publication_observations') and p.cmd <> 'SELECT') then
    raise exception 'unexpected publication RLS policy set'; end if;
  if exists (select 1 from pg_catalog.pg_class c where c.oid in (
    'public.content_publication_targets_client'::pg_catalog.regclass,
    'public.content_with_state'::pg_catalog.regclass)
    and not (coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true'])) then
    raise exception 'publication client view must be security_invoker'; end if;
  select pg_catalog.array_agg(a.attname::text order by a.attnum) into v_columns
  from pg_catalog.pg_attribute a where a.attrelid='public.content_with_state'::pg_catalog.regclass
    and a.attnum > 0 and not a.attisdropped;
  v_expected := array['id','content_id','client_id','title','format','pillar','platforms','status',
    'planned_date','schedule_state','publication_state','canva_url','drive_url','version','fact_check',
    'fact_check_scope','fact_check_exemption','fact_check_ledger','client_body','copy_blocks',
    'updated_at','review_ready_at','revision_in_progress','archived_at','current_decision','client_state'];
  if v_columns is distinct from v_expected then raise exception 'unsafe content view columns: %',v_columns; end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('register_publication_evidence',
      'check_admin_login_rate_limit','confirm_schedule_target','record_publication_observation','preview_publication_observation',
      'preview_historical_publication_import','preview_historical_publication_batch',
      'apply_historical_publication_batch','mark_schedule_target_failed',
      'portal_sync_publication_target') and (not p.prosecdef
        or not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']))) then
    raise exception 'publication writer is not hardened security definer'; end if;
  if pg_catalog.to_regclass('storage.objects') is not null and exists (
    select 1 from pg_catalog.pg_policies p where p.schemaname='storage' and p.tablename='objects'
      and p.roles && array['public','anon','authenticated']::name[]
  ) then raise exception 'authenticated storage policy could expose portal evidence'; end if;
  if pg_catalog.has_function_privilege('anon',
      'public.record_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
      'public.record_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
      'public.record_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)','EXECUTE') then
    raise exception 'unexpected publication writer execution privilege'; end if;
  if exists (select 1 from public.content_items ci where ci.status='posted'
    and public.portal_publication_state(ci.id,ci.client_visible_version) <> 'live') then
    raise exception 'posted content lacks all-destination manual verification'; end if;
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

create or replace function public.assert_portal_slice1_security()
returns void language sql security definer set search_path = ''
as $$ select public.assert_portal_security() $$;
revoke all on function public.assert_portal_slice1_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice1_security() to service_role;

select public.assert_portal_security();

commit;
