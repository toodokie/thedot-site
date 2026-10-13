-- Preserve a truthful before-and-after comparison after a client edit is applied.
-- The normal released-content policy intentionally exposes only the current version,
-- so this narrow reader returns only the one historical copy block referenced by an
-- authenticated client's own change request.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_change_requests') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null then
    raise exception '0071 requires the current content-request and version history slice';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice70_security;
revoke all on function public.assert_portal_slice70_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice70_security() to service_role;

create function public.get_content_request_base_copies(p_request_ids uuid[])
returns table(request_id uuid, base_copy text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_request_ids is null
     or pg_catalog.cardinality(p_request_ids) not between 1 and 200
     or exists (select 1 from pg_catalog.unnest(p_request_ids) value where value is null) then
    raise exception 'invalid content request base-copy selection';
  end if;

  return query
  select r.id, block.value->>'body'
  from public.content_change_requests r
  join public.content_item_versions version
    on version.content_item_id = r.content_id
   and version.client_id = r.client_id
   and version.version = r.base_version
  cross join lateral pg_catalog.jsonb_array_elements(version.copy_blocks) block(value)
  where r.id = any(p_request_ids)
    and r.request_type = 'edit'
    and r.client_id in (select public.my_client_ids())
    and block.value->>'key' = r.payload->>'block_key';
end;
$$;
revoke all on function public.get_content_request_base_copies(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_content_request_base_copies(uuid[]) to authenticated;

create function public.assert_portal_content_request_base_copy_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_content_request_base_copies(uuid[])'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%security definer%'
     or v_def not ilike '%public.my_client_ids()%'
     or v_def not ilike '%content_item_versions%'
     or v_def not ilike '%r.base_version%' then
    raise exception 'content request base-copy reader is incomplete';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.get_content_request_base_copies(uuid[])'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'content request base-copy reader has an unsafe search path';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.get_content_request_base_copies(uuid[])', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.get_content_request_base_copies(uuid[])', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.get_content_request_base_copies(uuid[])', 'EXECUTE'
     ) then
    raise exception 'content request base-copy reader grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_content_request_base_copy_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_content_request_base_copy_security()
  to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice70_security();
  perform public.assert_portal_content_request_base_copy_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
