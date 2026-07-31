-- Plan-cycle integrity: the client must see the nearest actionable week, and an
-- accidentally premature submitted cycle must be retired through an audited writer.
-- The plan-date writer is also corrected here: it updates the nearest relevant cycle
-- containing the item, never whichever cycle happens to be furthest in the future.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.agency_set_content_plan_date(uuid,text,date,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_feature_enabled(uuid,text)') is null
     or pg_catalog.to_regclass('public.plan_cycles') is null
     or pg_catalog.to_regclass('public.plan_cycle_items') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null then
    raise exception '0049 requires the current portal, plan-cycle, and agency-write boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice42_security;
revoke all on function public.assert_portal_slice42_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice42_security() to service_role;

insert into public.activity_event_types(event_type)
values ('plan_cycle_closed')
on conflict (event_type) do nothing;

-- Private selector used only by service-role writers. The item join matters: changing a
-- date must alter the nearest live cycle that actually contains that identity, rather than
-- a later cycle for an unrelated planned item.
create function public.agency_plan_cycle_for_content(
  p_client_id uuid,
  p_content_item_id uuid
) returns uuid
language sql stable security definer set search_path = '' as $$
  select pc.id
  from public.plan_cycles pc
  join public.plan_cycle_items pci
    on pci.plan_cycle_id = pc.id and pci.client_id = pc.client_id
  where pc.client_id = p_client_id
    and pci.content_item_id = p_content_item_id
    and pc.status in ('submitted', 'approved', 'change_requested')
    and pc.week_end >= (pg_catalog.now() at time zone 'America/Toronto')::date
  order by
    case when pc.status in ('submitted', 'change_requested') then 0 else 1 end,
    pc.week_start asc,
    pc.revision desc,
    pc.id desc
  limit 1
$$;
revoke all on function public.agency_plan_cycle_for_content(uuid,uuid)
  from public, anon, authenticated, service_role;

-- Do not copy the long, already-reviewed 0037 writer. Replace only its erroneous
-- cycle-selection fragment and abort if the installed function ever drifts from the
-- expected shape.
do $rewrite$
declare
  v_def text;
  v_old text := $old$
      and pci.plan_cycle_id = (
        select pc.id from public.plan_cycles pc
        where pc.client_id = p_client_id
        order by pc.week_start desc, pc.revision desc, pc.id desc
        limit 1
      );$old$;
  v_new text := $new$
      and pci.plan_cycle_id = public.agency_plan_cycle_for_content(p_client_id, v_ci.id);$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.agency_set_content_plan_date(uuid,text,date,text,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'agency plan-date cycle-selection drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;
revoke all on function public.agency_set_content_plan_date(uuid,text,date,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.agency_set_content_plan_date(uuid,text,date,text,text,text)
  to service_role;

-- Closing is deliberately narrower than editing: only an undecided submitted cycle can be
-- withdrawn. A change-requested or approved cycle carries a real client decision and must
-- instead be revised through the existing upsert path.
create function public.agency_close_plan_cycle(
  p_client_id uuid,
  p_plan_cycle_id uuid,
  p_revision int,
  p_reason text,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_cycle public.plan_cycles%rowtype;
  v_existing public.portal_command_receipts%rowtype;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_fingerprint text;
  v_response jsonb;
  v_event_key text;
  v_event_id uuid;
begin
  if p_client_id is null or p_plan_cycle_id is null
     or p_revision is null or p_revision < 1
     or p_actor_key is null
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,128}$'
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 3 and 500
     or not public.portal_client_summary_shape_valid(v_reason) then
    raise exception 'invalid agency plan-cycle close request';
  end if;

  select * into v_actor from public.agency_actors
    where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;
  if not public.portal_feature_enabled(p_client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'plan_cycle_id', p_plan_cycle_id,
      'revision', p_revision,
      'reason', v_reason
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-plan-cycle-close:' || p_client_id::text || ':' || p_plan_cycle_id::text, 0));

  select * into v_existing from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.command_type <> 'agency_close_plan_cycle'
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_existing.response;
  end if;

  select * into v_cycle from public.plan_cycles
    where id = p_plan_cycle_id and client_id = p_client_id
    for update;
  if not found then raise exception 'plan cycle not found for client'; end if;
  if v_cycle.revision is distinct from p_revision then
    raise exception 'stale plan cycle revision';
  end if;
  if v_cycle.status <> 'submitted' then
    raise exception 'only an undecided submitted plan cycle can be closed';
  end if;

  update public.plan_cycles
  set status = 'closed', updated_at = pg_catalog.now()
  where id = v_cycle.id;

  v_event_key := 'agency:plan-cycle-closed:' || v_cycle.id::text || ':' || v_cycle.revision;
  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name)
  values(
    p_client_id, 'plan_cycle_closed', v_event_key,
    'Plan withdrawn: ' || v_cycle.title, v_reason,
    'anastasia', v_actor.display_name
  ) returning id into v_event_id;

  v_response := pg_catalog.jsonb_build_object(
    'id', v_cycle.id,
    'cycle_key', v_cycle.cycle_key,
    'revision', v_cycle.revision,
    'status', 'closed',
    'activity_event_id', v_event_id,
    'activity_event_key', v_event_key
  );
  insert into public.portal_command_receipts
    (client_id,command_type,idempotency_key,request_fingerprint,response)
  values
    (p_client_id,'agency_close_plan_cycle',p_idempotency_key,v_fingerprint,v_response);
  return v_response;
end;
$$;
revoke all on function public.agency_close_plan_cycle(uuid,uuid,int,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.agency_close_plan_cycle(uuid,uuid,int,text,text,text)
  to service_role;

create function public.assert_portal_plan_cycle_selection_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
begin
  if not exists (select 1 from public.activity_event_types where event_type = 'plan_cycle_closed') then
    raise exception 'plan-cycle close activity vocabulary is missing';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.agency_close_plan_cycle(uuid,uuid,integer,text,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%portal_feature_enabled%'
     or v_def not ilike '%for update%'
     or v_def not ilike '%v_cycle.status <> ''submitted''%'
     or v_def not ilike '%plan_cycle_closed%' then
    raise exception 'agency plan-cycle close writer is incomplete';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.agency_close_plan_cycle(uuid,uuid,integer,text,text,text)'::pg_catalog.regprocedure
      and p.prosecdef and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'agency plan-cycle close writer is not hardened';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.agency_close_plan_cycle(uuid,uuid,integer,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_close_plan_cycle(uuid,uuid,integer,text,text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.agency_close_plan_cycle(uuid,uuid,integer,text,text,text)', 'EXECUTE') then
    raise exception 'agency plan-cycle close writer privileges are unsafe';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.agency_plan_cycle_for_content(uuid,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_plan_cycle_for_content(uuid,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.agency_plan_cycle_for_content(uuid,uuid)', 'EXECUTE') then
    raise exception 'plan-cycle selector must remain private';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.agency_set_content_plan_date(uuid,text,date,text,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%agency_plan_cycle_for_content(p_client_id, v_ci.id)%'
     or v_def ilike '%order by pc.week_start desc, pc.revision desc, pc.id desc%' then
    raise exception 'agency plan-date writer still targets the furthest-future plan cycle';
  end if;
end;
$$;
revoke all on function public.assert_portal_plan_cycle_selection_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_plan_cycle_selection_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice42_security();
  perform public.assert_portal_plan_cycle_selection_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
