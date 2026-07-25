-- Selected idea -> durable piece identity.
--
-- A submitted weekly plan may introduce a piece before its canonical Markdown pack
-- exists. The piece receives one content_items identity immediately, with no working
-- snapshot and no client-readable copy. The first canonical sync hydrates that same
-- identity as version 1.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_evaluate_content_item_version(jsonb,boolean)') is null
     or pg_catalog.to_regclass('public.plan_cycle_items') is null then
    raise exception '0028 plan-cycle objects must exist before applying 0029';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice23_security;
revoke all on function public.assert_portal_slice23_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice23_security() to service_role;

-- A NULL working_version is the structural definition of an idea-stage identity.
-- The composite working-snapshot FK uses MATCH SIMPLE, so it intentionally does not
-- require a content_item_versions row until the first canonical sync.
alter table public.content_items alter column working_version drop not null;

alter table public.plan_cycle_items add column pillar text;

-- Producer is agency workflow metadata. The client sees the safe editorial direction,
-- not who The Dot assigned to make it.
drop view public.plan_cycle_items_client;
revoke all on table public.plan_cycle_items from public, anon, authenticated, service_role;
grant select (
  id, plan_cycle_id, client_id, content_item_id, content_id, position, planned_date,
  title, format, pillar, platforms, direction_note, created_at, updated_at
) on public.plan_cycle_items to authenticated;
grant select on public.plan_cycle_items to service_role;

create view public.plan_cycle_items_client with (security_invoker = true, security_barrier = true) as
select i.id, i.plan_cycle_id, i.client_id, i.content_item_id, i.content_id, i.position,
  i.planned_date, i.title, i.format, i.pillar, i.platforms, i.direction_note,
  i.created_at, i.updated_at
from public.plan_cycle_items i
join public.plan_cycles c on c.id = i.plan_cycle_id and c.client_id = i.client_id
where c.status in ('submitted','approved','change_requested');

revoke all on public.plan_cycle_items_client from public, anon, authenticated, service_role;
grant select on public.plan_cycle_items_client to authenticated, service_role;

-- Keep the already-reviewed writer as the strict cycle/receipt/activity implementation.
-- The public writer below owns identity creation, then delegates inside the same atomic
-- transaction. The inner function is not callable by API roles.
alter function public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)
  rename to portal_core_agency_upsert_plan_cycle;
revoke all on function public.portal_core_agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.agency_upsert_plan_cycle(
  p_client_id uuid, p_cycle_key text, p_week_start date, p_week_end date,
  p_title text, p_direction_summary text, p_items jsonb,
  p_actor_key text, p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_content_id text;
  v_title text;
  v_format text;
  v_pillar text;
  v_producer text;
  v_date date;
  v_platforms text[];
  v_cycle_id uuid;
begin
  if pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid plan cycle payload';
  end if;

  -- Serialize all submissions for one tenant/cycle, including two first submissions
  -- racing to create the same content_id.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-plan-cycle-identity:' || p_client_id::text || ':' || coalesce(p_cycle_key, ''), 0));

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    v_content_id := pg_catalog.btrim(v_item->>'content_id');
    v_title := pg_catalog.btrim(v_item->>'title');
    v_format := nullif(pg_catalog.btrim(v_item->>'format'), '');
    v_pillar := nullif(pg_catalog.btrim(v_item->>'pillar'), '');
    v_producer := nullif(pg_catalog.btrim(v_item->>'producer'), '');
    v_date := nullif(v_item->>'planned_date', '')::date;
    select array(
      select pg_catalog.jsonb_array_elements_text(coalesce(v_item->'platforms', '[]'::jsonb))
    ) into v_platforms;

    if v_content_id !~ '^[a-z0-9][a-z0-9._-]{1,119}$'
       or v_title is null or pg_catalog.char_length(v_title) not between 1 and 300
       or v_producer is not null and v_producer not in ('the_dot','studio')
       or cardinality(v_platforms) > 12
       or not public.portal_client_summary_shape_valid(v_title)
       or not (v_format is null or public.portal_client_summary_shape_valid(v_format))
       or not (v_pillar is null or public.portal_client_summary_shape_valid(v_pillar)) then
      raise exception 'invalid plan cycle item identity';
    end if;

    insert into public.content_items(
      content_id, client_id, title, format, pillar, platforms, scheduled_date, status,
      version, working_version, client_visible_version, client_visible,
      review_ready_at, revision_in_progress, planned_date, updated_at
    ) values (
      v_content_id, p_client_id, v_title, v_format, v_pillar, coalesce(v_platforms, '{}'),
      v_date, 'idea', 1, null, null, false, null, false, v_date, pg_catalog.now()
    )
    on conflict (client_id, content_id) do nothing;

    -- Planning metadata may continue to move while no authored snapshot exists.
    -- Once version 1 exists, only planned_date is mutable here; version-owned title,
    -- producer, copy, evidence, and platform metadata remain canonical-file truth.
    update public.content_items ci
    set title = case when ci.working_version is null then v_title else ci.title end,
        format = case when ci.working_version is null then v_format else ci.format end,
        pillar = case when ci.working_version is null then v_pillar else ci.pillar end,
        platforms = case when ci.working_version is null then coalesce(v_platforms, '{}') else ci.platforms end,
        scheduled_date = v_date,
        planned_date = v_date,
        status = case when ci.working_version is null then 'idea' else ci.status end,
        updated_at = pg_catalog.now()
    where ci.client_id = p_client_id and ci.content_id = v_content_id
      and (
        ci.planned_date is distinct from v_date
        or ci.scheduled_date is distinct from v_date
        or (
          ci.working_version is null and (
            ci.title is distinct from v_title
            or ci.format is distinct from v_format
            or ci.pillar is distinct from v_pillar
            or ci.platforms is distinct from coalesce(v_platforms, '{}')
            or ci.status is distinct from 'idea'
          )
        )
      );
  end loop;

  v_cycle_id := public.portal_core_agency_upsert_plan_cycle(
    p_client_id, p_cycle_key, p_week_start, p_week_end, p_title,
    p_direction_summary, p_items, p_actor_key, p_idempotency_key
  );

  update public.plan_cycle_items pci
  set pillar = nullif(pg_catalog.btrim(src.value->>'pillar'), '')
  from pg_catalog.jsonb_array_elements(p_items) src(value)
  where pci.plan_cycle_id = v_cycle_id
    and pci.client_id = p_client_id
    and pci.content_id = pg_catalog.btrim(src.value->>'content_id');

  return v_cycle_id;
end;
$$;

revoke all on function public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)
  to service_role;

-- Preserve the reviewed evaluator for ordinary inserts/revisions, and interpose only
-- the new versionless-idea hydration branch.
alter function public.portal_evaluate_content_item_version(jsonb,boolean)
  rename to portal_core_evaluate_content_item_version;
revoke all on function public.portal_core_evaluate_content_item_version(jsonb,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.portal_evaluate_content_item_version(
  p_item jsonb,
  p_write boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_client_id uuid := (p_item->>'client_id')::uuid;
  v_content_id text := pg_catalog.btrim(p_item->>'content_id');
  v_version int := (p_item->>'version')::int;
  v_title text := pg_catalog.btrim(p_item->>'title');
  v_format text := nullif(pg_catalog.btrim(p_item->>'format'), '');
  v_pillar text := nullif(pg_catalog.btrim(p_item->>'pillar'), '');
  v_platforms text[] := array(select pg_catalog.jsonb_array_elements_text(coalesce(p_item->'platforms', '[]'::jsonb)));
  v_planned_date date := nullif(p_item->>'planned_date', '')::date;
  v_canva_url text := nullif(pg_catalog.btrim(p_item->>'canva_url'), '');
  v_drive_url text := nullif(pg_catalog.btrim(p_item->>'drive_url'), '');
  v_fact_check text := nullif(pg_catalog.btrim(p_item->>'fact_check'), '');
  v_fact_check_scope text := nullif(pg_catalog.btrim(p_item->>'fact_check_scope'), '');
  v_fact_check_exemption text := nullif(pg_catalog.btrim(p_item->>'fact_check_exemption'), '');
  v_fact_check_ledger jsonb := coalesce(p_item->'fact_check_ledger', '[]'::jsonb);
  v_client_body text := p_item->>'client_body';
  v_copy_blocks jsonb := coalesce(p_item->'copy_blocks', '[]'::jsonb);
  v_producer text := nullif(pg_catalog.btrim(p_item->>'producer'), '');
  v_calendar_note text := nullif(pg_catalog.btrim(p_item->>'calendar_note'), '');
  v_source_path text := pg_catalog.btrim(p_item->>'source_path');
  v_source_commit_sha text := nullif(pg_catalog.btrim(p_item->>'source_commit_sha'), '');
  v_checksum text;
  v_ci public.content_items%rowtype;
begin
  select ci.* into v_ci from public.content_items ci
  where ci.client_id = v_client_id and ci.content_id = v_content_id
  for update;

  if not found or v_ci.working_version is not null then
    return public.portal_core_evaluate_content_item_version(p_item, p_write);
  end if;

  if v_ci.status <> 'idea' or v_ci.client_visible or v_ci.client_visible_version is not null
     or v_ci.review_ready_at is not null or v_ci.revision_in_progress
     or v_ci.archived_at is not null
     or exists (select 1 from public.content_item_versions cv where cv.content_item_id = v_ci.id) then
    raise exception 'invalid versionless idea state for %', v_content_id;
  end if;
  if v_version is distinct from 1 then
    raise exception 'first snapshot for % must be version 1', v_content_id;
  end if;
  if v_title is null or v_title = ''
     or v_client_body is null or pg_catalog.btrim(v_client_body) = ''
     or v_source_path is null or v_source_path = ''
     or v_fact_check not in ('confirmed','needs-confirm','flagged') then
    raise exception 'invalid content sync payload';
  end if;
  if v_producer is not null and v_producer not in ('the_dot','studio') then
    raise exception 'invalid producer for %', v_content_id;
  end if;
  if v_calendar_note is not null and (
    pg_catalog.char_length(v_calendar_note) not between 1 and 1000
    or v_calendar_note ~ '[[:cntrl:]]'
  ) then
    raise exception 'invalid calendar_note for %', v_content_id;
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
    v_client_body, v_copy_blocks, v_producer, v_calendar_note
  );

  if not p_write then
    return pg_catalog.jsonb_build_object(
      'content_id', v_content_id, 'item_id', v_ci.id,
      'outcome', 'idea_hydrated', 'working_version', 1,
      'client_visible_version', null, 'checksum', v_checksum
    );
  end if;

  insert into public.content_item_versions(
    content_item_id, client_id, version, title, format, pillar, platforms,
    canva_url, drive_url, fact_check, fact_check_scope, fact_check_exemption,
    fact_check_ledger, client_body, copy_blocks, producer, calendar_note,
    content_checksum, source_path, source_commit_sha
  ) values (
    v_ci.id, v_client_id, 1, v_title, v_format, v_pillar, v_platforms,
    v_canva_url, v_drive_url, v_fact_check, v_fact_check_scope, v_fact_check_exemption,
    v_fact_check_ledger, v_client_body, v_copy_blocks, v_producer, v_calendar_note,
    v_checksum, v_source_path, v_source_commit_sha
  );

  update public.content_items
  set title = v_title, format = v_format, pillar = v_pillar, platforms = v_platforms,
      scheduled_date = v_planned_date, status = 'draft', canva_url = v_canva_url,
      drive_url = v_drive_url, version = 1, fact_check = v_fact_check,
      client_body = v_client_body, source_path = v_source_path, copy_blocks = v_copy_blocks,
      working_version = 1, planned_date = v_planned_date, updated_at = pg_catalog.now()
  where id = v_ci.id;

  return pg_catalog.jsonb_build_object(
    'content_id', v_content_id, 'item_id', v_ci.id,
    'outcome', 'idea_hydrated', 'working_version', 1,
    'client_visible_version', null, 'checksum', v_checksum
  );
end;
$$;

revoke all on function public.portal_evaluate_content_item_version(jsonb,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.assert_portal_content_identity_lifecycle()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_columns text[];
  v_def text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_items'
      and column_name = 'working_version' and is_nullable <> 'YES'
  ) then
    raise exception 'working_version must permit a versionless idea identity';
  end if;

  select pg_catalog.array_agg(column_name order by column_name)
  into v_columns
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'plan_cycle_items'
    and grantee = 'authenticated' and privilege_type = 'SELECT';
  if v_columns is distinct from array[
    'client_id','content_id','content_item_id','created_at','direction_note','format',
    'id','pillar','plan_cycle_id','planned_date','platforms','position','title','updated_at'
  ]::text[] then
    raise exception 'plan-cycle item client column grant drift: %', v_columns;
  end if;
  if pg_catalog.has_column_privilege('authenticated','public.plan_cycle_items','producer','SELECT')
     or pg_catalog.has_table_privilege('anon','public.plan_cycle_items_client','SELECT') then
    raise exception 'plan-cycle item metadata is overexposed';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)'::regprocedure
  ) into v_def;
  if v_def not ilike '%working_version is null%'
     or v_def not ilike '%on conflict (client_id, content_id) do nothing%'
     or v_def not ilike '%portal_core_agency_upsert_plan_cycle%' then
    raise exception 'plan writer does not own versionless identity creation safely';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.portal_evaluate_content_item_version(jsonb,boolean)'::regprocedure
  ) into v_def;
  if v_def not ilike '%first snapshot for % must be version 1%'
     or v_def not ilike '%invalid versionless idea state%'
     or v_def not ilike '%idea_hydrated%' then
    raise exception 'sync evaluator does not safely hydrate versionless ideas';
  end if;

  if pg_catalog.has_function_privilege(
       'authenticated','public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege(
       'service_role','public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege(
       'service_role','public.portal_core_agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege(
       'service_role','public.portal_core_evaluate_content_item_version(jsonb,boolean)','EXECUTE') then
    raise exception 'content identity writer grants are unsafe';
  end if;
end;
$$;

revoke all on function public.assert_portal_content_identity_lifecycle()
  from public, anon, authenticated;
grant execute on function public.assert_portal_content_identity_lifecycle() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice23_security();
  perform public.assert_portal_content_identity_lifecycle();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
