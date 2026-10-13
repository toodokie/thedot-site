-- A copy edit and a visual edit submitted in one client review bundle share a single working
-- revision. 0081 already knows this: begin_visual_request_revision refuses to create the working
-- version while a copy request is still pending, because "copy requests must start the shared
-- revision first". The copy side never learned the same fact. Its sibling guard predates 0081 and
-- treats ANY sibling in 'applying' or 'prepared' as a competing worker, so the moment the visual
-- request of the same bundle is marked prepared into that revision, the copy request that opened
-- the revision is locked out of it and cannot be reconciled by any command.
--
-- Exempt only a sibling that is already prepared INTO THIS SAME shared revision: same base
-- version, same content item, and a canonical version of exactly base + 1. A sibling that is
-- 'applying', or prepared against anything else, still blocks. The comparison is wrapped in
-- coalesce so a null canonical pointer fails closed and keeps blocking.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.begin_content_request_revision(uuid,uuid,integer)') is null
     or pg_catalog.to_regprocedure(
          'public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.assert_portal_bundled_edit_security()') is null then
    raise exception '0083 requires the bundled same-version edit request system';
  end if;
end;
$$;

select public.assert_portal_bundled_edit_security();

-- 1. The revision opener.
do $rewrite$
declare
  v_def text;
  -- Match the predicate expression only, never its surrounding indentation, so the rewrite
  -- cannot depend on how the live definition happens to be formatted.
  v_old text := $old$r.status in ('applying', 'prepared')$old$;
  v_new text := $new$(r.status = 'applying' or (r.status = 'prepared' and not coalesce(r.base_version = p_content_version and r.canonical_content_id = p_content_id and r.canonical_version = p_content_version + 1, false)))$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.begin_content_request_revision(uuid,uuid,integer)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'begin_content_request_revision sibling guard drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;

-- 2. The reconciliation starter carries the same predicate for a request moving to 'applying'.
do $rewrite$
declare
  v_def text;
  v_old text := $old$other_request.status in ('applying','prepared')$old$;
  v_new text := $new$(other_request.status='applying' or (other_request.status='prepared' and not coalesce(other_request.base_version=v_r.base_version and other_request.canonical_content_id=v_r.content_id and other_request.canonical_version=v_r.base_version+1, false)))$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'start_content_request_reconciliation sibling guard drifted';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;

revoke all on function public.begin_content_request_revision(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_content_request_revision(uuid,uuid,integer) to service_role;
revoke all on function public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)
  to service_role;

-- The inherited assertion pins the old predicate text. Re-pin it to the shared-revision shape so
-- a later cumulative fold still fails if either guard is weakened or dropped.
create or replace function public.assert_portal_bundled_edit_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.begin_content_request_revision(uuid,uuid,integer)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%security definer%'
     or v_def not ilike '%r.status = ''applying''%'
     or v_def not ilike '%r.canonical_version = p_content_version + 1%'
     or v_def not ilike '%not coalesce(%'
     or v_def not ilike '%r.base_version is distinct from p_content_version%'
     or v_def not ilike '%another_open_content_edit_request%'
     or v_def not ilike '%repository_reconciliation_disabled%'
  then
    raise exception 'bundled edit revision guard drifted';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.begin_content_request_revision(uuid,uuid,integer)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'bundled edit revision function has an unsafe search path';
  end if;
  if pg_catalog.has_function_privilege('anon',
       'public.begin_content_request_revision(uuid,uuid,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.begin_content_request_revision(uuid,uuid,integer)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.begin_content_request_revision(uuid,uuid,integer)','EXECUTE') then
    raise exception 'bundled edit revision grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%pg_advisory_xact_lock%'
     or v_def not ilike '%content-edit-start:%'
     or v_def not ilike '%other_request.status=''applying''%'
     or v_def not ilike '%other_request.canonical_version=v_r.base_version+1%'
     or v_def not ilike '%not coalesce(%'
     or v_def not ilike '%another_open_content_edit_request%'
  then
    raise exception 'reconciliation start guard drifted';
  end if;
end;
$$;
revoke all on function public.assert_portal_bundled_edit_security() from public, anon, authenticated;
grant execute on function public.assert_portal_bundled_edit_security() to service_role;

select public.assert_portal_bundled_edit_security();

commit;
