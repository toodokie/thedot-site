-- Add the reviewed provincial government hosts for British Columbia, Manitoba and Alberta.
-- Kanset serves every province except Quebec (Anastasia, 2026-10-15), so these are permanent.
-- Host matching remains exact or a real dot-boundary subdomain. Lookalike suffixes stay blocked.

begin;

set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.portal_primary_source_hosts') is null
     or pg_catalog.to_regprocedure(
       'public.portal_fact_check_ledger_release_valid(jsonb,text,text)'
     ) is null
     or pg_catalog.to_regprocedure('public.assert_portal_slice2_security()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0103 requires the current fact-check source policy and portal security fold';
  end if;
end;
$$;

select public.assert_portal_security();

-- The original release-quality assertion pins the exact official-source list. Rewrite only that
-- expected value before adding the three reviewed hosts, then keep it in the cumulative fold.
do $rewrite_primary_source_assertion$
declare
  v_definition text;
  v_old text := $old$v_expected := array['canada.ca','college-ic.ca','gazette.gc.ca','ontario.ca'];$old$;
  v_new text := $new$v_expected := array[
    'alberta.ca','canada.ca','college-ic.ca','gazette.gc.ca',
    'immigratemanitoba.com','ontario.ca','welcomebc.ca'
  ];$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.assert_portal_slice2_security()'::pg_catalog.regprocedure
  ) into v_definition;

  if (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old, '')))
       / pg_catalog.length(v_old) <> 1 then
    raise exception '0103 could not find the primary-source expectation exactly once';
  end if;

  execute pg_catalog.replace(v_definition, v_old, v_new);
end;
$rewrite_primary_source_assertion$;

insert into public.portal_primary_source_hosts(hostname) values
  ('alberta.ca'),
  ('immigratemanitoba.com'),
  ('welcomebc.ca');

create function public.assert_portal_provincial_primary_sources_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger jsonb := '[{
    "claim_key":"provincial-source",
    "claim":"The provincial government publishes this immigration information.",
    "status":"confirmed",
    "source_type":"primary_source",
    "source_url":"https://alberta.ca/source",
    "source_title":"Provincial government source",
    "checked_at":"2026-10-15",
    "checked_by_role":"agency_fact_checker"
  }]'::jsonb;
  v_url text;
begin
  if not exists (
       select 1 from public.portal_primary_source_hosts where hostname = 'alberta.ca'
     ) or not exists (
       select 1 from public.portal_primary_source_hosts where hostname = 'immigratemanitoba.com'
     ) or not exists (
       select 1 from public.portal_primary_source_hosts where hostname = 'welcomebc.ca'
     ) then
    raise exception 'a permanent provincial primary-source host is missing';
  end if;

  foreach v_url in array array[
    'https://alberta.ca/source',
    'https://www.alberta.ca/source',
    'https://immigratemanitoba.com/source',
    'https://www.immigratemanitoba.com/source',
    'https://welcomebc.ca/source',
    'https://www.welcomebc.ca/source'
  ]
  loop
    if not public.portal_fact_check_ledger_release_valid(
      pg_catalog.jsonb_set(v_ledger, '{0,source_url}', pg_catalog.to_jsonb(v_url)),
      'required',
      null
    ) then
      raise exception 'provincial primary source is blocked: %', v_url;
    end if;
  end loop;

  foreach v_url in array array[
    'https://welcomebc.ca.evil.com/source',
    'https://notalberta.ca/source',
    'https://alberta.ca-gov.com/source',
    'https://immigratemanitoba.com.example/source'
  ]
  loop
    if public.portal_fact_check_ledger_release_valid(
      pg_catalog.jsonb_set(v_ledger, '{0,source_url}', pg_catalog.to_jsonb(v_url)),
      'required',
      null
    ) then
      raise exception 'provincial primary-source lookalike passed: %', v_url;
    end if;
  end loop;

  if pg_catalog.has_function_privilege(
       'anon', 'public.assert_portal_provincial_primary_sources_security()', 'EXECUTE'
     ) or pg_catalog.has_function_privilege(
       'authenticated', 'public.assert_portal_provincial_primary_sources_security()', 'EXECUTE'
     ) then
    raise exception 'provincial primary-source assertion is exposed';
  end if;
end;
$$;

revoke all on function public.assert_portal_provincial_primary_sources_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_provincial_primary_sources_security()
  to service_role;

alter function public.assert_portal_security()
  rename to assert_portal_pre_provincial_primary_sources_security;
revoke all on function public.assert_portal_pre_provincial_primary_sources_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_pre_provincial_primary_sources_security()
  to service_role;

create function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_pre_provincial_primary_sources_security();
  perform public.assert_portal_provincial_primary_sources_security();
end;
$$;

revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
