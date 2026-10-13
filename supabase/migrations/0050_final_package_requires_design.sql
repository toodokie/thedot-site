-- A client plan-direction decision and a final review-package decision are distinct.
-- A fact-checked released version can be visible for early copy feedback, but the
-- version-bound final decision must not be recorded until that version has a client-safe
-- linked design. This wraps the interactive capability boundary only: historical / agency
-- external-decision records keep their audited semantics through their private core.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.record_content_decision(uuid,integer,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_core_record_content_decision(uuid,integer,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_require_client_action(uuid,text)') is null
     or pg_catalog.to_regclass('public.content_design_links') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null then
    raise exception '0050 requires the existing decision, access, design-link, and version boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice43_security;
revoke all on function public.assert_portal_slice43_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice43_security() to service_role;

create or replace function public.record_content_decision(
  p_content_id uuid,p_content_version int,p_decision text,p_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_client_id uuid;
  v_is_visible boolean;
  v_has_design boolean;
begin
  -- Resolve tenant identity before the capability check. The core still locks the item
  -- and verifies the released version, so this presentation precondition cannot bypass
  -- tenancy, stale-version, lifecycle, or idempotency safeguards.
  select ci.client_id,
    (ci.client_visible and ci.client_visible_version is not distinct from p_content_version),
    exists (
      select 1
      from public.content_item_versions cv
      left join public.content_design_links dl
        on dl.content_item_id = ci.id and dl.client_id = ci.client_id
      where cv.content_item_id = ci.id
        and cv.client_id = ci.client_id
        and cv.version = p_content_version
        and (dl.canva_url is not null or dl.drive_url is not null
          or cv.canva_url is not null or cv.drive_url is not null)
    )
  into v_client_id, v_is_visible, v_has_design
  from public.content_items ci
  where ci.id = p_content_id
  for update;

  if v_client_id is null then
    raise exception 'portal_action_not_allowed' using errcode='42501';
  end if;
  perform public.portal_require_client_action(v_client_id,'can_decide');
  -- Preserve the core's precise stale/unreleased failure and row-locking semantics.
  -- This branch cannot write: the core rejects before its approval insert.
  if not coalesce(v_is_visible,false) then
    return public.portal_core_record_content_decision(p_content_id,p_content_version,p_decision,p_note);
  end if;
  if not coalesce(v_has_design,false) then
    raise exception 'final_package_design_required' using errcode='23514',
      detail='Use the plan review and comments surface until a linked design is ready.';
  end if;
  return public.portal_core_record_content_decision(p_content_id,p_content_version,p_decision,p_note);
end;
$$;

revoke all on function public.record_content_decision(uuid,integer,text,text)
  from public, anon, service_role;
grant execute on function public.record_content_decision(uuid,integer,text,text) to authenticated;

create function public.assert_portal_final_package_security()
returns void language plpgsql security definer set search_path='' as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_content_decision(uuid,integer,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_require_client_action%'
     or v_def not ilike '%content_item_versions%'
     or v_def not ilike '%content_design_links%'
     or v_def not ilike '%for update%'
     or v_def not ilike '%v_is_visible%'
     or v_def not ilike '%final_package_design_required%'
     or v_def not ilike '%portal_core_record_content_decision%' then
    raise exception 'final-package decision wrapper is incomplete';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.record_content_decision(uuid,integer,text,text)'::pg_catalog.regprocedure
      and p.prosecdef and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'final-package decision wrapper is not hardened';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.record_content_decision(uuid,integer,text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.record_content_decision(uuid,integer,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.record_content_decision(uuid,integer,text,text)', 'EXECUTE') then
    raise exception 'final-package decision wrapper grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_final_package_security() from public, anon, authenticated;
grant execute on function public.assert_portal_final_package_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice43_security();
  perform public.assert_portal_final_package_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
