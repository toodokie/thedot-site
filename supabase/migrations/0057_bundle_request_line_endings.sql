-- Portal textareas submit CRLF on some browsers while canonical Markdown stores LF.
-- Normalize those control characters explicitly before comparing an audited request bundle.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0057 requires bundled content request reconciliation';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice56_security;
revoke all on function public.assert_portal_slice56_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice56_security() to service_role;

create or replace function public.mark_content_request_bundle_prepared(
  p_request_ids uuid[], p_commit_sha text, p_actor_key text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_ids uuid[];
  v_lead public.content_change_requests%rowtype;
  v_lead_job public.canonical_change_jobs%rowtype;
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_base public.content_item_versions%rowtype;
  v_working public.content_item_versions%rowtype;
  v_request public.content_change_requests%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_base_body text;
  v_working_body text;
  v_fingerprint text;
  v_result jsonb;
  v_count int;
begin
  select pg_catalog.array_agg(id order by id) into v_ids
  from (select distinct id from pg_catalog.unnest(p_request_ids) id where id is not null) ids;
  if coalesce(pg_catalog.array_length(v_ids, 1), 0) < 2
     or p_commit_sha !~ '^[0-9a-f]{40}$'
     or p_idempotency_key is null then
    raise exception 'invalid content request bundle';
  end if;

  select pg_catalog.count(*) into v_count
  from public.content_change_requests r
  where r.id = any(v_ids) and r.status = 'applying';
  if v_count <> 1 then raise exception 'bundle must have exactly one applying lead request'; end if;

  select * into v_lead
  from public.content_change_requests r
  where r.id = any(v_ids) and r.status = 'applying'
  for update;
  if not found then raise exception 'bundle has no applying lead request'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_lead.client_id, 'agency_mutations')
     or not public.portal_feature_enabled(v_lead.client_id, 'repository_worker') then
    raise exception 'repository_reconciliation_disabled' using errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'content-edit-bundle:' || v_lead.client_id::text || ':' || v_lead.content_id::text, 0));
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('request_ids', v_ids, 'commit_sha', p_commit_sha,
      'actor', p_actor_key)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts r
  where r.client_id = v_lead.client_id and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'mark_content_request_bundle_prepared'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  select * into v_item from public.content_items ci
  where ci.id = v_lead.content_id and ci.client_id = v_lead.client_id
  for update;
  if not found then raise exception 'bundle content item is unavailable'; end if;
  select * into v_base from public.content_item_versions cv
  where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
    and cv.version = v_lead.base_version;
  if not found then raise exception 'bundle base version is unavailable'; end if;
  select * into v_working from public.content_item_versions cv
  where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
    and cv.version = v_item.working_version;
  if not found or v_item.client_visible_version is distinct from v_lead.base_version
     or not v_item.revision_in_progress
     or v_item.working_version <> v_lead.base_version + 1
     or v_working.source_commit_sha is distinct from p_commit_sha
     or v_working.source_path is distinct from v_base.source_path then
    raise exception 'bundle snapshot does not match the requested revision';
  end if;

  select * into v_lead_job from public.canonical_change_jobs j
  where j.request_id = v_lead.id
  for update;
  if not found or v_lead_job.status not in ('pending','processing','committed')
     or v_lead_job.canonical_object_key is distinct from v_base.source_path
     or v_lead_job.expected_base_commit is distinct from v_base.source_commit_sha then
    raise exception 'bundle lead reconciliation job is invalid';
  end if;

  select pg_catalog.count(*) into v_count
  from public.content_change_requests r
  where r.id = any(v_ids)
    and r.client_id = v_lead.client_id
    and r.content_id = v_item.id
    and r.request_type = 'edit'
    and r.base_version = v_lead.base_version
    and (r.id = v_lead.id or r.status = 'pending');
  if v_count <> pg_catalog.array_length(v_ids, 1) then
    raise exception 'bundle requests must be pending sibling edits of the same version';
  end if;

  for v_request in select * from public.content_change_requests r where r.id = any(v_ids) order by r.id for update loop
    select block.value->>'body' into v_base_body
    from pg_catalog.jsonb_array_elements(v_base.copy_blocks) block(value)
    where block.value->>'key' = v_request.payload->>'block_key';
    select block.value->>'body' into v_working_body
    from pg_catalog.jsonb_array_elements(v_working.copy_blocks) block(value)
    where block.value->>'key' = v_request.payload->>'block_key';
    if v_base_body is null or v_working_body is null
       or pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_base_body, 'UTF8'), 'sha256'), 'hex')
          is distinct from v_request.payload->>'original_checksum'
       or pg_catalog.btrim(pg_catalog.replace(pg_catalog.replace(v_working_body, E'\r\n', E'\n'), E'\r', E'\n'))
          is distinct from pg_catalog.btrim(pg_catalog.replace(pg_catalog.replace(
            v_request.payload->>'proposed_text', E'\r\n', E'\n'), E'\r', E'\n')) then
      raise exception 'bundle request does not exactly match the synced copy';
    end if;
  end loop;

  update public.canonical_change_jobs set status='synced', commit_sha=p_commit_sha,
    committed_at=coalesce(committed_at,pg_catalog.now()), synced_at=pg_catalog.now(),
    locked_at=coalesce(locked_at,pg_catalog.now()), locked_by=coalesce(locked_by,v_actor.actor_key),
    updated_at=pg_catalog.now() where id=v_lead_job.id;

  for v_request in select * from public.content_change_requests r where r.id = any(v_ids) order by r.id for update loop
    if v_request.id <> v_lead.id then
      insert into public.canonical_change_jobs(client_id,request_id,operation,canonical_object_key,
        expected_base_version,expected_base_commit,structured_patch,status,locked_at,locked_by,
        commit_sha,committed_at,synced_at,idempotency_key,created_by)
      values(v_request.client_id,v_request.id,'edit',v_base.source_path,v_request.base_version,
        v_base.source_commit_sha,v_request.payload,'synced',pg_catalog.now(),v_actor.actor_key,
        p_commit_sha,pg_catalog.now(),pg_catalog.now(),gen_random_uuid(),v_actor.id);
    end if;
    update public.content_change_requests set status='prepared',canonical_content_id=v_item.id,
      canonical_version=v_working.version,reconciled_at=pg_catalog.now(),reconciled_by=v_actor.display_name,
      resolution_note='Canonical draft prepared with the related client edits; awaiting release review.',
      updated_at=pg_catalog.now() where id=v_request.id;
    insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,title,summary,actor_type,actor_name)
      values(v_request.client_id,v_item.id,v_working.version,'request_prepared',
        'content-request-prepared:'||v_request.id::text,'Request in progress: '||v_working.title,
        'The Dot prepared a new version. It remains in review before client release.','anastasia',v_actor.display_name);
    insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,actor_type,actor_name,payload,requires_reconciliation)
      values(v_request.client_id,'content-request-prepared:'||v_request.id::text,'request_prepared',
        'content_change_request',v_request.id,'anastasia',v_actor.display_name,
        pg_catalog.jsonb_build_object('canonical_version',v_working.version),false);
  end loop;
  v_result := pg_catalog.jsonb_build_object('request_ids',v_ids,'status','prepared',
    'content_id',v_item.id,'version',v_working.version,'outcome','updated');
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,request_fingerprint,response)
    values(v_lead.client_id,'mark_content_request_bundle_prepared',p_idempotency_key::text,v_fingerprint,v_result);
  return v_result;
end;
$$;
revoke all on function public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_content_request_bundle_prepared(uuid[],text,text,uuid) to service_role;

create function public.assert_portal_bundle_line_endings_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%pg_catalog.replace(pg_catalog.replace%'
     or v_def ilike '%regexp_replace(v_working_body%' then
    raise exception 'content request bundle line-ending normalization drifted';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p
    where p.oid='public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
      and p.prosecdef and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']) then
    raise exception 'content request bundle writer has an unsafe search path';
  end if;
  if pg_catalog.has_function_privilege('anon','public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)','EXECUTE') then
    raise exception 'content request bundle writer grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_bundle_line_endings_security() from public, anon, authenticated;
grant execute on function public.assert_portal_bundle_line_endings_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice56_security();
  perform public.assert_portal_bundle_line_endings_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
