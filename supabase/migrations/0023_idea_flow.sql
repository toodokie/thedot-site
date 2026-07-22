-- 0023_idea_flow.sql: idea lifecycle + curated news-run ingest.
--
-- Ideas remain client-readable under the existing tenant RLS policy. Internal provenance
-- (source_type/source_ref) is service/admin-only. Agency writes stay behind security-definer
-- RPCs with actor validation, receipts, shape checks, and the existing assistant-index trigger.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0022 portal objects must exist before applying 0023';
  end if;
  if pg_catalog.to_regclass('public.content_ideas') is null
     or pg_catalog.to_regclass('public.content_items') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.agency_actors') is null
     or pg_catalog.to_regprocedure('public.agency_add_idea(uuid,text,text,text,text,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_client_summary_shape_valid(text)') is null then
    raise exception '0022 idea/write objects must exist before applying 0023';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice17_security;
revoke all on function public.assert_portal_slice17_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice17_security() to service_role;

-- The status vocabulary is deliberately the current flow vocabulary. Existing interim values
-- are normalized before the new check is installed:
--   new -> proposed, considering/planned -> picked, archived -> dropped.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.content_ideas'::pg_catalog.regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute pg_catalog.format('alter table public.content_ideas drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

alter table public.content_ideas
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_ref text,
  add column if not exists became_content_id text;

update public.content_ideas
set status = case status
  when 'new' then 'proposed'
  when 'considering' then 'picked'
  when 'planned' then 'picked'
  when 'archived' then 'dropped'
  else status
end;

-- Existing rows fire the deferred assistant-index touch constraint trigger. Flush those events
-- before changing the table definition; PostgreSQL rejects ALTER TABLE while deferred trigger
-- events are pending (production has real idea rows, unlike an empty replay).
set constraints all immediate;

alter table public.content_ideas
  alter column status set default 'proposed';

alter table public.content_ideas
  add constraint content_ideas_flow_status_check
    check (status in ('proposed', 'picked', 'dropped', 'became_piece')),
  add constraint content_ideas_source_type_check
    check (source_type in ('manual', 'news_run')),
  add constraint content_ideas_source_ref_shape_check
    check (source_ref is null or (
      pg_catalog.char_length(source_ref) between 1 and 2048
      and source_ref ~ '^https://[^[:space:][:cntrl:]]+$'
      and source_ref !~ '^https://[^/?#]*@'
    )),
  add constraint content_ideas_news_source_check
    check ((source_type = 'news_run') = (source_ref is not null)),
  add constraint content_ideas_became_content_id_shape_check
    check (became_content_id is null or pg_catalog.btrim(became_content_id) <> ''),
  add constraint content_ideas_became_link_check
    check ((status = 'became_piece') = (became_content_id is not null));

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.content_ideas'::pg_catalog.regclass
      and conname = 'content_ideas_became_content_tenant_fk'
  ) then
    alter table public.content_ideas
      add constraint content_ideas_became_content_tenant_fk
      foreign key (client_id, became_content_id)
      references public.content_items (client_id, content_id)
      on delete restrict;
  end if;
end;
$$;

create unique index if not exists content_ideas_one_promotion_per_piece
  on public.content_ideas (client_id, became_content_id)
  where became_content_id is not null;

create index if not exists content_ideas_by_status
  on public.content_ideas (client_id, status, created_at desc);

-- Status changes are client-visible board events, but internal source provenance is not.
insert into public.activity_event_types (event_type)
values ('idea_status_changed')
on conflict (event_type) do nothing;

-- The existing client-safe column set remains exact, with only became_content_id added. The
-- source fields deliberately receive no authenticated grant.
grant select (became_content_id) on public.content_ideas to authenticated;

-- Preserve the existing eight-argument agency command for callers already on portal-write.
-- It accepts legacy status spellings during the transition but stores only the new vocabulary.
create or replace function public.agency_add_idea(
  p_client_id uuid, p_title text, p_body text, p_status text, p_author_type text,
  p_author_name text, p_actor_key text, p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_title text := pg_catalog.btrim(p_title);
  v_body text := nullif(pg_catalog.btrim(coalesce(p_body, '')), '');
  v_author text := pg_catalog.btrim(p_author_name);
  v_status text;
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_id uuid;
begin
  select * into v_actor from public.agency_actors
    where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;

  v_status := case p_status
    when 'new' then 'proposed'
    when 'considering' then 'picked'
    when 'planned' then 'picked'
    when 'archived' then 'dropped'
    else p_status
  end;
  if v_title is null or v_title = '' or pg_catalog.char_length(v_title) > 300
     or (v_body is not null and pg_catalog.char_length(v_body) > 4000)
     or v_status not in ('proposed', 'picked', 'dropped')
     or p_author_type is null or p_author_type not in ('client', 'anastasia', 'agent')
     or v_author is null or v_author = '' or pg_catalog.char_length(v_author) > 200 then
    raise exception 'invalid agency idea payload';
  end if;
  if not public.portal_client_summary_shape_valid(v_title)
     or not (v_body is null or public.portal_client_summary_shape_valid(v_body))
     or not public.portal_client_summary_shape_valid(v_author) then
    raise exception 'idea failed client-safety gate';
  end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;

  -- Keep the legacy fingerprint stable so a retry from before this migration is not turned into
  -- a second idea merely because the stored status vocabulary was normalized.
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('title', v_title, 'body', v_body, 'status', p_status,
      'author_type', p_author_type, 'author_name', v_author)::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-add-idea:' || p_client_id::text || ':' || p_idempotency_key, 0));
  select * into v_receipt from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'agency_add_idea'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return (v_receipt.response->>'id')::uuid;
  end if;

  insert into public.content_ideas
    (client_id, author_type, author_name, title, body, status, source_type, source_ref)
  values (p_client_id, p_author_type, v_author, v_title, v_body, v_status, 'manual', null)
  returning id into v_id;

  insert into public.activity_log
    (client_id, event_type, event_key, title, summary, actor_type, actor_name)
  values (p_client_id, 'idea_captured', 'agency:idea:' || p_idempotency_key,
    'Idea: ' || v_title, v_body, 'anastasia', v_actor.display_name);

  insert into public.portal_command_receipts
    (client_id, command_type, idempotency_key, request_fingerprint, response)
  values (p_client_id, 'agency_add_idea', p_idempotency_key, v_fingerprint,
    pg_catalog.jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

revoke all on function public.agency_add_idea(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.agency_add_idea(uuid, text, text, text, text, text, text, text)
  to service_role;

-- Curated news-run ingest. The local Notion-drain parser is still responsible for D3 review, but
-- this boundary independently rejects the obvious unverified markers and requires a real HTTPS
-- source URL. The source URL is retained for agency provenance and is not client-granted.
create or replace function public.agency_add_news_idea(
  p_client_id uuid, p_title text, p_body text, p_source_ref text, p_author_name text,
  p_actor_key text, p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_title text := pg_catalog.btrim(p_title);
  v_body text := nullif(pg_catalog.btrim(coalesce(p_body, '')), '');
  v_source_ref text := pg_catalog.btrim(p_source_ref);
  v_author text := pg_catalog.btrim(p_author_name);
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_id uuid;
begin
  select * into v_actor from public.agency_actors
    where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;
  if v_title is null or v_title = '' or pg_catalog.char_length(v_title) > 300
     or (v_body is not null and pg_catalog.char_length(v_body) > 4000)
     or v_author is null or v_author = '' or pg_catalog.char_length(v_author) > 200
     or v_source_ref is null or pg_catalog.char_length(v_source_ref) not between 9 and 2048
     or v_source_ref !~ '^https://[^[:space:][:cntrl:]]+$'
     or v_source_ref ~ '^https://[^/?#]*@' then
    raise exception 'invalid news idea payload';
  end if;
  if v_title ~* '(\[\s*confirm\s*\]|\bneeds[- ]confirm\b|\bunverified\b|\bto[- ]be[- ]verified\b|\btbd\b)'
     or coalesce(v_body, '') ~* '(\[\s*confirm\s*\]|\bneeds[- ]confirm\b|\bunverified\b|\bto[- ]be[- ]verified\b|\btbd\b)' then
    raise exception 'news idea is not past the curation gate';
  end if;
  if not public.portal_client_summary_shape_valid(v_title)
     or not (v_body is null or public.portal_client_summary_shape_valid(v_body))
     or not public.portal_client_summary_shape_valid(v_author) then
    raise exception 'news idea failed client-safety gate';
  end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('title', v_title, 'body', v_body, 'source_ref', v_source_ref,
      'author_name', v_author)::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-add-news-idea:' || p_client_id::text || ':' || p_idempotency_key, 0));
  select * into v_receipt from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'agency_add_news_idea'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return (v_receipt.response->>'id')::uuid;
  end if;

  insert into public.content_ideas
    (client_id, author_type, author_name, title, body, status, source_type, source_ref)
  values (p_client_id, 'agent', v_author, v_title, v_body, 'proposed', 'news_run', v_source_ref)
  returning id into v_id;

  insert into public.activity_log
    (client_id, event_type, event_key, title, summary, actor_type, actor_name)
  values (p_client_id, 'idea_captured', 'agency:news-idea:' || p_idempotency_key,
    'Idea: ' || v_title, v_body, 'anastasia', v_actor.display_name);

  insert into public.portal_command_receipts
    (client_id, command_type, idempotency_key, request_fingerprint, response)
  values (p_client_id, 'agency_add_news_idea', p_idempotency_key, v_fingerprint,
    pg_catalog.jsonb_build_object('id', v_id));
  return v_id;
end;
$$;

revoke all on function public.agency_add_news_idea(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.agency_add_news_idea(uuid, text, text, text, text, text, text)
  to service_role;

-- Audited lifecycle transition. dropped and became_piece are terminal. Promotion is linked to a
-- same-tenant content_id and one piece cannot be promoted from two ideas.
create or replace function public.set_idea_status(
  p_idea_id uuid, p_status text, p_became_content_id text,
  p_actor_key text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_idea public.content_ideas%rowtype;
  v_link text := nullif(pg_catalog.btrim(p_became_content_id), '');
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_response jsonb;
begin
  select * into v_actor from public.agency_actors
    where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_idea_id is null or p_status not in ('proposed', 'picked', 'dropped', 'became_piece')
     or p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'invalid idea status request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'set-idea-status:' || p_idea_id::text || ':' || p_idempotency_key, 0));
  select * into v_idea from public.content_ideas i where i.id = p_idea_id for update;
  if not found then raise exception 'idea not found'; end if;
  if p_status = 'became_piece' and v_link is null then
    raise exception 'became_piece requires became_content_id';
  end if;
  if p_status <> 'became_piece' and v_link is not null then
    raise exception 'became_content_id is only valid for became_piece';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('idea_id', p_idea_id, 'status', p_status,
      'became_content_id', v_link)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id = v_idea.client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'set_idea_status'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  if v_idea.status = 'dropped' and p_status <> 'dropped' then
    raise exception 'dropped ideas are terminal';
  end if;
  if v_idea.status = 'became_piece'
     and (p_status <> 'became_piece' or v_idea.became_content_id is distinct from v_link) then
    raise exception 'became_piece ideas are terminal';
  end if;
  if v_idea.status = 'picked' and p_status = 'proposed' then
    raise exception 'idea status cannot move backwards';
  end if;

  if v_link is not null then
    perform 1 from public.content_items ci
      where ci.client_id = v_idea.client_id and ci.content_id = v_link
      for share;
    if not found then raise exception 'became content does not belong to this client'; end if;
  end if;

  update public.content_ideas i
  set status = p_status, became_content_id = v_link, updated_at = pg_catalog.now()
  where i.id = v_idea.id;

  v_response := pg_catalog.jsonb_build_object(
    'id', v_idea.id, 'status', p_status, 'became_content_id', v_link);
  if v_idea.status is distinct from p_status
     or v_idea.became_content_id is distinct from v_link then
    insert into public.activity_log
      (client_id, event_type, event_key, title, summary, actor_type, actor_name)
    values (v_idea.client_id, 'idea_status_changed', 'agency:idea-status:' || p_idempotency_key,
      'Idea status updated: ' || v_idea.title,
      'Status: ' || pg_catalog.replace(p_status, '_', ' '), 'anastasia', v_actor.display_name);
  end if;

  insert into public.portal_command_receipts
    (client_id, command_type, idempotency_key, request_fingerprint, response)
  values (v_idea.client_id, 'set_idea_status', p_idempotency_key, v_fingerprint, v_response);
  return v_response;
end;
$$;

revoke all on function public.set_idea_status(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_idea_status(uuid, text, text, text, text)
  to service_role;

-- --- security assertion ------------------------------------------------------
create or replace function public.assert_portal_idea_flow_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actual text[];
  v_expected text[] := array[
    'author_name','author_type','became_content_id','body','client_id','created_at',
    'id','status','title','updated_at'
  ];
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.content_ideas'::pg_catalog.regclass) then
    raise exception 'content_ideas RLS disabled';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename = 'content_ideas'
      and p.policyname = 'content_ideas_read') then
    raise exception 'content_ideas tenant read policy missing';
  end if;
  if exists (select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename = 'content_ideas'
      and p.cmd <> 'SELECT') then
    raise exception 'content_ideas has a client write policy';
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'content_ideas'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  if v_actual is distinct from v_expected then
    raise exception 'unsafe content_ideas authenticated grants: %', v_actual;
  end if;
  if pg_catalog.has_table_privilege('anon', 'public.content_ideas', 'SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_ideas', 'INSERT,UPDATE,DELETE') then
    raise exception 'content_ideas direct client privilege detected';
  end if;
  if exists (select 1 from information_schema.column_privileges cp
    where cp.table_schema = 'public' and cp.table_name = 'content_ideas'
      and cp.grantee in ('anon', 'authenticated')
      and cp.column_name in ('source_type', 'source_ref')) then
    raise exception 'content_ideas internal provenance is client-visible';
  end if;

  if exists (select 1 from public.content_ideas where status not in
    ('proposed', 'picked', 'dropped', 'became_piece')) then
    raise exception 'legacy idea status remains';
  end if;
  if not exists (select 1 from public.activity_event_types where event_type = 'idea_status_changed') then
    raise exception 'idea_status_changed event vocabulary missing';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.content_ideas'::pg_catalog.regclass
      and c.conname = 'content_ideas_became_content_tenant_fk') then
    raise exception 'idea-to-content tenant FK missing';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_ideas'::pg_catalog.regclass
      and t.tgname = 'assistant_index_touch' and t.tgconstraint <> 0
      and t.tgdeferrable and t.tginitdeferred) then
    raise exception 'content_ideas assistant refresh trigger missing';
  end if;

  if exists (select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('agency_add_idea', 'agency_add_news_idea', 'set_idea_status')
      and (not p.prosecdef or not (coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']))) then
    raise exception 'idea writer is not hardened';
  end if;
  if pg_catalog.has_function_privilege('authenticated', 'public.agency_add_idea(uuid,text,text,text,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.agency_add_idea(uuid,text,text,text,text,text,text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.agency_add_idea(uuid,text,text,text,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_add_news_idea(uuid,text,text,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.agency_add_news_idea(uuid,text,text,text,text,text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.agency_add_news_idea(uuid,text,text,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.set_idea_status(uuid,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.set_idea_status(uuid,text,text,text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.set_idea_status(uuid,text,text,text,text)', 'EXECUTE') then
    raise exception 'unsafe idea writer privileges';
  end if;
end;
$$;

revoke all on function public.assert_portal_idea_flow_security() from public, anon, authenticated;
grant execute on function public.assert_portal_idea_flow_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice17_security();
  perform public.assert_portal_idea_flow_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
