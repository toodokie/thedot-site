-- Slice 1: immutable authored snapshots + an explicit client release pointer.
-- Apply after 0001..0005. Forward-only; legacy authored columns remain temporarily for rollback,
-- but authenticated loses access to them and the sync stops updating them.

begin;

-- The checksum is part of the immutable-version boundary. Fail before any schema change if the
-- production project does not have pgcrypto installed in Supabase's expected extensions schema.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then
    raise exception 'pgcrypto must be installed in the extensions schema before applying 0006';
  end if;
end;
$$;

-- Fail before changing anything if the live catalog does not have the per-tenant identity that
-- 0002 was meant to establish. Do not depend on 0002's historical default constraint name.
do $$
declare
  v_found boolean;
begin
  select exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.content_items'::pg_catalog.regclass
      and c.contype = 'u'
      and (
        select pg_catalog.array_agg(a.attname order by k.ordinality)
        from pg_catalog.unnest(c.conkey) with ordinality k(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) = array['client_id', 'content_id']::name[]
  ) into v_found;

  if not v_found then
    raise exception 'expected a unique (client_id, content_id) constraint on public.content_items';
  end if;
end;
$$;

create or replace function public.portal_copy_blocks_valid(p_blocks jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_blocks is null or pg_catalog.jsonb_typeof(p_blocks) <> 'array' then false
    when pg_catalog.jsonb_array_length(p_blocks) = 0 then false
    else
      not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_blocks) b(value)
        where pg_catalog.jsonb_typeof(b.value) <> 'object'
           or not (b.value ? 'key' and b.value ? 'label' and b.value ? 'body')
           or coalesce(b.value->>'key', '') !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
           or pg_catalog.btrim(coalesce(b.value->>'label', '')) = ''
           or pg_catalog.jsonb_typeof(b.value->'body') <> 'string'
           or pg_catalog.btrim(coalesce(b.value->>'body', '')) = ''
      )
      and (
        select pg_catalog.count(*) = pg_catalog.count(distinct b.value->>'key')
        from pg_catalog.jsonb_array_elements(p_blocks) b(value)
      )
  end
$$;

create or replace function public.portal_content_checksum(
  p_title text,
  p_format text,
  p_pillar text,
  p_platforms text[],
  p_canva_url text,
  p_drive_url text,
  p_fact_check text,
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

revoke all on function public.portal_copy_blocks_valid(jsonb) from public, anon, authenticated;
revoke all on function public.portal_content_checksum(text,text,text,text[],text,text,text,jsonb,text,jsonb)
  from public, anon, authenticated;

alter table public.content_items
  add column review_ready_at timestamptz,
  add column client_visible boolean not null default false,
  add column revision_in_progress boolean not null default false,
  add column working_version int,
  add column client_visible_version int,
  add column archived_at timestamptz,
  add column planned_date date,
  add column source_idea_id uuid,
  add column supersedes_content_id uuid;

alter table public.content_items
  add constraint content_items_working_version_positive
    check (working_version is null or working_version > 0),
  add constraint content_items_client_visible_version_positive
    check (client_visible_version is null or client_visible_version > 0),
  add constraint content_items_visible_pointer_consistent
    check (client_visible = (client_visible_version is not null)),
  add constraint content_items_version_order
    check (
      working_version is null
      or client_visible_version is null
      or client_visible_version <= working_version
    ),
  add constraint content_items_revision_requires_release
    check (not revision_in_progress or client_visible_version is not null),
  add constraint content_items_readiness_consistent
    check (
      review_ready_at is null
      or (
        client_visible
        and client_visible_version = working_version
        and not revision_in_progress
      )
    );

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.content_ideas'::pg_catalog.regclass
      and conname = 'content_ideas_id_client_id_key'
  ) then
    alter table public.content_ideas
      add constraint content_ideas_id_client_id_key unique (id, client_id);
  end if;
end;
$$;

alter table public.content_items
  add constraint content_items_source_idea_tenant_fk
    foreign key (source_idea_id, client_id)
    references public.content_ideas(id, client_id),
  add constraint content_items_source_idea_unique unique (source_idea_id),
  add constraint content_items_supersedes_tenant_fk
    foreign key (supersedes_content_id, client_id)
    references public.content_items(id, client_id);

create table public.content_item_versions (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null,
  client_id uuid not null,
  version int not null check (version > 0),
  title text not null,
  format text,
  pillar text,
  platforms text[] not null default '{}',
  canva_url text,
  drive_url text,
  fact_check text check (fact_check is null or fact_check in ('confirmed','needs-confirm','flagged')),
  fact_check_ledger jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(fact_check_ledger) = 'array'),
  client_body text not null,
  copy_blocks jsonb not null default '[]'::jsonb
    check (public.portal_copy_blocks_valid(copy_blocks)),
  content_checksum text not null check (content_checksum ~ '^[0-9a-f]{64}$'),
  source_path text not null,
  synced_at timestamptz not null default now(),
  unique (content_item_id, version),
  unique (content_item_id, client_id, version),
  foreign key (content_item_id, client_id)
    references public.content_items(id, client_id) on delete cascade
);

-- Existing rows were already exposed to authenticated users. Preserve that released snapshot and
-- mark visible draft rows review-ready; otherwise the hardened decision RPC would strand them.
insert into public.content_item_versions (
  content_item_id, client_id, version, title, format, pillar, platforms,
  canva_url, drive_url, fact_check, fact_check_ledger, client_body, copy_blocks,
  content_checksum, source_path, synced_at
)
select
  ci.id,
  ci.client_id,
  ci.version,
  ci.title,
  ci.format,
  ci.pillar,
  ci.platforms,
  ci.canva_url,
  ci.drive_url,
  ci.fact_check,
  '[]'::jsonb,
  coalesce(ci.client_body, ''),
  blocks.value,
  public.portal_content_checksum(
    ci.title, ci.format, ci.pillar, ci.platforms, ci.canva_url, ci.drive_url,
    ci.fact_check, '[]'::jsonb, coalesce(ci.client_body, ''), blocks.value
  ),
  coalesce(ci.source_path, 'legacy:unknown'),
  ci.updated_at
from public.content_items ci
cross join lateral (
  select case
    when pg_catalog.jsonb_typeof(ci.copy_blocks) <> 'array'
      or pg_catalog.jsonb_array_length(ci.copy_blocks) = 0
      then pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'key', 'legacy-copy',
        'label', 'Copy',
        'body', coalesce(ci.client_body, '')
      ))
    else (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'key', coalesce(
            nullif(
              pg_catalog.substr(
                pg_catalog.btrim(
                  pg_catalog.regexp_replace(
                    pg_catalog.lower(coalesce(b.value->>'label', '')),
                    '[^a-z0-9]+', '-', 'g'
                  ),
                  '-'
                ),
                1,
                64
              ),
              ''
            ),
            'legacy-' || b.ordinality::text
          ),
          'label', coalesce(b.value->>'label', 'Legacy block ' || b.ordinality::text),
          'body', coalesce(b.value->>'body', '')
        ) order by b.ordinality
      )
      from pg_catalog.jsonb_array_elements(ci.copy_blocks) with ordinality b(value, ordinality)
    )
  end as value
) blocks;

update public.content_items
set working_version = version,
    client_visible_version = case when status = 'idea' then null else version end,
    client_visible = (status <> 'idea'),
    review_ready_at = case when status = 'idea' then null else updated_at end,
    revision_in_progress = false,
    planned_date = scheduled_date;

alter table public.content_items alter column working_version set not null;

alter table public.content_items
  add constraint content_items_working_snapshot_fk
    foreign key (id, client_id, working_version)
    references public.content_item_versions(content_item_id, client_id, version)
    deferrable initially deferred,
  add constraint content_items_visible_snapshot_fk
    foreign key (id, client_id, client_visible_version)
    references public.content_item_versions(content_item_id, client_id, version)
    deferrable initially deferred;

alter table public.approvals
  add constraint approvals_content_version_fk
    foreign key (content_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version);

alter table public.comments
  add column content_version int,
  add column copy_block_key text;

update public.comments c
set content_version = ci.working_version
from public.content_items ci
where ci.id = c.content_id and ci.client_id = c.client_id;

alter table public.comments
  alter column content_version set not null,
  add constraint comments_content_version_positive check (content_version > 0),
  add constraint comments_copy_block_key_format check (
    copy_block_key is null or copy_block_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  add constraint comments_content_version_fk
    foreign key (content_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version);

create index comments_by_content_version
  on public.comments (content_id, content_version, created_at, id);

alter table public.content_item_versions enable row level security;

create policy content_item_versions_released_read
on public.content_item_versions
for select
using (
  client_id in (select public.my_client_ids())
  and exists (
    select 1
    from public.content_items ci
    where ci.id = content_item_id
      and ci.client_id = content_item_versions.client_id
      and ci.client_visible
      and ci.client_visible_version = content_item_versions.version
  )
);

drop policy ci_read on public.content_items;
create policy ci_released_read
on public.content_items
for select
using (
  client_visible
  and client_id in (select public.my_client_ids())
);

drop view public.content_with_state;

-- Reset all Data API privileges before recreating the safe released view.
revoke all on public.content_items, public.content_item_versions, public.approvals, public.comments
  from public, anon, authenticated;

grant select (
  id, content_id, client_id, status, review_ready_at, client_visible,
  revision_in_progress, client_visible_version, archived_at, planned_date, updated_at
) on public.content_items to authenticated;

grant select (
  id, content_item_id, client_id, version, title, format, pillar, platforms,
  canva_url, drive_url, fact_check, fact_check_ledger, client_body, copy_blocks, synced_at
) on public.content_item_versions to authenticated;

grant select (
  id, content_id, client_id, content_version, state, created_at
) on public.approvals to authenticated;

-- content_with_state is security_invoker; service-side admin/test readers need the same underlying
-- decision columns used by its lateral subquery.
revoke all on public.approvals from service_role;
grant select (
  id, content_id, client_id, content_version, state, created_at
) on public.approvals to service_role;

grant select (
  id, content_id, client_id, content_version, copy_block_key, author_type,
  author_name, body, quoted_text, resolved, created_at
) on public.comments to authenticated;

revoke all on public.content_item_versions from service_role;
grant select on public.content_item_versions to service_role;

-- The service key invokes reviewed security-definer functions; it cannot bypass the immutable
-- snapshot/release invariants with direct relation privileges. Revoke ALL first because Supabase
-- default privileges can also leave TRUNCATE/TRIGGER/REFERENCES behind on newly created objects.
revoke all on public.content_items, public.comments from service_role;
grant select on public.content_items, public.comments to service_role;

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
grant select on public.content_with_state to authenticated;
grant select on public.content_with_state to service_role;

-- Internal one-row sync helper. The public batch RPC below is the only granted entry point.
create or replace function public.portal_sync_content_item_version(p_item jsonb)
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
  v_fact_check_ledger jsonb := coalesce(p_item->'fact_check_ledger', '[]'::jsonb);
  v_client_body text := p_item->>'client_body';
  v_copy_blocks jsonb := coalesce(p_item->'copy_blocks', '[]'::jsonb);
  v_source_path text := pg_catalog.btrim(p_item->>'source_path');
  v_checksum text;
  v_existing_checksum text;
  v_ci public.content_items%rowtype;
  v_item_id uuid;
begin
  if v_client_id is null or v_content_id is null or v_content_id = ''
     or v_title is null or v_title = '' or v_version is null or v_version < 1
     or v_client_body is null or pg_catalog.btrim(v_client_body) = ''
     or v_source_path is null or v_source_path = '' then
    raise exception 'invalid content sync payload';
  end if;
  if v_fact_check is not null and v_fact_check not in ('confirmed','needs-confirm','flagged') then
    raise exception 'invalid fact_check for %', v_content_id;
  end if;
  if pg_catalog.jsonb_typeof(v_fact_check_ledger) <> 'array' then
    raise exception 'fact_check_ledger must be an array for %', v_content_id;
  end if;
  if not public.portal_copy_blocks_valid(v_copy_blocks) then
    raise exception 'invalid copy_blocks for %', v_content_id;
  end if;

  v_checksum := public.portal_content_checksum(
    v_title, v_format, v_pillar, v_platforms, v_canva_url, v_drive_url,
    v_fact_check, v_fact_check_ledger, v_client_body, v_copy_blocks
  );

  select ci.* into v_ci
  from public.content_items ci
  where ci.client_id = v_client_id and ci.content_id = v_content_id
  for update;

  if not found then
    insert into public.content_items (
      content_id, client_id,
      -- Legacy authored columns are populated only on first insert for rollback compatibility.
      title, format, pillar, platforms, scheduled_date, status, canva_url, drive_url,
      version, fact_check, client_body, source_path, copy_blocks,
      working_version, client_visible_version, client_visible, review_ready_at,
      revision_in_progress, planned_date, updated_at
    ) values (
      v_content_id, v_client_id,
      v_title, v_format, v_pillar, v_platforms, v_planned_date, 'draft', v_canva_url, v_drive_url,
      v_version, v_fact_check, v_client_body, v_source_path, v_copy_blocks,
      v_version, null, false, null, false, v_planned_date, pg_catalog.now()
    ) returning id into v_item_id;

    insert into public.content_item_versions (
      content_item_id, client_id, version, title, format, pillar, platforms,
      canva_url, drive_url, fact_check, fact_check_ledger, client_body, copy_blocks,
      content_checksum, source_path
    ) values (
      v_item_id, v_client_id, v_version, v_title, v_format, v_pillar, v_platforms,
      v_canva_url, v_drive_url, v_fact_check, v_fact_check_ledger, v_client_body, v_copy_blocks,
      v_checksum, v_source_path
    );

    return pg_catalog.jsonb_build_object(
      'content_id', v_content_id, 'item_id', v_item_id, 'outcome', 'inserted',
      'working_version', v_version, 'client_visible_version', null
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
      'client_visible_version', v_ci.client_visible_version
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

  insert into public.content_item_versions (
    content_item_id, client_id, version, title, format, pillar, platforms,
    canva_url, drive_url, fact_check, fact_check_ledger, client_body, copy_blocks,
    content_checksum, source_path
  ) values (
    v_item_id, v_client_id, v_version, v_title, v_format, v_pillar, v_platforms,
    v_canva_url, v_drive_url, v_fact_check, v_fact_check_ledger, v_client_body, v_copy_blocks,
    v_checksum, v_source_path
  );

  update public.content_items
  set working_version = v_version,
      updated_at = pg_catalog.now()
  where id = v_item_id;

  return pg_catalog.jsonb_build_object(
    'content_id', v_content_id, 'item_id', v_item_id, 'outcome', 'version_inserted',
    'working_version', v_version, 'client_visible_version', v_ci.client_visible_version
  );
end;
$$;

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
  if pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty JSON array';
  end if;
  if pg_catalog.jsonb_array_length(p_items) > 500 then
    raise exception 'content sync batch is too large';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    v_result := v_result || pg_catalog.jsonb_build_array(public.portal_sync_content_item_version(v_item));
  end loop;
  return v_result;
end;
$$;

revoke all on function public.portal_sync_content_item_version(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.sync_content_item_versions(jsonb) from public, anon, authenticated;
grant execute on function public.sync_content_item_versions(jsonb) to service_role;

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
  v_body text;
begin
  select ci.* into v_ci
  from public.content_items ci
  where ci.id = p_content_id
  for update;
  if not found then raise exception 'content item not found'; end if;

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
    raise exception 'stale content version';
  end if;

  select cv.title, cv.fact_check, cv.client_body
    into v_title, v_fact_check, v_body
  from public.content_item_versions cv
  where cv.content_item_id = v_ci.id
    and cv.client_id = v_ci.client_id
    and cv.version = p_content_version;
  if not found then raise exception 'content snapshot not found'; end if;
  if v_fact_check = 'flagged' then raise exception 'flagged content cannot be released for review'; end if;
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

-- Explicit workflow transition before agency-authored material changes. The snapshot sync is not
-- allowed to pull an active review/approval back to draft by itself.
create or replace function public.begin_content_revision(
  p_content_id uuid, p_content_version int
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ci public.content_items%rowtype;
begin
  select ci.* into v_ci
  from public.content_items ci
  where ci.id = p_content_id
  for update;
  if not found then raise exception 'content item not found'; end if;

  if v_ci.client_visible_version is distinct from p_content_version then
    raise exception 'stale content version';
  end if;

  if v_ci.status = 'draft'
     and v_ci.review_ready_at is null
     and v_ci.revision_in_progress then
    return;
  end if;

  if v_ci.working_version is distinct from p_content_version then
    raise exception 'stale content version';
  end if;

  if not v_ci.client_visible
     or v_ci.archived_at is not null
     or v_ci.status not in ('draft','approved') then
    raise exception 'content item is not eligible to begin a revision';
  end if;

  update public.content_items
  set status = 'draft',
      review_ready_at = null,
      revision_in_progress = true,
      updated_at = pg_catalog.now()
  where id = v_ci.id;
end;
$$;

revoke all on function public.begin_content_revision(uuid,int) from public, anon, authenticated;
grant execute on function public.begin_content_revision(uuid,int) to service_role;

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

  -- Exact retry must succeed even though the first call already changed workflow state.
  select a.id, a.state, a.note
    into v_approval, v_existing_state, v_existing_note
  from public.approvals a
  where a.content_id = p_content_id
    and a.content_version = p_content_version
    and a.decided_by = v_uid;
  if found
     and v_existing_state = p_decision
     and v_existing_note is not distinct from v_note then
    return v_approval;
  end if;

  if not v_ci.client_visible
     or v_ci.client_visible_version is distinct from p_content_version then
    raise exception 'stale or unreleased content version';
  end if;
  if v_ci.archived_at is not null or v_ci.status = 'posted' then
    raise exception 'this piece is not open for review';
  end if;

  if p_decision = 'approved' then
    if v_ci.status <> 'draft'
       or v_ci.review_ready_at is null
       or v_ci.revision_in_progress
       or v_ci.working_version is distinct from v_ci.client_visible_version then
      raise exception 'this piece is not open for approval';
    end if;
  else
    -- Scheduling/unscheduling is introduced in the next slice. Failing closed here avoids silently
    -- revising copy while an external scheduled post remains active.
    if v_ci.status not in ('draft','approved') or v_ci.review_ready_at is null then
      raise exception 'this piece is not open for a change request';
    end if;
  end if;

  select cv.title into v_title
  from public.content_item_versions cv
  where cv.content_item_id = v_ci.id
    and cv.client_id = v_ci.client_id
    and cv.version = p_content_version;
  if not found then raise exception 'released content snapshot not found'; end if;

  select coalesce(cu.name, cu.email) into v_actor
  from public.client_users cu
  where cu.auth_user_id = v_uid and cu.client_id = v_ci.client_id
  limit 1;

  insert into public.approvals (content_id, client_id, content_version, state, note, decided_by)
  values (p_content_id, v_ci.client_id, p_content_version, p_decision, v_note, v_uid)
  on conflict (content_id, content_version, decided_by)
  do update set state = excluded.state, note = excluded.note, created_at = pg_catalog.now()
  returning id into v_approval;

  if p_decision = 'approved' then
    update public.content_items
    set status = 'approved', revision_in_progress = false, updated_at = pg_catalog.now()
    where id = v_ci.id;
  else
    update public.content_items
    set status = 'draft', review_ready_at = null, revision_in_progress = true,
        updated_at = pg_catalog.now()
    where id = v_ci.id;
  end if;

  insert into public.activity_log (
    client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name
  ) values (
    v_ci.client_id, p_content_id, p_content_version, p_decision,
    case when p_decision = 'approved' then 'Approved: ' else 'Change requested: ' end || v_title,
    v_note, 'client', coalesce(v_actor, 'Client')
  );

  return v_approval;
end;
$$;

revoke all on function public.record_content_decision(uuid,int,text,text) from public, anon;
grant execute on function public.record_content_decision(uuid,int,text,text) to authenticated;

create or replace function public.add_comment(
  p_content_id uuid,
  p_body text,
  p_quoted_text text,
  p_copy_block_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_client_id uuid;
  v_title text;
  v_version int;
  v_blocks jsonb;
  v_actor text;
  v_body text := pg_catalog.btrim(p_body);
  v_quote text := nullif(pg_catalog.btrim(p_quoted_text), '');
  v_key text := nullif(pg_catalog.btrim(p_copy_block_key), '');
  v_block_body text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if v_body is null or v_body = '' then raise exception 'comment body is required'; end if;
  if pg_catalog.char_length(v_body) > 4000 then raise exception 'comment is too long'; end if;
  if v_quote is not null and pg_catalog.char_length(v_quote) > 2000 then
    raise exception 'quoted text is too long';
  end if;

  select ci.client_id, ci.client_visible_version, cv.title, cv.copy_blocks
    into v_client_id, v_version, v_title, v_blocks
  from public.content_items ci
  join public.client_users cu
    on cu.client_id = ci.client_id and cu.auth_user_id = v_uid
  join public.content_item_versions cv
    on cv.content_item_id = ci.id
   and cv.client_id = ci.client_id
   and cv.version = ci.client_visible_version
  where ci.id = p_content_id
    and ci.client_visible
    and ci.archived_at is null
  for update of ci;
  if not found then raise exception 'not authorized for this content'; end if;

  if v_quote is null and v_key is not null then
    raise exception 'copy block key requires quoted text';
  end if;
  if v_quote is not null then
    if v_key is null then raise exception 'copy block key is required for quoted text'; end if;
    select b.value->>'body' into v_block_body
    from pg_catalog.jsonb_array_elements(v_blocks) b(value)
    where b.value->>'key' = v_key;
    if not found then raise exception 'copy block does not exist on the released version'; end if;
    if pg_catalog.strpos(v_block_body, v_quote) = 0 then
      raise exception 'quoted text is not present in the released copy block';
    end if;
  end if;

  select coalesce(cu.name, cu.email) into v_actor
  from public.client_users cu
  where cu.auth_user_id = v_uid and cu.client_id = v_client_id
  limit 1;

  insert into public.comments (
    content_id, client_id, content_version, copy_block_key,
    author_type, author_name, body, quoted_text
  ) values (
    p_content_id, v_client_id, v_version, v_key,
    'client', coalesce(v_actor, 'Client'), v_body, v_quote
  ) returning id into v_id;

  insert into public.activity_log (
    client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name
  ) values (
    v_client_id, p_content_id, v_version, 'comment_added',
    'Comment: ' || v_title, v_body, 'client', coalesce(v_actor, 'Client')
  );

  return v_id;
end;
$$;

-- Compatibility wrapper for a rolling deploy. It permits unquoted comments from old code but
-- refuses an unverifiable quote that lacks a stable block key.
create or replace function public.add_comment(
  p_content_id uuid, p_body text, p_quoted_text text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(pg_catalog.btrim(p_quoted_text), '') is not null then
    raise exception 'refresh the page before quoting released copy';
  end if;
  return public.add_comment(p_content_id, p_body, null, null);
end;
$$;

revoke all on function public.add_comment(uuid,text,text,text) from public, anon;
revoke all on function public.add_comment(uuid,text,text) from public, anon;
grant execute on function public.add_comment(uuid,text,text,text) to authenticated;
grant execute on function public.add_comment(uuid,text,text) to authenticated;

create or replace function public.add_agency_comment(
  p_content_id uuid, p_body text, p_author_name text default 'The Dot'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_version int;
  v_title text;
  v_body text := pg_catalog.btrim(p_body);
  v_author text := pg_catalog.btrim(p_author_name);
  v_id uuid;
begin
  if v_body is null or v_body = '' then raise exception 'comment body is required'; end if;
  if pg_catalog.char_length(v_body) > 4000 then raise exception 'comment is too long'; end if;
  if v_author is null or v_author = '' then raise exception 'author name is required'; end if;
  if pg_catalog.char_length(v_author) > 200 then raise exception 'author name is too long'; end if;

  select ci.client_id, ci.client_visible_version, cv.title
    into v_client_id, v_version, v_title
  from public.content_items ci
  join public.content_item_versions cv
    on cv.content_item_id = ci.id
   and cv.client_id = ci.client_id
   and cv.version = ci.client_visible_version
  where ci.id = p_content_id and ci.client_visible and ci.archived_at is null
  for update of ci;
  if not found then raise exception 'released content item not found'; end if;

  insert into public.comments (
    content_id, client_id, content_version, copy_block_key,
    author_type, author_name, body, quoted_text
  ) values (
    p_content_id, v_client_id, v_version, null,
    'anastasia', v_author, v_body, null
  ) returning id into v_id;

  insert into public.activity_log (
    client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name
  ) values (
    v_client_id, p_content_id, v_version, 'comment_added',
    'Comment: ' || v_title, v_body, 'anastasia', v_author
  );

  return v_id;
end;
$$;

revoke all on function public.add_agency_comment(uuid,text,text) from public, anon, authenticated;
grant execute on function public.add_agency_comment(uuid,text,text) to service_role;

-- Service-only executable assertion used by migration replay and the PostgREST integration test.
create or replace function public.assert_portal_slice1_security()
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
  select pg_catalog.array_agg(cp.column_name order by cp.column_name)
    into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public'
    and cp.table_name = 'content_items'
    and cp.grantee = 'authenticated'
    and cp.privilege_type = 'SELECT';
  v_expected := array[
    'archived_at','client_id','client_visible','client_visible_version','content_id','id',
    'planned_date','review_ready_at','revision_in_progress','status','updated_at'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated content_items SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name)
    into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public'
    and cp.table_name = 'content_item_versions'
    and cp.grantee = 'authenticated'
    and cp.privilege_type = 'SELECT';
  v_expected := array[
    'canva_url','client_body','client_id','content_item_id','copy_blocks','drive_url',
    'fact_check','fact_check_ledger','format','id','pillar','platforms','synced_at','title','version'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated content_item_versions SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name)
    into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public'
    and cp.table_name = 'approvals'
    and cp.grantee = 'authenticated'
    and cp.privilege_type = 'SELECT';
  v_expected := array['client_id','content_id','content_version','created_at','id','state'];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated approvals SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name)
    into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public'
    and cp.table_name = 'approvals'
    and cp.grantee = 'service_role'
    and cp.privilege_type = 'SELECT';
  v_expected := array['client_id','content_id','content_version','created_at','id','state'];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected service_role approvals SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name)
    into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public'
    and cp.table_name = 'comments'
    and cp.grantee = 'authenticated'
    and cp.privilege_type = 'SELECT';
  v_expected := array[
    'author_name','author_type','body','client_id','content_id','content_version',
    'copy_block_key','created_at','id','quoted_text','resolved'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated comments SELECT grants: %', v_actual;
  end if;

  select pg_catalog.array_agg(a.attname::text order by a.attnum)
    into v_view_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.content_with_state'::pg_catalog.regclass
    and a.attnum > 0 and not a.attisdropped;
  v_expected := array[
    'id','content_id','client_id','title','format','pillar','platforms','status','scheduled_date',
    'canva_url','drive_url','version','fact_check','fact_check_ledger','client_body','copy_blocks',
    'updated_at','review_ready_at','revision_in_progress','archived_at','current_decision','client_state'
  ];
  if v_view_columns is distinct from v_expected then
    raise exception 'unsafe or missing content_with_state columns: %', v_view_columns;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'public.content_with_state'::pg_catalog.regclass
      and coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'content_with_state must be security_invoker';
  end if;

  if exists (
    select 1
    from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name in ('content_items','content_item_versions','content_with_state')
      and tp.grantee in ('PUBLIC','anon')
  ) then
    raise exception 'public/anon portal relation privilege detected';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.content_items', 'INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_item_versions', 'INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.approvals', 'INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.comments', 'INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_items', 'INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_item_versions', 'INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.comments', 'INSERT,UPDATE,DELETE') then
    raise exception 'direct Slice-1 table write privilege detected';
  end if;

  if exists (
    select 1
    from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name in ('content_items','content_item_versions','approvals','comments','content_with_state')
      and tp.grantee in ('authenticated','service_role')
      and tp.privilege_type <> 'SELECT'
  ) then
    raise exception 'unexpected non-SELECT authenticated/service_role relation privilege detected';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.my_client_ids()', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.my_client_ids()', 'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.record_content_decision(uuid,integer,text,text)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.add_comment(uuid,text,text,text)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.sync_content_item_versions(jsonb)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.mark_content_ready(uuid,integer)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.begin_content_revision(uuid,integer)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.add_agency_comment(uuid,text,text)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.sync_content_item_versions(jsonb)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.mark_content_ready(uuid,integer)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.begin_content_revision(uuid,integer)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.add_agency_comment(uuid,text,text)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.portal_sync_content_item_version(jsonb)', 'EXECUTE'
     ) then
    raise exception 'unexpected Slice-1 function execution privilege';
  end if;
end;
$$;

revoke all on function public.assert_portal_slice1_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice1_security() to service_role;

select public.assert_portal_slice1_security();

commit;
