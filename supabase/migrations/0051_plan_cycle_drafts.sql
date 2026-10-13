-- A future weekly plan may contain an already-created piece before the agency is ready
-- to submit the week's direction for Maria's decision. Draft cycles are client-safe
-- planning projections, visibly labelled as preparation, never decision targets.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_feature_enabled(uuid,text)') is null
     or pg_catalog.to_regclass('public.plan_cycles') is null
     or pg_catalog.to_regclass('public.plan_cycle_items') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null then
    raise exception '0051 requires the existing plan-cycle and agency-write boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice44_security;
revoke all on function public.assert_portal_slice44_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice44_security() to service_role;

alter table public.plan_cycles drop constraint plan_cycles_status_check;
alter table public.plan_cycles add constraint plan_cycles_status_check
  check (status in ('draft','submitted','approved','change_requested','closed'));
alter table public.plan_cycles add constraint plan_cycles_draft_undecided_check
  check (status <> 'draft' or (approved_revision is null and decided_at is null));

-- Draft direction and items are client-safe by construction, but an unsubmitted cycle
-- must remain read-only to a client. Decisions still use the existing RPC, which accepts
-- only submitted or change_requested cycles.
drop policy plan_cycles_client_read on public.plan_cycles;
create policy plan_cycles_client_read on public.plan_cycles
  for select to authenticated
  using (client_id in (select public.my_client_ids())
    and status in ('draft','submitted','approved','change_requested'));

drop policy plan_cycle_items_client_read on public.plan_cycle_items;
create policy plan_cycle_items_client_read on public.plan_cycle_items
  for select to authenticated
  using (client_id in (select public.my_client_ids()) and exists (
    select 1 from public.plan_cycles c
    where c.id = plan_cycle_items.plan_cycle_id
      and c.client_id = plan_cycle_items.client_id
      and c.status in ('draft','submitted','approved','change_requested')
  ));

drop policy plan_cycle_decisions_client_read on public.plan_cycle_decisions;
create policy plan_cycle_decisions_client_read on public.plan_cycle_decisions
  for select to authenticated
  using (client_id in (select public.my_client_ids()) and exists (
    select 1 from public.plan_cycles c
    where c.id = plan_cycle_decisions.plan_cycle_id
      and c.client_id = plan_cycle_decisions.client_id
      and c.status in ('draft','submitted','approved','change_requested')
  ));

drop view public.plan_cycle_items_client;
drop view public.plan_cycles_client;

create view public.plan_cycles_client with (security_invoker = true, security_barrier = true) as
select c.id, c.client_id, c.cycle_key, c.week_start, c.week_end, c.title,
  c.direction_summary, c.revision, c.status, c.submitted_at, c.decided_at,
  c.approved_revision, c.created_at, c.updated_at
from public.plan_cycles c
where c.status in ('draft','submitted','approved','change_requested');

create view public.plan_cycle_items_client with (security_invoker = true, security_barrier = true) as
select i.id, i.plan_cycle_id, i.client_id, i.content_item_id, i.content_id, i.position,
  i.planned_date, i.title, i.format, i.pillar, i.platforms, i.direction_note,
  i.created_at, i.updated_at
from public.plan_cycle_items i
join public.plan_cycles c on c.id = i.plan_cycle_id and c.client_id = i.client_id
where c.status in ('draft','submitted','approved','change_requested');

revoke all on public.plan_cycles_client, public.plan_cycle_items_client
  from public, anon, authenticated, service_role;
grant select on public.plan_cycles_client, public.plan_cycle_items_client to authenticated, service_role;

insert into public.activity_event_types(event_type)
values ('plan_cycle_staged')
on conflict (event_type) do nothing;

-- This writer intentionally requires existing content identities. Creating a new identity is
-- still the responsibility of the established submission writer, not a side effect of a
-- speculative future plan. A previously closed, undecided cycle may be re-staged as a new
-- revision, preserving its withdrawal history while making no client approval ask.
create function public.agency_stage_plan_cycle(
  p_client_id uuid, p_cycle_key text, p_week_start date, p_week_end date,
  p_title text, p_direction_summary text, p_items jsonb,
  p_actor_key text, p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_cycle public.plan_cycles%rowtype;
  v_existing public.portal_command_receipts%rowtype;
  v_fingerprint text;
  v_item jsonb;
  v_content_id text;
  v_title text;
  v_format text;
  v_pillar text;
  v_producer text;
  v_direction text;
  v_position int;
  v_date date;
  v_platforms text[];
  v_item_id uuid;
  v_count int := 0;
begin
  if p_client_id is null or p_cycle_key is null or pg_catalog.btrim(p_cycle_key) = ''
     or pg_catalog.char_length(p_cycle_key) > 200 or p_week_start is null or p_week_end is null
     or p_week_end < p_week_start or p_title is null
     or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 300
     or p_direction_summary is null
     or pg_catalog.char_length(pg_catalog.btrim(p_direction_summary)) not between 1 and 4000
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) not between 1 and 31
     or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,128}$'
     or not public.portal_client_summary_shape_valid(pg_catalog.btrim(p_title))
     or not public.portal_client_summary_shape_valid(pg_catalog.btrim(p_direction_summary)) then
    raise exception 'invalid plan-cycle draft payload';
  end if;
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;
  if not public.portal_feature_enabled(p_client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('cycle_key',p_cycle_key,'week_start',p_week_start,
      'week_end',p_week_end,'title',p_title,'direction_summary',p_direction_summary,'items',p_items)::text,
      'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-plan-cycle-stage:' || p_client_id::text || ':' || pg_catalog.btrim(p_cycle_key), 0));
  select * into v_existing from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.command_type <> 'agency_stage_plan_cycle'
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return (v_existing.response->>'id')::uuid;
  end if;

  select * into v_cycle from public.plan_cycles
    where client_id = p_client_id and cycle_key = pg_catalog.btrim(p_cycle_key)
    for update;
  if found and (v_cycle.status not in ('draft','closed')
      or exists (select 1 from public.plan_cycle_decisions d where d.plan_cycle_id = v_cycle.id)) then
    raise exception 'only an undecided draft or closed plan cycle can be staged';
  end if;
  if not found then
    insert into public.plan_cycles(client_id,cycle_key,week_start,week_end,title,direction_summary,revision,status)
    values (p_client_id,pg_catalog.btrim(p_cycle_key),p_week_start,p_week_end,
      pg_catalog.btrim(p_title),pg_catalog.btrim(p_direction_summary),1,'draft')
    returning * into v_cycle;
  else
    update public.plan_cycles set week_start=p_week_start, week_end=p_week_end,
      title=pg_catalog.btrim(p_title), direction_summary=pg_catalog.btrim(p_direction_summary),
      revision=v_cycle.revision + 1, status='draft', approved_revision=null, decided_at=null,
      updated_at=pg_catalog.now()
    where id=v_cycle.id returning * into v_cycle;
    delete from public.plan_cycle_items where plan_cycle_id=v_cycle.id;
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    v_count := v_count + 1;
    v_content_id := pg_catalog.btrim(v_item->>'content_id');
    v_title := pg_catalog.btrim(v_item->>'title');
    v_format := nullif(pg_catalog.btrim(v_item->>'format'),'');
    v_pillar := nullif(pg_catalog.btrim(v_item->>'pillar'),'');
    v_producer := nullif(pg_catalog.btrim(v_item->>'producer'),'');
    v_direction := nullif(pg_catalog.btrim(v_item->>'direction_note'),'');
    v_position := coalesce((v_item->>'position')::int, v_count);
    v_date := nullif(v_item->>'planned_date','')::date;
    select array(select pg_catalog.jsonb_array_elements_text(coalesce(v_item->'platforms','[]'::jsonb))) into v_platforms;
    if v_content_id is null or v_content_id = '' or pg_catalog.char_length(v_content_id) > 200
       or v_title is null or v_title = '' or pg_catalog.char_length(v_title) > 300
       or v_position < 1 or v_position > 100
       or v_producer is not null and v_producer not in ('the_dot','studio')
       or v_direction is not null and pg_catalog.char_length(v_direction) > 2000
       or cardinality(v_platforms) > 12
       or not public.portal_client_summary_shape_valid(v_title)
       or not (v_format is null or public.portal_client_summary_shape_valid(v_format))
       or not (v_pillar is null or public.portal_client_summary_shape_valid(v_pillar))
       or not (v_direction is null or public.portal_client_summary_shape_valid(v_direction)) then
      raise exception 'invalid plan-cycle draft item';
    end if;
    select id into v_item_id from public.content_items
      where client_id=p_client_id and content_id=v_content_id for update;
    if v_item_id is null then raise exception 'plan-cycle draft item % has no content identity', v_content_id; end if;
    insert into public.plan_cycle_items(plan_cycle_id,client_id,content_item_id,content_id,position,
      planned_date,title,format,pillar,platforms,producer,direction_note)
    values(v_cycle.id,p_client_id,v_item_id,v_content_id,v_position,v_date,v_title,v_format,v_pillar,
      coalesce(v_platforms,'{}'),v_producer,v_direction);
  end loop;

  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name)
  values(p_client_id,'plan_cycle_staged','agency:plan-cycle-staged:'||v_cycle.id::text||':'||v_cycle.revision,
    'Plan in preparation: '||v_cycle.title,
    'This upcoming plan is visible for planning, but has not been submitted for approval.',
    'anastasia',v_actor.display_name);
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,request_fingerprint,response)
  values(p_client_id,'agency_stage_plan_cycle',p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_cycle.id,'revision',v_cycle.revision,'status','draft'));
  return v_cycle.id;
end;
$$;
revoke all on function public.agency_stage_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.agency_stage_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text) to service_role;

create function public.assert_portal_plan_cycle_draft_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_def text;
begin
  if not exists (select 1 from public.activity_event_types where event_type = 'plan_cycle_staged') then
    raise exception 'plan-cycle draft activity vocabulary is missing';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.plan_cycles'::pg_catalog.regclass and c.conname='plan_cycles_status_check'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%''draft''%') then
    raise exception 'plan-cycle draft status is not constrained';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.agency_stage_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%portal_feature_enabled%'
     or v_def not ilike '%for update%'
     or v_def not ilike '%portal_client_summary_shape_valid%'
     or v_def not ilike '%status not in (''draft'',''closed'')%' then
    raise exception 'plan-cycle draft writer is incomplete';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p
    where p.oid='public.agency_stage_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)'::pg_catalog.regprocedure
      and p.prosecdef and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']) then
    raise exception 'plan-cycle draft writer is not hardened';
  end if;
  if pg_catalog.has_function_privilege('anon','public.agency_stage_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.agency_stage_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.agency_stage_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)','EXECUTE') then
    raise exception 'plan-cycle draft writer privileges are unsafe';
  end if;
  if pg_catalog.has_table_privilege('anon','public.plan_cycles','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.plan_cycles','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.plan_cycles','UPDATE') then
    raise exception 'plan-cycle draft grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_plan_cycle_draft_security() from public, anon, authenticated;
grant execute on function public.assert_portal_plan_cycle_draft_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice44_security();
  perform public.assert_portal_plan_cycle_draft_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
