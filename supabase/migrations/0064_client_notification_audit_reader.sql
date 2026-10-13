-- Narrow service-only reader for client notification audits. It joins the private activity
-- vocabulary without granting broad activity_log access to the service or any browser role.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.notification_outbox') is null
     or pg_catalog.to_regclass('public.activity_log') is null then
    raise exception '0064 requires notification volume guard and activity history';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice63_security;
revoke all on function public.assert_portal_slice63_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice63_security() to service_role;

create function public.read_client_notification_audit(
  p_client_id uuid,
  p_since timestamptz,
  p_limit int default 1000
) returns table(
  notification_id uuid,
  channel text,
  event_key text,
  source_kind text,
  source_activity_id uuid,
  activity_event_type text,
  subject text,
  status text,
  last_error text,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_client_id is null or p_since is null
     or p_since < pg_catalog.now() - interval '90 days'
     or p_since > pg_catalog.now() + interval '5 minutes'
     or p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'invalid client notification audit range';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;

  return query
  select n.id, n.channel, n.event_key, n.source_kind, n.source_activity_id,
    a.event_type, n.subject, n.status, n.last_error, n.created_at, n.completed_at
  from public.notification_outbox n
  left join public.activity_log a
    on a.id = n.source_activity_id and a.client_id = n.client_id
  where n.client_id = p_client_id
    and n.recipient_kind = 'client'
    and n.created_at >= p_since
  order by n.created_at desc, n.id desc
  limit p_limit;
end;
$$;

revoke all on function public.read_client_notification_audit(uuid,timestamptz,int)
  from public, anon, authenticated, service_role;
grant execute on function public.read_client_notification_audit(uuid,timestamptz,int)
  to service_role;

create function public.assert_portal_client_notification_audit_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.has_function_privilege('anon','public.read_client_notification_audit(uuid,timestamptz,int)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.read_client_notification_audit(uuid,timestamptz,int)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.read_client_notification_audit(uuid,timestamptz,int)','EXECUTE') then
    raise exception 'client notification audit reader grants are unsafe';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.read_client_notification_audit(uuid,timestamptz,int)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'client notification audit reader boundary is unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_client_notification_audit_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_client_notification_audit_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice63_security();
  perform public.assert_portal_client_notification_audit_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
