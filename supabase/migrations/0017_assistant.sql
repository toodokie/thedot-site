-- Client Work Assistant usage plane: the per-tenant usage ledger (assistant_usage), the
-- authenticated access gate (feature switch + capability, fail-closed), and the service-role
-- budget/logging RPCs the assistant route calls around every model request. No model call can
-- happen unless the 'assistant' switch (0013, default OFF) and the member's can_use_assistant
-- capability (0013, default false) both pass; both already exist, so nothing here grants access.
-- Granting can_use_assistant to a member stays a launch-time provisioning action through
-- upsert_portal_membership; this migration deliberately flips no membership row and no switch.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_feature_enabled(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.portal_require_client_action(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null
     or not exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'client_users'
         and c.column_name = 'can_use_assistant'
     ) then
    raise exception '0016/base portal objects must exist before applying 0017';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice11_security;
revoke all on function public.assert_portal_slice11_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice11_security() to service_role;

-- --- usage ledger -----------------------------------------------------------
-- One row per assistant request, whatever the outcome. question_hash is a sha256 of the question
-- (auditable without storing the text); cost_cents is model spend in cents (numeric so fractional
-- request costs sum exactly). The client may read only when their assistant was used and the
-- outcome; tokens, cost, model, and the hash stay agency-internal (the fee/PII wall).
create table public.assistant_usage (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  occurred_at timestamptz not null default pg_catalog.now(),
  question_hash text not null check (question_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in (
    'answered','refused_prefilter','refused_model','rejected_output','rate_limited','error'
  )),
  prompt_tokens int not null default 0 check (prompt_tokens >= 0),
  completion_tokens int not null default 0 check (completion_tokens >= 0),
  cost_cents numeric(12,4) not null default 0 check (cost_cents >= 0),
  model text not null check (pg_catalog.char_length(model) between 1 and 100),
  created_at timestamptz not null default pg_catalog.now()
);

create index assistant_usage_tenant_time
  on public.assistant_usage (client_id, occurred_at desc);

alter table public.assistant_usage enable row level security;
create policy assistant_usage_client_read on public.assistant_usage
  for select to authenticated
  using (client_id in (select public.my_client_ids()));

revoke all on public.assistant_usage from public,anon,authenticated;
grant select (id, client_id, occurred_at, decision) on public.assistant_usage to authenticated;
grant select on public.assistant_usage to service_role;

-- --- authenticated access gate (fail-closed) --------------------------------
-- The route's first database check, run under the tenant JWT. Switch first (a disabled assistant
-- is invisible), then the capability path, which also re-checks client_portal_launch and
-- client_mutations (the assistant is cost-bearing, so it rides the mutation kill switch too).
create or replace function public.portal_assistant_gate(p_client_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_client_id is null or not public.portal_feature_enabled(p_client_id, 'assistant') then
    raise exception 'portal_action_not_allowed' using errcode = '42501';
  end if;
  perform public.portal_require_client_action(p_client_id, 'can_use_assistant');
end;
$$;

revoke all on function public.portal_assistant_gate(uuid) from public,anon,service_role;
grant execute on function public.portal_assistant_gate(uuid) to authenticated;

-- --- service-role budget check (fail-closed) --------------------------------
-- Per-tenant rate and cost ceilings, evaluated before every model call. Unknown tenant, disabled
-- switch, or any limit breach all come back not-allowed; an unexpected error propagates and the
-- route treats it as a rejection (never fail-open). Ceilings are deliberately conservative for a
-- single-tenant launch; raise them by migration, not in app code.
--   requests: 20 per rolling hour, 100 per rolling 24h (every logged outcome counts)
--   spend:    500 cost_cents per rolling 24h, 2500 per rolling 30 days
create or replace function public.portal_assistant_check_budget(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_hour_requests bigint;
  v_day_requests bigint;
  v_day_cost numeric;
  v_month_cost numeric;
begin
  if p_client_id is null or not exists (select 1 from public.clients c where c.id = p_client_id) then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'unknown_client');
  end if;
  if not public.portal_feature_enabled(p_client_id, 'assistant') then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'assistant_disabled');
  end if;
  select pg_catalog.count(*) into v_hour_requests from public.assistant_usage u
    where u.client_id = p_client_id and u.occurred_at > pg_catalog.now() - interval '1 hour';
  select pg_catalog.count(*) into v_day_requests from public.assistant_usage u
    where u.client_id = p_client_id and u.occurred_at > pg_catalog.now() - interval '24 hours';
  select coalesce(pg_catalog.sum(u.cost_cents), 0) into v_day_cost from public.assistant_usage u
    where u.client_id = p_client_id and u.occurred_at > pg_catalog.now() - interval '24 hours';
  select coalesce(pg_catalog.sum(u.cost_cents), 0) into v_month_cost from public.assistant_usage u
    where u.client_id = p_client_id and u.occurred_at > pg_catalog.now() - interval '30 days';
  if v_hour_requests >= 20 then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'hourly_request_limit');
  end if;
  if v_day_requests >= 100 then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'daily_request_limit');
  end if;
  if v_day_cost >= 500 then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'daily_cost_limit');
  end if;
  if v_month_cost >= 2500 then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'monthly_cost_limit');
  end if;
  return pg_catalog.jsonb_build_object('allowed', true, 'reason', 'ok');
end;
$$;

-- --- service-role usage logger ----------------------------------------------
-- The only writer to assistant_usage (the table itself has no insert grant for anyone, matching
-- the 0015 outbox funnel). Validates every field so a buggy route cannot poison the ledger.
create or replace function public.portal_assistant_log_usage(
  p_client_id uuid, p_question_hash text, p_decision text,
  p_prompt_tokens int, p_completion_tokens int, p_cost_cents numeric, p_model text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_client_id is null or not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'assistant usage: unknown client';
  end if;
  if p_question_hash is null or p_question_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'assistant usage: invalid question hash';
  end if;
  if p_decision is null or p_decision not in (
    'answered','refused_prefilter','refused_model','rejected_output','rate_limited','error'
  ) then
    raise exception 'assistant usage: invalid decision';
  end if;
  if p_prompt_tokens is null or p_prompt_tokens < 0
     or p_completion_tokens is null or p_completion_tokens < 0
     or p_cost_cents is null or p_cost_cents < 0 then
    raise exception 'assistant usage: invalid token or cost value';
  end if;
  if p_model is null or pg_catalog.char_length(p_model) not between 1 and 100 then
    raise exception 'assistant usage: invalid model';
  end if;
  insert into public.assistant_usage (
    client_id, question_hash, decision, prompt_tokens, completion_tokens, cost_cents, model
  ) values (
    p_client_id, p_question_hash, p_decision, p_prompt_tokens, p_completion_tokens,
    p_cost_cents, p_model
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function
  public.portal_assistant_check_budget(uuid),
  public.portal_assistant_log_usage(uuid,text,text,int,int,numeric,text)
  from public,anon,authenticated;
grant execute on function
  public.portal_assistant_check_budget(uuid),
  public.portal_assistant_log_usage(uuid,text,text,int,int,numeric,text)
  to service_role;

-- --- in-migration security assertion ----------------------------------------
create or replace function public.assert_portal_assistant_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_actual text[]; v_expected text[];
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.assistant_usage'::pg_catalog.regclass) then
    raise exception 'assistant_usage RLS disabled'; end if;

  if not exists (select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename = 'assistant_usage'
      and p.policyname = 'assistant_usage_client_read') then
    raise exception 'assistant_usage tenant read policy missing'; end if;

  if not exists (select 1 from pg_catalog.pg_indexes i where i.schemaname = 'public'
    and i.indexname = 'assistant_usage_tenant_time') then
    raise exception 'assistant_usage tenant/time index missing'; end if;

  -- exact client-visible columns: outcome only, never tokens/cost/model/hash (fee + PII wall)
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
    from information_schema.column_privileges cp where cp.table_schema = 'public'
      and cp.table_name = 'assistant_usage' and cp.grantee = 'authenticated'
      and cp.privilege_type = 'SELECT';
  v_expected := array['client_id','decision','id','occurred_at'];
  if v_actual is distinct from v_expected then
    raise exception 'unsafe assistant_usage grants: %', v_actual; end if;

  if pg_catalog.has_table_privilege('authenticated','public.assistant_usage','INSERT,UPDATE,DELETE') then
    raise exception 'direct authenticated assistant_usage write detected'; end if;
  if pg_catalog.has_table_privilege('anon','public.assistant_usage','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'anon assistant_usage privilege detected'; end if;
  if not pg_catalog.has_table_privilege('service_role','public.assistant_usage','SELECT')
     or pg_catalog.has_table_privilege('service_role','public.assistant_usage','INSERT,UPDATE,DELETE') then
    raise exception 'unsafe service_role assistant_usage privilege'; end if;

  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('portal_assistant_gate',
      'portal_assistant_check_budget','portal_assistant_log_usage')
      and (not p.prosecdef or not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']))) then
    raise exception 'assistant function is not hardened'; end if;

  -- gate: tenant JWT only (mirrors portal_client_session)
  if not pg_catalog.has_function_privilege('authenticated','public.portal_assistant_gate(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_gate(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_assistant_gate(uuid)','EXECUTE') then
    raise exception 'unsafe assistant gate privilege'; end if;

  -- budget + logger: service_role only
  if pg_catalog.has_function_privilege('authenticated','public.portal_assistant_check_budget(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_check_budget(uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_check_budget(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_assistant_log_usage(uuid,text,text,integer,integer,numeric,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_log_usage(uuid,text,text,integer,integer,numeric,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_log_usage(uuid,text,text,integer,integer,numeric,text)','EXECUTE') then
    raise exception 'unsafe assistant budget/logging privilege'; end if;
end;
$$;
revoke all on function public.assert_portal_assistant_security() from public,anon,authenticated;
grant execute on function public.assert_portal_assistant_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice11_security();
  perform public.assert_portal_assistant_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
