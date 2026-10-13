-- Client-facing agency proposals: structured, reviewable conversation threads that are
-- intentionally separate from content_change_requests. A proposal can cover a campaign,
-- a production choice, or a package of clips without pretending to be a canonical-content edit.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null
     or pg_catalog.to_regprocedure('public.portal_require_client_action(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.portal_client_link_url_valid(text)') is null then
    raise exception '0053 requires the portal security, command, inbox, capability, and link boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice45_security;
revoke all on function public.assert_portal_slice45_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice45_security() to service_role;

-- No HTML or Markdown is accepted. The client renders this small JSON document as React text.
-- The stable URL allow-list is checked by the service writer, rather than a table CHECK, because
-- an allow-list change must not retroactively invalidate a historically approved proposal.
create function public.portal_proposal_blocks_shape_valid(p_blocks jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_block jsonb; v_item jsonb; v_kind text; v_title text; v_body text; v_key text;
begin
  if pg_catalog.jsonb_typeof(p_blocks) <> 'array'
     or pg_catalog.jsonb_array_length(p_blocks) not between 1 and 40 then return false; end if;
  for v_block in select value from pg_catalog.jsonb_array_elements(p_blocks) loop
    if pg_catalog.jsonb_typeof(v_block) <> 'object' then return false; end if;
    for v_key in select key from pg_catalog.jsonb_object_keys(v_block) key loop
      if v_key not in ('kind','title','body','items','links') then return false; end if;
    end loop;
    v_kind := v_block->>'kind'; v_title := nullif(pg_catalog.btrim(v_block->>'title'),'');
    v_body := nullif(pg_catalog.btrim(v_block->>'body'),'');
    if v_kind not in ('heading','paragraph','callout','checklist','quote','links')
       or not (v_title is null or (pg_catalog.char_length(v_title) <= 300 and public.portal_client_summary_shape_valid(v_title)))
       or not (v_body is null or (pg_catalog.char_length(v_body) <= 8000 and public.portal_client_summary_shape_valid(v_body))) then
      return false;
    end if;
    if v_kind = 'heading' and v_title is null then return false; end if;
    if v_kind in ('paragraph','quote') and v_body is null then return false; end if;
    if v_kind = 'callout' and v_title is null and v_body is null then return false; end if;
    if v_kind = 'checklist' then
      if pg_catalog.jsonb_typeof(v_block->'items') <> 'array'
         or pg_catalog.jsonb_array_length(v_block->'items') not between 1 and 50 then return false; end if;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_block->'items') loop
        if pg_catalog.jsonb_typeof(v_item) <> 'string' or pg_catalog.char_length(v_item #>> '{}') not between 1 and 4000
           or not public.portal_client_summary_shape_valid(v_item #>> '{}') then return false; end if;
      end loop;
    elsif v_block ? 'items' then return false;
    end if;
    if v_kind = 'links' then
      if pg_catalog.jsonb_typeof(v_block->'links') <> 'array'
         or pg_catalog.jsonb_array_length(v_block->'links') not between 1 and 20 then return false; end if;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_block->'links') loop
        if pg_catalog.jsonb_typeof(v_item) <> 'object' or (v_item->>'label') is null or (v_item->>'url') is null
           or pg_catalog.char_length(pg_catalog.btrim(v_item->>'label')) not between 1 and 300
           or not public.portal_client_summary_shape_valid(v_item->>'label')
           or (v_item->>'url') !~ '^https://[^[:space:][:cntrl:]]+$'
           or (v_item->>'url') ~ '^https://[^/?#]*@' then return false; end if;
      end loop;
    elsif v_block ? 'links' then return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.portal_proposal_blocks_shape_valid(jsonb) from public, anon, authenticated, service_role;

create table public.client_proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  proposal_key text not null check (proposal_key ~ '^[a-z0-9][a-z0-9._-]{0,199}$'),
  title text not null check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 300 and public.portal_client_summary_shape_valid(title)),
  summary text check (summary is null or (pg_catalog.char_length(pg_catalog.btrim(summary)) between 1 and 2000 and public.portal_client_summary_shape_valid(summary))),
  blocks jsonb not null check (public.portal_proposal_blocks_shape_valid(blocks)),
  status text not null default 'draft' check (status in ('draft','awaiting_decision','approved','change_requested','closed')),
  revision int not null default 1 check (revision > 0),
  submitted_at timestamptz,
  decided_at timestamptz,
  decision_note text check (decision_note is null or (pg_catalog.char_length(pg_catalog.btrim(decision_note)) between 1 and 4000 and public.portal_client_summary_shape_valid(decision_note))),
  decided_by uuid references auth.users(id),
  decided_by_name text check (decided_by_name is null or (pg_catalog.char_length(pg_catalog.btrim(decided_by_name)) between 1 and 200 and public.portal_client_summary_shape_valid(decided_by_name))),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id), unique (client_id, proposal_key),
  check ((status = 'draft') = (submitted_at is null)),
  check ((status in ('approved','change_requested')) = (decided_at is not null and decided_by is not null and decided_by_name is not null))
);
create table public.client_proposal_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  proposal_id uuid not null,
  author_type text not null check (author_type in ('client','anastasia')),
  author_name text not null check (pg_catalog.char_length(pg_catalog.btrim(author_name)) between 1 and 200 and public.portal_client_summary_shape_valid(author_name)),
  body text not null check (pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 4000 and public.portal_client_summary_shape_valid(body)),
  idempotency_key uuid not null,
  message_fingerprint text not null check (message_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id), unique (client_id, idempotency_key),
  foreign key (proposal_id, client_id) references public.client_proposals(id, client_id) on delete cascade
);
create table public.client_proposal_decisions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  proposal_id uuid not null,
  revision int not null check (revision > 0),
  decision text not null check (decision in ('approved','change_requested')),
  note text check (note is null or (pg_catalog.char_length(pg_catalog.btrim(note)) between 1 and 4000 and public.portal_client_summary_shape_valid(note))),
  decided_by uuid not null references auth.users(id),
  decided_by_name text not null check (pg_catalog.char_length(pg_catalog.btrim(decided_by_name)) between 1 and 200 and public.portal_client_summary_shape_valid(decided_by_name)),
  created_at timestamptz not null default pg_catalog.now(),
  unique (proposal_id, revision),
  foreign key (proposal_id, client_id) references public.client_proposals(id, client_id) on delete cascade
);
create index client_proposals_client_status on public.client_proposals(client_id,status,submitted_at desc);
create index client_proposal_messages_thread on public.client_proposal_messages(proposal_id,created_at,id);

alter table public.client_proposals enable row level security;
alter table public.client_proposal_messages enable row level security;
alter table public.client_proposal_decisions enable row level security;
create policy client_proposals_read on public.client_proposals for select to authenticated
  using (client_id in (select public.my_client_ids()) and status <> 'draft');
create policy client_proposal_messages_read on public.client_proposal_messages for select to authenticated
  using (client_id in (select public.my_client_ids()) and exists (select 1 from public.client_proposals p where p.id=proposal_id and p.client_id=client_id and p.status<>'draft'));
create policy client_proposal_decisions_read on public.client_proposal_decisions for select to authenticated
  using (client_id in (select public.my_client_ids()) and exists (select 1 from public.client_proposals p where p.id=proposal_id and p.client_id=client_id and p.status<>'draft'));

revoke all on public.client_proposals, public.client_proposal_messages, public.client_proposal_decisions from public, anon, authenticated, service_role;
grant select(id,client_id,proposal_key,title,summary,blocks,status,revision,submitted_at,decided_at,decision_note,decided_by_name,created_at,updated_at) on public.client_proposals to authenticated;
grant select(id,client_id,proposal_id,author_type,author_name,body,created_at) on public.client_proposal_messages to authenticated;
grant select(id,client_id,proposal_id,revision,decision,note,decided_by_name,created_at) on public.client_proposal_decisions to authenticated;
grant select on public.client_proposals, public.client_proposal_messages, public.client_proposal_decisions to service_role;

create view public.client_proposals_client with (security_invoker=true, security_barrier=true) as
  select id,client_id,proposal_key,title,summary,blocks,status,revision,submitted_at,decided_at,decision_note,decided_by_name,created_at,updated_at
  from public.client_proposals where status <> 'draft';
create view public.client_proposal_messages_client with (security_invoker=true, security_barrier=true) as
  select m.id,m.client_id,m.proposal_id,m.author_type,m.author_name,m.body,m.created_at
  from public.client_proposal_messages m join public.client_proposals p on p.id=m.proposal_id and p.client_id=m.client_id
  where p.status <> 'draft';
revoke all on public.client_proposals_client, public.client_proposal_messages_client from public, anon, authenticated, service_role;
grant select on public.client_proposals_client, public.client_proposal_messages_client to authenticated, service_role;

insert into public.activity_event_types(event_type) values
 ('proposal_submitted'),('proposal_approved'),('proposal_change_requested'),('proposal_message') on conflict do nothing;

-- Proposal conversation is a client-originated write just like a content-request reply.
-- Keep it inside the same bounded, per-client/hour mutation budget rather than creating
-- an unthrottled new message channel.
alter table public.portal_mutation_rate_limits drop constraint if exists portal_mutation_rate_limits_action_check;
alter table public.portal_mutation_rate_limits add constraint portal_mutation_rate_limits_action_check check (
  action in ('content_edit','content_create','content_archive','content_request_reply','proposal_reply')
);
create or replace function public.portal_consume_request_rate_limit(
  p_client_id uuid,p_auth_user_id uuid,p_action text
) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_attempts int; v_window timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
begin
  if p_action not in ('content_edit','content_create','content_archive','content_request_reply','proposal_reply') then return false; end if;
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

-- Agency creates a safe draft, then explicitly submits a known revision. A submitted or
-- approved proposal cannot be overwritten: it must first receive a change request.
create function public.upsert_client_proposal_draft(
  p_client_id uuid,p_proposal_key text,p_title text,p_summary text,p_blocks jsonb,p_actor_key text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.agency_actors%rowtype; v_row public.client_proposals%rowtype; v_receipt public.portal_command_receipts%rowtype; v_fp text; v_link jsonb;
begin
  if p_client_id is null or p_proposal_key !~ '^[a-z0-9][a-z0-9._-]{0,199}$' or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,200}$'
     or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 300
     or not public.portal_client_summary_shape_valid(p_title)
     or not (p_summary is null or (pg_catalog.char_length(pg_catalog.btrim(p_summary)) between 1 and 2000 and public.portal_client_summary_shape_valid(p_summary)))
     or not public.portal_proposal_blocks_shape_valid(p_blocks) then raise exception 'invalid proposal draft'; end if;
  for v_link in select link from pg_catalog.jsonb_array_elements(p_blocks) b cross join lateral pg_catalog.jsonb_array_elements(coalesce(b->'links','[]'::jsonb)) link loop
    if not public.portal_client_link_url_valid(v_link->>'url') then raise exception 'proposal link is not an approved client-visible URL'; end if;
  end loop;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(p_client_id,'agency_mutations') then raise exception 'agency_mutations_disabled' using errcode='42501'; end if;
  v_fp:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('key',p_proposal_key,'title',p_title,'summary',p_summary,'blocks',p_blocks,'actor',p_actor_key)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('proposal:'||p_client_id::text||':'||p_proposal_key,0));
  select * into v_receipt from public.portal_command_receipts r where r.client_id=p_client_id and r.idempotency_key=p_idempotency_key;
  if found then if v_receipt.command_type<>'upsert_client_proposal_draft' or v_receipt.request_fingerprint<>v_fp then raise exception 'idempotency key reused with different request'; end if; return v_receipt.response; end if;
  select * into v_row from public.client_proposals where client_id=p_client_id and proposal_key=p_proposal_key for update;
  if found then
    if v_row.status not in ('draft','change_requested') then raise exception 'proposal must be changed through a client-requested revision'; end if;
    update public.client_proposals set title=pg_catalog.btrim(p_title),summary=nullif(pg_catalog.btrim(p_summary),''),blocks=p_blocks,revision=v_row.revision+1,status='draft',submitted_at=null,decided_at=null,decision_note=null,decided_by=null,decided_by_name=null,updated_at=pg_catalog.now() where id=v_row.id returning * into v_row;
  else
    insert into public.client_proposals(client_id,proposal_key,title,summary,blocks) values(p_client_id,p_proposal_key,pg_catalog.btrim(p_title),nullif(pg_catalog.btrim(p_summary),''),p_blocks) returning * into v_row;
  end if;
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,request_fingerprint,response) values(p_client_id,'upsert_client_proposal_draft',p_idempotency_key,v_fp,pg_catalog.jsonb_build_object('id',v_row.id,'revision',v_row.revision,'status',v_row.status));
  return pg_catalog.jsonb_build_object('id',v_row.id,'revision',v_row.revision,'status',v_row.status);
end;
$$;

create function public.submit_client_proposal(
  p_client_id uuid,p_proposal_key text,p_revision int,p_actor_key text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.client_proposals%rowtype; v_actor public.agency_actors%rowtype; v_receipt public.portal_command_receipts%rowtype; v_fp text; v_slug text;
begin
  if p_client_id is null or p_revision < 1 or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,200}$' then raise exception 'invalid proposal submission'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active; if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(p_client_id,'agency_mutations') then raise exception 'agency_mutations_disabled' using errcode='42501'; end if;
  v_fp:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('key',p_proposal_key,'revision',p_revision,'actor',p_actor_key)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('proposal-submit:'||p_client_id::text||':'||p_proposal_key,0));
  select * into v_receipt from public.portal_command_receipts r where r.client_id=p_client_id and r.idempotency_key=p_idempotency_key;
  if found then if v_receipt.command_type<>'submit_client_proposal' or v_receipt.request_fingerprint<>v_fp then raise exception 'idempotency key reused with different request'; end if; return v_receipt.response; end if;
  select * into v_row from public.client_proposals where client_id=p_client_id and proposal_key=p_proposal_key for update;
  if not found or v_row.status<>'draft' or v_row.revision<>p_revision then raise exception 'proposal draft revision is not ready to submit'; end if;
  update public.client_proposals set status='awaiting_decision',submitted_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=v_row.id returning * into v_row;
  select slug into v_slug from public.clients where id=p_client_id;
  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name,related_url) values(p_client_id,'proposal_submitted','proposal:'||v_row.id::text||':'||v_row.revision,'Review requested: '||v_row.title,coalesce(v_row.summary,'A proposal from The Dot is ready for your decision.'),'anastasia',v_actor.display_name,case when v_slug is null then null else 'https://www.thedotcreative.co/client/'||v_slug||'/requests/proposals/'||v_row.proposal_key end);
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,request_fingerprint,response) values(p_client_id,'submit_client_proposal',p_idempotency_key,v_fp,pg_catalog.jsonb_build_object('id',v_row.id,'revision',v_row.revision,'status',v_row.status));
  return pg_catalog.jsonb_build_object('id',v_row.id,'revision',v_row.revision,'status',v_row.status);
end;
$$;

create function public.record_client_proposal_decision(p_proposal_id uuid,p_revision int,p_decision text,p_note text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_row public.client_proposals%rowtype; v_name text; v_receipt public.portal_command_receipts%rowtype; v_fp text; v_decision_id uuid;
begin
  if v_uid is null or p_proposal_id is null or p_revision<1 or p_decision not in ('approved','change_requested') or p_idempotency_key is null
     or not (p_note is null or (pg_catalog.char_length(pg_catalog.btrim(p_note)) between 1 and 4000 and public.portal_client_summary_shape_valid(p_note))) then raise exception 'invalid proposal decision'; end if;
  select p.* into v_row from public.client_proposals p join public.client_users cu on cu.client_id=p.client_id and cu.auth_user_id=v_uid where p.id=p_proposal_id for update of p;
  if not found then raise exception 'proposal not found' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_row.client_id,'can_decide');
  select coalesce(nullif(pg_catalog.btrim(name),''),'Client') into v_name from public.client_users where client_id=v_row.client_id and auth_user_id=v_uid;
  v_fp:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('proposal_id',p_proposal_id,'revision',p_revision,'decision',p_decision,'note',p_note,'uid',v_uid)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('proposal-decision:'||v_row.client_id::text||':'||p_proposal_id::text||':'||p_revision::text,0));
  select * into v_receipt from public.portal_command_receipts r where r.client_id=v_row.client_id and r.idempotency_key=p_idempotency_key::text;
  if found then if v_receipt.command_type<>'record_client_proposal_decision' or v_receipt.request_fingerprint<>v_fp then raise exception 'idempotency key reused with different request'; end if; return v_receipt.response; end if;
  if v_row.status<>'awaiting_decision' or v_row.revision<>p_revision then raise exception 'proposal is no longer awaiting this revision'; end if;
  insert into public.client_proposal_decisions(client_id,proposal_id,revision,decision,note,decided_by,decided_by_name) values(v_row.client_id,v_row.id,p_revision,p_decision,nullif(pg_catalog.btrim(p_note),''),v_uid,v_name) returning id into v_decision_id;
  update public.client_proposals set status=case when p_decision='approved' then 'approved' else 'change_requested' end,decided_at=pg_catalog.now(),decision_note=nullif(pg_catalog.btrim(p_note),''),decided_by=v_uid,decided_by_name=v_name,updated_at=pg_catalog.now() where id=v_row.id;
  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name) values(v_row.client_id,case when p_decision='approved' then 'proposal_approved' else 'proposal_change_requested' end,'proposal-decision:'||v_decision_id::text,case when p_decision='approved' then 'Approved: ' else 'Changes requested: ' end||v_row.title,nullif(pg_catalog.btrim(p_note),''),'client',v_name);
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,actor_type,actor_name,payload,requires_reconciliation) values(v_row.client_id,'proposal-decision:'||v_decision_id::text,case when p_decision='approved' then 'proposal_approved' else 'proposal_change_requested' end,'client_proposal',v_row.id,'client',v_name,pg_catalog.jsonb_build_object('proposal_id',v_row.id,'proposal_key',v_row.proposal_key,'revision',p_revision,'decision',p_decision,'note',nullif(pg_catalog.btrim(p_note),'')),true);
  insert into public.portal_command_receipts(client_id,auth_user_id,command_type,idempotency_key,request_fingerprint,response) values(v_row.client_id,v_uid,'record_client_proposal_decision',p_idempotency_key::text,v_fp,pg_catalog.jsonb_build_object('id',v_decision_id,'outcome','recorded'));
  return pg_catalog.jsonb_build_object('id',v_decision_id,'outcome','recorded');
end;
$$;

create function public.reply_to_client_proposal_as_client(p_proposal_id uuid,p_body text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_row public.client_proposals%rowtype; v_body text:=pg_catalog.btrim(p_body); v_name text; v_fp text; v_receipt public.portal_command_receipts%rowtype; v_id uuid;
begin
  if v_uid is null or p_proposal_id is null or p_idempotency_key is null or pg_catalog.char_length(v_body) not between 1 and 4000 or not public.portal_client_summary_shape_valid(v_body) then raise exception 'invalid proposal reply'; end if;
  select p.* into v_row from public.client_proposals p join public.client_users cu on cu.client_id=p.client_id and cu.auth_user_id=v_uid where p.id=p_proposal_id for update of p;
  if not found or v_row.status='draft' then raise exception 'proposal not found' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_row.client_id,'can_submit_requests');
  select coalesce(nullif(pg_catalog.btrim(name),''),'Client') into v_name from public.client_users where client_id=v_row.client_id and auth_user_id=v_uid;
  v_fp:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('proposal_id',p_proposal_id,'body',v_body,'uid',v_uid)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('proposal-reply:'||v_row.client_id::text||':'||p_idempotency_key::text,0));
  select * into v_receipt from public.portal_command_receipts r where r.client_id=v_row.client_id and r.idempotency_key=p_idempotency_key::text;
  if found then if v_receipt.command_type<>'reply_to_client_proposal_as_client' or v_receipt.request_fingerprint<>v_fp then raise exception 'idempotency key reused with different request'; end if; return v_receipt.response; end if;
  if not public.portal_consume_request_rate_limit(v_row.client_id,v_uid,'proposal_reply') then
    return pg_catalog.jsonb_build_object('outcome','rate_limited');
  end if;
  insert into public.client_proposal_messages(client_id,proposal_id,author_type,author_name,body,idempotency_key,message_fingerprint) values(v_row.client_id,v_row.id,'client',v_name,v_body,p_idempotency_key,v_fp) returning id into v_id;
  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name) values(v_row.client_id,'proposal_message','proposal-message:'||v_id::text,'Reply: '||v_row.title,v_body,'client',v_name);
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,actor_type,actor_name,payload,requires_reconciliation) values(v_row.client_id,'proposal-message:'||v_id::text,'proposal_message','client_proposal',v_row.id,'client',v_name,pg_catalog.jsonb_build_object('proposal_id',v_row.id,'proposal_key',v_row.proposal_key,'message_id',v_id),true);
  insert into public.portal_command_receipts(client_id,auth_user_id,command_type,idempotency_key,request_fingerprint,response) values(v_row.client_id,v_uid,'reply_to_client_proposal_as_client',p_idempotency_key::text,v_fp,pg_catalog.jsonb_build_object('id',v_id,'outcome','created'));
  return pg_catalog.jsonb_build_object('id',v_id,'outcome','created');
end;
$$;

create function public.reply_to_client_proposal(p_proposal_id uuid,p_body text,p_actor_key text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.client_proposals%rowtype; v_body text:=pg_catalog.btrim(p_body); v_actor public.agency_actors%rowtype; v_fp text; v_receipt public.portal_command_receipts%rowtype; v_id uuid;
begin
  if p_proposal_id is null or p_idempotency_key is null or pg_catalog.char_length(v_body) not between 1 and 4000 or not public.portal_client_summary_shape_valid(v_body) then raise exception 'invalid agency proposal reply'; end if;
  select * into v_row from public.client_proposals where id=p_proposal_id for update; if not found or v_row.status='draft' then raise exception 'proposal not found'; end if;
  select * into v_actor from public.agency_actors where actor_key=p_actor_key and active; if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_row.client_id,'agency_mutations') then raise exception 'agency_mutations_disabled' using errcode='42501'; end if;
  v_fp:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('proposal_id',p_proposal_id,'body',v_body,'actor',p_actor_key)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agency-proposal-reply:'||v_row.client_id::text||':'||p_idempotency_key::text,0));
  select * into v_receipt from public.portal_command_receipts r where r.client_id=v_row.client_id and r.idempotency_key=p_idempotency_key::text;
  if found then if v_receipt.command_type<>'reply_to_client_proposal' or v_receipt.request_fingerprint<>v_fp then raise exception 'idempotency key reused with different request'; end if; return v_receipt.response; end if;
  insert into public.client_proposal_messages(client_id,proposal_id,author_type,author_name,body,idempotency_key,message_fingerprint) values(v_row.client_id,v_row.id,'anastasia',v_actor.display_name,v_body,p_idempotency_key,v_fp) returning id into v_id;
  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name) values(v_row.client_id,'proposal_message','agency-proposal-message:'||v_id::text,'Reply from The Dot: '||v_row.title,v_body,'anastasia',v_actor.display_name);
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,request_fingerprint,response) values(v_row.client_id,'reply_to_client_proposal',p_idempotency_key::text,v_fp,pg_catalog.jsonb_build_object('id',v_id,'outcome','created'));
  return pg_catalog.jsonb_build_object('id',v_id,'outcome','created');
end;
$$;

revoke all on function public.upsert_client_proposal_draft(uuid,text,text,text,jsonb,text,text), public.submit_client_proposal(uuid,text,int,text,text), public.reply_to_client_proposal(uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.upsert_client_proposal_draft(uuid,text,text,text,jsonb,text,text), public.submit_client_proposal(uuid,text,int,text,text), public.reply_to_client_proposal(uuid,text,text,uuid) to service_role;
revoke all on function public.record_client_proposal_decision(uuid,int,text,text,uuid), public.reply_to_client_proposal_as_client(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_client_proposal_decision(uuid,int,text,text,uuid), public.reply_to_client_proposal_as_client(uuid,text,uuid) to authenticated;

create function public.assert_portal_proposal_security() returns void language plpgsql security definer set search_path='' as $$
declare v_def text; v_columns text[];
begin
  if exists(select 1 from pg_catalog.pg_class c where c.oid in ('public.client_proposals'::regclass,'public.client_proposal_messages'::regclass,'public.client_proposal_decisions'::regclass) and not c.relrowsecurity) then raise exception 'proposal RLS disabled'; end if;
  if pg_catalog.has_table_privilege('anon','public.client_proposals','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('anon','public.client_proposal_messages','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('anon','public.client_proposal_decisions','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.client_proposals','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.client_proposal_messages','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.client_proposal_decisions','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('service_role','public.client_proposals','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('service_role','public.client_proposal_messages','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('service_role','public.client_proposal_decisions','INSERT,UPDATE,DELETE') then raise exception 'proposal direct writes or anon reads are unsafe'; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_columns from information_schema.column_privileges cp where cp.table_schema='public' and cp.table_name='client_proposals' and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  if v_columns is distinct from array['blocks','client_id','created_at','decided_at','decided_by_name','decision_note','id','proposal_key','revision','status','submitted_at','summary','title','updated_at'] then raise exception 'proposal authenticated grants drifted'; end if;
  if not exists(select 1 from pg_catalog.pg_class c where c.oid='public.client_proposals_client'::regclass and c.reloptions @> array['security_invoker=true']) then raise exception 'proposal client view is not security invoker'; end if;
  select pg_catalog.pg_get_functiondef('public.record_client_proposal_decision(uuid,int,text,text,uuid)'::regprocedure) into v_def;
  if v_def is null or v_def not ilike '%security definer%' or v_def not ilike '%portal_require_client_action%' or v_def not ilike '%client_users%' or v_def not ilike '%portal_inbox_events%' or v_def not ilike '%for update%' then raise exception 'proposal decision writer is incomplete'; end if;
  if pg_catalog.has_function_privilege('anon','public.record_client_proposal_decision(uuid,int,text,text,uuid)','EXECUTE') or not pg_catalog.has_function_privilege('authenticated','public.record_client_proposal_decision(uuid,int,text,text,uuid)','EXECUTE') or pg_catalog.has_function_privilege('service_role','public.record_client_proposal_decision(uuid,int,text,text,uuid)','EXECUTE') then raise exception 'proposal decision grants unsafe'; end if;
end;
$$;
revoke all on function public.assert_portal_proposal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_proposal_security() to service_role;
create function public.assert_portal_security() returns void language plpgsql security definer set search_path='' as $$ begin perform public.assert_portal_slice45_security(); perform public.assert_portal_proposal_security(); end; $$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;
select public.assert_portal_security();

commit;
