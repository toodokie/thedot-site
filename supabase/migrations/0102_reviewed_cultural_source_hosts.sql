-- Reviewed cultural and agricultural publishers for the Kanset Thanksgiving explainer.
-- These hosts support only their own historical, horticultural, or festival claims. They do
-- not replace government sources for immigration law, eligibility, policy, or program claims.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_fact_check_ledger_release_valid(jsonb,text,text)') is null
     or pg_catalog.to_regclass('public.portal_reviewed_research_source_hosts') is null then
    raise exception '0102 requires the current reviewed-source policy';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security()
  rename to assert_portal_slice101_security;
revoke all on function public.assert_portal_slice101_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_slice101_security()
  to service_role;

create table public.portal_reviewed_cultural_source_hosts (
  hostname text primary key,
  added_at timestamptz not null default pg_catalog.now(),
  constraint portal_reviewed_cultural_source_hosts_normalized check (
    hostname = pg_catalog.lower(hostname)
    and hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
  )
);
alter table public.portal_reviewed_cultural_source_hosts enable row level security;
insert into public.portal_reviewed_cultural_source_hosts(hostname) values
  ('canadashistory.ca'),
  ('extension.umn.edu'),
  ('oktoberfest.ca');
revoke all on public.portal_reviewed_cultural_source_hosts
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
      ) and not exists (
        select 1 from public.portal_reviewed_cultural_source_hosts h
        where v_host = h.hostname or v_host like '%.' || h.hostname
      ) then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.portal_fact_check_ledger_release_valid(jsonb,text,text)
  from public, anon, authenticated, service_role;

create function public.assert_portal_reviewed_cultural_sources_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual text[];
  v_expected text[] := array['canadashistory.ca','extension.umn.edu','oktoberfest.ca'];
  v_ledger jsonb := '[{
    "claim_key":"cultural-source",
    "claim":"The original publisher documents this cultural fact.",
    "status":"confirmed",
    "source_type":"primary_source",
    "source_url":"https://canadashistory.ca/explore/thanksgiving",
    "source_title":"Original publisher",
    "checked_at":"2026-10-12",
    "checked_by_role":"agency_fact_checker"
  }]'::jsonb;
  v_host text;
  v_url text;
begin
  select pg_catalog.array_agg(h.hostname order by h.hostname) into v_actual
  from public.portal_reviewed_cultural_source_hosts h;
  if v_actual is distinct from v_expected then
    raise exception 'unexpected reviewed cultural source allow-list: %', v_actual;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'public.portal_reviewed_cultural_source_hosts'::pg_catalog.regclass
      and c.relrowsecurity
  ) or exists (
    select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name = 'portal_reviewed_cultural_source_hosts'
      and tp.grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then
    raise exception 'reviewed cultural source table access is unsafe';
  end if;

  foreach v_host in array v_expected
  loop
    if not public.portal_fact_check_ledger_release_valid(
      pg_catalog.jsonb_set(v_ledger,'{0,source_url}',pg_catalog.to_jsonb('https://' || v_host || '/source')),
      'required',null
    ) then
      raise exception 'reviewed cultural source is blocked: %', v_host;
    end if;
  end loop;

  if not public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(v_ledger,'{0,source_url}',
      '"https://blog-fruit-vegetable-ipm.extension.umn.edu/2021/09/pumpkins.html"'::jsonb),
    'required',null
  ) then
    raise exception 'reviewed cultural source subdomain is blocked';
  end if;

  foreach v_url in array array[
    'https://evilcanadashistory.ca/source',
    'https://canadashistory.ca.evil.example/source',
    'https://evilextension.umn.edu/source',
    'https://extension.umn.edu.evil.example/source',
    'https://eviloktoberfest.ca/source',
    'https://oktoberfest.ca.evil.example/source'
  ]
  loop
    if public.portal_fact_check_ledger_release_valid(
      pg_catalog.jsonb_set(v_ledger,'{0,source_url}',pg_catalog.to_jsonb(v_url)),
      'required',null
    ) then
      raise exception 'reviewed cultural source lookalike passed: %', v_url;
    end if;
  end loop;

  if pg_catalog.has_function_privilege(
       'anon','public.assert_portal_reviewed_cultural_sources_security()','EXECUTE'
     ) or pg_catalog.has_function_privilege(
       'authenticated','public.assert_portal_reviewed_cultural_sources_security()','EXECUTE'
     ) then
    raise exception 'reviewed cultural source assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_portal_reviewed_cultural_sources_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_reviewed_cultural_sources_security()
  to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice101_security();
  perform public.assert_portal_reviewed_cultural_sources_security();
end;
$$;
revoke all on function public.assert_portal_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_security()
  to service_role;

select public.assert_portal_security();

commit;
