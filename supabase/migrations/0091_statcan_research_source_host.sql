-- Add Statistics Canada to the reviewed original research publishers (0074).
--
-- Authorized by Anastasia on 2026-09-30 for the temporary-residents reel, which cites the
-- StatCan Daily release of 2026-09-23 (www150.statcan.gc.ca). StatCan is the original publisher
-- of Canada's population estimates, so it is primary only for its own datasets and indicators,
-- the same boundary that governs every host on this list (~/Kanset/portal-allowlists.md 1B).
-- It is deliberately NOT added to the official immigration-policy list.
--
-- The 0074 assertion pins the exact list, so it is replaced here with the new expected set and
-- a StatCan look-alike probe. The cumulative assert_portal_security() fold already calls it.

begin;

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
    raise exception '0091 requires the reviewed research source policy (0074)';
  end if;
end;
$$;

select public.assert_portal_security();

insert into public.portal_reviewed_research_source_hosts(hostname)
values ('statcan.gc.ca')
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
    'henleyglobal.com','statcan.gc.ca','transparency.org','usnews.com','who.int','worldbank.org'
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

  if not public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(
      v_ledger,
      '{0,source_url}',
      '"https://www150.statcan.gc.ca/n1/daily-quotidien/260923/dq260923a-eng.htm"'::jsonb
    ),
    'required',
    null
  ) then
    raise exception 'reviewed research source subdomain is blocked: www150.statcan.gc.ca';
  end if;

  foreach v_url in array array[
    'https://henleyglobal.com.evil.example/source',
    'https://evilusnews.com/source',
    'https://evilstatcan.gc.ca/source',
    'https://statcan.gc.ca.evil.example/source'
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

select public.assert_portal_reviewed_research_sources_security();
select public.assert_portal_security();

commit;
