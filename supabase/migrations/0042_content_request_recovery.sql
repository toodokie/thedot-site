-- Close a stale portal edit request only by explicitly binding it to a later, already released
-- version. This is a recovery path for an historic bypass, not an alternate copy writer.
-- It cannot modify canonical content, approvals, schedules, or publication evidence.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_change_requests') is null
     or pg_catalog.to_regclass('public.content_items') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null then
    raise exception '0042 requires the request, release, receipt, and activity boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice35_security;
revoke all on function public.assert_portal_slice35_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice35_security() to service_role;

insert into public.activity_event_types(event_type) values ('request_superseded')
on conflict (event_type) do nothing;

-- This writer deliberately accepts only a pending request and its own piece's CURRENT client-visible
-- version. The caller must supply a client-safe explanation. It therefore records a truthful outcome
-- after an earlier out-of-band re-share without pretending the original proposal was applied verbatim.
create function public.supersede_content_request_with_released_version(
  p_request_id uuid,
  p_content_id uuid,
  p_content_version int,
  p_note text,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.content_change_requests%rowtype;
  v_item public.content_items%rowtype;
  v_actor public.agency_actors%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_note text := pg_catalog.btrim(p_note);
  v_title text;
  v_fingerprint text;
  v_response jsonb;
begin
  if p_request_id is null or p_content_id is null or p_content_version is null or p_content_version < 1
     or p_idempotency_key is null or v_note is null
     or pg_catalog.char_length(v_note) not between 3 and 2000
     or not public.portal_client_summary_shape_valid(v_note) then
    raise exception 'invalid request supersession';
  end if;

  select * into v_request from public.content_change_requests r where r.id = p_request_id for update;
  if not found then raise exception 'content request not found'; end if;
  if v_request.request_type <> 'edit' or v_request.content_id is distinct from p_content_id then
    raise exception 'request does not belong to the supplied content item';
  end if;
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_request.client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'request_id', p_request_id, 'content_id', p_content_id, 'content_version', p_content_version,
      'note', v_note, 'actor', p_actor_key
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supersede-content-request:' || v_request.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_receipt from public.portal_command_receipts r
    where r.client_id = v_request.client_id and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'supersede_content_request_with_released_version'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  select * into v_item from public.content_items i
    where i.id = p_content_id and i.client_id = v_request.client_id
    for update;
  if not found then raise exception 'content item does not belong to request tenant'; end if;
  if v_item.client_visible_version is distinct from p_content_version then
    raise exception 'replacement version is not the current client-visible version';
  end if;
  if v_request.status = 'superseded'
     and v_request.canonical_content_id = p_content_id
     and v_request.canonical_version = p_content_version
     and v_request.resolution_note = v_note then
    return pg_catalog.jsonb_build_object(
      'request_id', v_request.id, 'status', 'superseded', 'outcome', 'unchanged',
      'content_id', p_content_id, 'content_version', p_content_version
    );
  end if;
  if v_request.status <> 'pending' then
    raise exception 'only a pending request can be superseded';
  end if;

  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = p_content_id and cv.client_id = v_request.client_id
      and cv.version = p_content_version;
  if v_title is null then raise exception 'replacement content version not found'; end if;

  update public.content_change_requests
  set status = 'superseded', canonical_content_id = p_content_id, canonical_version = p_content_version,
      resolution_note = v_note, reconciled_at = pg_catalog.now(), reconciled_by = v_actor.display_name,
      updated_at = pg_catalog.now()
  where id = v_request.id;

  insert into public.activity_log(
    client_id, content_id, content_version, event_type, event_key, title, summary, actor_type, actor_name
  ) values (
    v_request.client_id, p_content_id, p_content_version, 'request_superseded',
    'content-request-superseded:' || v_request.id::text,
    'Request updated: ' || v_title, v_note, 'anastasia', v_actor.display_name
  );
  insert into public.portal_inbox_events(
    client_id, event_key, event_type, object_type, object_id, actor_type, actor_name, payload,
    requires_reconciliation
  ) values (
    v_request.client_id, 'content-request-superseded:' || v_request.id::text,
    'request_superseded', 'content_change_request', v_request.id, 'anastasia', v_actor.display_name,
    pg_catalog.jsonb_build_object('content_id', p_content_id, 'content_version', p_content_version), false
  );
  v_response := pg_catalog.jsonb_build_object(
    'request_id', v_request.id, 'status', 'superseded', 'outcome', 'updated',
    'content_id', p_content_id, 'content_version', p_content_version
  );
  insert into public.portal_command_receipts(
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_request.client_id, 'supersede_content_request_with_released_version', p_idempotency_key::text,
    v_fingerprint, v_response
  );
  return v_response;
end;
$$;

revoke all on function public.supersede_content_request_with_released_version(uuid,uuid,int,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.supersede_content_request_with_released_version(uuid,uuid,int,text,text,uuid)
  to service_role;

-- The generic agency re-share path and the portal edit-request path share this item lock.  A client
-- request that wins first leaves a pending request and prevents begin_content_revision.  If the
-- agency revision wins first, a new client edit is refused rather than being stranded behind an
-- unrelated version bump.  The request-specific writer below is the only path permitted to open
-- a revision for an `applying` request.
create or replace function public.begin_content_revision(
  p_content_id uuid, p_content_version int
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ci public.content_items%rowtype;
begin
  select ci.* into v_ci
  from public.content_items ci
  where ci.id = p_content_id
  for update;
  if not found then raise exception 'content item not found'; end if;

  if v_ci.client_visible_version is distinct from p_content_version then
    raise exception 'stale content version';
  end if;
  if exists (
    select 1 from public.content_change_requests r
    where r.client_id = v_ci.client_id
      and r.content_id = v_ci.id
      and r.request_type = 'edit'
      and r.status in ('pending', 'applying', 'prepared')
  ) then
    raise exception 'open_content_edit_request';
  end if;

  if v_ci.status = 'draft'
     and v_ci.review_ready_at is null
     and v_ci.revision_in_progress then
    return;
  end if;
  if v_ci.working_version is distinct from p_content_version then
    raise exception 'stale content version';
  end if;
  if not v_ci.client_visible
     or v_ci.archived_at is not null
     or v_ci.status not in ('draft','approved') then
    raise exception 'content item is not eligible to begin a revision';
  end if;

  update public.content_items
  set status = 'draft',
      review_ready_at = null,
      revision_in_progress = true,
      updated_at = pg_catalog.now()
  where id = v_ci.id;
end;
$$;

-- This is deliberately separate from begin_content_revision. Generic agency re-shares must stop
-- for every open client edit. The reconciler has the request id and can prove that its `applying`
-- request owns this revision. A second unresolved edit on the same piece still blocks it.
create function public.begin_content_request_revision(
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
  if exists (
    select 1 from public.content_change_requests r
    where r.client_id = v_request.client_id
      and r.content_id = p_content_id
      and r.request_type = 'edit'
      and r.id <> p_request_id
      and r.status in ('pending', 'applying', 'prepared')
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
revoke all on function public.begin_content_request_revision(uuid,uuid,int)
  from public, anon, authenticated, service_role;
grant execute on function public.begin_content_request_revision(uuid,uuid,int) to service_role;

-- Preserve retries for an already-created request, but reject a fresh client edit while an agency
-- revision is open.  The row lock above gives this check the same serialization point as begin.
create or replace function public.request_content_edit(
  p_content_id uuid,p_content_version int,p_block_key text,p_proposed_text text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_ci public.content_items%rowtype;
  v_actor text; v_original text; v_payload jsonb; v_fingerprint text;
  v_existing public.content_change_requests%rowtype; v_id uuid; v_title text;
begin
  if v_uid is null or p_idempotency_key is null or p_block_key is null or p_proposed_text is null
     or p_block_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or pg_catalog.char_length(pg_catalog.btrim(p_proposed_text)) not between 1 and 8000 then
    raise exception 'invalid edit request';
  end if;
  select ci.* into v_ci from public.content_items ci where ci.id=p_content_id for update;
  if not found then raise exception 'portal_action_not_allowed' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_ci.client_id,'can_submit_requests');
  if not v_ci.client_visible or v_ci.client_visible_version is distinct from p_content_version
     or v_ci.archived_at is not null then raise exception 'stale_or_unavailable_content'; end if;
  select e.value->>'body',cv.title into v_original,v_title
  from public.content_item_versions cv
  cross join lateral pg_catalog.jsonb_array_elements(cv.copy_blocks) e(value)
  where cv.content_item_id=v_ci.id and cv.client_id=v_ci.client_id
    and cv.version=p_content_version and e.value->>'key'=p_block_key;
  if not found then raise exception 'copy_block_not_found'; end if;
  if pg_catalog.btrim(v_original)=pg_catalog.btrim(p_proposed_text) then
    raise exception 'proposed copy is unchanged'; end if;
  select coalesce(nullif(pg_catalog.btrim(cu.name),''),'Client') into v_actor
    from public.client_users cu where cu.client_id=v_ci.client_id and cu.auth_user_id=v_uid;
  v_payload:=pg_catalog.jsonb_build_object('block_key',p_block_key,
    'original_checksum',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_original,'UTF8'),'sha256'),'hex'),
    'proposed_text',pg_catalog.btrim(p_proposed_text));
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('content_id',p_content_id,'version',p_content_version,'payload',v_payload)::text,
    'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_ci.client_id::text||':'||p_idempotency_key::text,0));
  select * into v_existing from public.content_change_requests r
    where r.client_id=v_ci.client_id and r.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_fingerprint<>v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return pg_catalog.jsonb_build_object('id',v_existing.id,'status',v_existing.status,'outcome','unchanged');
  end if;
  if v_ci.revision_in_progress then raise exception 'content_revision_in_progress'; end if;
  if not public.portal_consume_request_rate_limit(v_ci.client_id,v_uid,'content_edit') then
    return pg_catalog.jsonb_build_object('outcome','rate_limited'); end if;
  begin
    insert into public.content_change_requests(client_id,content_id,request_type,base_version,
      payload,requested_by,requester_name,idempotency_key,request_fingerprint)
    values(v_ci.client_id,v_ci.id,'edit',p_content_version,v_payload,v_uid,v_actor,
      p_idempotency_key,v_fingerprint) returning id into v_id;
  exception when unique_violation then raise exception 'edit_request_already_open'; end;
  insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,
    title,summary,actor_type,actor_name) values(v_ci.client_id,v_ci.id,p_content_version,
    'edit_requested','content-request:'||v_id::text,'Edit suggested: '||v_title,
    'A copy edit is waiting for The Dot.','client',v_actor);
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation) values(v_ci.client_id,
    'content-request:'||v_id::text,'edit_requested','content_change_request',v_id,'client',v_actor,
    pg_catalog.jsonb_build_object('request_type','edit','content_id',v_ci.id,
      'base_version',p_content_version,'block_key',p_block_key),true);
  return pg_catalog.jsonb_build_object('id',v_id,'status','pending','outcome','created');
end;
$$;

create function public.assert_portal_content_request_recovery_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_def text;
begin
  if not exists(select 1 from public.activity_event_types where event_type = 'request_superseded') then
    raise exception 'request superseded activity vocabulary is missing';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%client_visible_version%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%portal_feature_enabled%'
     or v_def not ilike '%status <> ''pending''%'
     or v_def not ilike '%activity_log%'
     or v_def not ilike '%portal_inbox_events%' then
    raise exception 'content request recovery writer is incomplete';
  end if;
  select pg_catalog.pg_get_functiondef('public.begin_content_revision(uuid,integer)'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%open_content_edit_request%'
     or v_def not ilike '%''applying''%' then
    raise exception 'agency revision does not block an open client edit';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.request_content_edit(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%content_revision_in_progress%'
     or v_def not ilike '%security definer%' then
    raise exception 'client edit does not block an agency revision';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.begin_content_request_revision(uuid,uuid,integer)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%another_open_content_edit_request%'
     or v_def not ilike '%repository_worker%'
     or v_def not ilike '%security definer%' then
    raise exception 'request-specific revision writer is incomplete';
  end if;
  if not exists(
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'content request recovery writer has an unsafe search path';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)', 'EXECUTE'
     ) then
    raise exception 'content request recovery writer privileges are unsafe';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.begin_content_request_revision(uuid,uuid,integer)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.begin_content_request_revision(uuid,uuid,integer)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.begin_content_request_revision(uuid,uuid,integer)', 'EXECUTE'
     ) then
    raise exception 'request-specific revision writer privileges are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_content_request_recovery_security() from public, anon, authenticated;
grant execute on function public.assert_portal_content_request_recovery_security() to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice35_security();
  perform public.assert_portal_content_request_recovery_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
