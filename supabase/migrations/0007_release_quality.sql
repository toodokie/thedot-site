-- Slice 2: deterministic fact-check evidence and a release-quality boundary.
-- Apply after 0006. All authored evidence remains immutable and version-bound.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regprocedure('public.sync_content_item_versions(jsonb)') is null
     or pg_catalog.to_regprocedure('public.mark_content_ready(uuid,integer)') is null then
    raise exception '0006 versioned-content objects must exist before applying 0007';
  end if;
end;
$$;

create table public.portal_primary_source_hosts (
  hostname text primary key,
  added_at timestamptz not null default pg_catalog.now(),
  constraint portal_primary_source_hosts_normalized check (
    hostname = pg_catalog.lower(hostname)
    and hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  )
);

insert into public.portal_primary_source_hosts (hostname) values
  ('canada.ca'),
  ('college-ic.ca'),
  ('gazette.gc.ca'),
  ('ontario.ca');

revoke all on public.portal_primary_source_hosts from public, anon, authenticated, service_role;

-- Immutable structural validation is safe in a table CHECK: it depends only on its arguments.
create or replace function public.portal_fact_check_ledger_shape_valid(
  p_ledger jsonb,
  p_scope text,
  p_exemption text
) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_keys text[];
  v_checked_at date;
begin
  if p_scope not in ('required', 'not_applicable')
     or p_ledger is null
     or pg_catalog.jsonb_typeof(p_ledger) <> 'array' then
    return false;
  end if;

  if p_scope = 'required' then
    if p_exemption is not null or pg_catalog.jsonb_array_length(p_ledger) = 0 then
      return false;
    end if;
  else
    if p_exemption is null
       or pg_catalog.char_length(pg_catalog.btrim(p_exemption)) not between 10 and 300
       or pg_catalog.jsonb_array_length(p_ledger) <> 0 then
      return false;
    end if;
  end if;

  for v_entry in select value from pg_catalog.jsonb_array_elements(p_ledger)
  loop
    if pg_catalog.jsonb_typeof(v_entry) <> 'object' then return false; end if;

    select pg_catalog.array_agg(k order by k) into v_keys
    from pg_catalog.jsonb_object_keys(v_entry) k;
    if v_keys is distinct from array[
      'checked_at','checked_by_role','claim','claim_key','source_title','source_url','status'
    ]::text[] then
      return false;
    end if;

    if pg_catalog.jsonb_typeof(v_entry->'claim_key') <> 'string'
       or (v_entry->>'claim_key') !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
       or pg_catalog.jsonb_typeof(v_entry->'claim') <> 'string'
       or pg_catalog.char_length(pg_catalog.btrim(v_entry->>'claim')) not between 1 and 500
       or pg_catalog.jsonb_typeof(v_entry->'status') <> 'string'
       or (v_entry->>'status') not in ('confirmed','needs-confirm','flagged')
       or pg_catalog.jsonb_typeof(v_entry->'checked_at') <> 'string'
       or (v_entry->>'checked_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or pg_catalog.jsonb_typeof(v_entry->'checked_by_role') <> 'string'
       or (v_entry->>'checked_by_role') not in ('agency_fact_checker','agency_owner') then
      return false;
    end if;

    begin
      v_checked_at := (v_entry->>'checked_at')::date;
    exception when others then
      return false;
    end;
    if pg_catalog.to_char(v_checked_at, 'YYYY-MM-DD') <> v_entry->>'checked_at' then
      return false;
    end if;

    if not (
      pg_catalog.jsonb_typeof(v_entry->'source_url') in ('string','null')
      and pg_catalog.jsonb_typeof(v_entry->'source_title') in ('string','null')
    ) then
      return false;
    end if;
    if (pg_catalog.jsonb_typeof(v_entry->'source_url') = 'string') <>
       (pg_catalog.jsonb_typeof(v_entry->'source_title') = 'string') then
      return false;
    end if;
    if pg_catalog.jsonb_typeof(v_entry->'source_url') = 'string' and (
      pg_catalog.char_length(v_entry->>'source_url') not between 1 and 2048
      or (v_entry->>'source_url') !~ '^https://[^[:space:][:cntrl:]]+$'
      or (v_entry->>'source_url') ~ '^https://[^/?#]*@'
    ) then
      return false;
    end if;
    if pg_catalog.jsonb_typeof(v_entry->'source_title') = 'string' and
       pg_catalog.char_length(pg_catalog.btrim(v_entry->>'source_title')) not between 1 and 300 then
      return false;
    end if;
    if v_entry->>'status' = 'confirmed' and (
      pg_catalog.jsonb_typeof(v_entry->'source_url') <> 'string'
      or pg_catalog.jsonb_typeof(v_entry->'source_title') <> 'string'
    ) then
      return false;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_ledger) e(value)
    group by e.value->>'claim_key'
    having pg_catalog.count(*) > 1
  ) then
    return false;
  end if;

  return true;
end;
$$;

-- Stable release validation also consults the reviewed host relation and today's date.
create or replace function public.portal_fact_check_ledger_release_valid(
  p_ledger jsonb,
  p_scope text,
  p_exemption text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_url text;
  v_authority text;
  v_host text;
begin
  if not public.portal_fact_check_ledger_shape_valid(p_ledger, p_scope, p_exemption) then
    return false;
  end if;

  for v_entry in select value from pg_catalog.jsonb_array_elements(p_ledger)
  loop
    -- CURRENT_DATE is SQL syntax, not a schema-qualified function.
    if (v_entry->>'checked_at')::date > current_date then return false; end if;
    if pg_catalog.jsonb_typeof(v_entry->'source_url') = 'string' then
      v_url := v_entry->>'source_url';
      v_authority := pg_catalog.substring(v_url, '^https://([^/?#]+)');
      if v_authority is null or v_authority ~ '@' then return false; end if;
      v_host := pg_catalog.lower(pg_catalog.regexp_replace(v_authority, ':[0-9]+$', ''));
      v_host := pg_catalog.rtrim(v_host, '.');
      if v_host !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then
        return false;
      end if;
      if not exists (
        select 1 from public.portal_primary_source_hosts h
        where v_host = h.hostname or v_host like '%.' || h.hostname
      ) then
        return false;
      end if;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.portal_fact_check_ledger_shape_valid(jsonb,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.portal_fact_check_ledger_release_valid(jsonb,text,text)
  from public, anon, authenticated, service_role;

alter table public.content_item_versions
  add column fact_check_scope text,
  add column fact_check_exemption text,
  add column source_commit_sha text;

-- 0006 contains only demo/previously-visible snapshots. Preserve them explicitly as N/A rather
-- than inventing citations; real content must arrive through the corrected sync.
do $$
begin
  if exists (
    select 1
    from public.content_item_versions cv
    join public.content_items ci on ci.id = cv.content_item_id and ci.client_id = cv.client_id
    where ci.content_id not in (
      'kanset-2026-07-lmia-reel',
      'kanset-2026-07-oinp-employer',
      'upgrade-fixture',
      'release-quality-upgrade-probe'
    )
  ) then
    raise exception 'unexpected pre-ledger content exists; classify it explicitly before 0007';
  end if;
end;
$$;

update public.content_item_versions
set fact_check_scope = 'not_applicable',
    fact_check_exemption = 'Migrated pre-ledger portal fixture; replace before real client release.';

alter table public.content_item_versions
  add constraint content_item_versions_fact_check_shape check (
    public.portal_fact_check_ledger_shape_valid(
      fact_check_ledger, fact_check_scope, fact_check_exemption
    )
  ) not valid,
  add constraint content_item_versions_source_commit_sha check (
    source_commit_sha is null or source_commit_sha ~ '^[0-9a-f]{40}$'
  );

alter table public.content_item_versions
  validate constraint content_item_versions_fact_check_shape;

alter table public.content_item_versions
  alter column fact_check_scope set not null,
  alter column fact_check_scope set default 'required';

create or replace function public.portal_content_checksum(
  p_title text,
  p_format text,
  p_pillar text,
  p_platforms text[],
  p_canva_url text,
  p_drive_url text,
  p_fact_check text,
  p_fact_check_scope text,
  p_fact_check_exemption text,
  p_fact_check_ledger jsonb,
  p_client_body text,
  p_copy_blocks jsonb
) returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'title', p_title,
          'format', p_format,
          'pillar', p_pillar,
          'platforms', pg_catalog.to_jsonb(coalesce(p_platforms, '{}'::text[])),
          'canva_url', p_canva_url,
          'drive_url', p_drive_url,
          'fact_check', p_fact_check,
          'fact_check_scope', p_fact_check_scope,
          'fact_check_exemption', p_fact_check_exemption,
          'fact_check_ledger', coalesce(p_fact_check_ledger, '[]'::jsonb),
          'client_body', p_client_body,
          'copy_blocks', coalesce(p_copy_blocks, '[]'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

revoke all on function public.portal_content_checksum(
  text,text,text,text[],text,text,text,text,text,jsonb,text,jsonb
) from public, anon, authenticated, service_role;

-- Recompute every stored checksum in the same transaction so an unchanged post-upgrade payload
-- remains an exact retry rather than a false immutable-version conflict.
update public.content_item_versions cv
set content_checksum = public.portal_content_checksum(
  cv.title, cv.format, cv.pillar, cv.platforms, cv.canva_url, cv.drive_url,
  cv.fact_check, cv.fact_check_scope, cv.fact_check_exemption, cv.fact_check_ledger,
  cv.client_body, cv.copy_blocks
);

drop view public.content_with_state;

revoke all on public.content_item_versions from public, anon, authenticated, service_role;
grant select (
  id, content_item_id, client_id, version, title, format, pillar, platforms,
  canva_url, drive_url, fact_check, fact_check_scope, fact_check_exemption,
  fact_check_ledger, client_body, copy_blocks, synced_at
) on public.content_item_versions to authenticated;
grant select on public.content_item_versions to service_role;

-- Remove any Supabase project-default service privileges before exposing only the agency reads
-- used by tooling. Membership/client writes go through the reviewed definer RPCs below.
revoke all on public.clients, public.client_users from service_role;
grant select on public.clients to service_role;

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
  ci.planned_date as scheduled_date,
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
    when decision.state = 'change_requested' or ci.revision_in_progress then 'with_dot'
    when ci.status = 'scheduled' then 'scheduled'
    when ci.status = 'approved' then 'approved'
    when ci.status = 'draft' and ci.review_ready_at is not null then 'needs_review'
    else 'with_dot'
  end::text as client_state
from public.content_items ci
join public.content_item_versions v
  on v.content_item_id = ci.id
 and v.client_id = ci.client_id
 and v.version = ci.client_visible_version
left join lateral (
  select a.state
  from public.approvals a
  where a.content_id = ci.id
    and a.client_id = ci.client_id
    and a.content_version = ci.client_visible_version
  order by a.created_at desc, a.id desc
  limit 1
) decision on true;

revoke all on public.content_with_state from public, anon, authenticated, service_role;
grant select on public.content_with_state to authenticated, service_role;

create or replace function public.portal_evaluate_content_item_version(
  p_item jsonb,
  p_write boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid := (p_item->>'client_id')::uuid;
  v_content_id text := pg_catalog.btrim(p_item->>'content_id');
  v_version int := (p_item->>'version')::int;
  v_title text := pg_catalog.btrim(p_item->>'title');
  v_format text := nullif(pg_catalog.btrim(p_item->>'format'), '');
  v_pillar text := nullif(pg_catalog.btrim(p_item->>'pillar'), '');
  v_platforms text[] := array(
    select pg_catalog.jsonb_array_elements_text(coalesce(p_item->'platforms', '[]'::jsonb))
  );
  v_planned_date date := nullif(p_item->>'planned_date', '')::date;
  v_canva_url text := nullif(pg_catalog.btrim(p_item->>'canva_url'), '');
  v_drive_url text := nullif(pg_catalog.btrim(p_item->>'drive_url'), '');
  v_fact_check text := nullif(pg_catalog.btrim(p_item->>'fact_check'), '');
  v_fact_check_scope text := nullif(pg_catalog.btrim(p_item->>'fact_check_scope'), '');
  v_fact_check_exemption text := nullif(pg_catalog.btrim(p_item->>'fact_check_exemption'), '');
  v_fact_check_ledger jsonb := coalesce(p_item->'fact_check_ledger', '[]'::jsonb);
  v_client_body text := p_item->>'client_body';
  v_copy_blocks jsonb := coalesce(p_item->'copy_blocks', '[]'::jsonb);
  v_source_path text := pg_catalog.btrim(p_item->>'source_path');
  v_source_commit_sha text := nullif(pg_catalog.btrim(p_item->>'source_commit_sha'), '');
  v_checksum text;
  v_existing_checksum text;
  v_ci public.content_items%rowtype;
  v_item_id uuid;
begin
  if v_client_id is null or v_content_id is null or v_content_id = ''
     or v_title is null or v_title = '' or v_version is null or v_version < 1
     or v_client_body is null or pg_catalog.btrim(v_client_body) = ''
     or v_source_path is null or v_source_path = ''
     or v_fact_check not in ('confirmed','needs-confirm','flagged') then
    raise exception 'invalid content sync payload';
  end if;
  if v_source_commit_sha is not null and v_source_commit_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'invalid source commit SHA for %', v_content_id;
  end if;
  if not public.portal_copy_blocks_valid(v_copy_blocks) then
    raise exception 'invalid copy_blocks for %', v_content_id;
  end if;
  if not public.portal_fact_check_ledger_release_valid(
    v_fact_check_ledger, v_fact_check_scope, v_fact_check_exemption
  ) then
    raise exception 'ledger_invalid for %', v_content_id;
  end if;

  v_checksum := public.portal_content_checksum(
    v_title, v_format, v_pillar, v_platforms, v_canva_url, v_drive_url,
    v_fact_check, v_fact_check_scope, v_fact_check_exemption, v_fact_check_ledger,
    v_client_body, v_copy_blocks
  );

  select ci.* into v_ci
  from public.content_items ci
  where ci.client_id = v_client_id and ci.content_id = v_content_id
  for update;

  if not found then
    if not p_write then
      return pg_catalog.jsonb_build_object(
        'content_id', v_content_id, 'item_id', null, 'outcome', 'inserted',
        'working_version', v_version, 'client_visible_version', null, 'checksum', v_checksum
      );
    end if;

    insert into public.content_items (
      content_id, client_id, title, format, pillar, platforms, scheduled_date, status,
      canva_url, drive_url, version, fact_check, client_body, source_path, copy_blocks,
      working_version, client_visible_version, client_visible, review_ready_at,
      revision_in_progress, planned_date, updated_at
    ) values (
      v_content_id, v_client_id, v_title, v_format, v_pillar, v_platforms, v_planned_date,
      'draft', v_canva_url, v_drive_url, v_version, v_fact_check, v_client_body,
      v_source_path, v_copy_blocks, v_version, null, false, null, false, v_planned_date,
      pg_catalog.now()
    ) returning id into v_item_id;

    insert into public.content_item_versions (
      content_item_id, client_id, version, title, format, pillar, platforms,
      canva_url, drive_url, fact_check, fact_check_scope, fact_check_exemption,
      fact_check_ledger, client_body, copy_blocks, content_checksum, source_path,
      source_commit_sha
    ) values (
      v_item_id, v_client_id, v_version, v_title, v_format, v_pillar, v_platforms,
      v_canva_url, v_drive_url, v_fact_check, v_fact_check_scope, v_fact_check_exemption,
      v_fact_check_ledger, v_client_body, v_copy_blocks, v_checksum, v_source_path,
      v_source_commit_sha
    );

    return pg_catalog.jsonb_build_object(
      'content_id', v_content_id, 'item_id', v_item_id, 'outcome', 'inserted',
      'working_version', v_version, 'client_visible_version', null, 'checksum', v_checksum
    );
  end if;

  v_item_id := v_ci.id;
  select cv.content_checksum into v_existing_checksum
  from public.content_item_versions cv
  where cv.content_item_id = v_item_id and cv.version = v_version;

  if found then
    if v_existing_checksum is distinct from v_checksum then
      raise exception 'version % for % already exists with a different checksum', v_version, v_content_id;
    end if;
    if v_version is distinct from v_ci.working_version then
      raise exception 'snapshot/pointer mismatch for % version %', v_content_id, v_version;
    end if;
    return pg_catalog.jsonb_build_object(
      'content_id', v_content_id, 'item_id', v_item_id, 'outcome', 'exact_retry',
      'working_version', v_ci.working_version,
      'client_visible_version', v_ci.client_visible_version, 'checksum', v_checksum
    );
  end if;

  if v_version <> v_ci.working_version + 1 then
    raise exception 'stale or skipped snapshot conflict for % version %', v_content_id, v_version;
  end if;
  if v_ci.archived_at is not null
     or v_ci.status <> 'draft'
     or v_ci.review_ready_at is not null
     or (v_ci.client_visible_version is not null and not v_ci.revision_in_progress) then
    raise exception 'begin a guarded revision before syncing a new version for %', v_content_id;
  end if;

  if not p_write then
    return pg_catalog.jsonb_build_object(
      'content_id', v_content_id, 'item_id', v_item_id, 'outcome', 'version_inserted',
      'working_version', v_version, 'client_visible_version', v_ci.client_visible_version,
      'checksum', v_checksum
    );
  end if;

  insert into public.content_item_versions (
    content_item_id, client_id, version, title, format, pillar, platforms,
    canva_url, drive_url, fact_check, fact_check_scope, fact_check_exemption,
    fact_check_ledger, client_body, copy_blocks, content_checksum, source_path,
    source_commit_sha
  ) values (
    v_item_id, v_client_id, v_version, v_title, v_format, v_pillar, v_platforms,
    v_canva_url, v_drive_url, v_fact_check, v_fact_check_scope, v_fact_check_exemption,
    v_fact_check_ledger, v_client_body, v_copy_blocks, v_checksum, v_source_path,
    v_source_commit_sha
  );

  update public.content_items
  set working_version = v_version, updated_at = pg_catalog.now()
  where id = v_item_id;

  return pg_catalog.jsonb_build_object(
    'content_id', v_content_id, 'item_id', v_item_id, 'outcome', 'version_inserted',
    'working_version', v_version, 'client_visible_version', v_ci.client_visible_version,
    'checksum', v_checksum
  );
end;
$$;

revoke all on function public.portal_evaluate_content_item_version(jsonb,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.portal_sync_content_item_version(p_item jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.portal_evaluate_content_item_version(p_item, true)
$$;

revoke all on function public.portal_sync_content_item_version(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.sync_content_item_versions(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  if pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty JSON array';
  end if;
  if pg_catalog.jsonb_array_length(p_items) > 500 then
    raise exception 'content sync batch is too large';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) e(value)
    group by e.value->>'client_id', e.value->>'content_id'
    having pg_catalog.count(*) > 1
  ) then raise exception 'duplicate client/content identity in sync batch'; end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    v_result := v_result || pg_catalog.jsonb_build_array(
      public.portal_evaluate_content_item_version(v_item, true)
    );
  end loop;
  return v_result;
end;
$$;

revoke all on function public.sync_content_item_versions(jsonb) from public, anon, authenticated;
grant execute on function public.sync_content_item_versions(jsonb) to service_role;

create or replace function public.preview_content_item_versions(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  if pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty JSON array';
  end if;
  if pg_catalog.jsonb_array_length(p_items) > 500 then
    raise exception 'content sync batch is too large';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) e(value)
    group by e.value->>'client_id', e.value->>'content_id'
    having pg_catalog.count(*) > 1
  ) then raise exception 'duplicate client/content identity in sync batch'; end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    v_result := v_result || pg_catalog.jsonb_build_array(
      public.portal_evaluate_content_item_version(v_item, false)
    );
  end loop;
  return v_result;
end;
$$;

revoke all on function public.preview_content_item_versions(jsonb)
  from public, anon, authenticated;
grant execute on function public.preview_content_item_versions(jsonb) to service_role;

create or replace function public.create_portal_client(p_slug text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := pg_catalog.lower(pg_catalog.btrim(p_slug));
  v_name text := pg_catalog.btrim(p_name);
  v_id uuid;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     or v_name is null or pg_catalog.char_length(v_name) not between 1 and 200 then
    raise exception 'invalid client payload';
  end if;
  insert into public.clients (slug, name)
  values (v_slug, v_name)
  on conflict (slug) do nothing
  returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.clients c where c.slug = v_slug;
  end if;
  return v_id;
end;
$$;

revoke all on function public.create_portal_client(text,text)
  from public, anon, authenticated;
grant execute on function public.create_portal_client(text,text) to service_role;

-- Narrow agency provisioning boundary. Direct client_users grants remain absent; the service caller
-- must name an existing auth user and client, and can assign only the schema's client role.
create or replace function public.upsert_client_membership(
  p_client_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_name text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_auth_email text;
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_id uuid;
begin
  if p_client_id is null or p_auth_user_id is null
     or v_email is null or v_email = '' or pg_catalog.char_length(v_email) > 320 then
    raise exception 'invalid client membership payload';
  end if;
  if v_name is not null and pg_catalog.char_length(v_name) > 200 then
    raise exception 'client member name is too long';
  end if;
  select pg_catalog.lower(u.email) into v_auth_email
  from auth.users u where u.id = p_auth_user_id;
  if not found or v_auth_email is distinct from v_email then
    raise exception 'auth user email does not match membership email';
  end if;

  insert into public.client_users (client_id, auth_user_id, email, name, role)
  values (p_client_id, p_auth_user_id, v_email, v_name, 'client')
  on conflict (client_id, auth_user_id)
  do update set email = excluded.email, name = excluded.name, role = 'client'
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.upsert_client_membership(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.upsert_client_membership(uuid,uuid,text,text) to service_role;

create or replace function public.list_portal_memberships()
returns table (email text, name text, role text, client_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select cu.email, cu.name, cu.role, cu.client_id
  from public.client_users cu
  order by cu.client_id, cu.email
$$;

revoke all on function public.list_portal_memberships() from public, anon, authenticated;
grant execute on function public.list_portal_memberships() to service_role;

create or replace function public.mark_content_ready(p_content_id uuid, p_content_version int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ci public.content_items%rowtype;
  v_title text;
  v_fact_check text;
  v_scope text;
  v_exemption text;
  v_ledger jsonb;
  v_body text;
begin
  select ci.* into v_ci
  from public.content_items ci
  where ci.id = p_content_id
  for update;
  if not found then raise exception 'content item not found'; end if;

  -- Preserve the 0006 exact retry contract and do not duplicate activity.
  if v_ci.client_visible
     and v_ci.client_visible_version = p_content_version
     and v_ci.review_ready_at is not null
     and not v_ci.revision_in_progress then
    return;
  end if;

  if v_ci.archived_at is not null or v_ci.status <> 'draft' then
    raise exception 'content item is not eligible for review release';
  end if;
  if v_ci.working_version is distinct from p_content_version then
    raise exception 'stale_version';
  end if;

  select cv.title, cv.fact_check, cv.fact_check_scope, cv.fact_check_exemption,
         cv.fact_check_ledger, cv.client_body
    into v_title, v_fact_check, v_scope, v_exemption, v_ledger, v_body
  from public.content_item_versions cv
  where cv.content_item_id = v_ci.id
    and cv.client_id = v_ci.client_id
    and cv.version = p_content_version;
  if not found then raise exception 'content snapshot not found'; end if;
  if v_fact_check is distinct from 'confirmed' then raise exception 'fact_check_unconfirmed'; end if;
  if not public.portal_fact_check_ledger_release_valid(v_ledger, v_scope, v_exemption) then
    raise exception 'ledger_invalid';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_ledger) e(value)
    where e.value->>'status' <> 'confirmed'
  ) then
    raise exception 'ledger_entry_unconfirmed';
  end if;
  if pg_catalog.btrim(v_body) = '' then raise exception 'client body is required'; end if;

  update public.content_items
  set client_visible = true,
      client_visible_version = p_content_version,
      review_ready_at = pg_catalog.now(),
      revision_in_progress = false,
      updated_at = pg_catalog.now()
  where id = v_ci.id;

  insert into public.activity_log (
    client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name
  ) values (
    v_ci.client_id, v_ci.id, p_content_version, 'needs_review',
    'Needs review: ' || v_title, null, 'agent', 'The Dot'
  );
end;
$$;

revoke all on function public.mark_content_ready(uuid,int) from public, anon, authenticated;
grant execute on function public.mark_content_ready(uuid,int) to service_role;

-- Cumulative exact-grant/view assertion. Keep the Slice-1 name as a compatibility wrapper for the
-- existing integration runner while new verification calls assert_portal_security directly.
create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual text[];
  v_expected text[];
  v_view_columns text[];
begin
  select pg_catalog.array_agg(h.hostname order by h.hostname) into v_actual
  from public.portal_primary_source_hosts h;
  v_expected := array['canada.ca','college-ic.ca','gazette.gc.ca','ontario.ca'];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected primary-source host allow-list: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'clients'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array['created_at','id','name','slug'];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated clients SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'clients'
    and cp.grantee = 'service_role' and cp.privilege_type = 'SELECT';
  v_expected := array['created_at','id','name','slug'];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected service_role clients SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'client_users'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array['auth_user_id','client_id','created_at','email','id','name','role'];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated client_users SELECT grants: %', v_actual;
  end if;

  if exists (
    select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public' and tp.table_name = 'client_users'
      and tp.grantee = 'service_role'
  ) then raise exception 'service_role must not access client_users directly'; end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'content_items'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array[
    'archived_at','client_id','client_visible','client_visible_version','content_id','id',
    'planned_date','review_ready_at','revision_in_progress','status','updated_at'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated content_items SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'content_item_versions'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array[
    'canva_url','client_body','client_id','content_item_id','copy_blocks','drive_url',
    'fact_check','fact_check_exemption','fact_check_ledger','fact_check_scope','format','id',
    'pillar','platforms','synced_at','title','version'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated content_item_versions SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'approvals'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array['client_id','content_id','content_version','created_at','id','state'];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated approvals SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'approvals'
    and cp.grantee = 'service_role' and cp.privilege_type = 'SELECT';
  v_expected := array['client_id','content_id','content_version','created_at','id','state'];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected service_role approvals SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'comments'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array[
    'author_name','author_type','body','client_id','content_id','content_version',
    'copy_block_key','created_at','id','quoted_text','resolved'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated comments SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(a.attname::text order by a.attnum) into v_view_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.content_with_state'::pg_catalog.regclass
    and a.attnum > 0 and not a.attisdropped;
  v_expected := array[
    'id','content_id','client_id','title','format','pillar','platforms','status','scheduled_date',
    'canva_url','drive_url','version','fact_check','fact_check_scope','fact_check_exemption',
    'fact_check_ledger','client_body','copy_blocks','updated_at','review_ready_at',
    'revision_in_progress','archived_at','current_decision','client_state'
  ];
  if v_view_columns is distinct from v_expected then
    raise exception 'unsafe or missing content_with_state columns: %', v_view_columns;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'public.content_with_state'::pg_catalog.regclass
      and coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
  ) then raise exception 'content_with_state must be security_invoker'; end if;

  if exists (
    select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name in (
        'clients','client_users','content_items','content_item_versions','approvals','comments','content_with_state',
        'portal_primary_source_hosts'
      )
      and tp.grantee in ('PUBLIC','anon')
  ) then raise exception 'public/anon portal relation privilege detected'; end if;

  if exists (
    select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name in (
        'clients','client_users','content_items','content_item_versions','approvals','comments','content_with_state',
        'portal_primary_source_hosts'
      )
      and tp.grantee in ('authenticated','service_role')
      and tp.privilege_type <> 'SELECT'
  ) then raise exception 'unexpected non-SELECT authenticated/service_role relation privilege'; end if;

  if pg_catalog.has_table_privilege('authenticated','public.portal_primary_source_hosts','SELECT')
     or pg_catalog.has_table_privilege('service_role','public.portal_primary_source_hosts','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.content_items','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.content_item_versions','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.approvals','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.comments','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('service_role','public.content_items','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('service_role','public.content_item_versions','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('service_role','public.comments','INSERT,UPDATE,DELETE') then
    raise exception 'direct portal table privilege detected';
  end if;

  if not pg_catalog.has_function_privilege('authenticated','public.my_client_ids()','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.my_client_ids()','EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated','public.record_content_decision(uuid,integer,text,text)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.add_comment(uuid,text,text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.sync_content_item_versions(jsonb)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.mark_content_ready(uuid,integer)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.begin_content_revision(uuid,integer)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.add_agency_comment(uuid,text,text)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.sync_content_item_versions(jsonb)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.preview_content_item_versions(jsonb)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.upsert_client_membership(uuid,uuid,text,text)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.create_portal_client(text,text)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.list_portal_memberships()','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.mark_content_ready(uuid,integer)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.begin_content_revision(uuid,integer)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.add_agency_comment(uuid,text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role','public.portal_sync_content_item_version(jsonb)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role','public.portal_evaluate_content_item_version(jsonb,boolean)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.preview_content_item_versions(jsonb)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.upsert_client_membership(uuid,uuid,text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.create_portal_client(text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.list_portal_memberships()','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.portal_fact_check_ledger_shape_valid(jsonb,text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.portal_fact_check_ledger_release_valid(jsonb,text,text)','EXECUTE'
     ) then
    raise exception 'unexpected portal function execution privilege';
  end if;
end;
$$;

revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

create or replace function public.assert_portal_slice1_security()
returns void
language sql
security definer
set search_path = ''
as $$ select public.assert_portal_security() $$;

revoke all on function public.assert_portal_slice1_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice1_security() to service_role;

select public.assert_portal_security();

commit;
