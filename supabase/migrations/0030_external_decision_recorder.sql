-- External client decisions are evidence records, not interactive portal actions.
--
-- record_external_decision already validates that the named contact belongs to the
-- tenant, installs that contact's authenticated identity transaction-locally, and
-- records the email/call provenance. It must call the hardened decision core directly:
-- requiring the contact to hold the current can_decide capability forced an audited
-- capability-transfer sandwich merely to record an older real-world approval.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure(
       'public.record_external_decision(uuid,uuid,integer,uuid,text,text,text,timestamp with time zone,text,text)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.portal_core_record_content_decision(uuid,integer,text,text)'
     ) is null then
    raise exception '0029/access-control objects must exist before applying 0030';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice24_security;
revoke all on function public.assert_portal_slice24_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice24_security() to service_role;

do $$
declare
  v_def text;
  v_next text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_external_decision(uuid,uuid,integer,uuid,text,text,text,timestamp with time zone,text,text)'::regprocedure
  ) into v_def;
  if v_def is null
     or v_def ilike '%portal_core_record_content_decision%'
     or v_def not ilike '%public.record_content_decision(%' then
    raise exception 'record_external_decision body does not match the reviewed predecessor';
  end if;
  v_next := pg_catalog.replace(
    v_def,
    'public.record_content_decision(',
    'public.portal_core_record_content_decision('
  );
  if v_next = v_def then
    raise exception 'record_external_decision capability-wrapper call was not replaced';
  end if;
  execute v_next;
end;
$$;

revoke all on function public.record_external_decision(
  uuid,uuid,integer,uuid,text,text,text,timestamptz,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_external_decision(
  uuid,uuid,integer,uuid,text,text,text,timestamptz,text,text
) to service_role;

create or replace function public.assert_portal_external_decision_recorder()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_external_decision(uuid,uuid,integer,uuid,text,text,text,timestamp with time zone,text,text)'::regprocedure
  ) into v_def;
  if v_def not ilike '%portal_core_record_content_decision%'
     or v_def ilike '%v_approval := public.record_content_decision(%' then
    raise exception 'external decisions still depend on the interactive capability wrapper';
  end if;
  if v_def not ilike '%client_users%'
     or v_def not ilike '%contact is not a member of this client%'
     or v_def not ilike '%request.jwt.claims%'
     or v_def not ilike '%source_occurred_at%' then
    raise exception 'external decision tenant/provenance guards are missing';
  end if;
  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.record_external_decision(uuid,uuid,integer,uuid,text,text,text,timestamp with time zone,text,text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.record_external_decision(uuid,uuid,integer,uuid,text,text,text,timestamp with time zone,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'public.portal_core_record_content_decision(uuid,integer,text,text)',
       'EXECUTE'
     ) then
    raise exception 'external decision recorder grants are unsafe';
  end if;
end;
$$;

revoke all on function public.assert_portal_external_decision_recorder()
  from public, anon, authenticated;
grant execute on function public.assert_portal_external_decision_recorder() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice24_security();
  perform public.assert_portal_external_decision_recorder();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
