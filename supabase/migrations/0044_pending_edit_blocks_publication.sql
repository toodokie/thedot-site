-- A client must never be locked out by a publication confirmation while their copy edit is
-- still unresolved.  Scheduling remains coordination-only; this guard applies at the only
-- transition that claims a destination is live and locks the released version.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_content_publication_authorized(uuid,uuid,integer)') is null
     or pg_catalog.to_regprocedure('public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)') is null
     or pg_catalog.to_regclass('public.content_change_requests') is null then
    raise exception '0044 requires the publication and content-request boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice37_security;
revoke all on function public.assert_portal_slice37_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice37_security() to service_role;

-- Keep the shared authorization predicate focused on approval/courtesy authority. The
-- request check belongs in the evidence writer because it applies only to the irreversible
-- first-live transition, not later evidence such as a removal or availability correction.
create or replace function public.portal_content_publication_authorized(
  p_content_id uuid,
  p_client_id uuid,
  p_content_version int
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    exists (
      select 1
      from public.approvals a
      where a.content_id = p_content_id
        and a.client_id = p_client_id
        and a.content_version = p_content_version
        and a.state = 'approved'
        and not exists (
          select 1
          from public.approvals newer
          where newer.content_id = a.content_id
            and newer.client_id = a.client_id
            and newer.content_version = a.content_version
            and (newer.created_at, newer.id) > (a.created_at, a.id)
        )
    ) or exists (
      select 1
      from public.content_courtesy_releases cr
      where cr.client_id = p_client_id
        and cr.content_id = p_content_id
        and cr.content_version = p_content_version
    )
  )
$$;
revoke all on function public.portal_content_publication_authorized(uuid,uuid,integer)
  from public, anon, authenticated, service_role;

-- Keep the operator-facing failure specific. This branch is in the only writer that can
-- create a first verified live record, so no application caller can bypass it.
do $rewrite$
declare
  v_def text;
  v_old text := $old$
  if v_ci.status not in ('approved','scheduled','posted') or v_ci.revision_in_progress
     or not public.portal_content_publication_authorized(
       v_ci.id, v_ci.client_id, v_target.content_version
     ) then raise exception 'content is not authorized for publication'; end if;$old$;
  v_new text := $new$
  if p_provider_state = 'live' and v_ci.publication_locked_version is null
     and exists (
       select 1 from public.content_change_requests r
       where r.client_id = v_ci.client_id
         and r.content_id = v_ci.id
         and r.request_type = 'edit'
         and r.status in ('pending', 'applying', 'prepared')
     ) then
    raise exception 'unresolved client edit request';
  end if;
  if v_ci.status not in ('approved','scheduled','posted') or v_ci.revision_in_progress
     or not public.portal_content_publication_authorized(
       v_ci.id, v_ci.client_id, v_target.content_version
     ) then raise exception 'content is not authorized for publication'; end if;$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'record_publication_observation authorization predicate drifted';
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

create function public.assert_portal_pending_edit_publication_security()
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
     or v_def not ilike '%content_change_requests%'
     or v_def not ilike '%unresolved client edit request%'
     or v_def not ilike '%publication_locked_version is null%'
     or v_def not ilike '%p_provider_state = ''live''%'
  then
    raise exception 'publication writer does not block an unresolved client edit before first live';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.portal_content_publication_authorized(uuid,uuid,integer)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null then
    raise exception 'publication authorization predicate is missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.portal_content_publication_authorized(uuid,uuid,integer)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'publication authorization predicate is not hardened';
  end if;
  if pg_catalog.has_function_privilege(
       'service_role', 'public.portal_content_publication_authorized(uuid,uuid,integer)', 'EXECUTE'
     ) then
    raise exception 'private publication authorization predicate is executable';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%portal_content_publication_authorized%' then
    raise exception 'publication writer bypasses authorization predicate';
  end if;
  if v_def not ilike '%unresolved client edit request%'
     or v_def not ilike '%content_change_requests%' then
    raise exception 'publication writer does not explain the unresolved edit block';
  end if;
end;
$$;
revoke all on function public.assert_portal_pending_edit_publication_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_pending_edit_publication_security() to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice37_security();
  perform public.assert_portal_pending_edit_publication_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
