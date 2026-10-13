-- Client edit/create/archive requests and the checked v1 local-reconciliation boundary.
-- Released snapshots remain immutable. Client requests never write content_items or repository paths.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_require_client_action(uuid,text)') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null then
    raise exception '0013 access-control objects must exist before applying 0014';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice8_security;
revoke all on function public.assert_portal_slice8_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice8_security() to service_role;

create or replace function public.portal_content_request_payload_valid(
  p_request_type text,p_payload jsonb
) returns boolean language sql immutable set search_path='' as $$
  select pg_catalog.jsonb_typeof(p_payload)='object' and case p_request_type
    when 'edit' then
    (select pg_catalog.array_agg(k order by k)=array['block_key','original_checksum','proposed_text']
       from pg_catalog.jsonb_object_keys(p_payload) k)
      and p_payload->>'block_key' is not null
      and p_payload->>'original_checksum' is not null
      and p_payload->>'proposed_text' is not null
      and p_payload->>'block_key' ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      and p_payload->>'original_checksum' ~ '^[0-9a-f]{64}$'
      and pg_catalog.char_length(pg_catalog.btrim(p_payload->>'proposed_text')) between 1 and 8000
    when 'create' then
      (select pg_catalog.array_agg(k order by k)=array['brief','desired_date','notes','platforms','title']
       from pg_catalog.jsonb_object_keys(p_payload) k)
      and p_payload->>'title' is not null
      and p_payload->>'brief' is not null
      and pg_catalog.char_length(pg_catalog.btrim(p_payload->>'title')) between 1 and 300
      and pg_catalog.char_length(pg_catalog.btrim(p_payload->>'brief')) between 1 and 4000
      and pg_catalog.jsonb_typeof(p_payload->'platforms')='array'
      and pg_catalog.jsonb_array_length(p_payload->'platforms') between 1 and 5
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(p_payload->'platforms') e(value)
        where pg_catalog.jsonb_typeof(e.value)<>'string'
          or e.value#>>'{}' not in ('instagram','facebook','youtube','squarespace','other')
      )
      and (p_payload->>'desired_date' is null
        or p_payload->>'desired_date' ~ '^\d{4}-\d{2}-\d{2}$')
      and (p_payload->>'notes' is null
        or pg_catalog.char_length(pg_catalog.btrim(p_payload->>'notes')) between 1 and 2000)
    when 'archive' then
      (select pg_catalog.array_agg(k order by k)=array['reason']
       from pg_catalog.jsonb_object_keys(p_payload) k)
      and (p_payload->>'reason' is null
        or pg_catalog.char_length(pg_catalog.btrim(p_payload->>'reason')) between 1 and 2000)
    else false
  end
$$;

revoke all on function public.portal_content_request_payload_valid(text,jsonb)
  from public,anon,authenticated,service_role;

create table public.content_change_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_id uuid,
  requested_content_id text,
  request_type text not null check (request_type in ('edit','create','archive')),
  base_version int check (base_version is null or base_version>0),
  payload jsonb not null,
  status text not null default 'pending' check (status in (
    'pending','applying','prepared','applied','conflicted','rejected','superseded'
  )),
  requested_by uuid not null references auth.users(id),
  requester_name text not null check (
    pg_catalog.char_length(pg_catalog.btrim(requester_name)) between 1 and 200
  ),
  idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  reconciled_at timestamptz,
  reconciled_by text,
  canonical_content_id uuid,
  canonical_version int check (canonical_version is null or canonical_version>0),
  resolution_note text check (
    resolution_note is null or pg_catalog.char_length(pg_catalog.btrim(resolution_note)) between 1 and 2000
  ),
  unique (id,client_id),
  unique (client_id,idempotency_key),
  foreign key (content_id,client_id,base_version)
    references public.content_item_versions(content_item_id,client_id,version),
  foreign key (canonical_content_id,client_id,canonical_version)
    references public.content_item_versions(content_item_id,client_id,version),
  check (public.portal_content_request_payload_valid(request_type,payload)),
  check (
    (request_type='create' and content_id is null and base_version is null)
    or (request_type in ('edit','archive') and content_id is not null and base_version is not null
      and requested_content_id is null)
  ),
  check ((canonical_content_id is null and canonical_version is null)
    or (canonical_content_id is not null and canonical_version is not null)),
  check (status not in ('prepared','applied')
    or (canonical_content_id is not null and canonical_version is not null)),
  check (requested_content_id is null or requested_content_id ~ '^[a-z0-9][a-z0-9._-]{1,119}$')
);

create unique index content_change_requests_open_edit
  on public.content_change_requests(client_id,content_id,base_version,(payload->>'block_key'))
  where request_type='edit' and status in ('pending','applying','prepared');
create unique index content_change_requests_open_archive
  on public.content_change_requests(client_id,content_id)
  where request_type='archive' and status in ('pending','applying');
create unique index content_change_requests_canonical_result
  on public.content_change_requests(client_id,canonical_content_id,canonical_version)
  where status in ('prepared','applied') and request_type in ('edit','create');
create index content_change_requests_client_created
  on public.content_change_requests(client_id,created_at desc,id desc);

alter table public.content_change_requests enable row level security;
create policy content_change_requests_read on public.content_change_requests for select
  using (client_id in (select public.my_client_ids()));

create table public.portal_mutation_rate_limits (
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('content_edit','content_create','content_archive')),
  window_started_at timestamptz not null,
  attempts int not null check (attempts>0),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key(client_id,auth_user_id,action,window_started_at)
);
alter table public.portal_mutation_rate_limits enable row level security;

create or replace function public.portal_consume_request_rate_limit(
  p_client_id uuid,p_auth_user_id uuid,p_action text
) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_attempts int; v_window timestamptz:=pg_catalog.date_trunc('hour',pg_catalog.now());
begin
  if p_action not in ('content_edit','content_create','content_archive') then return false; end if;
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
  from public,anon,authenticated,service_role;

create table public.canonical_change_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (operation in ('edit','create','archive')),
  canonical_object_key text,
  expected_base_version int check (expected_base_version is null or expected_base_version>0),
  expected_base_commit text check (expected_base_commit is null or expected_base_commit ~ '^[0-9a-f]{40}$'),
  structured_patch jsonb not null check (pg_catalog.jsonb_typeof(structured_patch)='object'),
  status text not null default 'pending' check (status in (
    'pending','processing','committed','synced','conflicted','failed','abandoned'
  )),
  attempts int not null default 0 check (attempts>=0),
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz,
  last_error text check (last_error is null or pg_catalog.char_length(last_error)<=2000),
  commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-f]{40}$'),
  committed_at timestamptz,
  synced_at timestamptz,
  idempotency_key uuid not null,
  created_by uuid not null references public.agency_actors(id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique(request_id),
  unique(client_id,idempotency_key),
  foreign key(request_id,client_id) references public.content_change_requests(id,client_id)
    on delete cascade,
  check (canonical_object_key is null or (
    canonical_object_key ~ '^[a-z0-9][a-z0-9._-]*\.md$'
    and canonical_object_key !~ '(^|/)\.\.?(/|$)'
    and pg_catalog.strpos(canonical_object_key,'/')=0
  )),
  check ((status in ('processing','committed','synced') and locked_by is not null and locked_at is not null)
    or status not in ('processing','committed','synced'))
);
create index canonical_change_jobs_pending
  on public.canonical_change_jobs(status,next_attempt_at,created_at);
alter table public.canonical_change_jobs enable row level security;

-- Safe client projection. The canonical content key appears only after the resulting item is
-- client-visible because the security-invoker join is itself constrained by content_items RLS.
create view public.content_change_requests_client with (security_invoker=true) as
select r.id,r.client_id,r.content_id,r.request_type,r.base_version,r.payload,r.status,
  r.requester_name,r.created_at,r.updated_at,r.reconciled_at,r.reconciled_by,
  r.canonical_version,r.resolution_note,ci.content_id as canonical_content_key
from public.content_change_requests r
left join public.content_items ci
  on ci.id=r.canonical_content_id and ci.client_id=r.client_id;

-- Request RPCs derive tenant, actor, original text/checksum, and released version server-side.
create function public.request_content_edit(
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

create function public.request_content_create(
  p_client_id uuid,p_title text,p_brief text,p_platforms text[],p_desired_date date,
  p_notes text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_actor text; v_title text:=pg_catalog.btrim(p_title);
  v_brief text:=pg_catalog.btrim(p_brief); v_notes text:=nullif(pg_catalog.btrim(p_notes),'');
  v_platforms text[]; v_payload jsonb; v_fingerprint text;
  v_existing public.content_change_requests%rowtype; v_id uuid;
begin
  if v_uid is null or p_idempotency_key is null or p_title is null or p_brief is null
     or pg_catalog.char_length(v_title) not between 1 and 300
     or pg_catalog.char_length(v_brief) not between 1 and 4000
     or (v_notes is not null and pg_catalog.char_length(v_notes)>2000)
     or p_desired_date is null or p_platforms is null or p_desired_date<current_date
     or p_desired_date>current_date+730 then raise exception 'invalid create request'; end if;
  select pg_catalog.array_agg(distinct pg_catalog.lower(pg_catalog.btrim(p)) order by pg_catalog.lower(pg_catalog.btrim(p)))
    into v_platforms from pg_catalog.unnest(p_platforms) p;
  if coalesce(pg_catalog.array_length(v_platforms,1),0) not between 1 and 5
     or exists(select 1 from pg_catalog.unnest(p_platforms) p where p is null or pg_catalog.btrim(p)='')
     or exists(select 1 from pg_catalog.unnest(v_platforms) p
       where p not in ('instagram','facebook','youtube','squarespace','other')) then
    raise exception 'invalid create request platforms'; end if;
  perform public.portal_require_client_action(p_client_id,'can_submit_requests');
  select coalesce(nullif(pg_catalog.btrim(cu.name),''),'Client') into v_actor
    from public.client_users cu where cu.client_id=p_client_id and cu.auth_user_id=v_uid;
  v_payload:=pg_catalog.jsonb_build_object('title',v_title,'brief',v_brief,
    'platforms',pg_catalog.to_jsonb(v_platforms),'desired_date',p_desired_date,'notes',v_notes);
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_client_id::text||':'||p_idempotency_key::text,0));
  select * into v_existing from public.content_change_requests r
    where r.client_id=p_client_id and r.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_fingerprint<>v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return pg_catalog.jsonb_build_object('id',v_existing.id,'status',v_existing.status,'outcome','unchanged');
  end if;
  if not public.portal_consume_request_rate_limit(p_client_id,v_uid,'content_create') then
    return pg_catalog.jsonb_build_object('outcome','rate_limited'); end if;
  insert into public.content_change_requests(client_id,request_type,payload,requested_by,
    requester_name,idempotency_key,request_fingerprint) values(p_client_id,'create',v_payload,
    v_uid,v_actor,p_idempotency_key,v_fingerprint) returning id into v_id;
  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name)
    values(p_client_id,'create_requested','content-request:'||v_id::text,
      'New piece requested: '||v_title,'The Dot received the brief.','client',v_actor);
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation) values(p_client_id,
    'content-request:'||v_id::text,'create_requested','content_change_request',v_id,'client',v_actor,
    pg_catalog.jsonb_build_object('request_type','create','title',v_title),true);
  return pg_catalog.jsonb_build_object('id',v_id,'status','pending','outcome','created');
end;
$$;

create function public.request_content_archive(
  p_content_id uuid,p_content_version int,p_reason text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_ci public.content_items%rowtype; v_actor text;
  v_reason text:=nullif(pg_catalog.btrim(p_reason),''); v_payload jsonb; v_fingerprint text;
  v_existing public.content_change_requests%rowtype; v_id uuid; v_title text;
begin
  if v_uid is null or p_idempotency_key is null
     or (v_reason is not null and pg_catalog.char_length(v_reason)>2000) then
    raise exception 'invalid archive request'; end if;
  select ci.* into v_ci from public.content_items ci where ci.id=p_content_id for update;
  if not found then raise exception 'portal_action_not_allowed' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_ci.client_id,'can_submit_requests');
  if not v_ci.client_visible or v_ci.client_visible_version is distinct from p_content_version
     or v_ci.archived_at is not null then raise exception 'stale_or_unavailable_content'; end if;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id=v_ci.id and cv.client_id=v_ci.client_id and cv.version=p_content_version;
  select coalesce(nullif(pg_catalog.btrim(cu.name),''),'Client') into v_actor
    from public.client_users cu where cu.client_id=v_ci.client_id and cu.auth_user_id=v_uid;
  v_payload:=pg_catalog.jsonb_build_object('reason',v_reason);
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
  if not public.portal_consume_request_rate_limit(v_ci.client_id,v_uid,'content_archive') then
    return pg_catalog.jsonb_build_object('outcome','rate_limited'); end if;
  begin
    insert into public.content_change_requests(client_id,content_id,request_type,base_version,
      payload,requested_by,requester_name,idempotency_key,request_fingerprint)
    values(v_ci.client_id,v_ci.id,'archive',p_content_version,v_payload,v_uid,v_actor,
      p_idempotency_key,v_fingerprint) returning id into v_id;
  exception when unique_violation then raise exception 'archive_request_already_open'; end;
  insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,
    title,summary,actor_type,actor_name) values(v_ci.client_id,v_ci.id,p_content_version,
    'archive_requested','content-request:'||v_id::text,'Removal requested: '||v_title,
    'The piece remains available while The Dot reviews the request.','client',v_actor);
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation) values(v_ci.client_id,
    'content-request:'||v_id::text,'archive_requested','content_change_request',v_id,'client',v_actor,
    pg_catalog.jsonb_build_object('request_type','archive','content_id',v_ci.id,
      'base_version',p_content_version),true);
  return pg_catalog.jsonb_build_object('id',v_id,'status','pending','outcome','created');
end;
$$;

revoke all on function public.request_content_edit(uuid,int,text,text,uuid),
  public.request_content_create(uuid,text,text,text[],date,text,uuid),
  public.request_content_archive(uuid,int,text,uuid) from public,anon,service_role;
grant execute on function public.request_content_edit(uuid,int,text,text,uuid),
  public.request_content_create(uuid,text,text,text[],date,text,uuid),
  public.request_content_archive(uuid,int,text,uuid) to authenticated;

-- Service-only handoff from a reviewed request to the controlled local checkout.
create function public.start_content_request_reconciliation(
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

create function public.get_content_request_reconciliation(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'request',pg_catalog.to_jsonb(r)-'requested_by'-'idempotency_key'-'request_fingerprint',
    'job',pg_catalog.to_jsonb(j)-'created_by'
  ) into v_result
  from public.content_change_requests r left join public.canonical_change_jobs j on j.request_id=r.id
  where r.id=p_request_id;
  if v_result is null then raise exception 'content request not found'; end if;
  return v_result;
end;
$$;

create function public.mark_content_request_prepared(
  p_request_id uuid,p_commit_sha text,p_actor_key text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r public.content_change_requests%rowtype; v_job public.canonical_change_jobs%rowtype;
  v_actor public.agency_actors%rowtype; v_ci public.content_items%rowtype; v_cv public.content_item_versions%rowtype;
  v_title text; v_version int;
begin
  if p_commit_sha is null or p_actor_key is null or p_commit_sha !~ '^[0-9a-f]{40}$'
     or p_idempotency_key is null then
    raise exception 'invalid prepared reconciliation'; end if;
  select * into v_r from public.content_change_requests r where r.id=p_request_id for update;
  select * into v_job from public.canonical_change_jobs j where j.request_id=p_request_id for update;
  if not found then raise exception 'reconciliation job not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_r.client_id,'agency_mutations')
     or not public.portal_feature_enabled(v_r.client_id,'repository_worker') then
    raise exception 'repository_reconciliation_disabled' using errcode='42501'; end if;
  if v_r.status='prepared' and v_job.status='synced' and v_job.commit_sha=p_commit_sha then
    return pg_catalog.jsonb_build_object('request_id',v_r.id,'status','prepared',
      'content_id',v_r.canonical_content_id,'version',v_r.canonical_version,'outcome','unchanged'); end if;
  if v_r.status<>'applying' or v_job.status not in ('pending','processing','committed') then
    raise exception 'request is not awaiting canonical sync'; end if;
  if v_r.request_type='create' then
    select * into v_ci from public.content_items ci
      where ci.client_id=v_r.client_id and ci.content_id=v_r.requested_content_id for update;
    if not found or v_ci.client_visible or v_ci.client_visible_version is not null then
      raise exception 'created content is missing or was released early'; end if;
    v_version:=v_ci.working_version;
  elsif v_r.request_type='edit' then
    select * into v_ci from public.content_items ci where ci.id=v_r.content_id for update;
    if not found or v_ci.client_visible_version is distinct from v_r.base_version
       or not v_ci.revision_in_progress or v_ci.working_version<>v_r.base_version+1 then
      raise exception 'edited content does not match the requested base/version'; end if;
    v_version:=v_ci.working_version;
  else raise exception 'archive requests use the archive reconciliation boundary'; end if;
  select * into v_cv from public.content_item_versions cv where cv.content_item_id=v_ci.id
    and cv.client_id=v_ci.client_id and cv.version=v_version;
  if not found or v_cv.source_commit_sha<>p_commit_sha or v_cv.source_path<>v_job.canonical_object_key then
    raise exception 'synced snapshot does not match the canonical commit/path'; end if;
  update public.canonical_change_jobs set status='synced',commit_sha=p_commit_sha,
    committed_at=coalesce(committed_at,pg_catalog.now()),synced_at=pg_catalog.now(),
    locked_at=coalesce(locked_at,pg_catalog.now()),locked_by=coalesce(locked_by,v_actor.actor_key),
    updated_at=pg_catalog.now() where id=v_job.id;
  update public.content_change_requests set status='prepared',canonical_content_id=v_ci.id,
    canonical_version=v_version,reconciled_at=pg_catalog.now(),reconciled_by=v_actor.display_name,
    resolution_note='Canonical draft prepared; awaiting release review.',updated_at=pg_catalog.now()
    where id=v_r.id;
  v_title:=v_cv.title;
  insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,
    title,summary,actor_type,actor_name) values(v_r.client_id,v_ci.id,v_version,
    'request_prepared','content-request-prepared:'||v_r.id::text,'Request in progress: '||v_title,
    'The Dot prepared a new version. It remains in review before client release.',
    'anastasia',v_actor.display_name);
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation) values(v_r.client_id,
    'content-request-prepared:'||v_r.id::text,'request_prepared','content_change_request',v_r.id,
    'anastasia',v_actor.display_name,pg_catalog.jsonb_build_object('canonical_version',v_version),false);
  return pg_catalog.jsonb_build_object('request_id',v_r.id,'status','prepared',
    'content_id',v_ci.id,'version',v_version,'outcome','updated');
end;
$$;

create function public.apply_content_archive_request(
  p_request_id uuid,p_actor_key text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r public.content_change_requests%rowtype; v_job public.canonical_change_jobs%rowtype;
  v_actor public.agency_actors%rowtype; v_ci public.content_items%rowtype; v_title text;
begin
  select * into v_r from public.content_change_requests r where r.id=p_request_id for update;
  select * into v_job from public.canonical_change_jobs j where j.request_id=p_request_id for update;
  if not found then raise exception 'reconciliation job not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found or p_idempotency_key is null then raise exception 'invalid archive reconciliation'; end if;
  if not public.portal_feature_enabled(v_r.client_id,'agency_mutations')
     or not public.portal_feature_enabled(v_r.client_id,'repository_worker') then
    raise exception 'repository_reconciliation_disabled' using errcode='42501'; end if;
  if v_r.status='applied' then return pg_catalog.jsonb_build_object('request_id',v_r.id,
    'status','applied','outcome','unchanged'); end if;
  if v_r.request_type<>'archive' or v_r.status<>'applying' then
    raise exception 'archive request is not applying'; end if;
  select ci.* into v_ci from public.content_items ci
    where ci.id=v_r.content_id and ci.client_id=v_r.client_id for update;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id=v_ci.id and cv.client_id=v_ci.client_id and cv.version=v_r.base_version;
  if not found or v_ci.client_visible_version is distinct from v_r.base_version
     or v_ci.archived_at is not null then raise exception 'archive request is stale'; end if;
  update public.content_items set archived_at=pg_catalog.now(),projection_revision=projection_revision+1,
    updated_at=pg_catalog.now() where id=v_ci.id;
  update public.canonical_change_jobs set status='synced',commit_sha=v_job.expected_base_commit,
    committed_at=pg_catalog.now(),synced_at=pg_catalog.now(),locked_at=pg_catalog.now(),
    locked_by=v_actor.actor_key,updated_at=pg_catalog.now() where id=v_job.id;
  update public.content_change_requests set status='applied',canonical_content_id=v_ci.id,
    canonical_version=v_r.base_version,reconciled_at=pg_catalog.now(),reconciled_by=v_actor.display_name,
    resolution_note='Removal request applied; history retained.',updated_at=pg_catalog.now() where id=v_r.id;
  insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,
    title,summary,actor_type,actor_name) values(v_r.client_id,v_ci.id,v_r.base_version,
    'request_applied','content-request-applied:'||v_r.id::text,'Removal applied: '||v_title,
    'The piece moved to retained history.','anastasia',v_actor.display_name);
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation) values(v_r.client_id,
    'content-request-applied:'||v_r.id::text,'request_applied','content_change_request',v_r.id,
    'anastasia',v_actor.display_name,pg_catalog.jsonb_build_object('request_type','archive'),false);
  insert into public.projection_outbox(client_id,event_key,destination,operation,object_type,
    object_key,object_revision,payload) values(v_r.client_id,
    'content-request-applied:'||v_r.id::text,'notion','archive','content',v_ci.id::text,
    v_ci.projection_revision+1,pg_catalog.jsonb_build_object('reason','archive_request_applied'));
  return pg_catalog.jsonb_build_object('request_id',v_r.id,'status','applied','outcome','updated');
end;
$$;

create function public.resolve_content_request(
  p_request_id uuid,p_status text,p_reason text,p_actor_key text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_r public.content_change_requests%rowtype; v_actor public.agency_actors%rowtype;
  v_reason text:=pg_catalog.btrim(p_reason); v_event text;
begin
  if p_status is null or v_reason is null or p_status not in ('rejected','conflicted')
     or pg_catalog.char_length(v_reason) not between 3 and 2000
     or p_idempotency_key is null then raise exception 'invalid request resolution'; end if;
  select * into v_r from public.content_change_requests r where r.id=p_request_id for update;
  if not found then raise exception 'content request not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_r.client_id,'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode='42501'; end if;
  if v_r.status=p_status and v_r.resolution_note=v_reason then
    return pg_catalog.jsonb_build_object('request_id',v_r.id,'status',p_status,'outcome','unchanged'); end if;
  if v_r.status not in ('pending','applying') then raise exception 'request is not resolvable'; end if;
  update public.content_change_requests set status=p_status,resolution_note=v_reason,
    reconciled_at=pg_catalog.now(),reconciled_by=v_actor.display_name,updated_at=pg_catalog.now()
    where id=v_r.id;
  update public.canonical_change_jobs set status=case when p_status='conflicted' then 'conflicted' else 'abandoned' end,
    last_error=v_reason,updated_at=pg_catalog.now() where request_id=v_r.id;
  v_event:=case when p_status='conflicted' then 'request_conflicted' else 'request_rejected' end;
  insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,
    title,summary,actor_type,actor_name) values(v_r.client_id,v_r.content_id,v_r.base_version,
    v_event,'content-request-'||p_status||':'||v_r.id::text,
    case when p_status='conflicted' then 'Request needs review' else 'Request declined' end,
    v_reason,'anastasia',v_actor.display_name);
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation) values(v_r.client_id,
    'content-request-'||p_status||':'||v_r.id::text,v_event,'content_change_request',v_r.id,
    'anastasia',v_actor.display_name,pg_catalog.jsonb_build_object('resolution_note',v_reason),false);
  return pg_catalog.jsonb_build_object('request_id',v_r.id,'status',p_status,'outcome','updated');
end;
$$;

-- The release pointer is also the terminal edit/create reconciliation boundary. The existing
-- fact-check gate remains the core and runs first under the same transaction/row lock.
alter function public.mark_content_ready(uuid,int) rename to portal_core_mark_content_ready;
revoke all on function public.portal_core_mark_content_ready(uuid,int)
  from public,anon,authenticated,service_role;

create function public.mark_content_ready(p_content_id uuid,p_content_version int)
returns void language plpgsql security definer set search_path='' as $$
declare v_client_id uuid; v_title text; v_actor_name text:='The Dot'; v_r record;
begin
  select ci.client_id into v_client_id from public.content_items ci where ci.id=p_content_id;
  if v_client_id is null then raise exception 'content item not found'; end if;
  if not public.portal_feature_enabled(v_client_id,'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode='42501'; end if;
  perform public.portal_core_mark_content_ready(p_content_id,p_content_version);
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id=p_content_id and cv.client_id=v_client_id and cv.version=p_content_version;
  for v_r in update public.content_change_requests r set status='applied',
      reconciled_at=pg_catalog.now(),reconciled_by=v_actor_name,
      resolution_note='Requested version released to the portal.',updated_at=pg_catalog.now()
    where r.client_id=v_client_id and r.canonical_content_id=p_content_id
      and r.canonical_version=p_content_version and r.request_type in ('edit','create')
      and r.status='prepared' returning r.id,r.request_type
  loop
    insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,
      title,summary,actor_type,actor_name) values(v_client_id,p_content_id,p_content_version,
      'request_applied','content-request-applied:'||v_r.id::text,
      'Request applied: '||v_title,'The reviewed version is now available in the portal.',
      'agent',v_actor_name);
    insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,
      actor_type,actor_name,payload,requires_reconciliation) values(v_client_id,
      'content-request-applied:'||v_r.id::text,'request_applied','content_change_request',v_r.id,
      'agent',v_actor_name,pg_catalog.jsonb_build_object('request_type',v_r.request_type,
        'content_id',p_content_id,'content_version',p_content_version),false);
  end loop;
end;
$$;
revoke all on function public.mark_content_ready(uuid,int) from public,anon,authenticated;
grant execute on function public.mark_content_ready(uuid,int) to service_role;

-- Terminal request events can be acknowledged; unresolved reconciliation events remain sticky.
create or replace function public.ack_portal_inbox(
  p_consumer_key text,p_client_id uuid,p_seq bigint
) returns bigint language plpgsql security definer set search_path='' as $$
declare v_current bigint;
begin
  if not exists(select 1 from public.portal_inbox_events e
    where e.client_id=p_client_id and e.seq=p_seq) then raise exception 'event does not belong to client'; end if;
  if exists(select 1 from public.portal_inbox_events e
    where e.client_id=p_client_id and e.seq<=p_seq and e.requires_reconciliation
      and not (e.object_type='content_change_request' and exists(
        select 1 from public.content_change_requests r where r.id=e.object_id and r.client_id=e.client_id
          and r.status in ('applied','conflicted','rejected','superseded')
      ))) then raise exception 'unresolved reconciliation events cannot be cursor-acknowledged'; end if;
  update public.portal_inbox_consumers set last_ack_seq=greatest(last_ack_seq,p_seq),
    updated_at=pg_catalog.now() where consumer_key=p_consumer_key and client_id=p_client_id
    returning last_ack_seq into v_current;
  if not found then raise exception 'unknown inbox consumer'; end if;
  return v_current;
end;
$$;

create function public.list_content_change_requests(p_client_id uuid default null)
returns setof public.content_change_requests language sql stable security definer set search_path='' as $$
  select r.* from public.content_change_requests r
  where p_client_id is null or r.client_id=p_client_id order by r.created_at desc,r.id desc
$$;

revoke all on function public.start_content_request_reconciliation(uuid,text,text,text,text,uuid),
  public.get_content_request_reconciliation(uuid),public.mark_content_request_prepared(uuid,text,text,uuid),
  public.apply_content_archive_request(uuid,text,uuid),
  public.resolve_content_request(uuid,text,text,text,uuid),
  public.list_content_change_requests(uuid) from public,anon,authenticated;
grant execute on function public.start_content_request_reconciliation(uuid,text,text,text,text,uuid),
  public.get_content_request_reconciliation(uuid),public.mark_content_request_prepared(uuid,text,text,uuid),
  public.apply_content_archive_request(uuid,text,uuid),
  public.resolve_content_request(uuid,text,text,text,uuid),
  public.list_content_change_requests(uuid) to service_role;

-- Exact grants. Internal jobs/rate state and private request identity/idempotency remain unreachable.
revoke all on public.content_change_requests,public.portal_mutation_rate_limits,
  public.canonical_change_jobs,public.content_change_requests_client
  from public,anon,authenticated,service_role;
grant select(id,client_id,content_id,request_type,base_version,payload,status,requester_name,
  created_at,updated_at,reconciled_at,reconciled_by,canonical_content_id,canonical_version,resolution_note)
  on public.content_change_requests to authenticated;
grant select on public.content_change_requests_client to authenticated;
grant select on public.content_change_requests,public.content_change_requests_client to service_role;

create or replace function public.assert_portal_content_requests_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_actual text[]; v_expected text[];
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid='public.content_change_requests'::pg_catalog.regclass) then
    raise exception 'content request RLS disabled'; end if;
  if not exists(select 1 from pg_catalog.pg_class c where c.oid='public.content_change_requests_client'::pg_catalog.regclass
    and coalesce(c.reloptions,'{}'::text[])@>array['security_invoker=true']) then
    raise exception 'content request view is not security invoker'; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
    from information_schema.column_privileges cp where cp.table_schema='public'
      and cp.table_name='content_change_requests' and cp.grantee='authenticated'
      and cp.privilege_type='SELECT';
  v_expected:=array['base_version','canonical_content_id','canonical_version','client_id','content_id',
    'created_at','id','payload','reconciled_at','reconciled_by','request_type','requester_name',
    'resolution_note','status','updated_at'];
  if v_actual is distinct from v_expected then raise exception 'unsafe content request grants: %',v_actual; end if;
  if exists(select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('portal_mutation_rate_limits','canonical_change_jobs')
    and tp.grantee in ('PUBLIC','anon','authenticated','service_role')) then
    raise exception 'internal request relation privilege detected'; end if;
  if pg_catalog.has_table_privilege('authenticated','public.content_change_requests','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.content_change_requests_client','INSERT,UPDATE,DELETE') then
    raise exception 'direct authenticated request write detected'; end if;
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('request_content_edit','request_content_create',
      'request_content_archive','start_content_request_reconciliation','get_content_request_reconciliation',
      'mark_content_request_prepared','apply_content_archive_request','resolve_content_request',
      'portal_consume_request_rate_limit','mark_content_ready')
      and (not p.prosecdef or not(coalesce(p.proconfig,'{}'::text[])@>array['search_path=""']))) then
    raise exception 'content request function is not hardened'; end if;
  if not pg_catalog.has_function_privilege('authenticated',
       'public.request_content_edit(uuid,integer,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.request_content_create(uuid,text,text,text[],date,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.request_content_archive(uuid,integer,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.request_content_edit(uuid,integer,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.request_content_create(uuid,text,text,text[],date,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.request_content_archive(uuid,integer,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.start_content_request_reconciliation(uuid,text,text,text,text,uuid)','EXECUTE') then
    raise exception 'unsafe content request function privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.portal_core_mark_content_ready(uuid,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_core_mark_content_ready(uuid,integer)','EXECUTE') then
    raise exception 'private release core is executable'; end if;
end;
$$;
revoke all on function public.assert_portal_content_requests_security()
  from public,anon,authenticated;
grant execute on function public.assert_portal_content_requests_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice8_security();
  perform public.assert_portal_content_requests_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
