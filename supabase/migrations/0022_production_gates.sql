-- Production gates + ops tasks (gate-system spec phase 1, Anastasia's go 2026-07-21;
-- docs/superpowers/specs/2026-07-21-portal-gate-system-design.md sections 2-3).
--
-- AGENCY-ONLY storage. Three principles, all asserted below:
-- 1. Zero client visibility: RLS on, ZERO authenticated grants, no policies. Maria's
--    roles can read none of it; production internals never reach her feed (gate events
--    go to a dedicated append-only table, NEVER activity_log).
-- 2. service_role reads only; writes go through hardened definer RPCs with agency-actor
--    validation and fingerprinted idempotency (the 0011 conventions). Revoke-then-grant
--    includes service_role (the 0017 prod default-privileges incident pattern).
-- 3. NOT an assistant index source: the 13-source index does not grow here; the
--    client-facing assistant must never learn or leak production internals.
--
-- content_production_gates.dest is reserved for forward-compat and stays NULL in v1
-- (call 1: the four production gates are per-piece facts; the RPC takes no dest).
--
-- This migration flips no switch and grants no client capability.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.agency_actors') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.content_items') is null
     or pg_catalog.to_regprocedure('public.portal_reject_immutable_history_mutation()') is null then
    raise exception '0021/base portal objects must exist before applying 0022';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice16_security;
revoke all on function public.assert_portal_slice16_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice16_security() to service_role;

-- --- tables -------------------------------------------------------------------

create table public.content_production_gates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid not null,
  gate_key text not null check (gate_key in ('source_in_hand','design_built','proofed','approval_sent')),
  dest text check (dest in ('instagram','facebook','youtube','squarespace')),
  state text not null check (state in ('open','done','na')),
  na_reason text check (na_reason is null or pg_catalog.char_length(na_reason) between 1 and 1000),
  owner_label text not null check (owner_label in ('anastasia','studio','agent')),
  occurred_at timestamptz,
  note text check (note is null or pg_catalog.char_length(note) between 1 and 2000),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (content_item_id, client_id)
    references public.content_items(id, client_id) on delete cascade,
  -- the grammar's [~] always carries a reason; every [x] carries a date
  check (state <> 'na' or na_reason is not null),
  check (state <> 'done' or occurred_at is not null),
  -- call 1: production gates are per-piece facts in v1; when destinations arrive, a
  -- migration drops this check and widens the unique key below
  constraint content_production_gates_dest_null_v1 check (dest is null)
);
create unique index content_production_gates_current
  on public.content_production_gates (client_id, content_item_id, gate_key);

create table public.production_gate_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid not null,
  gate_key text not null check (gate_key in ('source_in_hand','design_built','proofed','approval_sent')),
  dest text check (dest in ('instagram','facebook','youtube','squarespace')),
  from_state text check (from_state in ('open','done','na')),
  to_state text not null check (to_state in ('open','done','na')),
  actor_key text not null,
  note text check (note is null or pg_catalog.char_length(note) between 1 and 2000),
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now()
);
create index production_gate_events_item
  on public.production_gate_events (client_id, content_item_id, created_at);

-- append-only audit: no update or delete, ever (same guard as publication history)
create trigger production_gate_events_immutable
  before update or delete on public.production_gate_events
  for each row execute function public.portal_reject_immutable_history_mutation();

create table public.ops_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade, -- null = agency-global
  title text not null check (pg_catalog.char_length(title) between 1 and 300),
  category text not null check (category in
    ('invoice','follow_up','revisit','access','watch','plan','report','portal','admin')),
  due_date date,
  trigger_note text check (trigger_note is null or pg_catalog.char_length(trigger_note) between 1 and 1000),
  owner_label text not null check (owner_label in ('anastasia','studio','agent')),
  status text not null default 'open' check (status in ('open','done','dropped')),
  source text not null check (pg_catalog.char_length(source) between 1 and 1000),
  -- table-local idempotency: portal_command_receipts requires a client_id, and ops
  -- tasks may be agency-global, so the receipt lives on the row itself
  idempotency_key text not null unique,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  completion_key text unique,
  completion_fingerprint text check (completion_fingerprint is null or completion_fingerprint ~ '^[0-9a-f]{64}$'),
  -- completion_note is a SEPARATE field (Codex round-2 fix B): the completion reason
  -- never overwrites trigger_note, so the task's original watch/trigger provenance
  -- survives beside its resolution
  completion_note text check (completion_note is null or pg_catalog.char_length(completion_note) between 1 and 1000),
  completed_at timestamptz,
  completed_by text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  -- done/dropped rows keep their audit fields together (rows are never deleted; call 3)
  check (status = 'open' or (completed_at is not null and completion_key is not null))
);
create index ops_tasks_open on public.ops_tasks (status, due_date) where status = 'open';

-- trigger_note is IMMUTABLE (Codex round-2 fix B): once captured it never changes, so a
-- completion can never rewrite the original trigger/watch provenance. The RPC is the
-- only writer, but the trigger makes the invariant structural.
create or replace function public.ops_tasks_trigger_note_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.trigger_note is distinct from old.trigger_note then
    raise exception 'ops_tasks.trigger_note is immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.ops_tasks_trigger_note_immutable() from public,anon,authenticated,service_role;
create trigger ops_tasks_trigger_note_immutable
  before update on public.ops_tasks
  for each row execute function public.ops_tasks_trigger_note_immutable();

-- Reserved-grammar/injection guard for gate + ops notes (Codex round-2 fix C): the
-- STATUS GATES block renders these strings straight into markdown lines, so a note that
-- carries a newline, a control char, the field separator '|', the owner marker '@', or a
-- checkbox '- [' could inject a fake gate line or break the parser. Rejected at the
-- source (the RPCs raise; the CLI validator mirrors it).
create or replace function public.portal_note_grammar_safe(p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select p_text is null
    or (p_text !~ '[[:cntrl:]]'
        and p_text not like '%|%'
        and p_text not like '%@%'
        and p_text not like '%- [%');
$$;
revoke all on function public.portal_note_grammar_safe(text) from public,anon,authenticated,service_role;

-- --- security posture (spec 2.4) ---------------------------------------------

alter table public.content_production_gates enable row level security;
alter table public.production_gate_events enable row level security;
alter table public.ops_tasks enable row level security;
-- NO policies: client roles read nothing, ever.

revoke all on public.content_production_gates from public,anon,authenticated,service_role;
revoke all on public.production_gate_events from public,anon,authenticated,service_role;
revoke all on public.ops_tasks from public,anon,authenticated,service_role;
grant select on public.content_production_gates to service_role;
grant select on public.production_gate_events to service_role;
grant select on public.ops_tasks to service_role;

-- --- write RPCs (definer, agency actor, receipts) ----------------------------

-- One CURRENT row per (client, piece, gate); every transition appends an audit event.
-- dest is deliberately absent in v1 (call 1).
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
  v_receipt public.portal_command_receipts%rowtype;
  v_gate_id uuid;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found'; end if;
  if p_content_id is null or pg_catalog.char_length(pg_catalog.btrim(p_content_id)) not between 1 and 200 then
    raise exception 'content id is required'; end if;
  select * into v_item from public.content_items ci
    where ci.client_id = p_client_id and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content does not belong to client'; end if;
  if p_gate_key not in ('source_in_hand','design_built','proofed','approval_sent') then
    raise exception 'unknown production gate key'; end if;
  if p_state not in ('open','done','na') then raise exception 'unknown gate state'; end if;
  if p_owner not in ('anastasia','studio','agent') then raise exception 'unknown gate owner'; end if;
  if p_state = 'na' and (p_na_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_na_reason)) not between 1 and 1000) then
    raise exception 'na requires a reason (the grammar''s [~] rule)'; end if;
  if p_state = 'done' and p_occurred_at is null then
    raise exception 'done requires occurred_at (every [x] carries a date)'; end if;
  if p_note is not null and pg_catalog.char_length(p_note) > 2000 then
    raise exception 'note too long'; end if;
  -- fix C: notes/reasons render into the STATUS GATES markdown; reject injection chars
  if not public.portal_note_grammar_safe(p_note) or not public.portal_note_grammar_safe(p_na_reason) then
    raise exception 'note contains a reserved grammar or control character (newline, |, @, - [)'; end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required'; end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('content_id', pg_catalog.btrim(p_content_id),
      'gate_key', p_gate_key, 'state', p_state, 'owner', p_owner, 'note', p_note,
      'na_reason', p_na_reason, 'occurred_at', p_occurred_at)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'set_production_gate' or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return v_receipt.response;
  end if;

  select * into v_existing from public.content_production_gates g
    where g.client_id = p_client_id and g.content_item_id = v_item.id
      and g.gate_key = p_gate_key and g.dest is null
    for update;

  if found then
    update public.content_production_gates g
      set state = p_state,
          na_reason = case when p_state = 'na' then pg_catalog.btrim(p_na_reason) else null end,
          owner_label = p_owner,
          occurred_at = p_occurred_at,
          note = p_note,
          updated_at = pg_catalog.now()
      where g.id = v_existing.id
      returning g.id into v_gate_id;
  else
    insert into public.content_production_gates
      (client_id, content_item_id, gate_key, state, na_reason, owner_label, occurred_at, note)
    values (p_client_id, v_item.id, p_gate_key, p_state,
      case when p_state = 'na' then pg_catalog.btrim(p_na_reason) else null end,
      p_owner, p_occurred_at, p_note)
    returning id into v_gate_id;
  end if;

  -- the append-only audit trail; NEVER activity_log (call 2: the client feed reads
  -- activity_log and production internals must not leak into it)
  insert into public.production_gate_events
    (client_id, content_item_id, gate_key, from_state, to_state, actor_key, note, idempotency_key)
  values (p_client_id, v_item.id, p_gate_key, v_existing.state, p_state, p_actor_key,
    p_note, p_idempotency_key);

  insert into public.portal_command_receipts (client_id, command_type, idempotency_key,
    request_fingerprint, response)
  values (p_client_id, 'set_production_gate', p_idempotency_key, v_fingerprint,
    pg_catalog.jsonb_build_object('id', v_gate_id, 'gate_key', p_gate_key, 'state', p_state));
  return pg_catalog.jsonb_build_object('id', v_gate_id, 'gate_key', p_gate_key, 'state', p_state);
end;
$$;
revoke all on function public.set_production_gate(uuid,text,text,text,text,text,text,timestamptz,text,text)
  from public,anon,authenticated;
grant execute on function public.set_production_gate(uuid,text,text,text,text,text,text,timestamptz,text,text)
  to service_role;

create or replace function public.add_ops_task(
  p_client_id uuid, p_title text, p_category text, p_due_date date,
  p_trigger_note text, p_owner text, p_source text,
  p_actor_key text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_existing public.ops_tasks%rowtype;
  v_fingerprint text;
  v_id uuid;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_client_id is not null and not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found'; end if;
  if p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 300 then
    raise exception 'title is required'; end if;
  if p_category not in ('invoice','follow_up','revisit','access','watch','plan','report','portal','admin') then
    raise exception 'unknown ops category'; end if;
  if p_owner not in ('anastasia','studio','agent') then raise exception 'unknown task owner'; end if;
  if p_source is null or pg_catalog.char_length(pg_catalog.btrim(p_source)) not between 1 and 1000 then
    raise exception 'source provenance is mandatory'; end if;
  if p_trigger_note is not null and pg_catalog.char_length(p_trigger_note) > 1000 then
    raise exception 'trigger note too long'; end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required'; end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('client_id', p_client_id, 'title', pg_catalog.btrim(p_title),
      'category', p_category, 'due_date', p_due_date, 'trigger_note', p_trigger_note,
      'owner', p_owner, 'source', pg_catalog.btrim(p_source))::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_existing from public.ops_tasks t where t.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', v_existing.status);
  end if;

  insert into public.ops_tasks (client_id, title, category, due_date, trigger_note,
    owner_label, source, idempotency_key, request_fingerprint)
  values (p_client_id, pg_catalog.btrim(p_title), p_category, p_due_date, p_trigger_note,
    p_owner, pg_catalog.btrim(p_source), p_idempotency_key, v_fingerprint)
  returning id into v_id;
  return pg_catalog.jsonb_build_object('id', v_id, 'status', 'open');
end;
$$;
revoke all on function public.add_ops_task(uuid,text,text,date,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.add_ops_task(uuid,text,text,date,text,text,text,text,text)
  to service_role;

-- Completion (done or dropped). Rows are never deleted (call 3); a completed task keeps
-- its full audit trail on the row. Re-completion with a different key is refused.
create or replace function public.complete_ops_task(
  p_task_id uuid, p_status text, p_note text, p_actor_key text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_task public.ops_tasks%rowtype;
  v_fingerprint text;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_status not in ('done','dropped') then raise exception 'completion status must be done or dropped'; end if;
  if p_note is not null and pg_catalog.char_length(p_note) > 1000 then
    raise exception 'note too long'; end if;
  if not public.portal_note_grammar_safe(p_note) then
    raise exception 'completion note contains a reserved grammar or control character'; end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required'; end if;
  select * into v_task from public.ops_tasks t where t.id = p_task_id for update;
  if not found then raise exception 'ops task not found'; end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('task_id', p_task_id, 'status', p_status, 'note', p_note)::text,
    'UTF8'), 'sha256'), 'hex');
  if v_task.status <> 'open' then
    if v_task.completion_key = p_idempotency_key and v_task.completion_fingerprint = v_fingerprint then
      return pg_catalog.jsonb_build_object('id', v_task.id, 'status', v_task.status);
    end if;
    raise exception 'ops task already completed';
  end if;

  -- completion writes completion_note ONLY (fix B): trigger_note is left untouched, so
  -- the task's original trigger/watch provenance survives (the immutability trigger
  -- would reject any change to it anyway)
  update public.ops_tasks t
    set status = p_status, completed_at = pg_catalog.now(), completed_by = p_actor_key,
        completion_key = p_idempotency_key, completion_fingerprint = v_fingerprint,
        completion_note = p_note, updated_at = pg_catalog.now()
    where t.id = v_task.id;
  return pg_catalog.jsonb_build_object('id', v_task.id, 'status', p_status);
end;
$$;
revoke all on function public.complete_ops_task(uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.complete_ops_task(uuid,text,text,text,text)
  to service_role;

-- --- in-migration security assertion -----------------------------------------
create or replace function public.assert_portal_production_gates_security()
returns void language plpgsql security definer set search_path='' as $$
declare
  v_table text;
begin
  foreach v_table in array array['content_production_gates','production_gate_events','ops_tasks'] loop
    -- RLS on, zero policies, ZERO authenticated/anon access, service_role SELECT-only
    if not (select c.relrowsecurity from pg_catalog.pg_class c
      where c.oid = ('public.' || v_table)::pg_catalog.regclass) then
      raise exception '% RLS disabled', v_table; end if;
    if exists (select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = v_table) then
      raise exception '% must have no policies (agency-only surface)', v_table; end if;
    if exists (select 1 from information_schema.column_privileges cp
      where cp.table_schema = 'public' and cp.table_name = v_table
        and cp.grantee in ('authenticated','anon')) then
      raise exception '% must have zero client-role grants', v_table; end if;
    if pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::pg_catalog.regclass, 'SELECT,INSERT,UPDATE,DELETE')
       or pg_catalog.has_table_privilege('anon', ('public.' || v_table)::pg_catalog.regclass, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception '% reachable by client roles', v_table; end if;
    if not pg_catalog.has_table_privilege('service_role', ('public.' || v_table)::pg_catalog.regclass, 'SELECT')
       or pg_catalog.has_table_privilege('service_role', ('public.' || v_table)::pg_catalog.regclass, 'INSERT,UPDATE,DELETE') then
      raise exception '% service_role must be SELECT-only', v_table; end if;
    -- NOT an assistant index source: no touch trigger may ever appear here
    if exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = ('public.' || v_table)::pg_catalog.regclass
        and t.tgname = 'assistant_index_touch') then
      raise exception '% must not feed the assistant index', v_table; end if;
  end loop;

  -- the assistant document vocabulary must not know these sources either
  if exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.assistant_documents'::pg_catalog.regclass
      and c.conname = 'assistant_documents_source_type_check'
      and (pg_catalog.pg_get_constraintdef(c.oid) ilike '%gate%'
        or pg_catalog.pg_get_constraintdef(c.oid) ilike '%ops_task%')) then
    raise exception 'assistant source vocabulary must not include production internals'; end if;

  -- append-only audit trail
  if not exists (select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.production_gate_events'::pg_catalog.regclass
      and t.tgname = 'production_gate_events_immutable' and not t.tgisinternal) then
    raise exception 'production_gate_events immutability trigger missing'; end if;

  -- writer RPCs: hardened definers, service_role-only execution
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_production_gate','add_ops_task','complete_ops_task')
      and (not p.prosecdef or not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']))) then
    raise exception 'production gate RPC is not hardened'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.set_production_gate(uuid,text,text,text,text,text,text,timestamptz,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.set_production_gate(uuid,text,text,text,text,text,text,timestamptz,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.set_production_gate(uuid,text,text,text,text,text,text,timestamptz,text,text)','EXECUTE') then
    raise exception 'unsafe set_production_gate privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.add_ops_task(uuid,text,text,date,text,text,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.add_ops_task(uuid,text,text,date,text,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.add_ops_task(uuid,text,text,date,text,text,text,text,text)','EXECUTE') then
    raise exception 'unsafe add_ops_task privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.complete_ops_task(uuid,text,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.complete_ops_task(uuid,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.complete_ops_task(uuid,text,text,text,text)','EXECUTE') then
    raise exception 'unsafe complete_ops_task privilege'; end if;

  -- fix B: completion_note is a distinct column and trigger_note is immutable
  if not exists (select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'ops_tasks' and c.column_name = 'completion_note') then
    raise exception 'ops_tasks.completion_note column missing'; end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.ops_tasks'::pg_catalog.regclass
      and t.tgname = 'ops_tasks_trigger_note_immutable' and not t.tgisinternal) then
    raise exception 'ops_tasks trigger_note immutability trigger missing'; end if;

  -- fix C: the note grammar guard behaves on the boundary cases
  if not public.portal_note_grammar_safe('email-mg-monday-posts.md (Spark thread 34600)')
     or not public.portal_note_grammar_safe(null)
     or public.portal_note_grammar_safe(pg_catalog.concat('line one', pg_catalog.chr(10), '- [ ] fake gate'))
     or public.portal_note_grammar_safe('field | injection')
     or public.portal_note_grammar_safe('owner @studio')
     or public.portal_note_grammar_safe(pg_catalog.concat('tab', pg_catalog.chr(9), 'here')) then
    raise exception 'portal_note_grammar_safe boundary failure'; end if;
end;
$$;
revoke all on function public.assert_portal_production_gates_security() from public,anon,authenticated;
grant execute on function public.assert_portal_production_gates_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice16_security();
  perform public.assert_portal_production_gates_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
