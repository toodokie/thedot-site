-- Allow an agency plan-date change on a plan-only content placeholder that has no authored version.
-- Preserve the current plan-cycle selector and every other reviewed behavior. Change only the
-- activity-log insert so its content-id/version pairing remains valid before version 1 exists.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure(
       'public.agency_set_content_plan_date(uuid,text,date,text,text,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.agency_plan_cycle_for_content(uuid,uuid)'
     ) is null then
    raise exception '0075 requires the current portal plan-date writer';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security()
  rename to assert_portal_slice74_security;
revoke all on function public.assert_portal_slice74_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_slice74_security()
  to service_role;

do $rewrite$
declare
  v_def text;
  v_old text := $old$
      (p_client_id, v_ci.id, v_version,
       case when p_planned_date is null then 'unschedule_requested' else 'planned_date_changed' end,$old$;
  v_new text := $new$
      (p_client_id,
       case when v_version is null then null else v_ci.id end,
       v_version,
       case when p_planned_date is null then 'unschedule_requested' else 'planned_date_changed' end,$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.agency_set_content_plan_date(uuid,text,date,text,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'agency plan-date activity insert drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;
revoke all on function public.agency_set_content_plan_date(uuid,text,date,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.agency_set_content_plan_date(uuid,text,date,text,text,text)
  to service_role;

create function public.assert_portal_plan_date_placeholder_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.agency_set_content_plan_date(uuid,text,date,text,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def !~* 'case[[:space:]]+when[[:space:]]+v_version[[:space:]]+is[[:space:]]+null[[:space:]]+then[[:space:]]+null[[:space:]]+else[[:space:]]+v_ci.id[[:space:]]+end'
     or v_def !~* 'agency_plan_cycle_for_content[[:space:]]*\([[:space:]]*p_client_id[[:space:]]*,[[:space:]]*v_ci.id[[:space:]]*\)' then
    raise exception 'plan-date writer lost placeholder or nearest-cycle safety';
  end if;
  if pg_catalog.has_function_privilege(
       'anon','public.agency_set_content_plan_date(uuid,text,date,text,text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.agency_set_content_plan_date(uuid,text,date,text,text,text)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.agency_set_content_plan_date(uuid,text,date,text,text,text)','EXECUTE'
     ) then
    raise exception 'plan-date writer privileges are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_plan_date_placeholder_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_plan_date_placeholder_security()
  to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice74_security();
  perform public.assert_portal_plan_date_placeholder_security();
end;
$$;
revoke all on function public.assert_portal_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_security()
  to service_role;

select public.assert_portal_security();

commit;
