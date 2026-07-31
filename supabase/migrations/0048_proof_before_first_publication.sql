-- A visible live link is not evidence that the required production proof was completed.
-- If a piece explicitly tracks the proof gate, the first live confirmation for each
-- destination must refuse while that gate is still open. Older/imported work with no
-- proof row remains readable and reconcilable; this migration does not rewrite history.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)') is null
     or pg_catalog.to_regclass('public.content_production_gates') is null then
    raise exception '0048 requires the publication and production-gate boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice41_security;
revoke all on function public.assert_portal_slice41_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice41_security() to service_role;

do $rewrite$
declare
  v_def text;
  v_old text := $old$
  if p_provider_state = 'live' and v_ci.publication_locked_version is null
     and exists (
       select 1 from public.content_change_requests r
       where r.client_id = v_ci.client_id
         and r.content_id = v_ci.id
         and r.request_type = 'edit'
         and r.status in ('pending', 'applying', 'prepared')
     ) then
    raise exception 'unresolved client edit request';
  end if;$old$;
  v_new text := $new$
  if p_provider_state = 'live' and v_target.current_observation_id is null
     and exists (
       select 1
       from public.content_production_gates g
       where g.client_id = v_ci.client_id
         and g.content_item_id = v_ci.id
         and g.content_version = v_target.content_version
         and g.gate_key = 'proofed'
         and g.state = 'open'
     ) then
    raise exception 'proof gate is open';
  end if;
  if p_provider_state = 'live' and v_ci.publication_locked_version is null
     and exists (
       select 1 from public.content_change_requests r
       where r.client_id = v_ci.client_id
         and r.content_id = v_ci.id
         and r.request_type = 'edit'
         and r.status in ('pending', 'applying', 'prepared')
     ) then
    raise exception 'unresolved client edit request';
  end if;$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'record_publication_observation pending-edit guard drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;
revoke all on function public.record_publication_observation(
  uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_publication_observation(
  uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text
) to service_role;

create or replace function public.assert_portal_proof_before_publication_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%proof gate is open%'
     or v_def not ilike '%content_production_gates%'
     or v_def not ilike '%g.gate_key = ''proofed''%'
     or v_def not ilike '%g.state = ''open''%'
     or v_def not ilike '%v_target.current_observation_id is null%'
  then
    raise exception 'publication writer does not enforce an open proof gate';
  end if;
  if pg_catalog.has_function_privilege(
      'anon',
      'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)',
      'EXECUTE'
    ) or pg_catalog.has_function_privilege(
      'authenticated',
      'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)',
      'EXECUTE'
    ) or not pg_catalog.has_function_privilege(
      'service_role',
      'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)',
      'EXECUTE'
    ) then
    raise exception 'publication writer grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_proof_before_publication_security() from public, anon, authenticated;
grant execute on function public.assert_portal_proof_before_publication_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice41_security();
  perform public.assert_portal_proof_before_publication_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
