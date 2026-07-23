-- Piece architecture contract (spec 2026-07-23, v2.1).
--
-- This migration makes version ownership and production-gate scope structural:
-- producer/calendar_note are immutable snapshot metadata, and every production
-- gate/event is tied to the working content version that produced it.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regclass('public.content_production_gates') is null
     or pg_catalog.to_regclass('public.production_gate_events') is null then
    raise exception '0024/base portal objects must exist before applying 0025';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice19_security;
revoke all on function public.assert_portal_slice19_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice19_security() to service_role;

-- --- immutable snapshot metadata --------------------------------------------

alter table public.content_item_versions
  add column producer text,
  add column calendar_note text;

alter table public.content_item_versions
  add constraint content_item_versions_producer_valid
    check (producer is null or producer in ('the_dot','studio')),
  add constraint content_item_versions_calendar_note_valid
    check (calendar_note is null or (
      pg_catalog.char_length(calendar_note) between 1 and 1000
      and calendar_note !~ '[[:cntrl:]]'
    ));

-- Recompute existing snapshot checksums under the new checksum contract. Existing
-- rows have NULL metadata, so this is a semantic no-op for the content itself but
-- makes the next exact sync retry deterministic.
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
  p_copy_blocks jsonb,
  p_producer text,
  p_calendar_note text
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
          'copy_blocks', coalesce(p_copy_blocks, '[]'::jsonb),
          'producer', p_producer,
          'calendar_note', p_calendar_note
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

update public.content_item_versions cv
set content_checksum = public.portal_content_checksum(
  cv.title, cv.format, cv.pillar, cv.platforms, cv.canva_url, cv.drive_url,
  cv.fact_check, cv.fact_check_scope, cv.fact_check_exemption, cv.fact_check_ledger,
  cv.client_body, cv.copy_blocks, cv.producer, cv.calendar_note
);

-- --- version-bound production gates -----------------------------------------

alter table public.content_production_gates
  add column content_version int;
update public.content_production_gates g
set content_version = ci.working_version
from public.content_items ci
where ci.id = g.content_item_id and ci.client_id = g.client_id;
alter table public.content_production_gates
  alter column content_version set not null,
  add constraint content_production_gates_version_positive check (content_version > 0);

drop index public.content_production_gates_current;
create unique index content_production_gates_current
  on public.content_production_gates (client_id, content_item_id, content_version, gate_key);

alter table public.production_gate_events
  add column content_version int;
update public.production_gate_events e
set content_version = ci.working_version
from public.content_items ci
where ci.id = e.content_item_id and ci.client_id = e.client_id;
alter table public.production_gate_events
  alter column content_version set not null,
  add constraint production_gate_events_version_positive check (content_version > 0);

-- --- version-aware sync evaluator -------------------------------------------

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
  if not public.portal_fact_check_ledger_release_valid(v_fact_check_ledger, v_fact_check_scope, v_fact_check_exemption) then
    raise exception 'ledger_invalid for %', v_content_id;
  end if;

  v_checksum := public.portal_content_checksum(
    v_title, v_format, v_pillar, v_platforms, v_canva_url, v_drive_url,
    v_fact_check, v_fact_check_scope, v_fact_check_exemption, v_fact_check_ledger,
    v_client_body, v_copy_blocks, v_producer, v_calendar_note
  );

  select ci.* into v_ci from public.content_items ci
  where ci.client_id = v_client_id and ci.content_id = v_content_id for update;

  if not found then
    if not p_write then
      return pg_catalog.jsonb_build_object('content_id', v_content_id, 'item_id', null,
        'outcome', 'inserted', 'working_version', v_version,
        'client_visible_version', null, 'checksum', v_checksum);
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
      fact_check_ledger, client_body, copy_blocks, producer, calendar_note,
      content_checksum, source_path, source_commit_sha
    ) values (
      v_item_id, v_client_id, v_version, v_title, v_format, v_pillar, v_platforms,
      v_canva_url, v_drive_url, v_fact_check, v_fact_check_scope, v_fact_check_exemption,
      v_fact_check_ledger, v_client_body, v_copy_blocks, v_producer, v_calendar_note,
      v_checksum, v_source_path, v_source_commit_sha
    );
    return pg_catalog.jsonb_build_object('content_id', v_content_id, 'item_id', v_item_id,
      'outcome', 'inserted', 'working_version', v_version,
      'client_visible_version', null, 'checksum', v_checksum);
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
    return pg_catalog.jsonb_build_object('content_id', v_content_id, 'item_id', v_item_id,
      'outcome', 'exact_retry', 'working_version', v_ci.working_version,
      'client_visible_version', v_ci.client_visible_version, 'checksum', v_checksum);
  end if;
  if v_version <> v_ci.working_version + 1 then
    raise exception 'stale or skipped snapshot conflict for %', v_content_id;
  end if;
  if v_ci.archived_at is not null or v_ci.status <> 'draft' or v_ci.review_ready_at is not null
     or (v_ci.client_visible_version is not null and not v_ci.revision_in_progress) then
    raise exception 'begin a guarded revision before syncing a new version for %', v_content_id;
  end if;
  if not p_write then
    return pg_catalog.jsonb_build_object('content_id', v_content_id, 'item_id', v_item_id,
      'outcome', 'version_inserted', 'working_version', v_version,
      'client_visible_version', v_ci.client_visible_version, 'checksum', v_checksum);
  end if;
  insert into public.content_item_versions (
    content_item_id, client_id, version, title, format, pillar, platforms,
    canva_url, drive_url, fact_check, fact_check_scope, fact_check_exemption,
    fact_check_ledger, client_body, copy_blocks, producer, calendar_note,
    content_checksum, source_path, source_commit_sha
  ) values (
    v_item_id, v_client_id, v_version, v_title, v_format, v_pillar, v_platforms,
    v_canva_url, v_drive_url, v_fact_check, v_fact_check_scope, v_fact_check_exemption,
    v_fact_check_ledger, v_client_body, v_copy_blocks, v_producer, v_calendar_note,
    v_checksum, v_source_path, v_source_commit_sha
  );
  update public.content_items set working_version = v_version, updated_at = pg_catalog.now()
  where id = v_item_id;
  return pg_catalog.jsonb_build_object('content_id', v_content_id, 'item_id', v_item_id,
    'outcome', 'version_inserted', 'working_version', v_version,
    'client_visible_version', v_ci.client_visible_version, 'checksum', v_checksum);
end;
$$;

revoke all on function public.portal_evaluate_content_item_version(jsonb, boolean)
  from public, anon, authenticated, service_role;

-- The writer derives the version while holding the item lock. An idempotency
-- fingerprint includes that version, so a key cannot silently replay across a
-- revision.
create or replace function public.set_production_gate(
  p_client_id uuid, p_content_id text, p_gate_key text, p_state text,
  p_owner text, p_note text, p_na_reason text, p_occurred_at timestamptz,
  p_actor_key text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_existing public.content_production_gates%rowtype;
  v_fingerprint text;
  v_legacy_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_gate_id uuid;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;
  if p_content_id is null or pg_catalog.char_length(pg_catalog.btrim(p_content_id)) not between 1 and 200 then
    raise exception 'content id is required';
  end if;
  select * into v_item from public.content_items ci
    where ci.client_id = p_client_id and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content does not belong to client'; end if;
  if p_gate_key not in ('source_in_hand','design_built','proofed','approval_sent') then
    raise exception 'unknown production gate key';
  end if;
  if p_state not in ('open','done','na') then raise exception 'unknown gate state'; end if;
  if p_owner not in ('anastasia','studio','agent') then raise exception 'unknown gate owner'; end if;
  if v_item.working_version is null then raise exception 'content has no working version'; end if;
  if p_state = 'na' and (p_na_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_na_reason)) not between 1 and 1000) then
    raise exception 'na requires a reason';
  end if;
  if p_state = 'done' and p_occurred_at is null then raise exception 'done requires occurred_at'; end if;
  if p_note is not null and pg_catalog.char_length(p_note) > 2000 then raise exception 'note too long'; end if;
  if not public.portal_note_grammar_safe(p_note) or not public.portal_note_grammar_safe(p_na_reason) then
    raise exception 'note contains a reserved grammar or control character';
  end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('content_id', pg_catalog.btrim(p_content_id),
      'content_version', v_item.working_version, 'gate_key', p_gate_key, 'state', p_state,
      'owner', p_owner, 'note', p_note, 'na_reason', p_na_reason,
      'occurred_at', p_occurred_at)::text, 'UTF8'), 'sha256'), 'hex');
  -- Receipts written by 0022 predate version-bound gates. Accept the exact
  -- legacy fingerprint once so a retry of an already-recorded command remains
  -- idempotent after this migration, while all new commands bind the version.
  v_legacy_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('content_id', pg_catalog.btrim(p_content_id),
      'gate_key', p_gate_key, 'state', p_state, 'owner', p_owner, 'note', p_note,
      'na_reason', p_na_reason, 'occurred_at', p_occurred_at)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'set_production_gate'
       or v_receipt.request_fingerprint not in (v_fingerprint, v_legacy_fingerprint) then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  select * into v_existing from public.content_production_gates g
    where g.client_id = p_client_id and g.content_item_id = v_item.id
      and g.content_version = v_item.working_version and g.gate_key = p_gate_key and g.dest is null
    for update;
  if found then
    update public.content_production_gates g set
      state = p_state,
      na_reason = case when p_state = 'na' then pg_catalog.btrim(p_na_reason) else null end,
      owner_label = p_owner, occurred_at = p_occurred_at, note = p_note,
      updated_at = pg_catalog.now()
    where g.id = v_existing.id returning g.id into v_gate_id;
  else
    insert into public.content_production_gates
      (client_id, content_item_id, content_version, gate_key, state, na_reason,
       owner_label, occurred_at, note)
    values (p_client_id, v_item.id, v_item.working_version, p_gate_key, p_state,
      case when p_state = 'na' then pg_catalog.btrim(p_na_reason) else null end,
      p_owner, p_occurred_at, p_note)
    returning id into v_gate_id;
  end if;

  insert into public.production_gate_events
    (client_id, content_item_id, content_version, gate_key, from_state, to_state,
     actor_key, note, idempotency_key)
  values (p_client_id, v_item.id, v_item.working_version, p_gate_key,
    v_existing.state, p_state, p_actor_key, p_note, p_idempotency_key);

  insert into public.portal_command_receipts
    (client_id, command_type, idempotency_key, request_fingerprint, response)
  values (p_client_id, 'set_production_gate', p_idempotency_key, v_fingerprint,
    pg_catalog.jsonb_build_object('id', v_gate_id, 'gate_key', p_gate_key,
      'content_version', v_item.working_version, 'state', p_state));
  return pg_catalog.jsonb_build_object('id', v_gate_id, 'gate_key', p_gate_key,
    'content_version', v_item.working_version, 'state', p_state);
end;
$$;
revoke all on function public.set_production_gate(uuid,text,text,text,text,text,text,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.set_production_gate(uuid,text,text,text,text,text,text,timestamptz,text,text)
  to service_role;

create or replace function public.portal_piece_fact_check_release_valid(
  p_fact_check text, p_fact_check_scope text, p_fact_check_exemption text, p_fact_check_ledger jsonb
) returns boolean language sql security definer set search_path = '' as $$
  select p_fact_check = 'confirmed'
    and public.portal_fact_check_ledger_release_valid(
      p_fact_check_ledger, p_fact_check_scope, p_fact_check_exemption
    )
$$;
revoke all on function public.portal_piece_fact_check_release_valid(text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.portal_piece_fact_check_release_valid(text,text,text,jsonb)
  to service_role;

-- --- safe grants and client calendar view -----------------------------------

-- Keep the established content_with_state column contract intact. The dedicated
-- calendar view adds only the explicitly client-safe note, avoiding a silent
-- alteration of the long-lived client piece view and its exact-grant assertion.
revoke all on public.content_item_versions from public, anon, authenticated, service_role;
grant select (
  id, content_item_id, client_id, version, title, format, pillar, platforms,
  canva_url, drive_url, fact_check, fact_check_scope, fact_check_exemption,
  fact_check_ledger, client_body, copy_blocks, calendar_note, synced_at
) on public.content_item_versions to authenticated;
grant select on public.content_item_versions to service_role;

create view public.content_calendar_client
with (security_barrier = true, security_invoker = true)
as
select
  cws.id, cws.content_id, cws.client_id, cws.title, cws.format, cws.pillar,
  cws.platforms, cws.status, cws.scheduled_date, cws.version, v.calendar_note,
  cws.client_state, cws.schedule_state, cws.publication_state, cws.updated_at
from public.content_with_state cws
join public.content_item_versions v on v.content_item_id = cws.id
  and v.client_id = cws.client_id and v.version = cws.version
where cws.client_id in (select public.my_client_ids());

revoke all on public.content_calendar_client from public, anon, authenticated, service_role;
grant select on public.content_calendar_client to authenticated, service_role;

-- The pre-0025 cumulative assertion contains the exact version-table grant set.
-- Extend that assertion in-place so the new client-safe calendar_note grant is
-- guarded on every later cumulative fold, while producer remains excluded.
do $migration$
declare
  v_def text;
  v_old text := $assert$v_expected := array[
    'canva_url','client_body','client_id','content_item_id','copy_blocks','drive_url',
    'fact_check','fact_check_exemption','fact_check_ledger','fact_check_scope','format','id',
    'pillar','platforms','synced_at','title','version'
  ];$assert$;
  v_new text := $assert$v_expected := array[
    'calendar_note','canva_url','client_body','client_id','content_item_id','copy_blocks','drive_url',
    'fact_check','fact_check_exemption','fact_check_ledger','fact_check_scope','format','id',
    'pillar','platforms','synced_at','title','version'
  ];$assert$;
begin
  select pg_catalog.pg_get_functiondef('public.assert_portal_slice2_security()'::regprocedure)
    into v_def;
  if v_def is null or pg_catalog.position(v_old in v_def) = 0 then
    raise exception 'could not update the inherited version-grant assertion';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$migration$;

-- --- assertions -------------------------------------------------------------

create or replace function public.assert_portal_piece_architecture_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actual text[];
  v_expected text[];
  v_view_columns text[];
begin
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'content_item_versions'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  v_expected := array[
    'calendar_note','canva_url','client_body','client_id','content_item_id','copy_blocks',
    'drive_url','fact_check','fact_check_exemption','fact_check_ledger','fact_check_scope',
    'format','id','pillar','platforms','synced_at','title','version'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected authenticated version grant set: %', v_actual;
  end if;
  if pg_catalog.has_column_privilege('authenticated','public.content_item_versions','producer','SELECT') then
    raise exception 'producer must remain agency-only';
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
    raise exception 'content_with_state columns changed unexpectedly: %', v_view_columns;
  end if;
  select pg_catalog.array_agg(a.attname::text order by a.attnum) into v_view_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.content_calendar_client'::pg_catalog.regclass
    and a.attnum > 0 and not a.attisdropped;
  v_expected := array[
    'id','content_id','client_id','title','format','pillar','platforms','status','scheduled_date',
    'version','calendar_note','client_state','schedule_state','publication_state','updated_at'
  ];
  if v_view_columns is distinct from v_expected then
    raise exception 'unsafe content_calendar_client columns: %', v_view_columns;
  end if;
  if not exists (select 1 from pg_catalog.pg_class c where c.oid = 'public.content_calendar_client'::pg_catalog.regclass
    and coalesce(c.reloptions, '{}'::text[]) @> array['security_barrier=true']) then
    raise exception 'content_calendar_client must be security_barrier';
  end if;
  if not exists (select 1 from pg_catalog.pg_class c where c.oid = 'public.content_calendar_client'::pg_catalog.regclass
    and coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']) then
    raise exception 'content_calendar_client must be security_invoker';
  end if;
  if pg_catalog.pg_get_viewdef('public.content_calendar_client'::regclass, true)
       not ilike '%my_client_ids%' then
    raise exception 'content_calendar_client must enforce tenant membership';
  end if;
  if not exists (select 1 from pg_catalog.pg_class c where c.oid = 'public.content_with_state'::pg_catalog.regclass
    and coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']) then
    raise exception 'content_with_state must remain security_invoker';
  end if;
  if exists (select 1 from public.content_production_gates g
    join public.content_items ci on ci.id = g.content_item_id and ci.client_id = g.client_id
    where g.content_version > ci.working_version) then
    raise exception 'production gate points at a future version';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.content_production_gates','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.production_gate_events','SELECT') then
    raise exception 'production internals must remain hidden from authenticated';
  end if;
  if not pg_catalog.has_function_privilege('service_role','public.set_production_gate(uuid,text,text,text,text,text,text,timestamptz,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.set_production_gate(uuid,text,text,text,text,text,text,timestamptz,text,text)','EXECUTE') then
    raise exception 'production gate writer privileges are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_piece_architecture_security() from public, anon, authenticated;
grant execute on function public.assert_portal_piece_architecture_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice19_security();
  perform public.assert_portal_piece_architecture_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
