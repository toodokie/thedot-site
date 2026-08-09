-- Keep official immigration sources separate from reviewed publishers of original rankings and
-- institutional indicators. Both lists use the same exact-host or dot-boundary matching rule.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.portal_primary_source_hosts') is null
     or pg_catalog.to_regprocedure(
       'public.portal_fact_check_ledger_release_valid(jsonb,text,text)'
     ) is null then
    raise exception '0074 requires the current fact-check source policy';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security()
  rename to assert_portal_slice73_security;
revoke all on function public.assert_portal_slice73_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_slice73_security()
  to service_role;

create table public.portal_reviewed_research_source_hosts (
  hostname text primary key,
  added_at timestamptz not null default pg_catalog.now(),
  constraint portal_reviewed_research_source_hosts_normalized check (
    hostname = pg_catalog.lower(hostname)
    and hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  )
);

insert into public.portal_reviewed_research_source_hosts(hostname) values
  ('henleyglobal.com'),
  ('transparency.org'),
  ('usnews.com'),
  ('who.int'),
  ('worldbank.org');

revoke all on public.portal_reviewed_research_source_hosts
  from public, anon, authenticated, service_role;

create or replace function public.portal_fact_check_ledger_release_valid(
  p_ledger jsonb, p_scope text, p_exemption text
) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_entry jsonb;
  v_authority text;
  v_host text;
begin
  if not public.portal_fact_check_ledger_shape_valid(p_ledger,p_scope,p_exemption) then
    return false;
  end if;
  for v_entry in select value from pg_catalog.jsonb_array_elements(p_ledger)
  loop
    if (v_entry->>'checked_at')::date > current_date then return false; end if;
    if v_entry->>'source_type' = 'primary_source'
       and pg_catalog.jsonb_typeof(v_entry->'source_url') = 'string' then
      v_authority := pg_catalog.substring(v_entry->>'source_url', '^https://([^/?#]+)');
      if v_authority is null or v_authority ~ '@' then return false; end if;
      v_host := pg_catalog.lower(pg_catalog.rtrim(
        pg_catalog.regexp_replace(v_authority, ':[0-9]+$', ''), '.'
      ));
      if not exists (
        select 1 from public.portal_primary_source_hosts h
        where v_host = h.hostname or v_host like '%.' || h.hostname
      ) and not exists (
        select 1 from public.portal_reviewed_research_source_hosts h
        where v_host = h.hostname or v_host like '%.' || h.hostname
      ) then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.portal_fact_check_ledger_release_valid(jsonb,text,text)
  from public, anon, authenticated, service_role;

create function public.assert_portal_reviewed_research_sources_security()
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
begin
  select pg_catalog.array_agg(h.hostname order by h.hostname) into v_actual
  from public.portal_reviewed_research_source_hosts h;
  v_expected := array[
    'henleyglobal.com','transparency.org','usnews.com','who.int','worldbank.org'
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

  if public.portal_fact_check_ledger_release_valid(
       pg_catalog.jsonb_set(
         v_ledger,
         '{0,source_url}',
         '"https://henleyglobal.com.evil.example/source"'::jsonb
       ),
       'required',
       null
     )
     or public.portal_fact_check_ledger_release_valid(
       pg_catalog.jsonb_set(
         v_ledger,
         '{0,source_url}',
         '"https://evilusnews.com/source"'::jsonb
       ),
       'required',
       null
     ) then
    raise exception 'reviewed research source lookalike passed';
  end if;

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

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice73_security();
  perform public.assert_portal_reviewed_research_sources_security();
end;
$$;
revoke all on function public.assert_portal_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_security()
  to service_role;

select public.assert_portal_security();

commit;
