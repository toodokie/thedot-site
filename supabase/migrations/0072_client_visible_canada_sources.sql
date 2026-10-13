-- Website articles carry their official IRCC citations in the same canonical body
-- that Maria reviews. Add the reviewed canada.ca root to the client-visible link
-- policy; the existing dot-boundary matcher safely covers www.canada.ca and
-- ircc.canada.ca without accepting lookalike or parent-suffix hosts.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.portal_client_link_hosts') is null
     or pg_catalog.to_regprocedure('public.portal_client_link_url_valid(text)') is null then
    raise exception '0072 requires the current client-visible link policy';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security()
  rename to assert_portal_slice71_security;
revoke all on function public.assert_portal_slice71_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_slice71_security()
  to service_role;

insert into public.portal_client_link_hosts(hostname) values ('canada.ca');

create function public.assert_portal_client_visible_canada_sources_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.portal_client_link_hosts where hostname = 'canada.ca'
  ) then
    raise exception 'canada.ca is missing from the client-visible link policy';
  end if;
  if not public.portal_client_link_url_valid(
       'https://www.canada.ca/en/immigration-refugees-citizenship.html'
     )
     or not public.portal_client_link_url_valid(
       'https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=022'
     ) then
    raise exception 'official Canada client-visible citations are blocked';
  end if;
  if public.portal_client_link_url_valid('https://evilcanada.ca/immigration')
     or public.portal_client_link_url_valid('https://canada.ca.evil.example/immigration') then
    raise exception 'Canada lookalike host passed the client-visible link policy';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.assert_portal_client_visible_canada_sources_security()', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.assert_portal_client_visible_canada_sources_security()', 'EXECUTE'
     ) then
    raise exception 'client-visible Canada source assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_portal_client_visible_canada_sources_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_client_visible_canada_sources_security()
  to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice71_security();
  perform public.assert_portal_client_visible_canada_sources_security();
end;
$$;
revoke all on function public.assert_portal_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_security()
  to service_role;

select public.assert_portal_security();

commit;
