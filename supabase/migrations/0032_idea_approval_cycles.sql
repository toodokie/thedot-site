-- Idea approval is a plan-cycle decision, not a versionless-content decision.
-- A Markdown-backed idea may already have a working snapshot when the plan is sent;
-- that snapshot must not skip the idea approval cycle.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.record_content_idea_decision(uuid,uuid,integer,text,text)') is null
     or pg_catalog.to_regclass('public.content_idea_decisions') is null then
    raise exception '0032 requires 0031 idea decision objects';
  end if;
end;
$$;

create or replace function public.record_content_idea_decision(
  p_content_item_id uuid,
  p_plan_cycle_id uuid,
  p_plan_cycle_revision int,
  p_decision text,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_client_id uuid;
  v_cycle_revision int;
  v_cycle_status text;
  v_existing public.content_idea_decisions%rowtype;
  v_id uuid;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_title text;
begin
  if v_uid is null then raise exception 'idea decision requires an authenticated user' using errcode = '42501'; end if;
  if p_decision not in ('approved','change_requested') then raise exception 'invalid idea decision'; end if;
  if p_plan_cycle_revision is null or p_plan_cycle_revision < 1 then raise exception 'invalid plan cycle revision'; end if;
  if p_decision = 'change_requested' and v_note is null then raise exception 'idea change request note is required'; end if;
  if v_note is not null and (pg_catalog.char_length(v_note) > 2000 or not public.portal_note_grammar_safe(v_note)) then
    raise exception 'invalid idea decision note';
  end if;

  select c.client_id, c.revision, c.status, c.title
    into v_client_id, v_cycle_revision, v_cycle_status, v_title
  from public.plan_cycles c
  join public.client_users cu on cu.client_id = c.client_id and cu.auth_user_id = v_uid
  where c.id = p_plan_cycle_id
  for update;
  if v_client_id is null then raise exception 'not authorized for idea decision' using errcode = '42501'; end if;

  perform public.portal_require_client_action(v_client_id, 'can_decide');
  if p_plan_cycle_revision is distinct from v_cycle_revision then raise exception 'stale plan cycle revision'; end if;

  -- The plan-cycle membership is the approval boundary. Do not require
  -- working_version IS NULL: the canonical sync may have hydrated the idea pack
  -- before Maria reviews the plan.
  if not exists (
    select 1 from public.plan_cycle_items i
    join public.content_items ci on ci.id = i.content_item_id and ci.client_id = i.client_id
    where i.plan_cycle_id = p_plan_cycle_id and i.client_id = v_client_id
      and i.content_item_id = p_content_item_id and ci.archived_at is null
  ) then
    raise exception 'content item is not in this plan cycle';
  end if;

  select * into v_existing from public.content_idea_decisions
  where content_item_id = p_content_item_id and plan_cycle_id = p_plan_cycle_id
    and plan_cycle_revision = p_plan_cycle_revision
  for update;
  if found then
    -- Exact retry is idempotent even after a batch decision closes the cycle.
    if v_existing.decision = p_decision and v_existing.note is not distinct from v_note then
      return v_existing.id;
    end if;
    if v_cycle_status not in ('submitted','change_requested') then
      raise exception 'plan cycle is not open for idea decision';
    end if;
    update public.content_idea_decisions
       set decision = p_decision, note = v_note, decided_by = v_uid,
           created_at = pg_catalog.now()
     where id = v_existing.id
     returning id into v_id;
    insert into public.activity_log(client_id, event_type, event_key, title, summary,
      actor_type, actor_name)
    values (
      v_client_id,
      case when p_decision = 'approved' then 'idea_approved' else 'idea_change_requested' end,
      'client:idea:' || p_content_item_id::text || ':' || p_plan_cycle_id::text || ':' ||
        p_plan_cycle_revision::text || ':' || p_decision || ':' || extensions.gen_random_uuid()::text,
      case when p_decision = 'approved' then 'Idea approved: ' else 'Idea changes requested: ' end ||
        coalesce((select ci.title from public.content_items ci where ci.id = p_content_item_id), v_title),
      v_note, 'client',
      coalesce((select cu.name from public.client_users cu
        where cu.auth_user_id = v_uid and cu.client_id = v_client_id), 'Client')
    );
    return v_id;
  end if;

  if v_cycle_status not in ('submitted','change_requested') then
    raise exception 'plan cycle is not open for idea decision';
  end if;

  insert into public.content_idea_decisions(
    client_id, content_item_id, plan_cycle_id, plan_cycle_revision,
    decision, note, decided_by
  ) values (
    v_client_id, p_content_item_id, p_plan_cycle_id, p_plan_cycle_revision,
    p_decision, v_note, v_uid
  ) returning id into v_id;

  insert into public.activity_log(client_id, event_type, event_key, title, summary,
    actor_type, actor_name)
  values (
    v_client_id,
    case when p_decision = 'approved' then 'idea_approved' else 'idea_change_requested' end,
    'client:idea:' || p_content_item_id::text || ':' || p_plan_cycle_id::text || ':' || p_plan_cycle_revision::text,
    case when p_decision = 'approved' then 'Idea approved: ' else 'Idea changes requested: ' end ||
      coalesce((select ci.title from public.content_items ci where ci.id = p_content_item_id), v_title),
    v_note, 'client',
    coalesce((select cu.name from public.client_users cu
      where cu.auth_user_id = v_uid and cu.client_id = v_client_id), 'Client')
  );
  return v_id;
end;
$$;

revoke all on function public.record_content_idea_decision(uuid,uuid,int,text,text)
  from public, anon, service_role;
grant execute on function public.record_content_idea_decision(uuid,uuid,int,text,text) to authenticated;

create or replace function public.assert_portal_idea_decision_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_def text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class where oid = 'public.content_idea_decisions'::pg_catalog.regclass
      and relrowsecurity
  ) then raise exception 'content idea decisions must have RLS'; end if;
  if pg_catalog.has_table_privilege('anon','public.content_idea_decisions','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.content_idea_decisions','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.content_idea_decisions','UPDATE')
     or pg_catalog.has_table_privilege('authenticated','public.content_idea_decisions','DELETE')
     or pg_catalog.has_function_privilege('anon','public.record_content_idea_decision(uuid,uuid,integer,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.record_content_idea_decision(uuid,uuid,integer,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.record_content_idea_decision(uuid,uuid,integer,text,text)','EXECUTE') then
    raise exception 'idea decision boundary is over-granted';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_content_idea_decision(uuid,uuid,integer,text,text)'::regprocedure
  ) into v_def;
  if v_def ilike '%ci.working_version is null%'
     or v_def not ilike '%plan_cycle_items%'
     or v_def not ilike '%update public.content_idea_decisions%'
     or v_def not ilike '%portal_require_client_action%' then
    raise exception 'idea decision RPC does not support hydrated packs or re-decisions safely';
  end if;
end;
$$;
revoke all on function public.assert_portal_idea_decision_security() from public, anon, authenticated;
grant execute on function public.assert_portal_idea_decision_security() to service_role;

select public.assert_portal_security();
commit;
