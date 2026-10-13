-- Weekly plan-cycle approval surface.
-- The Markdown plan remains the authoring source. These tables are the tenant-safe,
-- revisioned portal projection of the client-facing direction, not a replacement for
-- canonical piece content or individual piece approvals.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_feature_enabled(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.portal_client_summary_shape_valid(text)') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.content_items') is null then
    raise exception '0027 portal objects must exist before applying 0028';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice22_security;
revoke all on function public.assert_portal_slice22_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice22_security() to service_role;

create table public.plan_cycles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  cycle_key text not null,
  week_start date not null,
  week_end date not null,
  title text not null,
  direction_summary text not null,
  revision int not null default 1 check (revision > 0),
  status text not null default 'submitted'
    check (status in ('submitted','approved','change_requested','closed')),
  submitted_at timestamptz not null default pg_catalog.now(),
  decided_at timestamptz,
  approved_revision int,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (client_id, cycle_key),
  unique (id, client_id),
  check (week_end >= week_start),
  check (pg_catalog.btrim(cycle_key) <> '' and pg_catalog.char_length(cycle_key) <= 200),
  check (pg_catalog.char_length(title) between 1 and 300),
  check (pg_catalog.char_length(direction_summary) between 1 and 4000),
  check (approved_revision is null or approved_revision between 1 and revision),
  check (status <> 'approved' or approved_revision is not null)
);

-- Snapshot the client-facing plan row at submission. The content item remains the one
-- durable piece identity; these fields are the cycle's direction record and make a
-- revision auditable even when the working piece changes later.
create table public.plan_cycle_items (
  id uuid primary key default gen_random_uuid(),
  plan_cycle_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid not null,
  content_id text not null,
  position int not null check (position > 0),
  planned_date date,
  title text not null,
  format text,
  platforms text[] not null default '{}',
  producer text,
  direction_note text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (plan_cycle_id, content_item_id),
  unique (plan_cycle_id, position),
  unique (id, client_id),
  foreign key (plan_cycle_id, client_id)
    references public.plan_cycles(id, client_id) on delete cascade,
  foreign key (content_item_id, client_id)
    references public.content_items(id, client_id) on delete restrict,
  check (pg_catalog.btrim(content_id) <> '' and pg_catalog.char_length(content_id) <= 200),
  check (pg_catalog.char_length(title) between 1 and 300),
  check (producer is null or producer in ('the_dot','studio')),
  check (direction_note is null or pg_catalog.char_length(direction_note) <= 2000),
  check (cardinality(platforms) <= 12)
);

create index plan_cycle_items_by_client_date
  on public.plan_cycle_items(client_id, planned_date, position);

create table public.plan_cycle_decisions (
  id uuid primary key default gen_random_uuid(),
  plan_cycle_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  revision int not null check (revision > 0),
  decision text not null check (decision in ('approved','change_requested')),
  note text,
  decided_by uuid not null references auth.users(id),
  created_at timestamptz not null default pg_catalog.now(),
  unique (plan_cycle_id, revision),
  foreign key (plan_cycle_id, client_id)
    references public.plan_cycles(id, client_id) on delete cascade,
  check (note is null or pg_catalog.char_length(note) <= 2000),
  check (decision <> 'change_requested' or nullif(pg_catalog.btrim(note), '') is not null)
);

create index plan_cycle_decisions_by_client
  on public.plan_cycle_decisions(client_id, created_at desc);

insert into public.activity_event_types(event_type)
values ('plan_cycle_submitted'), ('plan_cycle_approved'), ('plan_cycle_change_requested')
on conflict (event_type) do nothing;

-- Client-readable tables expose only the direction snapshot and decision metadata.
-- Agency/service-role reads use the full columns; authenticated never receives actor IDs
-- or the internal command/audit fields.
alter table public.plan_cycles enable row level security;
alter table public.plan_cycle_items enable row level security;
alter table public.plan_cycle_decisions enable row level security;

create policy plan_cycles_client_read on public.plan_cycles
  for select to authenticated
  using (client_id in (select public.my_client_ids())
    and status in ('submitted','approved','change_requested'));
create policy plan_cycle_items_client_read on public.plan_cycle_items
  for select to authenticated
  using (client_id in (select public.my_client_ids()) and exists (
    select 1 from public.plan_cycles c
    where c.id = plan_cycle_items.plan_cycle_id
      and c.client_id = plan_cycle_items.client_id
      and c.status in ('submitted','approved','change_requested')
  ));
create policy plan_cycle_decisions_client_read on public.plan_cycle_decisions
  for select to authenticated
  using (client_id in (select public.my_client_ids()) and exists (
    select 1 from public.plan_cycles c
    where c.id = plan_cycle_decisions.plan_cycle_id
      and c.client_id = plan_cycle_decisions.client_id
      and c.status in ('submitted','approved','change_requested')
  ));

revoke all on table public.plan_cycles, public.plan_cycle_items, public.plan_cycle_decisions
  from public, anon, authenticated, service_role;
grant select (id, client_id, cycle_key, week_start, week_end, title, direction_summary,
  revision, status, submitted_at, decided_at, approved_revision, created_at, updated_at)
  on public.plan_cycles to authenticated;
grant select (id, plan_cycle_id, client_id, content_item_id, content_id, position, planned_date,
  title, format, platforms, producer, direction_note, created_at, updated_at)
  on public.plan_cycle_items to authenticated;
grant select (id, plan_cycle_id, client_id, revision, decision, note, created_at)
  on public.plan_cycle_decisions to authenticated;
grant select on public.plan_cycles, public.plan_cycle_items, public.plan_cycle_decisions to service_role;

create or replace view public.plan_cycles_client with (security_invoker = true) as
select c.id, c.client_id, c.cycle_key, c.week_start, c.week_end, c.title,
  c.direction_summary, c.revision, c.status, c.submitted_at, c.decided_at,
  c.approved_revision, c.created_at, c.updated_at
from public.plan_cycles c
where c.status in ('submitted','approved','change_requested');

create or replace view public.plan_cycle_items_client with (security_invoker = true) as
select i.id, i.plan_cycle_id, i.client_id, i.content_item_id, i.content_id, i.position,
  i.planned_date, i.title, i.format, i.platforms, i.producer, i.direction_note,
  i.created_at, i.updated_at
from public.plan_cycle_items i
join public.plan_cycles c on c.id = i.plan_cycle_id and c.client_id = i.client_id
where c.status in ('submitted','approved','change_requested');

revoke all on public.plan_cycles_client, public.plan_cycle_items_client
  from public, anon, authenticated, service_role;
grant select on public.plan_cycles_client, public.plan_cycle_items_client to authenticated;
grant select on public.plan_cycles_client, public.plan_cycle_items_client to service_role;

-- Agency write boundary. Every item must already exist in content_items, because a plan
-- reference is not permission to invent a second piece identity or a placeholder snapshot.
-- Canonical sync creates the item from its Markdown pack first; this writer only records the
-- client-safe planning snapshot and never overwrites a version-owned snapshot.
create or replace function public.agency_upsert_plan_cycle(
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
  v_revision int;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;
  if not public.portal_feature_enabled(p_client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;
  if p_cycle_key is null or pg_catalog.btrim(p_cycle_key) = '' or pg_catalog.char_length(p_cycle_key) > 200
     or p_week_end < p_week_start
     or p_title is null or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 300
     or p_direction_summary is null or pg_catalog.char_length(pg_catalog.btrim(p_direction_summary)) not between 1 and 4000
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) < 1
     or pg_catalog.jsonb_array_length(p_items) > 31 then
    raise exception 'invalid plan cycle payload';
  end if;
  if not public.portal_client_summary_shape_valid(pg_catalog.btrim(p_title))
     or not public.portal_client_summary_shape_valid(pg_catalog.btrim(p_direction_summary)) then
    raise exception 'plan cycle failed client-safety gate';
  end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('cycle_key',p_cycle_key,'week_start',p_week_start,
      'week_end',p_week_end,'title',p_title,'direction_summary',p_direction_summary,'items',p_items)::text,
      'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-plan-cycle:' || p_client_id::text || ':' || p_idempotency_key, 0));
  select * into v_existing from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.command_type <> 'agency_upsert_plan_cycle'
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return (v_existing.response->>'id')::uuid;
  end if;

  select * into v_cycle from public.plan_cycles
    where client_id = p_client_id and cycle_key = pg_catalog.btrim(p_cycle_key)
    for update;
  v_revision := coalesce(v_cycle.revision, 0) + 1;
  if v_cycle.id is null then
    insert into public.plan_cycles(client_id,cycle_key,week_start,week_end,title,direction_summary,revision,status)
      values(p_client_id,pg_catalog.btrim(p_cycle_key),p_week_start,p_week_end,pg_catalog.btrim(p_title),
        pg_catalog.btrim(p_direction_summary),1,'submitted') returning * into v_cycle;
  else
    update public.plan_cycles set week_start=p_week_start, week_end=p_week_end,
      title=pg_catalog.btrim(p_title), direction_summary=pg_catalog.btrim(p_direction_summary),
      revision=v_revision, status='submitted', approved_revision=null, decided_at=null,
      submitted_at=pg_catalog.now(), updated_at=pg_catalog.now()
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
    select array(select jsonb_array_elements_text(coalesce(v_item->'platforms','[]'::jsonb))) into v_platforms;
    if v_content_id is null or v_content_id = '' or pg_catalog.char_length(v_content_id) > 200
       or v_title is null or v_title = '' or pg_catalog.char_length(v_title) > 300
       or v_position < 1 or v_position > 100
       or v_producer is not null and v_producer not in ('the_dot','studio')
       or v_direction is not null and pg_catalog.char_length(v_direction) > 2000
       or cardinality(v_platforms) > 12
       or not public.portal_client_summary_shape_valid(v_title)
       or not (v_direction is null or public.portal_client_summary_shape_valid(v_direction)) then
      raise exception 'invalid plan cycle item';
    end if;
    select id into v_item_id from public.content_items
      where client_id=p_client_id and content_id=v_content_id for update;
    if v_item_id is null then
      raise exception 'plan cycle item % has no synced content item', v_content_id;
    end if;
    insert into public.plan_cycle_items(plan_cycle_id,client_id,content_item_id,content_id,position,
      planned_date,title,format,platforms,producer,direction_note)
    values(v_cycle.id,p_client_id,v_item_id,v_content_id,v_position,v_date,v_title,v_format,
      coalesce(v_platforms,'{}'),v_producer,v_direction);
  end loop;

  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name)
  values(p_client_id,'plan_cycle_submitted','agency:plan-cycle:'||p_cycle_key||':'||v_cycle.revision,
    'Plan submitted: '||v_cycle.title,v_cycle.direction_summary,'anastasia',v_actor.display_name);
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,request_fingerprint,response)
  values(p_client_id,'agency_upsert_plan_cycle',p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_cycle.id,'revision',v_cycle.revision));
  return v_cycle.id;
end;
$$;

revoke all on function public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text) to service_role;

create or replace function public.record_plan_cycle_decision(
  p_plan_cycle_id uuid, p_revision int, p_decision text, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_client_id uuid;
  v_title text;
  v_current_revision int;
  v_status text;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_existing public.plan_cycle_decisions%rowtype;
  v_id uuid;
begin
  if p_decision not in ('approved','change_requested') then raise exception 'invalid plan cycle decision'; end if;
  if p_decision = 'change_requested' and v_note is null then raise exception 'change request note is required'; end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 2000 then raise exception 'decision note is too long'; end if;
  select c.client_id,c.title,c.revision,c.status into v_client_id,v_title,v_current_revision,v_status
  from public.plan_cycles c join public.client_users cu on cu.client_id=c.client_id and cu.auth_user_id=v_uid
  where c.id=p_plan_cycle_id for update;
  if v_client_id is null then raise exception 'not authorized for plan cycle' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_client_id,'can_decide');
  if p_revision is distinct from v_current_revision then raise exception 'stale plan cycle revision'; end if;
  select * into v_existing from public.plan_cycle_decisions
    where plan_cycle_id=p_plan_cycle_id and revision=p_revision;
  if found then
    if v_existing.decision <> p_decision or v_existing.note is distinct from v_note then
      raise exception 'plan cycle revision already decided';
    end if;
    return v_existing.id;
  end if;
  if v_status not in ('submitted','change_requested') then raise exception 'plan cycle is not open for decision'; end if;
  insert into public.plan_cycle_decisions(plan_cycle_id,client_id,revision,decision,note,decided_by)
    values(p_plan_cycle_id,v_client_id,p_revision,p_decision,v_note,v_uid) returning id into v_id;
  update public.plan_cycles set status=case when p_decision='approved' then 'approved' else 'change_requested' end,
    approved_revision=case when p_decision='approved' then p_revision else null end,
    decided_at=pg_catalog.now(), updated_at=pg_catalog.now() where id=p_plan_cycle_id;
  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name)
    values(v_client_id,case when p_decision='approved' then 'plan_cycle_approved' else 'plan_cycle_change_requested' end,
      'client:plan-cycle:'||p_plan_cycle_id::text||':'||p_revision,
      case when p_decision='approved' then 'Plan approved: ' else 'Plan changes requested: ' end||v_title,
      v_note,'client',coalesce((select cu.name from public.client_users cu where cu.auth_user_id=v_uid and cu.client_id=v_client_id),'Client'));
  return v_id;
end;
$$;

revoke all on function public.record_plan_cycle_decision(uuid,int,text,text)
  from public, anon, service_role;
grant execute on function public.record_plan_cycle_decision(uuid,int,text,text) to authenticated;

create or replace function public.assert_portal_plan_cycle_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_def text;
begin
  if not exists (select 1 from pg_catalog.pg_class c
    where c.oid='public.plan_cycles'::pg_catalog.regclass and c.relrowsecurity)
     or not exists (select 1 from pg_catalog.pg_class c
    where c.oid='public.plan_cycle_items'::pg_catalog.regclass and c.relrowsecurity)
     or not exists (select 1 from pg_catalog.pg_class c
    where c.oid='public.plan_cycle_decisions'::pg_catalog.regclass and c.relrowsecurity) then
    raise exception 'plan cycle tables must have RLS';
  end if;
  if pg_catalog.has_table_privilege('anon','public.plan_cycles','SELECT')
     or pg_catalog.has_table_privilege('anon','public.plan_cycle_items','SELECT')
     or pg_catalog.has_table_privilege('anon','public.plan_cycle_decisions','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.plan_cycles','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.plan_cycles','UPDATE')
     or pg_catalog.has_table_privilege('authenticated','public.plan_cycle_items','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.plan_cycle_items','UPDATE')
     or pg_catalog.has_table_privilege('authenticated','public.plan_cycle_decisions','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.plan_cycle_decisions','UPDATE')
     or pg_catalog.has_table_privilege('service_role','public.plan_cycles','INSERT')
     or pg_catalog.has_table_privilege('service_role','public.plan_cycle_items','UPDATE')
     or pg_catalog.has_table_privilege('service_role','public.plan_cycle_decisions','DELETE')
     or pg_catalog.has_table_privilege('anon','public.plan_cycles_client','SELECT')
     or pg_catalog.has_table_privilege('anon','public.plan_cycle_items_client','SELECT') then
    raise exception 'plan cycle grants overexpose the client boundary';
  end if;
  if pg_catalog.has_function_privilege('anon','public.record_plan_cycle_decision(uuid,integer,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.record_plan_cycle_decision(uuid,integer,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.record_plan_cycle_decision(uuid,integer,text,text)','EXECUTE') then
    raise exception 'plan decision RPC grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef('public.agency_upsert_plan_cycle(uuid,text,date,date,text,text,jsonb,text,text)'::regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%portal_client_summary_shape_valid%' then
    raise exception 'agency plan cycle writer must use client safety validation';
  end if;
end;
$$;
revoke all on function public.assert_portal_plan_cycle_security() from public, anon, authenticated;
grant execute on function public.assert_portal_plan_cycle_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice22_security();
  perform public.assert_portal_plan_cycle_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
