-- A client may submit distinct edit requests against different blocks of the same visible
-- version. One reconciliation may carry all of those requested changes in one review package.
-- Pending sibling requests at that same base version are therefore not a race. An applying or
-- prepared sibling, or any sibling from a different base version, still fails closed.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.begin_content_request_revision(uuid,uuid,integer)') is null
     or pg_catalog.to_regclass('public.content_change_requests') is null then
    raise exception '0047 requires the content-request reconciliation boundary';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice40_security;

create or replace function public.start_content_request_reconciliation(
  p_request_id uuid,p_requested_content_id text,p_canonical_object_key text,
  p_expected_base_commit text,p_actor_key text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r public.content_change_requests%rowtype; v_actor public.agency_actors%rowtype;
  v_cv public.content_item_versions%rowtype; v_job public.canonical_change_jobs%rowtype;
  v_object_key text; v_content_key text;
begin
  select * into v_r from public.content_change_requests r where r.id=p_request_id for update;
  if not found then raise exception 'content request not found'; end if;
  if not public.portal_feature_enabled(v_r.client_id,'agency_mutations')
     or not public.portal_feature_enabled(v_r.client_id,'repository_worker') then
    raise exception 'repository_reconciliation_disabled' using errcode='42501'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key required'; end if;

  -- Serialize all agency starts for one existing piece. This prevents two concurrent
  -- pending requests becoming `applying` before either one can own the revision.
  if v_r.request_type='edit' then
    if v_r.content_id is null then raise exception 'edit request has no content item'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'content-edit-start:' || v_r.client_id::text || ':' || v_r.content_id::text, 0));
  end if;

  select * into v_job from public.canonical_change_jobs j where j.request_id=v_r.id;
  if found then
    if v_job.idempotency_key<>p_idempotency_key then
      raise exception 'request already has a reconciliation job'; end if;
    return pg_catalog.to_jsonb(v_job)-'structured_patch'-'last_error';
  end if;
  if v_r.status<>'pending' then raise exception 'content request is not pending'; end if;
  if v_r.request_type='create' then
    v_content_key:=pg_catalog.lower(pg_catalog.btrim(p_requested_content_id));
    v_object_key:=pg_catalog.lower(pg_catalog.btrim(p_canonical_object_key));
    if p_requested_content_id is null or p_canonical_object_key is null or p_expected_base_commit is null
       or v_content_key !~ '^[a-z0-9][a-z0-9._-]{1,119}$'
       or v_object_key !~ '^[a-z0-9][a-z0-9._-]*\.md$'
       or pg_catalog.strpos(v_object_key,'/')>0
       or p_expected_base_commit !~ '^[0-9a-f]{40}$' then
      raise exception 'invalid canonical create mapping'; end if;
    if exists(select 1 from public.content_items ci
      where ci.client_id=v_r.client_id and ci.content_id=v_content_key) then
      raise exception 'canonical content id already exists'; end if;
    update public.content_change_requests set requested_content_id=v_content_key,updated_at=pg_catalog.now()
      where id=v_r.id;
  else
    if p_requested_content_id is not null or p_canonical_object_key is not null
       or p_expected_base_commit is not null then raise exception 'existing content mapping is server-derived'; end if;
    if exists (
      select 1 from public.content_change_requests other_request
      where other_request.client_id=v_r.client_id and other_request.content_id=v_r.content_id
        and other_request.request_type='edit' and other_request.id<>v_r.id
        and other_request.status in ('applying','prepared')
    ) then
      raise exception 'another_open_content_edit_request';
    end if;
    select cv.* into v_cv from public.content_item_versions cv
      where cv.content_item_id=v_r.content_id and cv.client_id=v_r.client_id
        and cv.version=v_r.base_version;
    if not found or v_cv.source_commit_sha is null or v_cv.source_path like 'legacy:%'
       or v_cv.source_path !~ '^[a-z0-9][a-z0-9._-]*\.md$'
       or pg_catalog.strpos(v_cv.source_path,'/')>0 then
      raise exception 'request has no safe canonical provenance'; end if;
    v_object_key:=v_cv.source_path;
    p_expected_base_commit:=v_cv.source_commit_sha;
  end if;
  insert into public.canonical_change_jobs(client_id,request_id,operation,canonical_object_key,
    expected_base_version,expected_base_commit,structured_patch,idempotency_key,created_by)
  values(v_r.client_id,v_r.id,v_r.request_type,v_object_key,v_r.base_version,
    p_expected_base_commit,v_r.payload,p_idempotency_key,v_actor.id) returning * into v_job;
  update public.content_change_requests set status='applying',updated_at=pg_catalog.now(),
    reconciled_by=v_actor.display_name where id=v_r.id;
  return pg_catalog.to_jsonb(v_job)-'structured_patch'-'last_error';
end;
$$;
revoke all on function public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.start_content_request_reconciliation(uuid,text,text,text,text,uuid) to service_role;

create or replace function public.begin_content_request_revision(
  p_request_id uuid,
  p_content_id uuid,
  p_content_version int
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.content_change_requests%rowtype;
  v_ci public.content_items%rowtype;
begin
  if p_request_id is null or p_content_id is null or p_content_version is null or p_content_version < 1 then
    raise exception 'invalid content request revision';
  end if;
  select * into v_request
  from public.content_change_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.request_type <> 'edit'
     or v_request.status <> 'applying'
     or v_request.content_id is distinct from p_content_id
     or v_request.base_version is distinct from p_content_version then
    raise exception 'content request is not eligible to begin a revision';
  end if;
  if not public.portal_feature_enabled(v_request.client_id, 'agency_mutations')
     or not public.portal_feature_enabled(v_request.client_id, 'repository_worker') then
    raise exception 'repository_reconciliation_disabled' using errcode = '42501';
  end if;
  select ci.* into v_ci
  from public.content_items ci
  where ci.id = p_content_id and ci.client_id = v_request.client_id
  for update;
  if not found then raise exception 'content item does not belong to request tenant'; end if;
  if v_ci.client_visible_version is distinct from p_content_version then
    raise exception 'stale content version';
  end if;

  -- Only untouched sibling edits to the same released version may be bundled. A second
  -- worker already applying/preparing work, or a stale sibling from another version, blocks.
  if exists (
    select 1 from public.content_change_requests r
    where r.client_id = v_request.client_id
      and r.content_id = p_content_id
      and r.request_type = 'edit'
      and r.id <> p_request_id
      and (
        r.status in ('applying', 'prepared')
        or (r.status = 'pending' and r.base_version is distinct from p_content_version)
      )
  ) then
    raise exception 'another_open_content_edit_request';
  end if;
  if v_ci.status = 'draft'
     and v_ci.review_ready_at is null
     and v_ci.revision_in_progress then
    return;
  end if;
  if v_ci.working_version is distinct from p_content_version
     or not v_ci.client_visible
     or v_ci.archived_at is not null
     or v_ci.status not in ('draft','approved') then
    raise exception 'content item is not eligible to begin a revision';
  end if;
  update public.content_items
  set status = 'draft', review_ready_at = null, revision_in_progress = true, updated_at = pg_catalog.now()
  where id = v_ci.id;
end;
$$;
revoke all on function public.begin_content_request_revision(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_content_request_revision(uuid,uuid,integer) to service_role;

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
     or v_def not ilike '%r.status in (''applying'', ''prepared'')%'
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
     or v_def not ilike '%other_request.status in (''applying'',''prepared'')%'
     or v_def not ilike '%another_open_content_edit_request%'
  then
    raise exception 'bundled edit start guard drifted';
  end if;
  if pg_catalog.has_function_privilege('anon',
       'public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)','EXECUTE') then
    raise exception 'bundled edit start grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_bundled_edit_security() from public, anon, authenticated;
grant execute on function public.assert_portal_bundled_edit_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice40_security();
  perform public.assert_portal_bundled_edit_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
