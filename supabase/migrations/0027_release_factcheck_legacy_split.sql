-- Piece architecture follow-up (spec 2026-07-23, v2.1).
-- Align release eligibility with the same stable fact-check predicate used by
-- the agency stage bar, and add no new client-visible schema.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.mark_content_ready(uuid,int)') is null
     or pg_catalog.to_regprocedure('public.portal_fact_check_ledger_release_valid(jsonb,text,text)') is null then
    raise exception '0026/base portal objects must exist before applying 0027';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice21_security;
revoke all on function public.assert_portal_slice21_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice21_security() to service_role;

create or replace function public.mark_content_ready(p_content_id uuid, p_content_version int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ci public.content_items%rowtype;
  v_title text;
  v_fact_check text;
  v_fact_check_scope text;
  v_fact_check_exemption text;
  v_fact_check_ledger jsonb;
  v_body text;
begin
  select ci.* into v_ci
  from public.content_items ci
  where ci.id = p_content_id
  for update;
  if not found then raise exception 'content item not found'; end if;

  if v_ci.client_visible
     and v_ci.client_visible_version = p_content_version
     and v_ci.review_ready_at is not null
     and not v_ci.revision_in_progress then
    return;
  end if;

  if v_ci.archived_at is not null or v_ci.status <> 'draft' then
    raise exception 'content item is not eligible for review release';
  end if;
  if v_ci.working_version is distinct from p_content_version then
    raise exception 'stale content version';
  end if;

  select cv.title, cv.fact_check, cv.fact_check_scope, cv.fact_check_exemption,
         cv.fact_check_ledger, cv.client_body
    into v_title, v_fact_check, v_fact_check_scope, v_fact_check_exemption,
         v_fact_check_ledger, v_body
  from public.content_item_versions cv
  where cv.content_item_id = v_ci.id
    and cv.client_id = v_ci.client_id
    and cv.version = p_content_version;
  if not found then raise exception 'content snapshot not found'; end if;
  if v_fact_check <> 'confirmed'
     or not public.portal_fact_check_ledger_release_valid(
       v_fact_check_ledger, v_fact_check_scope, v_fact_check_exemption
     ) then
    raise exception 'content fact-check is not release-valid';
  end if;
  if pg_catalog.btrim(v_body) = '' then raise exception 'client body is required'; end if;

  update public.content_items
  set client_visible = true,
      client_visible_version = p_content_version,
      review_ready_at = pg_catalog.now(),
      revision_in_progress = false,
      updated_at = pg_catalog.now()
  where id = v_ci.id;

  insert into public.activity_log (
    client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name
  ) values (
    v_ci.client_id, v_ci.id, p_content_version, 'needs_review',
    'Needs review: ' || v_title, null, 'agent', 'The Dot'
  );
end;
$$;

revoke all on function public.mark_content_ready(uuid,int) from public, anon, authenticated;
grant execute on function public.mark_content_ready(uuid,int) to service_role;

create or replace function public.assert_portal_release_factcheck_legacy_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.mark_content_ready(uuid,integer)'::regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%portal_fact_check_ledger_release_valid%'
     or v_def not ilike '%v_fact_check <> ''confirmed''%' then
    raise exception 'mark_content_ready must use the release-valid fact-check predicate';
  end if;
  if pg_catalog.has_function_privilege(
       'authenticated','public.mark_content_ready(uuid,integer)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon','public.mark_content_ready(uuid,integer)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.mark_content_ready(uuid,integer)','EXECUTE'
     ) then
    raise exception 'mark_content_ready privileges are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_release_factcheck_legacy_security() from public, anon, authenticated;
grant execute on function public.assert_portal_release_factcheck_legacy_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice21_security();
  perform public.assert_portal_release_factcheck_legacy_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
