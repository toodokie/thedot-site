-- Durable agency inbox events for every client decision surface.
--
-- Copy decisions already write portal_inbox_events in record_content_decision. Idea and
-- plan-cycle decisions historically only wrote activity_log, which meant an agent polling
-- portal-inbox could miss them. These AFTER triggers derive inbox events from the decision
-- tables themselves, so both per-piece and batch approvals are covered without duplicating
-- RPC business logic.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_idea_decisions') is null
     or pg_catalog.to_regclass('public.plan_cycle_decisions') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regprocedure('public.portal_note_grammar_safe(text)') is null then
    raise exception '0034 requires decision tables and portal inbox objects';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice27_security;
revoke all on function public.assert_portal_slice27_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice27_security() to service_role;

create or replace function public.portal_idea_decision_inbox_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_actor_name text;
  v_event_key text;
begin
  if tg_op = 'UPDATE'
     and old.decision is not distinct from new.decision
     and old.note is not distinct from new.note then
    return new;
  end if;

  v_event_type := case when new.decision = 'approved'
    then 'idea_approved' else 'idea_change_requested' end;
  select nullif(pg_catalog.btrim(cu.name), '') into v_actor_name
  from public.client_users cu
  where cu.client_id = new.client_id and cu.auth_user_id = new.decided_by
  limit 1;
  -- created_at is refreshed on every genuine re-decision, so the same decision row
  -- can produce a durable event for each state change while exact retries stay quiet.
  v_event_key := 'client:idea-inbox:' || new.id::text || ':' || new.created_at::text;

  insert into public.portal_inbox_events (
    client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation
  ) values (
    new.client_id, v_event_key, v_event_type, 'content_idea', new.content_item_id,
    'client', coalesce(v_actor_name, 'Client'),
    pg_catalog.jsonb_build_object(
      'content_item_id', new.content_item_id,
      'plan_cycle_id', new.plan_cycle_id,
      'plan_cycle_revision', new.plan_cycle_revision,
      'decision', new.decision,
      'note', new.note
    ), false
  );
  return new;
end;
$$;

create or replace function public.portal_plan_cycle_decision_inbox_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_actor_name text;
  v_event_key text;
begin
  v_event_type := case when new.decision = 'approved'
    then 'plan_cycle_approved' else 'plan_cycle_change_requested' end;
  select nullif(pg_catalog.btrim(cu.name), '') into v_actor_name
  from public.client_users cu
  where cu.client_id = new.client_id and cu.auth_user_id = new.decided_by
  limit 1;
  v_event_key := 'client:plan-cycle-inbox:' || new.id::text;

  insert into public.portal_inbox_events (
    client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation
  ) values (
    new.client_id, v_event_key, v_event_type, 'plan_cycle', new.plan_cycle_id,
    'client', coalesce(v_actor_name, 'Client'),
    pg_catalog.jsonb_build_object(
      'plan_cycle_id', new.plan_cycle_id,
      'revision', new.revision,
      'decision', new.decision,
      'note', new.note
    ), false
  )
  on conflict (client_id, event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists portal_idea_decision_inbox on public.content_idea_decisions;
create trigger portal_idea_decision_inbox
  after insert or update of decision, note on public.content_idea_decisions
  for each row execute function public.portal_idea_decision_inbox_trigger();

drop trigger if exists portal_plan_cycle_decision_inbox on public.plan_cycle_decisions;
create trigger portal_plan_cycle_decision_inbox
  after insert on public.plan_cycle_decisions
  for each row execute function public.portal_plan_cycle_decision_inbox_trigger();

-- Repair decisions recorded before this migration. The current decision row is the
-- authoritative state, so one inbox event per existing row is sufficient; future updates
-- are covered by the trigger above. Deterministic keys make this backfill idempotent.
insert into public.portal_inbox_events (
  client_id, event_key, event_type, object_type, object_id,
  actor_type, actor_name, payload, requires_reconciliation
)
select d.client_id,
  'client:idea-inbox:' || d.id::text || ':' || d.created_at::text,
  case when d.decision = 'approved' then 'idea_approved' else 'idea_change_requested' end,
  'content_idea', d.content_item_id, 'client',
  coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client'),
  pg_catalog.jsonb_build_object(
    'content_item_id', d.content_item_id,
    'plan_cycle_id', d.plan_cycle_id,
    'plan_cycle_revision', d.plan_cycle_revision,
    'decision', d.decision,
    'note', d.note
  ), false
from public.content_idea_decisions d
left join public.client_users cu
  on cu.client_id = d.client_id and cu.auth_user_id = d.decided_by
on conflict (client_id, event_key) do nothing;

insert into public.portal_inbox_events (
  client_id, event_key, event_type, object_type, object_id,
  actor_type, actor_name, payload, requires_reconciliation
)
select d.client_id,
  'client:plan-cycle-inbox:' || d.id::text,
  case when d.decision = 'approved' then 'plan_cycle_approved' else 'plan_cycle_change_requested' end,
  'plan_cycle', d.plan_cycle_id, 'client',
  coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client'),
  pg_catalog.jsonb_build_object(
    'plan_cycle_id', d.plan_cycle_id,
    'revision', d.revision,
    'decision', d.decision,
    'note', d.note
  ), false
from public.plan_cycle_decisions d
left join public.client_users cu
  on cu.client_id = d.client_id and cu.auth_user_id = d.decided_by
on conflict (client_id, event_key) do nothing;

revoke all on function public.portal_idea_decision_inbox_trigger() from public, anon, authenticated, service_role;
revoke all on function public.portal_plan_cycle_decision_inbox_trigger() from public, anon, authenticated, service_role;

create or replace function public.assert_portal_decision_inbox_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_idea_decisions'::pg_catalog.regclass
      and t.tgname = 'portal_idea_decision_inbox'
      and not t.tgenabled = 'D'
  ) then
    raise exception 'idea decision inbox trigger is missing or disabled';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.plan_cycle_decisions'::pg_catalog.regclass
      and t.tgname = 'portal_plan_cycle_decision_inbox'
      and not t.tgenabled = 'D'
  ) then
    raise exception 'plan cycle decision inbox trigger is missing or disabled';
  end if;
  if pg_catalog.has_function_privilege('anon','public.portal_idea_decision_inbox_trigger()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_idea_decision_inbox_trigger()','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_idea_decision_inbox_trigger()','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_plan_cycle_decision_inbox_trigger()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_plan_cycle_decision_inbox_trigger()','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_plan_cycle_decision_inbox_trigger()','EXECUTE') then
    raise exception 'decision inbox trigger functions are over-granted';
  end if;
end;
$$;
revoke all on function public.assert_portal_decision_inbox_security() from public, anon, authenticated;
grant execute on function public.assert_portal_decision_inbox_security() to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice27_security();
  perform public.assert_portal_decision_inbox_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
