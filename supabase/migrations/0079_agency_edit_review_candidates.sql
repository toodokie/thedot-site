-- Keep agency safe-merge drafts and approvals private until canonical reconciliation begins.
-- Saving or approving a candidate never changes the client request, released copy, or notifications.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_change_requests') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.agency_actors') is null then
    raise exception '0079 requires the existing content request and agency audit system';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice78_security;
revoke all on function public.assert_portal_slice78_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice78_security() to service_role;

create table public.content_request_review_candidates (
  request_id uuid primary key,
  client_id uuid not null,
  candidate_text text not null check (
    pg_catalog.char_length(pg_catalog.btrim(candidate_text)) between 1 and 8000
  ),
  change_summary text not null check (
    pg_catalog.char_length(pg_catalog.btrim(change_summary)) between 3 and 4000
  ),
  status text not null default 'draft' check (status in ('draft','approved')),
  revision int not null default 1 check (revision > 0),
  authored_by uuid not null references public.agency_actors(id),
  approved_by uuid references public.agency_actors(id),
  approved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (request_id, client_id)
    references public.content_change_requests(id, client_id) on delete cascade,
  check (
    (status = 'draft' and approved_by is null and approved_at is null)
    or (status = 'approved' and approved_by is not null and approved_at is not null)
  )
);

create index content_request_review_candidates_client_status
  on public.content_request_review_candidates(client_id, status, updated_at desc);

alter table public.content_request_review_candidates enable row level security;
revoke all on public.content_request_review_candidates from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.content_request_review_candidates to service_role;

create function public.upsert_content_request_review_candidate(
  p_request_id uuid,
  p_candidate_text text,
  p_change_summary text,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.content_change_requests%rowtype;
  v_actor public.agency_actors%rowtype;
  v_candidate text := pg_catalog.btrim(p_candidate_text);
  v_summary text := pg_catalog.btrim(p_change_summary);
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_row public.content_request_review_candidates%rowtype;
  v_response jsonb;
begin
  if p_request_id is null or p_idempotency_key is null
     or v_candidate is null or pg_catalog.char_length(v_candidate) not between 1 and 8000
     or v_summary is null or pg_catalog.char_length(v_summary) not between 3 and 4000 then
    raise exception 'invalid content request review candidate';
  end if;

  select * into v_request
  from public.content_change_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.request_type <> 'edit' then
    raise exception 'edit request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'edit request is no longer open for pre-apply review';
  end if;

  select * into v_actor
  from public.agency_actors a
  where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_request.client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'request_id', p_request_id,
      'candidate_text', v_candidate,
      'change_summary', v_summary,
      'actor', p_actor_key
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'content-request-review-candidate:' || v_request.client_id::text || ':'
      || p_idempotency_key::text, 0));
  select * into v_receipt
  from public.portal_command_receipts r
  where r.client_id = v_request.client_id
    and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'upsert_content_request_review_candidate'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  insert into public.content_request_review_candidates(
    request_id, client_id, candidate_text, change_summary, status, revision, authored_by
  ) values (
    v_request.id, v_request.client_id, v_candidate, v_summary, 'draft', 1, v_actor.id
  )
  on conflict (request_id) do update
    set candidate_text = excluded.candidate_text,
        change_summary = excluded.change_summary,
        status = 'draft',
        revision = public.content_request_review_candidates.revision + 1,
        authored_by = excluded.authored_by,
        approved_by = null,
        approved_at = null,
        updated_at = pg_catalog.now()
  returning * into v_row;

  v_response := pg_catalog.jsonb_build_object(
    'request_id', v_row.request_id,
    'status', v_row.status,
    'revision', v_row.revision
  );
  insert into public.portal_command_receipts(
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_request.client_id, 'upsert_content_request_review_candidate',
    p_idempotency_key::text, v_fingerprint, v_response
  );
  return v_response;
end;
$$;

create function public.approve_content_request_review_candidate(
  p_request_id uuid,
  p_expected_revision int,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.content_change_requests%rowtype;
  v_actor public.agency_actors%rowtype;
  v_row public.content_request_review_candidates%rowtype;
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_response jsonb;
begin
  if p_request_id is null or p_idempotency_key is null
     or p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'invalid content request candidate approval';
  end if;

  select * into v_request
  from public.content_change_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.request_type <> 'edit' then
    raise exception 'edit request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'edit request is no longer open for pre-apply review';
  end if;

  select * into v_actor
  from public.agency_actors a
  where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_request.client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'request_id', p_request_id,
      'expected_revision', p_expected_revision,
      'actor', p_actor_key
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'content-request-review-candidate-approval:' || v_request.client_id::text || ':'
      || p_idempotency_key::text, 0));
  select * into v_receipt
  from public.portal_command_receipts r
  where r.client_id = v_request.client_id
    and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'approve_content_request_review_candidate'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  select * into v_row
  from public.content_request_review_candidates c
  where c.request_id = v_request.id
  for update;
  if not found then raise exception 'review candidate has not been saved'; end if;
  if v_row.revision <> p_expected_revision then
    raise exception 'review candidate changed; refresh before approving';
  end if;

  update public.content_request_review_candidates
  set status = 'approved', approved_by = v_actor.id,
      approved_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where request_id = v_row.request_id
  returning * into v_row;

  v_response := pg_catalog.jsonb_build_object(
    'request_id', v_row.request_id,
    'status', v_row.status,
    'revision', v_row.revision,
    'approved_at', v_row.approved_at
  );
  insert into public.portal_command_receipts(
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_request.client_id, 'approve_content_request_review_candidate',
    p_idempotency_key::text, v_fingerprint, v_response
  );
  return v_response;
end;
$$;

revoke all on function public.upsert_content_request_review_candidate(uuid,text,text,text,uuid),
  public.approve_content_request_review_candidate(uuid,int,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.upsert_content_request_review_candidate(uuid,text,text,text,uuid),
  public.approve_content_request_review_candidate(uuid,int,text,uuid)
  to service_role;

create function public.assert_portal_content_request_review_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_save_def text;
  v_approve_def text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'content_request_review_candidates'
      and c.relrowsecurity
  ) then
    raise exception 'content request review candidate RLS is disabled';
  end if;
  if exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename = 'content_request_review_candidates'
  ) then
    raise exception 'content request review candidates must remain agency-only';
  end if;
  if pg_catalog.has_table_privilege('anon','public.content_request_review_candidates','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.content_request_review_candidates','SELECT,INSERT,UPDATE,DELETE')
     or not pg_catalog.has_table_privilege('service_role','public.content_request_review_candidates','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'content request review candidate grants are unsafe';
  end if;
  if pg_catalog.has_function_privilege(
       'anon','public.upsert_content_request_review_candidate(uuid,text,text,text,uuid)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.upsert_content_request_review_candidate(uuid,text,text,text,uuid)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon','public.approve_content_request_review_candidate(uuid,int,text,uuid)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.approve_content_request_review_candidate(uuid,int,text,uuid)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.upsert_content_request_review_candidate(uuid,text,text,text,uuid)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.approve_content_request_review_candidate(uuid,int,text,uuid)','EXECUTE'
     ) then
    raise exception 'content request review candidate function grants are unsafe';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.upsert_content_request_review_candidate(uuid,text,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_save_def;
  select pg_catalog.pg_get_functiondef(
    'public.approve_content_request_review_candidate(uuid,int,text,uuid)'::pg_catalog.regprocedure
  ) into v_approve_def;
  if v_save_def is null or v_save_def not ilike '%security definer%'
     or v_save_def not ilike '%portal_command_receipts%'
     or v_save_def not ilike '%agency_mutations%'
     or v_approve_def is null or v_approve_def not ilike '%security definer%'
     or v_approve_def not ilike '%portal_command_receipts%'
     or v_approve_def not ilike '%agency_mutations%' then
    raise exception 'content request review candidate functions are not hardened';
  end if;
end;
$$;

revoke all on function public.assert_portal_content_request_review_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_content_request_review_security() to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice78_security();
  perform public.assert_portal_content_request_review_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
