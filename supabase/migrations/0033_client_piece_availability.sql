-- Client-safe explanation for a planned piece that has no released copy yet.
-- This deliberately returns a small classification only. It never exposes a working
-- title, body, ledger, or internal release state to the client Data API.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_items') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regclass('public.client_users') is null then
    raise exception '0033 requires the portal content and membership objects';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice26_security;
revoke all on function public.assert_portal_slice26_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice26_security() to service_role;

-- Keep the shared predicate's existing meaning for sync and preview: it validates
-- shape, dates, and approved hosts, but it may represent an open fact-check. Release
-- uses this stricter wrapper, so working drafts can still be synced and explained.
create or replace function public.portal_fact_check_release_complete(
  p_ledger jsonb, p_scope text, p_exemption text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.portal_fact_check_ledger_release_valid(p_ledger, p_scope, p_exemption) then
    return false;
  end if;
  return not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_ledger) e(value)
    where e.value->>'status' is distinct from 'confirmed'
  );
end;
$$;
revoke all on function public.portal_fact_check_release_complete(jsonb, text, text)
  from public, anon, authenticated, service_role;

-- Interpose the strict check at the service-only release core. The existing core is
-- retained under a private name so its reviewed transition and activity behavior stay
-- unchanged; sync and preview never call this path.
alter function public.portal_core_mark_content_ready(uuid, int)
  rename to portal_unchecked_mark_content_ready;
revoke all on function public.portal_unchecked_mark_content_ready(uuid, int)
  from public, anon, authenticated, service_role;

create or replace function public.portal_core_mark_content_ready(
  p_content_id uuid, p_content_version int
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fact_check text;
  v_scope text;
  v_exemption text;
  v_ledger jsonb;
begin
  select cv.fact_check, cv.fact_check_scope, cv.fact_check_exemption, cv.fact_check_ledger
    into v_fact_check, v_scope, v_exemption, v_ledger
  from public.content_item_versions cv
  where cv.content_item_id = p_content_id
    and cv.version = p_content_version;
  if not found then raise exception 'content snapshot not found'; end if;
  if (v_fact_check is null or v_fact_check <> 'confirmed')
     or not public.portal_fact_check_ledger_release_valid(v_ledger, v_scope, v_exemption)
     or not public.portal_fact_check_release_complete(v_ledger, v_scope, v_exemption) then
    raise exception 'content fact-check is not release-complete';
  end if;
  perform public.portal_unchecked_mark_content_ready(p_content_id, p_content_version);
end;
$$;
revoke all on function public.portal_core_mark_content_ready(uuid, int)
  from public, anon, authenticated, service_role;

create or replace function public.get_client_content_availability(p_client_id uuid, p_content_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_working_version int;
  v_visible_version int;
  v_fact_check text;
  v_scope text;
  v_exemption text;
  v_ledger jsonb;
begin
  if v_uid is null or p_client_id is null or nullif(pg_catalog.btrim(p_content_id), '') is null then
    return 'not_available';
  end if;

  -- Membership is checked in the same query as the piece lookup. A caller who is
  -- not a member receives the same opaque result as an unknown content id.
  select ci.working_version, ci.client_visible_version,
         cv.fact_check, cv.fact_check_scope, cv.fact_check_exemption, cv.fact_check_ledger
    into v_working_version, v_visible_version, v_fact_check, v_scope, v_exemption, v_ledger
  from public.content_items ci
  join public.client_users cu
    on cu.client_id = ci.client_id
   and cu.auth_user_id = v_uid
  left join public.content_item_versions cv
    on cv.content_item_id = ci.id
   and cv.client_id = ci.client_id
   and cv.version = ci.working_version
  where ci.content_id = pg_catalog.btrim(p_content_id)
    and ci.client_id = p_client_id;

  if not found then
    return 'not_available';
  end if;
  if v_visible_version is not null then
    return 'released';
  end if;
  if v_working_version is null then
    return 'no_copy';
  end if;
  if v_fact_check is distinct from 'confirmed'
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(coalesce(v_ledger, '[]'::jsonb)) e(value)
       where e.value->>'status' is distinct from 'confirmed'
     ) then
    return 'pending_fact_check';
  end if;

  if not public.portal_fact_check_ledger_release_valid(v_ledger, v_scope, v_exemption) then
    return 'pending_release';
  end if;

  -- Confirmed content can still be waiting for another release prerequisite
  -- (for example a date or host validation). Do not mislabel that as fact-checking.
  return 'pending_release';
end;
$$;

revoke all on function public.get_client_content_availability(uuid, text)
  from public, anon, service_role, authenticated;
grant execute on function public.get_client_content_availability(uuid, text) to authenticated;

create or replace function public.assert_portal_piece_availability_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
begin
  if pg_catalog.has_function_privilege(
       'anon', 'public.get_client_content_availability(uuid,text)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.get_client_content_availability(uuid,text)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.get_client_content_availability(uuid,text)', 'EXECUTE'
     ) then
    raise exception 'client piece availability RPC grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.get_client_content_availability(uuid,text)'::regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%client_users%'
     or v_def not ilike '%content_item_versions%'
     or v_def not ilike '%auth.uid%'
     or v_def not ilike '%pending_fact_check%' then
    raise exception 'client piece availability RPC lacks membership or release classification';
  end if;
  if not exists (
       select 1 from pg_catalog.pg_proc p
       where p.oid = 'public.portal_fact_check_release_complete(jsonb,text,text)'::regprocedure
     ) then
    raise exception 'strict fact-check release predicate is missing';
  end if;
end;
$$;

revoke all on function public.assert_portal_piece_availability_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_piece_availability_security() to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice26_security();
  perform public.assert_portal_piece_availability_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
