-- Agency-recorded plan-cycle decisions (the "backdoor" for idea approval).
--
-- A plan cycle's idea approval is a client decision. record_plan_cycle_decision (0028) and
-- record_content_idea_decision (0032) are both client-only: they resolve the client via
-- auth.uid() + client_users and are revoked from service_role. The service role is
-- deliberately not a client, so there was NO sanctioned agency entry point to record an
-- approval a client made out of band (email/call). The cycle stayed 'submitted', and every
-- piece in it read as "resolve idea approval" with no way to clear it agency-side.
--
-- This adds agency_record_plan_cycle_decision: the agency-write mirror of
-- record_external_decision (0030, which does the same for copy approvals) applied to
-- plan-cycle decisions. It is service-role only, gated on the agency_mutations feature
-- switch, advisory-locked, idempotent via portal_command_receipts, and attributed to the
-- REAL client decider (decided_by), so the existing after-insert inbox trigger
-- (portal_plan_cycle_decision_inbox_trigger, 0034) resolves that person's name and emits the
-- client inbox event exactly as a client-side decision would. Approving the cycle
-- (status='approved', approved_revision=revision) batch-clears idea approval for every piece
-- in the cycle (gates-loader derives ideaDecision='approved' from the approved cycle).
--
-- It RECORDS a real decision; it does not fabricate a client identity (the contact must be a
-- client_users member with a client-safe name) and it does not rewrite a decision already
-- made for a revision (an exact repeat is idempotent; a conflicting one is refused, and a
-- correction comes from a freshly submitted revision via agency_upsert_plan_cycle).

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_feature_enabled(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.portal_client_summary_shape_valid(text)') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.plan_cycle_decisions') is null
     or pg_catalog.to_regclass('public.agency_actors') is null then
    raise exception '0039 requires the plan-cycle and agency-write objects';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice32_security;
revoke all on function public.assert_portal_slice32_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice32_security() to service_role;

create or replace function public.agency_record_plan_cycle_decision(
  p_client_id uuid,
  p_plan_cycle_id uuid,
  p_revision int,
  p_contact_auth_user_id uuid,
  p_decision text,
  p_note text,
  p_decision_source text,
  p_source_occurred_at timestamptz,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_contact_name text;
  v_cycle public.plan_cycles%rowtype;
  v_existing_receipt public.portal_command_receipts%rowtype;
  v_existing_decision public.plan_cycle_decisions%rowtype;
  v_fingerprint text;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_new_status text := case when p_decision = 'approved' then 'approved' else 'change_requested' end;
  v_decision_id uuid;
  v_summary text;
  v_response jsonb;
begin
  -- input validation (mirrors record_external_decision + record_plan_cycle_decision)
  if p_client_id is null or p_plan_cycle_id is null or p_contact_auth_user_id is null then
    raise exception 'invalid agency plan-cycle decision request';
  end if;
  if p_decision not in ('approved','change_requested') then raise exception 'invalid plan cycle decision'; end if;
  if p_decision_source not in ('email','call') then raise exception 'external decision source must be email or call'; end if;
  if p_source_occurred_at is null or p_source_occurred_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'invalid source occurrence time';
  end if;
  if p_revision is null or p_revision < 1 then raise exception 'invalid plan cycle revision'; end if;
  if p_decision = 'change_requested' and v_note is null then raise exception 'change request note is required'; end if;
  if v_note is not null and (pg_catalog.char_length(v_note) > 2000
      or not public.portal_client_summary_shape_valid(v_note)) then
    raise exception 'invalid client-visible note';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,128}$' then
    raise exception 'idempotency key is required';
  end if;

  -- agency actor + client + feature gate (agency writes never run when the switch is off)
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;
  if not public.portal_feature_enabled(p_client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;

  -- the recorded decider must be a real client contact with a client-safe display name, so a
  -- decision cannot be fabricated against nobody and the inbox trigger can name the decider.
  select nullif(pg_catalog.btrim(cu.name), '') into v_contact_name
  from public.client_users cu
  where cu.client_id = p_client_id and cu.auth_user_id = p_contact_auth_user_id
  limit 1;
  if not found then raise exception 'contact is not a member of this client'; end if;
  if v_contact_name is null then raise exception 'contact needs a client-safe display name'; end if;

  -- idempotency: advisory lock + receipt replay, keyed by (client, idempotency_key)
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'plan_cycle_id', p_plan_cycle_id, 'revision', p_revision,
      'contact', p_contact_auth_user_id, 'decision', p_decision, 'note', v_note,
      'source', p_decision_source, 'occurred_at', p_source_occurred_at
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-plan-cycle-decision:' || p_client_id::text || ':' || p_idempotency_key, 0));
  select * into v_existing_receipt from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing_receipt.command_type <> 'agency_record_plan_cycle_decision'
       or v_existing_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_existing_receipt.response;
  end if;

  -- lock the cycle; the recorded revision must be the live one (no deciding a stale plan)
  select * into v_cycle from public.plan_cycles
    where id = p_plan_cycle_id and client_id = p_client_id for update;
  if not found then raise exception 'plan cycle not found for client'; end if;
  if p_revision is distinct from v_cycle.revision then raise exception 'stale plan cycle revision'; end if;

  -- a decision for a revision is an immutable fact: an exact repeat is idempotent, a
  -- conflicting one is refused (corrections come from a newly submitted revision).
  select * into v_existing_decision from public.plan_cycle_decisions
    where plan_cycle_id = p_plan_cycle_id and revision = p_revision;
  if found then
    if v_existing_decision.decision <> p_decision or v_existing_decision.note is distinct from v_note then
      raise exception 'plan cycle revision already decided';
    end if;
    v_decision_id := v_existing_decision.id;
  else
    if v_cycle.status not in ('submitted','change_requested') then
      raise exception 'plan cycle is not open for decision';
    end if;
    -- the after-insert trigger emits the client inbox event from decided_by
    insert into public.plan_cycle_decisions(plan_cycle_id, client_id, revision, decision, note, decided_by)
      values (p_plan_cycle_id, p_client_id, p_revision, p_decision, v_note, p_contact_auth_user_id)
      returning id into v_decision_id;
    update public.plan_cycles
      set status = v_new_status,
          approved_revision = case when p_decision = 'approved' then p_revision else null end,
          decided_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_plan_cycle_id;
    v_summary := case when v_note is null
      then v_contact_name || ' decided by ' || p_decision_source || '; recorded by ' || v_actor.display_name || '.'
      else v_note || '; decided by ' || p_decision_source || '; recorded by ' || v_actor.display_name || '.' end;
    insert into public.activity_log(client_id, event_type, event_key, title, summary, actor_type, actor_name)
      values (p_client_id,
        case when p_decision = 'approved' then 'plan_cycle_approved' else 'plan_cycle_change_requested' end,
        'agency:plan-cycle-decision:' || p_plan_cycle_id::text || ':' || p_revision::text || ':' || p_idempotency_key,
        case when p_decision = 'approved' then 'Plan approved: ' else 'Plan changes requested: ' end || v_cycle.title,
        v_summary, 'client', v_contact_name);
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'id', v_decision_id, 'plan_cycle_id', p_plan_cycle_id, 'revision', p_revision,
    'decision', p_decision, 'status', v_new_status);
  insert into public.portal_command_receipts(client_id, command_type, idempotency_key, request_fingerprint, response)
    values (p_client_id, 'agency_record_plan_cycle_decision', p_idempotency_key, v_fingerprint, v_response);
  return v_response;
end;
$$;

revoke all on function public.agency_record_plan_cycle_decision(uuid,uuid,int,uuid,text,text,text,timestamptz,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.agency_record_plan_cycle_decision(uuid,uuid,int,uuid,text,text,text,timestamptz,text,text)
  to service_role;

create or replace function public.assert_portal_agency_plan_cycle_decision_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.agency_record_plan_cycle_decision(uuid,uuid,integer,uuid,text,text,text,timestamptz,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%plan_cycle_decisions%'
     or v_def not ilike '%portal_feature_enabled%'
     or v_def not ilike '%portal_client_summary_shape_valid%'
     or v_def not ilike '%activity_log%'
     or v_def not ilike '%client_users%' then
    raise exception 'agency plan-cycle decision writer is incomplete';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.agency_record_plan_cycle_decision(uuid,uuid,integer,uuid,text,text,text,timestamptz,text,text)'::pg_catalog.regprocedure
      and p.prosecdef and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'agency plan-cycle decision writer is not hardened';
  end if;
  if pg_catalog.has_function_privilege('anon','public.agency_record_plan_cycle_decision(uuid,uuid,integer,uuid,text,text,text,timestamptz,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.agency_record_plan_cycle_decision(uuid,uuid,integer,uuid,text,text,text,timestamptz,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.agency_record_plan_cycle_decision(uuid,uuid,integer,uuid,text,text,text,timestamptz,text,text)','EXECUTE') then
    raise exception 'unsafe agency plan-cycle decision writer privileges';
  end if;
end;
$$;
revoke all on function public.assert_portal_agency_plan_cycle_decision_security() from public, anon, authenticated;
grant execute on function public.assert_portal_agency_plan_cycle_decision_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice32_security();
  perform public.assert_portal_agency_plan_cycle_decision_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
