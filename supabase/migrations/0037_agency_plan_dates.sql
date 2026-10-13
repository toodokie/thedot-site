-- Agency-owned plan-date adjustments.
-- The client can request a schedule change, but editorial plan dates are also an agency
-- coordination concern. This RPC updates the canonical content date, keeps the current
-- plan-cycle projection aligned, and emits the same durable audit/inbox/projection records
-- as every other agency write.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_feature_enabled(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.portal_client_summary_shape_valid(text)') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.plan_cycle_items') is null then
    raise exception '0037 requires the agency write and plan-cycle objects';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice30_security;
revoke all on function public.assert_portal_slice30_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice30_security() to service_role;

create or replace function public.agency_set_content_plan_date(
  p_client_id uuid,
  p_content_id text,
  p_planned_date date,
  p_note text,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_ci public.content_items%rowtype;
  v_title text;
  v_version int;
  v_existing public.portal_command_receipts%rowtype;
  v_fingerprint text;
  v_response jsonb;
  v_event_key text;
  v_revision bigint;
  v_outcome text;
  v_cycle_updates int := 0;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_date_label text := coalesce(p_planned_date::text, 'unscheduled');
begin
  if p_client_id is null
     or p_content_id is null
     or pg_catalog.btrim(p_content_id) = ''
     or pg_catalog.char_length(pg_catalog.btrim(p_content_id)) > 200
     or p_actor_key is null
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,128}$'
     or (v_note is not null and pg_catalog.char_length(v_note) > 2000)
     or (v_note is not null and not public.portal_client_summary_shape_valid(v_note)) then
    raise exception 'invalid agency plan-date request';
  end if;
  if p_planned_date is not null
     and p_planned_date > (pg_catalog.now() at time zone 'America/Toronto')::date + 730 then
    raise exception 'planned date is more than 730 days ahead';
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
      'content_id', pg_catalog.btrim(p_content_id),
      'planned_date', p_planned_date,
      'note', v_note
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-plan-date:' || p_client_id::text || ':' || pg_catalog.btrim(p_content_id), 0));

  select * into v_existing from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.command_type <> 'agency_set_content_plan_date'
       or v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_existing.response;
  end if;

  select * into v_ci from public.content_items ci
    where ci.client_id = p_client_id and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content item not found for client'; end if;
  if v_ci.archived_at is not null then raise exception 'archived content cannot be planned'; end if;

  select cv.title, cv.version into v_title, v_version
  from public.content_item_versions cv
  where cv.content_item_id = v_ci.id and cv.client_id = v_ci.client_id
  order by (cv.version = coalesce(v_ci.working_version, v_ci.client_visible_version)) desc,
    cv.version desc limit 1;
  v_title := coalesce(v_title, pg_catalog.btrim(p_content_id));

  if (v_ci.planned_date = p_planned_date)
     or (v_ci.planned_date is null and p_planned_date is null) then
    v_outcome := 'unchanged';
    v_revision := v_ci.projection_revision;
  else
    update public.content_items
    set planned_date = p_planned_date,
        projection_revision = projection_revision + 1,
        updated_at = pg_catalog.now()
    where id = v_ci.id
    returning projection_revision into v_revision;
    v_outcome := case when p_planned_date is null then 'cleared' else 'updated' end;

    -- Keep the current client-facing plan cycle from contradicting the canonical piece date.
    update public.plan_cycle_items pci
    set planned_date = p_planned_date, updated_at = pg_catalog.now()
    where pci.client_id = p_client_id
      and pci.content_item_id = v_ci.id
      and pci.plan_cycle_id = (
        select pc.id from public.plan_cycles pc
        where pc.client_id = p_client_id
        order by pc.week_start desc, pc.revision desc, pc.id desc
        limit 1
      );
    get diagnostics v_cycle_updates = row_count;

    v_event_key := 'agency:plan-date:' || p_client_id::text || ':' || v_ci.id::text || ':' || p_idempotency_key;
    insert into public.activity_log
      (client_id, content_id, content_version, event_type, event_key, title, summary, actor_type, actor_name)
    values
      (p_client_id, v_ci.id, v_version,
       case when p_planned_date is null then 'unschedule_requested' else 'planned_date_changed' end,
       v_event_key,
       'Plan updated: ' || v_title,
       'Editorial plan: ' || v_date_label || case when v_note is null then '' else ' · ' || v_note end,
       'anastasia', v_actor.display_name);
    insert into public.portal_inbox_events
      (client_id, event_key, event_type, object_type, object_id, actor_type, actor_name, payload, requires_reconciliation)
    values
      (p_client_id, v_event_key,
       case when p_planned_date is null then 'unschedule_requested' else 'planned_date_changed' end,
       'content', v_ci.id, 'anastasia', v_actor.display_name,
       pg_catalog.jsonb_build_object('content_id', v_ci.id, 'content_version', v_version,
         'planned_date', p_planned_date, 'note', v_note), false);
    insert into public.projection_outbox
      (client_id, event_key, destination, operation, object_type, object_key, object_revision, payload)
    values
      (p_client_id, v_event_key, 'notion', 'upsert', 'content', v_ci.id::text, v_revision,
       pg_catalog.jsonb_build_object('reason', 'agency_plan_date_changed'));
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'content_id', v_ci.id,
    'content_key', v_ci.content_id,
    'planned_date', p_planned_date,
    'outcome', v_outcome,
    'cycle_items_updated', v_cycle_updates
  );
  insert into public.portal_command_receipts
    (client_id, command_type, idempotency_key, request_fingerprint, response)
  values
    (p_client_id, 'agency_set_content_plan_date', p_idempotency_key, v_fingerprint, v_response);
  return v_response;
end;
$$;

revoke all on function public.agency_set_content_plan_date(uuid, text, date, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.agency_set_content_plan_date(uuid, text, date, text, text, text)
  to service_role;

create or replace function public.assert_portal_agency_plan_date_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.agency_set_content_plan_date(uuid,text,date,text,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%plan_cycle_items%'
     or v_def not ilike '%portal_inbox_events%'
     or v_def not ilike '%projection_outbox%' then
    raise exception 'agency plan-date writer is incomplete';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.agency_set_content_plan_date(uuid,text,date,text,text,text)'::pg_catalog.regprocedure
      and p.prosecdef and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'agency plan-date writer is not hardened';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.agency_set_content_plan_date(uuid,text,date,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_set_content_plan_date(uuid,text,date,text,text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.agency_set_content_plan_date(uuid,text,date,text,text,text)', 'EXECUTE') then
    raise exception 'unsafe agency plan-date writer privileges';
  end if;
end;
$$;
revoke all on function public.assert_portal_agency_plan_date_security() from public, anon, authenticated;
grant execute on function public.assert_portal_agency_plan_date_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice30_security();
  perform public.assert_portal_agency_plan_date_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
