-- Anastasia approved this exact original interview as evidence for minister attribution,
-- October 17, 2026. No news domain is approved; policy claims still need official sources.
begin;
set local lock_timeout = '5s';
select public.assert_portal_security();

-- Preserve the validity of every stored version, including unreleased and historical copies.
create temporary table interview_source_preflight on commit drop as
select id, public.portal_fact_check_ledger_release_valid(
  fact_check_ledger, fact_check_scope, fact_check_exemption
) as was_valid from public.content_item_versions;

create function public.portal_reviewed_original_interview_url_valid(p_url text)
returns boolean
language sql immutable strict set search_path = ''
as $$
  select p_url = 'https://www.ctvnews.ca/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/';
$$;
revoke all on function public.portal_reviewed_original_interview_url_valid(text)
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
      ) and not public.portal_reviewed_original_interview_url_valid(v_entry->>'source_url')
      then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.portal_fact_check_ledger_release_valid(jsonb,text,text)
  from public, anon, authenticated, service_role;

create function public.assert_portal_original_interview_security()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_role text;
  v_fn text;
  v_ledger jsonb := '[{
    "claim_key":"minister-reported-levels-signal",
    "claim":"The minister signalled that targets could rise; no new targets are asserted.",
    "status":"confirmed",
    "source_type":"primary_source",
    "source_url":"https://www.ctvnews.ca/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/",
    "source_title":"CTV original minister interview, attribution only",
    "checked_at":"2026-10-17",
    "checked_by_role":"agency_fact_checker"
  }]'::jsonb;
begin
  if exists (
    select 1 from public.portal_primary_source_hosts where hostname = 'ctvnews.ca'
  ) or exists (
    select 1 from public.portal_reviewed_research_source_hosts where hostname = 'ctvnews.ca'
  ) then raise exception 'the interview must not approve a news domain'; end if;

  if not public.portal_fact_check_ledger_release_valid(v_ledger, 'required', null) then
    raise exception 'the exact original minister interview is blocked';
  end if;

  foreach v_url in array array[
    'https://www.ctvnews.ca/politics/article/another-story/',
    'https://www.ctvnews.ca/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/?redirect=https://example.com',
    'https://www.ctvnews.ca/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/#changed',
    'https://www.ctvnews.ca.evil.com/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/',
    'http://www.ctvnews.ca/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/',
    'https://someone@www.ctvnews.ca/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/',
    'https://WWW.CTVNEWS.CA/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/',
    'https://www.ctvnews.ca:443/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/',
    'https://www.ctvnews.ca/discard/../politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/',
    ' https://www.ctvnews.ca/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/',
    E'https://www.ctvnews.ca/politics/article/immigration-minister-says-immigration-levels-will-be-going-up-heres-what-that-means/\n'
  ] loop
    if public.portal_fact_check_ledger_release_valid(
      pg_catalog.jsonb_set(v_ledger, '{0,source_url}', pg_catalog.to_jsonb(v_url)),
      'required', null
    ) then raise exception 'unreviewed interview URL passed: %', v_url; end if;
  end loop;

  if public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(v_ledger, '{0,source_title}', 'null'::jsonb), 'required', null
  ) or public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(v_ledger, '{0,checked_at}', pg_catalog.to_jsonb((current_date + 1)::text)),
    'required', null
  ) then raise exception 'interview exception bypassed ledger quality'; end if;

  -- Piece confirmation is enforced by the piece wrapper, not the source-url helper.
  if public.portal_piece_fact_check_release_valid('needs-confirm', 'required', null, v_ledger) then
    raise exception 'unconfirmed piece passed the release wrapper';
  end if;

  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_fn in array array[
      'public.portal_reviewed_original_interview_url_valid(text)',
      'public.portal_fact_check_ledger_release_valid(jsonb,text,text)'
    ] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'internal fact-check helper exposed to %: %', v_role, v_fn;
      end if;
    end loop;
  end loop;
  if pg_catalog.has_function_privilege('anon', 'public.assert_portal_original_interview_security()', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.assert_portal_original_interview_security()', 'EXECUTE')
  then raise exception 'original interview assertion is exposed'; end if;
end;
$$;
revoke all on function public.assert_portal_original_interview_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_original_interview_security() to service_role;

alter function public.assert_portal_security()
  rename to assert_portal_pre_original_interview_security;
revoke all on function public.assert_portal_pre_original_interview_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_pre_original_interview_security() to service_role;

create function public.assert_portal_security()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.assert_portal_pre_original_interview_security();
  perform public.assert_portal_original_interview_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

-- This migration admits one source but never invalidates any previously valid version.
do $$
begin
  if exists (
    select 1 from pg_temp.interview_source_preflight before
    join public.content_item_versions after on after.id = before.id
    where before.was_valid and not public.portal_fact_check_ledger_release_valid(
      after.fact_check_ledger, after.fact_check_scope, after.fact_check_exemption
    )
  ) then raise exception 'original interview policy invalidated a stored version'; end if;
end;
$$;
select public.assert_portal_security();
commit;
