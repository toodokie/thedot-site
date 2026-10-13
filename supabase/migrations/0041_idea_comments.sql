-- Shared, tenant-scoped discussion threads for ideas before they become content pieces.
-- A comment is not a content mutation. Client and agency writers are separate, audited RPCs;
-- direct table writes stay revoked. Client comments also create a durable inbox event, so the
-- agency and its agents do not need to notice an email or a browser refresh to see them.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_ideas') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.notification_outbox') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null then
    raise exception '0041 requires ideas, command receipts, inbox, notifications, and activity vocabulary';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice34_security;
revoke all on function public.assert_portal_slice34_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice34_security() to service_role;

create table public.idea_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  idea_id uuid not null,
  reply_to_comment_id uuid,
  author_type text not null check (author_type in ('client', 'anastasia', 'agent')),
  author_name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(author_name)) between 1 and 200
    and public.portal_client_summary_shape_valid(author_name)
  ),
  body text not null check (
    pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 4000
    and public.portal_client_summary_shape_valid(body)
  ),
  resolved boolean not null default false,
  idempotency_key uuid not null,
  comment_fingerprint text not null check (comment_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (client_id, idempotency_key),
  foreign key (idea_id, client_id)
    references public.content_ideas(id, client_id) on delete cascade,
  foreign key (reply_to_comment_id, client_id)
    references public.idea_comments(id, client_id) on delete set null,
  check (reply_to_comment_id is null or author_type in ('anastasia', 'agent'))
);
create index idea_comments_by_idea on public.idea_comments(idea_id, created_at, id);

alter table public.idea_comments enable row level security;
create policy idea_comments_read on public.idea_comments
  for select to authenticated
  using (client_id in (select public.my_client_ids()));
revoke all on public.idea_comments from public, anon, authenticated, service_role;
grant select(id, client_id, idea_id, reply_to_comment_id, author_type, author_name, body, resolved, created_at)
  on public.idea_comments to authenticated;
grant select on public.idea_comments to service_role;

insert into public.activity_event_types(event_type)
values ('idea_comment_added'), ('agency_idea_comment_added')
on conflict (event_type) do nothing;

-- Client comments are bound to the caller's own tenant by the membership join. The client never
-- supplies an actor name, client id, or an agency-owned idea id. Idempotent retries return the
-- original receipt without a duplicate comment, activity row, inbox event, or alert.
create function public.add_idea_comment(
  p_idea_id uuid,
  p_body text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_idea public.content_ideas%rowtype;
  v_body text := pg_catalog.btrim(p_body);
  v_actor text;
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_comment_id uuid;
  v_response jsonb;
begin
  if v_uid is null or p_idea_id is null or p_idempotency_key is null
     or v_body is null or pg_catalog.char_length(v_body) not between 1 and 4000
     or not public.portal_client_summary_shape_valid(v_body) then
    raise exception 'invalid idea comment';
  end if;

  select i.* into v_idea
  from public.content_ideas i
  join public.client_users cu
    on cu.client_id = i.client_id and cu.auth_user_id = v_uid
  where i.id = p_idea_id
  for update of i;
  if not found then raise exception 'not authorized for this idea' using errcode = '42501'; end if;
  perform public.portal_require_client_action(v_idea.client_id, 'can_comment');

  select nullif(pg_catalog.btrim(cu.name), '') into v_actor
  from public.client_users cu
  where cu.client_id = v_idea.client_id and cu.auth_user_id = v_uid
  limit 1;
  v_actor := coalesce(v_actor, 'Client');
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('idea_id', p_idea_id, 'body', v_body, 'author', v_uid)::text,
    'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'idea-comment:' || v_idea.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_receipt from public.portal_command_receipts r
  where r.client_id = v_idea.client_id and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'add_idea_comment'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  insert into public.idea_comments(
    client_id, idea_id, author_type, author_name, body, idempotency_key, comment_fingerprint
  ) values (
    v_idea.client_id, v_idea.id, 'client', v_actor, v_body, p_idempotency_key, v_fingerprint
  ) returning id into v_comment_id;
  insert into public.activity_log(
    client_id, event_type, event_key, title, summary, actor_type, actor_name, related_url
  ) values (
    v_idea.client_id, 'idea_comment_added', 'idea-comment:' || v_comment_id::text,
    'Comment on idea: ' || v_idea.title, v_body, 'client', v_actor,
    'https://www.thedotcreative.co/admin/portal/ideas#idea-' || v_idea.id::text
  );
  v_response := pg_catalog.jsonb_build_object('id', v_comment_id, 'outcome', 'created');
  insert into public.portal_command_receipts(
    client_id, auth_user_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_idea.client_id, v_uid, 'add_idea_comment', p_idempotency_key::text, v_fingerprint, v_response
  );
  return v_response;
end;
$$;
revoke all on function public.add_idea_comment(uuid,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_idea_comment(uuid,text,uuid) to authenticated;

-- The agency may also start a thread on an idea, for example to ask a clarifying question before
-- it becomes a piece. This has the same actor, switch, idempotency, audit, and client-alert
-- boundary as an agency reply, but does not depend on a pre-existing client comment.
create function public.add_agency_idea_comment(
  p_idea_id uuid,
  p_body text,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idea public.content_ideas%rowtype;
  v_actor public.agency_actors%rowtype;
  v_body text := pg_catalog.btrim(p_body);
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_comment_id uuid;
  v_slug text;
  v_response jsonb;
begin
  if p_idea_id is null or p_idempotency_key is null
     or v_body is null or pg_catalog.char_length(v_body) not between 1 and 4000
     or not public.portal_client_summary_shape_valid(v_body) then
    raise exception 'invalid agency idea comment';
  end if;
  select * into v_idea from public.content_ideas i where i.id = p_idea_id for update;
  if not found then raise exception 'idea not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_idea.client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('idea_id', p_idea_id, 'body', v_body, 'actor', p_actor_key)::text,
    'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-idea-comment:' || v_idea.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_receipt from public.portal_command_receipts r
  where r.client_id = v_idea.client_id and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'add_agency_idea_comment'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;
  insert into public.idea_comments(
    client_id, idea_id, author_type, author_name, body, idempotency_key, comment_fingerprint
  ) values (
    v_idea.client_id, v_idea.id, 'anastasia', v_actor.display_name, v_body,
    p_idempotency_key, v_fingerprint
  ) returning id into v_comment_id;
  select c.slug into v_slug from public.clients c where c.id = v_idea.client_id;
  insert into public.activity_log(
    client_id, event_type, event_key, title, summary, actor_type, actor_name, related_url
  ) values (
    v_idea.client_id, 'agency_idea_comment_added', 'agency-idea-comment:' || v_comment_id::text,
    'Comment from The Dot: ' || v_idea.title, v_body, 'anastasia', v_actor.display_name,
    case when v_slug is null then null
      else 'https://www.thedotcreative.co/client/' || v_slug || '/ideas#idea-' || v_idea.id::text end
  );
  v_response := pg_catalog.jsonb_build_object('id', v_comment_id, 'outcome', 'created');
  insert into public.portal_command_receipts(
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_idea.client_id, 'add_agency_idea_comment', p_idempotency_key::text, v_fingerprint, v_response
  );
  return v_response;
end;
$$;
revoke all on function public.add_agency_idea_comment(uuid,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_agency_idea_comment(uuid,text,text,uuid) to service_role;

-- The agency can reply only to an unresolved client comment. Parent context supplies the tenant
-- and idea, so a service-side bug cannot reply across tenants or forge an agency thread location.
create function public.add_agency_idea_comment_reply(
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
  v_parent public.idea_comments%rowtype;
  v_idea public.content_ideas%rowtype;
  v_actor public.agency_actors%rowtype;
  v_body text := pg_catalog.btrim(p_body);
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_reply_id uuid;
  v_slug text;
  v_response jsonb;
begin
  if p_parent_comment_id is null or p_idempotency_key is null
     or v_body is null or pg_catalog.char_length(v_body) not between 1 and 4000
     or not public.portal_client_summary_shape_valid(v_body) then
    raise exception 'invalid agency idea comment reply';
  end if;
  select * into v_parent from public.idea_comments c where c.id = p_parent_comment_id for update;
  if not found or v_parent.author_type <> 'client' then raise exception 'client idea comment not found'; end if;
  select * into v_idea from public.content_ideas i
    where i.id = v_parent.idea_id and i.client_id = v_parent.client_id for share;
  if not found then raise exception 'idea not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_parent.client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('parent_comment_id', p_parent_comment_id, 'body', v_body,
      'actor', p_actor_key)::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-idea-comment-reply:' || v_parent.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_receipt from public.portal_command_receipts r
  where r.client_id = v_parent.client_id and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'add_agency_idea_comment_reply'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;
  if v_parent.resolved then raise exception 'client idea comment is already answered'; end if;

  insert into public.idea_comments(
    client_id, idea_id, reply_to_comment_id, author_type, author_name, body,
    idempotency_key, comment_fingerprint
  ) values (
    v_parent.client_id, v_parent.idea_id, v_parent.id, 'anastasia', v_actor.display_name, v_body,
    p_idempotency_key, v_fingerprint
  ) returning id into v_reply_id;
  update public.idea_comments set resolved = true
  where id = v_parent.id and client_id = v_parent.client_id;
  select c.slug into v_slug from public.clients c where c.id = v_parent.client_id;
  insert into public.activity_log(
    client_id, event_type, event_key, title, summary, actor_type, actor_name, related_url
  ) values (
    v_parent.client_id, 'agency_idea_comment_added', 'agency-idea-comment-reply:' || v_reply_id::text,
    'Reply on idea: ' || v_idea.title, v_body, 'anastasia', v_actor.display_name,
    case when v_slug is null then null
      else 'https://www.thedotcreative.co/client/' || v_slug || '/ideas#idea-' || v_parent.idea_id::text end
  );
  v_response := pg_catalog.jsonb_build_object(
    'parent_comment_id', v_parent.id, 'reply_comment_id', v_reply_id, 'outcome', 'answered'
  );
  insert into public.portal_command_receipts(
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_parent.client_id, 'add_agency_idea_comment_reply', p_idempotency_key::text, v_fingerprint, v_response
  );
  return v_response;
end;
$$;
revoke all on function public.add_agency_idea_comment_reply(uuid,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_agency_idea_comment_reply(uuid,text,text,uuid) to service_role;

-- This is the durable agent signal for a client comment. It is intentionally independent from
-- email delivery and the visible Ops page, and has one deterministic event key per comment.
create function public.portal_idea_comment_inbox_event() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_type = 'client' then
    insert into public.portal_inbox_events(
      client_id, event_key, event_type, object_type, object_id, actor_type, actor_name,
      payload, requires_reconciliation
    ) values (
      new.client_id, 'client-idea-comment:' || new.id::text, 'idea_comment_added', 'content_idea', new.idea_id,
      'client', new.author_name,
      pg_catalog.jsonb_build_object('idea_id', new.idea_id, 'comment_id', new.id), true
    ) on conflict (client_id, event_key) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.portal_idea_comment_inbox_event()
  from public, anon, authenticated, service_role;
create trigger portal_idea_comment_inbox_ain
  after insert on public.idea_comments
  for each row execute function public.portal_idea_comment_inbox_event();

-- Idea comments use the same transactional outbox guarantees as piece comments. Their routes are
-- internal for agency recipients and client-safe for client recipients.
create function public.portal_idea_comment_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient text;
  v_slug text;
  v_related_url text;
begin
  v_recipient := public.portal_notification_recipient(new.author_type);
  if v_recipient = 'agency' then
    v_related_url := 'https://www.thedotcreative.co/admin/portal/ideas#idea-' || new.idea_id::text;
  else
    select c.slug into v_slug from public.clients c where c.id = new.client_id;
    if v_slug is not null then
      v_related_url := 'https://www.thedotcreative.co/client/' || v_slug || '/ideas#idea-' || new.idea_id::text;
    end if;
  end if;
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'comment', new.id,
    new.author_name || ' commented on an idea', pg_catalog.left(new.body, 280), v_related_url
  );
  if v_recipient = 'agency' or public.portal_feature_enabled(new.client_id, 'client_alerts') then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'comment', new.id,
      new.author_name || ' commented on an idea', pg_catalog.left(new.body, 280), v_related_url
    );
  end if;
  return new;
end;
$$;
revoke all on function public.portal_idea_comment_notify()
  from public, anon, authenticated, service_role;
create trigger portal_idea_comment_notify_ain
  after insert on public.idea_comments
  for each row execute function public.portal_idea_comment_notify();

-- The comment table itself enqueues the alert. Skip its paired activity events so one comment
-- produces exactly one agency/client alert, not both a comment and an activity duplicate.
create or replace function public.portal_activity_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient text;
begin
  if new.event_type in ('comment_added','agency_comment_added','idea_comment_added','agency_idea_comment_added') then
    return new;
  end if;
  v_recipient := public.portal_notification_recipient(new.actor_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'activity', new.id,
    new.title, coalesce(new.summary,''), new.related_url);
  if v_recipient = 'agency' or public.portal_feature_enabled(new.client_id, 'client_alerts') then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  end if;
  return new;
end;
$$;

create function public.assert_portal_idea_comment_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_columns text[];
  v_def text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.idea_comments'::pg_catalog.regclass) then
    raise exception 'idea comment RLS is disabled';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies p
    where p.schemaname='public' and p.tablename='idea_comments' and p.policyname='idea_comments_read'
      and p.cmd='SELECT')
     or exists (select 1 from pg_catalog.pg_policies p
      where p.schemaname='public' and p.tablename='idea_comments' and p.cmd <> 'SELECT') then
    raise exception 'idea comment policies are unsafe';
  end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_columns
  from information_schema.column_privileges cp
  where cp.table_schema='public' and cp.table_name='idea_comments'
    and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  if v_columns is distinct from array[
    'author_name','author_type','body','client_id','created_at','id','idea_id','reply_to_comment_id','resolved'
  ]
     or pg_catalog.has_table_privilege('anon','public.idea_comments','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.idea_comments','INSERT,UPDATE,DELETE')
     or not pg_catalog.has_table_privilege('service_role','public.idea_comments','SELECT')
     or pg_catalog.has_table_privilege('service_role','public.idea_comments','INSERT,UPDATE,DELETE') then
    raise exception 'idea comment grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef('public.add_idea_comment(uuid,text,uuid)'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%client_users%'
     or v_def not ilike '%portal_require_client_action%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%portal_client_summary_shape_valid%'
     or v_def not ilike '%activity_log%' then
    raise exception 'client idea comment writer is incomplete';
  end if;
  if pg_catalog.has_function_privilege('anon','public.add_idea_comment(uuid,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.add_idea_comment(uuid,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.add_idea_comment(uuid,text,uuid)','EXECUTE') then
    raise exception 'client idea comment writer grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef('public.add_agency_idea_comment_reply(uuid,text,text,uuid)'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_feature_enabled%'
     or v_def not ilike '%agency_actors%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%set resolved = true%' then
    raise exception 'agency idea comment writer is incomplete';
  end if;
  if pg_catalog.has_function_privilege('anon','public.add_agency_idea_comment_reply(uuid,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.add_agency_idea_comment_reply(uuid,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.add_agency_idea_comment_reply(uuid,text,text,uuid)','EXECUTE') then
    raise exception 'agency idea comment writer grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef('public.add_agency_idea_comment(uuid,text,text,uuid)'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_feature_enabled%'
     or v_def not ilike '%agency_actors%'
     or v_def not ilike '%portal_command_receipts%'
     or pg_catalog.has_function_privilege('anon','public.add_agency_idea_comment(uuid,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.add_agency_idea_comment(uuid,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.add_agency_idea_comment(uuid,text,text,uuid)','EXECUTE') then
    raise exception 'agency idea comment writer is unsafe';
  end if;
  select pg_catalog.pg_get_functiondef('public.portal_idea_comment_inbox_event()'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%portal_inbox_events%'
     or v_def not ilike '%new.author_type = ''client''%'
     or not exists(select 1 from pg_catalog.pg_trigger t where t.tgname='portal_idea_comment_inbox_ain' and not t.tgisinternal) then
    raise exception 'idea comment inbox trigger is missing';
  end if;
  select pg_catalog.pg_get_functiondef('public.portal_idea_comment_notify()'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%portal_enqueue_notification%'
     or not exists(select 1 from pg_catalog.pg_trigger t where t.tgname='portal_idea_comment_notify_ain' and not t.tgisinternal) then
    raise exception 'idea comment notification trigger is missing';
  end if;
  if not exists(select 1 from public.activity_event_types where event_type='idea_comment_added')
     or not exists(select 1 from public.activity_event_types where event_type='agency_idea_comment_added') then
    raise exception 'idea comment activity vocabulary is missing';
  end if;
end;
$$;
revoke all on function public.assert_portal_idea_comment_security() from public, anon, authenticated;
grant execute on function public.assert_portal_idea_comment_security() to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice34_security();
  perform public.assert_portal_idea_comment_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
