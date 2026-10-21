-- Proposed academic-source additions for the approved October 23 university carousel.
-- QS supports its own rankings/methodology; each university supports its own program/language
-- information. Immigration-policy and eligibility claims still require official sources.
-- This changes only the reviewed research list, not the official list or URL matching rules.
-- Requires independent frozen-hash review and Anastasia authorization before deployment.

begin;
set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.portal_reviewed_research_source_hosts') is null
     or pg_catalog.to_regprocedure(
       'public.portal_fact_check_ledger_release_valid(jsonb,text,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.assert_portal_reviewed_research_sources_security()'
     ) is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0105 requires the reviewed research source policy (0074)';
  end if;
end;
$$;

select public.assert_portal_security();

-- Record validity before changing the list; no stored ledger may become invalid.
create temporary table university_source_preflight on commit drop as
select id, public.portal_fact_check_ledger_release_valid(
  fact_check_ledger, fact_check_scope, fact_check_exemption
) as was_valid from public.content_item_versions;

insert into public.portal_reviewed_research_source_hosts(hostname)
values ('mcgill.ca'), ('topuniversities.com'), ('umontreal.ca'), ('uwaterloo.ca')
on conflict (hostname) do nothing;

create or replace function public.assert_portal_reviewed_research_sources_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual text[];
  v_expected text[];
  v_ledger jsonb := '[{
    "claim_key":"research-source",
    "claim":"The original publisher reports this indicator.",
    "status":"confirmed",
    "source_type":"primary_source",
    "source_url":"https://henleyglobal.com/source",
    "source_title":"Original publisher",
    "checked_at":"2026-08-09",
    "checked_by_role":"agency_fact_checker"
  }]'::jsonb;
  v_host text;
  v_url text;
begin
  select pg_catalog.array_agg(h.hostname order by h.hostname) into v_actual
  from public.portal_reviewed_research_source_hosts h;
  v_expected := array[
    'henleyglobal.com','mcgill.ca','statcan.gc.ca','topuniversities.com','transparency.org',
    'umontreal.ca','usnews.com','uwaterloo.ca','who.int','worldbank.org'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected reviewed research source allow-list: %', v_actual;
  end if;

  if exists (
    select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name = 'portal_reviewed_research_source_hosts'
      and tp.grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then
    raise exception 'reviewed research source table privileges are unsafe';
  end if;

  foreach v_host in array v_expected
  loop
    if not public.portal_fact_check_ledger_release_valid(
      pg_catalog.jsonb_set(
        v_ledger,
        '{0,source_url}',
        pg_catalog.to_jsonb('https://' || v_host || '/source')
      ),
      'required',
      null
    ) then
      raise exception 'reviewed research source is blocked: %', v_host;
    end if;
  end loop;

  foreach v_url in array array[
    'https://www150.statcan.gc.ca/n1/daily-quotidien/260923/dq260923a-eng.htm',
    'https://www.topuniversities.com/world-university-rankings/methodology',
    'https://www.mcgill.ca/undergraduate-admissions/apply/english-proficiency',
    'https://llm.umontreal.ca/english/you-are/a-prospective-student-from-outside-quebec/',
    'https://uwaterloo.ca/future-students/co-op'
  ]
  loop
    if not public.portal_fact_check_ledger_release_valid(
      pg_catalog.jsonb_set(v_ledger, '{0,source_url}', pg_catalog.to_jsonb(v_url)),
      'required',
      null
    ) then
      raise exception 'reviewed research source URL is blocked: %', v_url;
    end if;
  end loop;

  foreach v_url in array array[
    'https://henleyglobal.com.evil.example/source',
    'https://evilusnews.com/source',
    'https://evilstatcan.gc.ca/source',
    'https://statcan.gc.ca.evil.example/source',
    'https://topuniversities.com.evil.example/source',
    'https://eviltopuniversities.com/source',
    'https://mcgill.ca.evil.example/source',
    'https://evilmcgill.ca/source',
    'https://umontreal.ca.evil.example/source',
    'https://evilumontreal.ca/source',
    'https://uwaterloo.ca.evil.example/source',
    'https://eviluwaterloo.ca/source',
    'https://unreviewed-university.edu/source',
    'http://uwaterloo.ca/source',
    'https://someone@mcgill.ca/source'
  ]
  loop
    if public.portal_fact_check_ledger_release_valid(
      pg_catalog.jsonb_set(v_ledger, '{0,source_url}', pg_catalog.to_jsonb(v_url)),
      'required',
      null
    ) then
      raise exception 'reviewed research source lookalike passed: %', v_url;
    end if;
  end loop;

  if pg_catalog.has_function_privilege(
       'anon','public.assert_portal_reviewed_research_sources_security()','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.assert_portal_reviewed_research_sources_security()','EXECUTE'
     ) then
    raise exception 'reviewed research source assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_portal_reviewed_research_sources_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_reviewed_research_sources_security()
  to service_role;

do $$
begin
  if exists (
    select 1 from university_source_preflight b
    join public.content_item_versions a on a.id = b.id
    where b.was_valid and not public.portal_fact_check_ledger_release_valid(
      a.fact_check_ledger, a.fact_check_scope, a.fact_check_exemption
    )
  ) then
    raise exception 'university source policy invalidated a stored ledger';
  end if;
end;
$$;

select public.assert_portal_reviewed_research_sources_security();
select public.assert_portal_security();

commit;
