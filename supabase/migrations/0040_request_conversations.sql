-- Durable two-way conversations for client comments and content-change requests.
-- A request is an instruction, not an automatic text patch: agency replies can clarify or close
-- a question without claiming that the client wording was copied verbatim. Actual copy changes
-- still move only through canonical reconciliation and the release boundary.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.comments') is null
     or pg_catalog.to_regclass('public.content_change_requests') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null then
    raise exception '0040 requires the portal comments, request, and audit boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice33_security;
revoke all on function public.assert_portal_slice33_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice33_security() to service_role;

-- An agency reply is explicitly tied to the client comment it answers. The composite reference
-- prevents a service bug from attaching a reply across tenants.
alter table public.comments
  add constraint comments_id_client_unique unique (id, client_id);
alter table public.comments
  add column reply_to_comment_id uuid,
  add constraint comments_reply_parent_same_client_fk
    foreign key (reply_to_comment_id, client_id)
    references public.comments(id, client_id) on delete set null,
  add constraint comments_reply_parent_author_check
    check (reply_to_comment_id is null or author_type in ('anastasia', 'agent'));
grant select (reply_to_comment_id) on public.comments to authenticated;

-- The slice-2 assertion pins comments' client-visible column grants. Extend that exact contract,
-- rather than relying on a broad table grant.
do $adjust_comments_grants$
declare
  v_definition text;
  v_adjusted text;
  v_old text := $assert$v_expected := array[
    'author_name','author_type','body','client_id','content_id','content_version',
    'copy_block_key','created_at','id','quoted_text','resolved','target_kind','target_url'
  ];$assert$;
  v_new text := $assert$v_expected := array[
    'author_name','author_type','body','client_id','content_id','content_version',
    'copy_block_key','created_at','id','quoted_text','reply_to_comment_id','resolved',
    'target_kind','target_url'
  ];$assert$;
begin
  select pg_catalog.pg_get_functiondef('public.assert_portal_slice2_security()'::pg_catalog.regprocedure)
    into v_definition;
  if v_definition is null or pg_catalog.strpos(v_definition, v_old) = 0 then
    raise exception 'could not update inherited comments grant assertion';
  end if;
  v_adjusted := pg_catalog.replace(v_definition, v_old, v_new);
  execute v_adjusted;
end;
$adjust_comments_grants$;

-- Existing reply RPC accepted client-controlled piece and quote fields. The parent comment now
-- supplies all of that context server-side, then becomes resolved in the same transaction.
drop function if exists public.add_agency_comment_reply(uuid,text,text,text,text,text,text);
create function public.add_agency_comment_reply(
  p_parent_comment_id uuid,
  p_body text,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.comments%rowtype;
  v_actor public.agency_actors%rowtype;
  v_body text := pg_catalog.btrim(p_body);
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_reply_id uuid;
  v_title text;
  v_response jsonb;
begin
  if p_parent_comment_id is null or p_idempotency_key is null
     or v_body is null or pg_catalog.char_length(v_body) not between 1 and 4000
     or not public.portal_client_summary_shape_valid(v_body) then
    raise exception 'invalid agency comment reply';
  end if;
  select * into v_parent from public.comments c where c.id = p_parent_comment_id for update;
  if not found or v_parent.author_type <> 'client' then
    raise exception 'client comment not found';
  end if;
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_parent.client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('parent_comment_id', p_parent_comment_id, 'body', v_body,
      'actor', p_actor_key)::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-comment-reply:' || v_parent.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_receipt from public.portal_command_receipts r
    where r.client_id = v_parent.client_id and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'add_agency_comment_reply'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;
  if v_parent.resolved then raise exception 'client comment is already answered'; end if;

  insert into public.comments(
    content_id, client_id, content_version, copy_block_key, target_kind, target_url,
    reply_to_comment_id, author_type, author_name, body, quoted_text
  ) values (
    v_parent.content_id, v_parent.client_id, v_parent.content_version, v_parent.copy_block_key,
    v_parent.target_kind, v_parent.target_url, v_parent.id, 'anastasia', v_actor.display_name,
    v_body, v_parent.quoted_text
  ) returning id into v_reply_id;
  update public.comments set resolved = true where id = v_parent.id and client_id = v_parent.client_id;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_parent.content_id and cv.client_id = v_parent.client_id
      and cv.version = v_parent.content_version;
  insert into public.activity_log(
    client_id, content_id, content_version, event_type, event_key, title, summary, actor_type, actor_name
  ) values (
    v_parent.client_id, v_parent.content_id, v_parent.content_version, 'agency_comment_added',
    'agency-comment-reply:' || v_reply_id::text, 'Reply: ' || coalesce(v_title, 'Client comment'),
    v_body, 'anastasia', v_actor.display_name
  );
  v_response := pg_catalog.jsonb_build_object(
    'parent_comment_id', v_parent.id, 'reply_comment_id', v_reply_id, 'outcome', 'answered'
  );
  insert into public.portal_command_receipts(
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_parent.client_id, 'add_agency_comment_reply', p_idempotency_key::text, v_fingerprint, v_response
  );
  return v_response;
end;
$$;
revoke all on function public.add_agency_comment_reply(uuid,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_agency_comment_reply(uuid,text,text,uuid) to service_role;

-- Email and the Ops comment list are useful alerts, but the agent workflow must not depend on
-- either one being noticed. Every client comment therefore also becomes one durable inbox event.
create function public.portal_comment_inbox_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.author_type = 'client' then
    insert into public.portal_inbox_events(
      client_id, event_key, event_type, object_type, object_id, actor_type, actor_name,
      payload, requires_reconciliation
    ) values (
      new.client_id, 'client-comment:' || new.id::text, 'comment_added', 'comment', new.id,
      'client', new.author_name,
      pg_catalog.jsonb_build_object(
        'comment_id', new.id, 'content_id', new.content_id, 'content_version', new.content_version,
        'target_kind', new.target_kind, 'copy_block_key', new.copy_block_key
      ), true
    ) on conflict (client_id, event_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.portal_comment_inbox_event() from public, anon, authenticated, service_role;
create trigger portal_comment_inbox_ain
  after insert on public.comments
  for each row execute function public.portal_comment_inbox_event();

-- 0026's stored assertion named the retired seven-argument function. Keep the cumulative
-- assertion chain meaningful after replacing the reply boundary with the parent-derived RPC.
create or replace function public.assert_portal_admin_piece_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.add_agency_comment_reply(uuid,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%reply_to_comment_id%'
     or v_def not ilike '%set resolved = true%' then
    raise exception 'admin comment reply is not hardened';
  end if;
  if pg_catalog.has_function_privilege('anon','public.add_agency_comment_reply(uuid,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.add_agency_comment_reply(uuid,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.add_agency_comment_reply(uuid,text,text,uuid)','EXECUTE') then
    raise exception 'admin comment reply privileges are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_admin_piece_security() from public, anon, authenticated;
grant execute on function public.assert_portal_admin_piece_security() to service_role;

-- A request conversation is separate from the canonical patch job. It preserves questions and
-- answers without pretending that a client suggestion is a byte-for-byte automatic edit.
create table public.content_change_request_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  request_id uuid not null,
  author_type text not null check (author_type in ('client', 'anastasia')),
  author_name text not null check (pg_catalog.char_length(pg_catalog.btrim(author_name)) between 1 and 200),
  body text not null check (
    pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 4000
    and public.portal_client_summary_shape_valid(body)
  ),
  idempotency_key uuid not null,
  message_fingerprint text not null check (message_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (client_id, idempotency_key),
  foreign key (request_id, client_id)
    references public.content_change_requests(id, client_id) on delete cascade
);
create index content_change_request_messages_thread
  on public.content_change_request_messages(request_id, created_at, id);
alter table public.content_change_request_messages enable row level security;
create policy content_change_request_messages_read on public.content_change_request_messages
  for select to authenticated using (client_id in (select public.my_client_ids()));
revoke all on public.content_change_request_messages from public, anon, authenticated, service_role;
grant select(id, client_id, request_id, author_type, author_name, body, created_at)
  on public.content_change_request_messages to authenticated;
grant select on public.content_change_request_messages to service_role;

-- A question can be closed as answered without a canonical version. A later client follow-up
-- reopens it to pending, while actual edit reconciliation retains the existing applying/prepared path.
alter table public.content_change_requests drop constraint if exists content_change_requests_status_check;
alter table public.content_change_requests add constraint content_change_requests_status_check check (status in (
  'pending','applying','prepared','applied','answered','conflicted','rejected','superseded'
));
alter table public.portal_mutation_rate_limits drop constraint if exists portal_mutation_rate_limits_action_check;
alter table public.portal_mutation_rate_limits add constraint portal_mutation_rate_limits_action_check check (
  action in ('content_edit','content_create','content_archive','content_request_reply')
);
create or replace function public.portal_consume_request_rate_limit(
  p_client_id uuid,p_auth_user_id uuid,p_action text
) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_attempts int; v_window timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
begin
  if p_action not in ('content_edit','content_create','content_archive','content_request_reply') then return false; end if;
  insert into public.portal_mutation_rate_limits(
    client_id,auth_user_id,action,window_started_at,attempts
  ) values(p_client_id,p_auth_user_id,p_action,v_window,1)
  on conflict(client_id,auth_user_id,action,window_started_at) do update
    set attempts=public.portal_mutation_rate_limits.attempts+1,updated_at=pg_catalog.now()
  returning attempts into v_attempts;
  return v_attempts<=20;
end;
$$;
revoke all on function public.portal_consume_request_rate_limit(uuid,uuid,text)
  from public, anon, authenticated, service_role;

insert into public.activity_event_types(event_type) values ('request_replied') on conflict do nothing;

create function public.reply_to_content_request_as_client(
  p_request_id uuid,p_body text,p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_request public.content_change_requests%rowtype;
  v_body text := pg_catalog.btrim(p_body);
  v_actor text;
  v_fingerprint text;
  v_existing public.content_change_request_messages%rowtype;
  v_message_id uuid;
  v_title text;
begin
  if v_uid is null or p_request_id is null or p_idempotency_key is null
     or v_body is null or pg_catalog.char_length(v_body) not between 1 and 4000
     or not public.portal_client_summary_shape_valid(v_body) then
    raise exception 'invalid request reply';
  end if;
  select r.* into v_request
  from public.content_change_requests r
  join public.client_users cu on cu.client_id = r.client_id and cu.auth_user_id = v_uid
  where r.id = p_request_id
  for update of r;
  if not found then raise exception 'request not found' using errcode = '42501'; end if;
  select coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client') into v_actor
  from public.client_users cu
  where cu.client_id = v_request.client_id and cu.auth_user_id = v_uid;
  perform public.portal_require_client_action(v_request.client_id, 'can_submit_requests');
  if v_request.status not in ('pending','answered') then raise exception 'request is not open for reply'; end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('request_id', p_request_id, 'body', v_body, 'actor', v_uid)::text,
    'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'client-request-reply:' || v_request.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing from public.content_change_request_messages m
    where m.client_id = v_request.client_id and m.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.message_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', v_request.status, 'outcome', 'unchanged');
  end if;
  if not public.portal_consume_request_rate_limit(v_request.client_id, v_uid, 'content_request_reply') then
    return pg_catalog.jsonb_build_object('outcome','rate_limited');
  end if;
  insert into public.content_change_request_messages(
    client_id, request_id, author_type, author_name, body, idempotency_key, message_fingerprint
  ) values (
    v_request.client_id, v_request.id, 'client', v_actor, v_body, p_idempotency_key, v_fingerprint
  ) returning id into v_message_id;
  if v_request.status = 'answered' then
    update public.content_change_requests set status = 'pending', resolution_note = null,
      reconciled_at = null, reconciled_by = null, updated_at = pg_catalog.now() where id = v_request.id;
  end if;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_request.content_id and cv.client_id = v_request.client_id
      and cv.version = v_request.base_version;
  insert into public.activity_log(
    client_id, content_id, content_version, event_type, event_key, title, summary, actor_type, actor_name
  ) values (
    v_request.client_id, v_request.content_id, v_request.base_version, 'request_replied',
    'client-request-reply:' || v_message_id::text,
    'Follow-up: ' || coalesce(v_title, 'Content request'), v_body, 'client', v_actor
  );
  insert into public.portal_inbox_events(
    client_id, event_key, event_type, object_type, object_id, actor_type, actor_name, payload,
    requires_reconciliation
  ) values (
    v_request.client_id, 'client-request-reply:' || v_message_id::text, 'request_replied',
    'content_change_request', v_request.id, 'client', v_actor,
    pg_catalog.jsonb_build_object('request_id', v_request.id, 'message_id', v_message_id), true
  );
  return pg_catalog.jsonb_build_object('id', v_message_id, 'status',
    case when v_request.status = 'answered' then 'pending' else v_request.status end, 'outcome', 'created');
end;
$$;
revoke all on function public.reply_to_content_request_as_client(uuid,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reply_to_content_request_as_client(uuid,text,uuid) to authenticated;

create function public.reply_to_content_request(
  p_request_id uuid,p_body text,p_close boolean,p_actor_key text,p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.content_change_requests%rowtype;
  v_actor public.agency_actors%rowtype;
  v_body text := pg_catalog.btrim(p_body);
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_message_id uuid;
  v_title text;
  v_slug text;
  v_response jsonb;
begin
  if p_request_id is null or p_idempotency_key is null or p_close is null
     or v_body is null or pg_catalog.char_length(v_body) not between 1 and 4000
     or not public.portal_client_summary_shape_valid(v_body) then
    raise exception 'invalid agency request reply';
  end if;
  select * into v_request from public.content_change_requests r where r.id = p_request_id for update;
  if not found then raise exception 'content request not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_request.client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('request_id', p_request_id, 'body', v_body,
      'close', p_close, 'actor', p_actor_key)::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-request-reply:' || v_request.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_receipt from public.portal_command_receipts r
    where r.client_id = v_request.client_id and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'reply_to_content_request'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;
  if v_request.status not in ('pending','applying','prepared') then
    raise exception 'request is not open for an agency reply';
  end if;
  if p_close and v_request.status <> 'pending' then
    raise exception 'only an unstarted request can be answered without a copy change';
  end if;
  insert into public.content_change_request_messages(
    client_id, request_id, author_type, author_name, body, idempotency_key, message_fingerprint
  ) values (
    v_request.client_id, v_request.id, 'anastasia', v_actor.display_name, v_body,
    p_idempotency_key, v_fingerprint
  ) returning id into v_message_id;
  if p_close then
    update public.content_change_requests set status = 'answered',
      resolution_note = 'Answered in the portal. No copy change was requested.',
      reconciled_at = pg_catalog.now(), reconciled_by = v_actor.display_name,
      updated_at = pg_catalog.now() where id = v_request.id;
  end if;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_request.content_id and cv.client_id = v_request.client_id
      and cv.version = v_request.base_version;
  select c.slug into v_slug from public.clients c where c.id = v_request.client_id;
  insert into public.activity_log(
    client_id, content_id, content_version, event_type, event_key, title, summary,
    actor_type, actor_name, related_url
  ) values (
    v_request.client_id, v_request.content_id, v_request.base_version, 'request_replied',
    'agency-request-reply:' || v_message_id::text,
    'Reply from The Dot: ' || coalesce(v_title, 'Content request'), v_body,
    'anastasia', v_actor.display_name,
    case when v_slug is null then null else 'https://www.thedotcreative.co/client/' || v_slug || '/requests' end
  );
  v_response := pg_catalog.jsonb_build_object('id', v_message_id,
    'status', case when p_close then 'answered' else v_request.status end,
    'outcome', 'created');
  insert into public.portal_command_receipts(
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_request.client_id, 'reply_to_content_request', p_idempotency_key::text, v_fingerprint, v_response
  );
  return v_response;
end;
$$;
revoke all on function public.reply_to_content_request(uuid,text,boolean,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reply_to_content_request(uuid,text,boolean,text,uuid) to service_role;

create or replace function public.assert_portal_conversation_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
  v_columns text[];
begin
  if not exists(select 1 from pg_catalog.pg_class c
    where c.oid = 'public.content_change_request_messages'::pg_catalog.regclass and c.relrowsecurity) then
    raise exception 'request conversation RLS is disabled';
  end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_columns
  from information_schema.column_privileges cp
  where cp.table_schema='public' and cp.table_name='content_change_request_messages'
    and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  if v_columns is distinct from array['author_name','author_type','body','client_id','created_at','id','request_id']
     or pg_catalog.has_table_privilege('authenticated','public.content_change_request_messages','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('anon','public.content_change_request_messages','SELECT,INSERT,UPDATE,DELETE')
     or not pg_catalog.has_table_privilege('service_role','public.content_change_request_messages','SELECT')
     or pg_catalog.has_table_privilege('service_role','public.content_change_request_messages','INSERT,UPDATE,DELETE') then
    raise exception 'request conversation grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.reply_to_content_request_as_client(uuid,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%client_users%'
     or v_def not ilike '%portal_require_client_action%'
     or v_def not ilike '%portal_consume_request_rate_limit%'
     or v_def not ilike '%portal_inbox_events%' then
    raise exception 'client request reply writer is incomplete';
  end if;
  if pg_catalog.has_function_privilege('anon','public.reply_to_content_request_as_client(uuid,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.reply_to_content_request_as_client(uuid,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.reply_to_content_request_as_client(uuid,text,uuid)','EXECUTE') then
    raise exception 'client request reply grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.reply_to_content_request(uuid,text,boolean,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%portal_feature_enabled%'
     or v_def not ilike '%content_change_request_messages%' then
    raise exception 'agency request reply writer is incomplete';
  end if;
  if pg_catalog.has_function_privilege('anon','public.reply_to_content_request(uuid,text,boolean,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.reply_to_content_request(uuid,text,boolean,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.reply_to_content_request(uuid,text,boolean,text,uuid)','EXECUTE') then
    raise exception 'agency request reply grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.add_agency_comment_reply(uuid,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%reply_to_comment_id%'
     or v_def not ilike '%set resolved = true%'
     or v_def not ilike '%portal_command_receipts%' then
    raise exception 'comment reply writer is incomplete';
  end if;
  if pg_catalog.has_function_privilege('anon','public.add_agency_comment_reply(uuid,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.add_agency_comment_reply(uuid,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.add_agency_comment_reply(uuid,text,text,uuid)','EXECUTE') then
    raise exception 'comment reply grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef('public.portal_comment_inbox_event()'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%portal_inbox_events%'
     or v_def not ilike '%new.author_type = ''client''%'
     or pg_catalog.has_function_privilege('anon','public.portal_comment_inbox_event()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_comment_inbox_event()','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_comment_inbox_event()','EXECUTE')
     or not exists(select 1 from pg_catalog.pg_trigger where tgname = 'portal_comment_inbox_ain' and not tgisinternal) then
    raise exception 'client comment inbox trigger is unsafe or missing';
  end if;
end;
$$;
revoke all on function public.assert_portal_conversation_security() from public, anon, authenticated;
grant execute on function public.assert_portal_conversation_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice33_security();
  perform public.assert_portal_conversation_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
