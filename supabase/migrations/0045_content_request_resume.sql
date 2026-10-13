-- A checked canonical commit can survive a local process interruption. Preserve that work as an
-- explicit, service-only recovery, rather than falsely closing the client's request as conflicted.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.begin_content_request_revision(uuid,uuid,integer)') is null
     or pg_catalog.to_regclass('public.content_change_requests') is null
     or pg_catalog.to_regclass('public.canonical_change_jobs') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null then
    raise exception '0045 requires the content-request reconciliation boundary';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice38_security;
revoke all on function public.assert_portal_slice38_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice38_security() to service_role;

insert into public.activity_event_types(event_type) values ('request_reopened')
on conflict (event_type) do nothing;

create function public.resume_content_request_reconciliation(
  p_request_id uuid,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.content_change_requests%rowtype;
  v_job public.canonical_change_jobs%rowtype;
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_title text;
begin
  if p_request_id is null or p_actor_key is null or p_idempotency_key is null then
    raise exception 'invalid reconciliation resume';
  end if;

  select * into v_request
  from public.content_change_requests r
  where r.id = p_request_id
  for update;
  if not found then raise exception 'content request not found'; end if;

  select * into v_job
  from public.canonical_change_jobs j
  where j.request_id = v_request.id
  for update;
  if not found then raise exception 'reconciliation job not found'; end if;

  select * into v_actor
  from public.agency_actors a
  where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;

  if not public.portal_feature_enabled(v_request.client_id, 'agency_mutations')
     or not public.portal_feature_enabled(v_request.client_id, 'repository_worker') then
    raise exception 'repository_reconciliation_disabled' using errcode = '42501';
  end if;

  if v_request.status = 'applying' and v_job.status in ('pending', 'processing', 'committed') then
    return pg_catalog.jsonb_build_object(
      'request_id', v_request.id,
      'status', 'applying',
      'outcome', 'unchanged'
    );
  end if;

  if v_request.request_type <> 'edit'
     or v_request.status <> 'conflicted'
     or v_job.status <> 'conflicted'
     or v_request.content_id is null
     or v_request.base_version is null then
    raise exception 'content request is not eligible to resume';
  end if;

  select * into v_item
  from public.content_items ci
  where ci.id = v_request.content_id and ci.client_id = v_request.client_id
  for update;
  if not found
     or v_item.client_visible_version is distinct from v_request.base_version
     or v_item.working_version is distinct from v_request.base_version
     or v_item.revision_in_progress
     or not v_item.client_visible
     or v_item.archived_at is not null
     or v_item.status not in ('draft', 'approved') then
    raise exception 'content request is no longer safe to resume';
  end if;

  if exists (
    select 1
    from public.content_change_requests other_request
    where other_request.client_id = v_request.client_id
      and other_request.content_id = v_request.content_id
      and other_request.request_type = 'edit'
      and other_request.id <> v_request.id
      and other_request.status in ('pending', 'applying', 'prepared')
  ) then
    raise exception 'another_open_content_edit_request';
  end if;

  update public.canonical_change_jobs
  set status = 'pending',
      last_error = null,
      next_attempt_at = null,
      locked_at = null,
      locked_by = null,
      updated_at = pg_catalog.now()
  where id = v_job.id;

  update public.content_change_requests
  set status = 'applying',
      canonical_content_id = null,
      canonical_version = null,
      reconciled_at = null,
      reconciled_by = v_actor.display_name,
      resolution_note = 'Reconciliation resumed after a local tool interruption. Canonical and snapshot checks still apply.',
      updated_at = pg_catalog.now()
  where id = v_request.id;

  select cv.title into v_title
  from public.content_item_versions cv
  where cv.content_item_id = v_item.id
    and cv.client_id = v_item.client_id
    and cv.version = v_request.base_version;

  insert into public.activity_log(
    client_id, content_id, content_version, event_type, event_key,
    title, summary, actor_type, actor_name
  ) values (
    v_request.client_id, v_item.id, v_request.base_version,
    'request_reopened', 'content-request-reopened:' || v_request.id::text,
    'Request reconciliation resumed: ' || coalesce(v_title, 'content item'),
    'The Dot resumed a checked canonical reconciliation after a local tool interruption.',
    'anastasia', v_actor.display_name
  );

  insert into public.portal_inbox_events(
    client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation
  ) values (
    v_request.client_id, 'content-request-reopened:' || v_request.id::text,
    'request_reopened', 'content_change_request', v_request.id,
    'anastasia', v_actor.display_name,
    pg_catalog.jsonb_build_object('request_id', v_request.id), false
  );

  return pg_catalog.jsonb_build_object(
    'request_id', v_request.id,
    'status', 'applying',
    'outcome', 'resumed'
  );
end;
$$;
revoke all on function public.resume_content_request_reconciliation(uuid,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resume_content_request_reconciliation(uuid,text,uuid) to service_role;

create function public.assert_portal_content_request_resume_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.resume_content_request_reconciliation(uuid,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%v_request.status <> ''conflicted''%'
     or v_def not ilike '%v_job.status <> ''conflicted''%'
     or v_def not ilike '%another_open_content_edit_request%'
     or v_def not ilike '%repository_reconciliation_disabled%'
  then
    raise exception 'content-request resume guard drifted';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.resume_content_request_reconciliation(uuid,text,uuid)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'content-request resume function is not hardened';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.resume_content_request_reconciliation(uuid,text,uuid)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.resume_content_request_reconciliation(uuid,text,uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.resume_content_request_reconciliation(uuid,text,uuid)', 'EXECUTE'
     ) then
    raise exception 'unsafe content-request resume function privilege';
  end if;
end;
$$;
revoke all on function public.assert_portal_content_request_resume_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_content_request_resume_security() to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice38_security();
  perform public.assert_portal_content_request_resume_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
