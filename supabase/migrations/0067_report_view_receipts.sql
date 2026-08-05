-- Keep overview report prompts visible until the signed-in client has actually opened the report.
-- Receipts are per auth user, so a preview-seat visit cannot dismiss Maria's card.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null
     or pg_catalog.to_regclass('public.client_users') is null then
    raise exception '0067 requires the existing portal access system';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice66_security;
revoke all on function public.assert_portal_slice66_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice66_security() to service_role;

create table public.portal_report_views (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  report_key text not null check (report_key ~ '^[0-9]{4}-[0-9]{2}$'),
  viewed_at timestamptz not null default pg_catalog.now(),
  primary key (auth_user_id, client_id, report_key)
);

alter table public.portal_report_views enable row level security;
create policy portal_report_views_read_own on public.portal_report_views
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    and client_id in (select public.my_client_ids())
  );

revoke all on public.portal_report_views from public, anon, authenticated;
grant select (client_id, report_key, viewed_at) on public.portal_report_views to authenticated;
grant select, insert, update, delete on public.portal_report_views to service_role;

create function public.mark_portal_report_viewed(p_client_id uuid, p_report_key text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_viewed_at timestamptz;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_report_key is null or p_report_key !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'invalid report key';
  end if;
  if not exists (
    select 1 from public.client_users cu
    where cu.auth_user_id = v_uid and cu.client_id = p_client_id
  ) then
    raise exception 'not authorized for this client';
  end if;
  if not exists (
    select 1 from public.report_snapshots r
    where r.client_id = p_client_id
      and pg_catalog.to_char(r.period_start, 'YYYY-MM') = p_report_key
      and r.schema_version >= 1
  ) then
    raise exception 'report period not found';
  end if;

  insert into public.portal_report_views (auth_user_id, client_id, report_key)
  values (v_uid, p_client_id, p_report_key)
  on conflict (auth_user_id, client_id, report_key) do nothing
  returning viewed_at into v_viewed_at;
  if v_viewed_at is null then
    select r.viewed_at into v_viewed_at
    from public.portal_report_views r
    where r.auth_user_id = v_uid
      and r.client_id = p_client_id
      and r.report_key = p_report_key;
  end if;
  return v_viewed_at;
end;
$$;

revoke all on function public.mark_portal_report_viewed(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_portal_report_viewed(uuid,text)
  to authenticated, service_role;

create function public.assert_portal_report_views_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual text[];
  v_expected text[] := array['client_id','report_key','viewed_at'];
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.portal_report_views'::pg_catalog.regclass) then
    raise exception 'portal_report_views RLS is disabled';
  end if;

  select pg_catalog.array_agg(c.column_name::text order by c.column_name)
  into v_actual
  from information_schema.column_privileges c
  where c.table_schema = 'public' and c.table_name = 'portal_report_views'
    and c.grantee = 'authenticated' and c.privilege_type = 'SELECT';
  select pg_catalog.array_agg(x order by x) into v_expected from pg_catalog.unnest(v_expected) x;
  if v_actual is distinct from v_expected then
    raise exception 'unsafe portal_report_views client columns: %', v_actual;
  end if;

  if pg_catalog.has_table_privilege('anon','public.portal_report_views','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.portal_report_views','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.portal_report_views','UPDATE')
     or pg_catalog.has_table_privilege('authenticated','public.portal_report_views','DELETE') then
    raise exception 'unsafe portal_report_views table grants';
  end if;

  if pg_catalog.has_function_privilege('anon','public.mark_portal_report_viewed(uuid,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.mark_portal_report_viewed(uuid,text)','EXECUTE')
     or not exists (
       select 1 from pg_catalog.pg_proc p
       where p.oid = 'public.mark_portal_report_viewed(uuid,text)'::pg_catalog.regprocedure
         and p.prosecdef
         and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
     ) then
    raise exception 'mark_portal_report_viewed is not safely exposed';
  end if;
end;
$$;

revoke all on function public.assert_portal_report_views_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_report_views_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice66_security();
  perform public.assert_portal_report_views_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
