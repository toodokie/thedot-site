-- Portal access-control plane: fail-closed launch/mutation switches, explicit membership
-- capabilities, and one primary client decision-maker per tenant.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.client_users') is null
     or pg_catalog.to_regclass('public.agency_actors') is null
     or pg_catalog.to_regprocedure('public.claim_calendar_sync_jobs(integer,integer)') is null then
    raise exception '0012 portal objects must exist before applying 0013';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice7_security;
revoke all on function public.assert_portal_slice7_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice7_security() to service_role;

-- A membership permits tenant-scoped reads. Mutating/cost-bearing powers are independent and
-- default false so provisioning cannot accidentally create a second decision-maker.
alter table public.client_users
  add column can_decide boolean not null default false,
  add column can_comment boolean not null default false,
  add column can_submit_requests boolean not null default false,
  add column can_manage_schedule boolean not null default false,
  add column can_use_assistant boolean not null default false;

create unique index client_users_one_primary_decider
  on public.client_users(client_id) where can_decide;

-- Switch configuration is an internal control plane. Effective tenant state is global AND tenant;
-- a missing row therefore fails closed. Nothing is exposed through the Data API.
create table public.portal_feature_switches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  feature text not null check (feature in (
    'client_portal_launch','client_mutations','assistant','agency_mutations','cron_drain',
    'notion_projection','client_alerts','repository_worker'
  )),
  enabled boolean not null default false,
  reason text not null check (pg_catalog.char_length(pg_catalog.btrim(reason)) between 3 and 1000),
  updated_by uuid not null references public.agency_actors(id),
  updated_at timestamptz not null default pg_catalog.now(),
  unique nulls not distinct (client_id,feature)
);

alter table public.portal_feature_switches enable row level security;

-- Immutable command receipts double as the agency audit for switch and membership lifecycle
-- operations. client_id deliberately has no FK so tenant offboarding/deletion cannot erase history.
create table public.portal_access_commands (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  auth_user_id uuid,
  operation text not null check (operation in (
    'set_feature_switch','upsert_membership','offboard_membership','transfer_primary_decider'
  )),
  actor_id uuid not null references public.agency_actors(id),
  idempotency_key text not null check (pg_catalog.char_length(idempotency_key) between 8 and 200),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique nulls not distinct (client_id,idempotency_key)
);

alter table public.portal_access_commands enable row level security;

revoke all on public.portal_feature_switches,public.portal_access_commands
  from public,anon,authenticated,service_role;

insert into public.portal_feature_switches(feature,enabled,reason,updated_by)
select f,false,'Initial production-safe default: disabled',a.id
from unnest(array[
  'client_portal_launch','client_mutations','assistant','agency_mutations','cron_drain',
  'notion_projection','client_alerts','repository_worker'
]) f
cross join public.agency_actors a
where a.actor_key='thedot-admin';

create or replace function public.portal_feature_enabled(p_client_id uuid,p_feature text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_global boolean; v_tenant boolean;
begin
  if p_feature not in ('client_portal_launch','client_mutations','assistant','agency_mutations',
      'cron_drain','notion_projection','client_alerts','repository_worker') then
    return false;
  end if;
  select s.enabled into v_global from public.portal_feature_switches s
    where s.client_id is null and s.feature=p_feature;
  if p_client_id is null then return coalesce(v_global,false); end if;
  select s.enabled into v_tenant from public.portal_feature_switches s
    where s.client_id=p_client_id and s.feature=p_feature;
  return coalesce(v_global,false) and coalesce(v_tenant,false);
end;
$$;

create or replace function public.portal_require_client_action(p_client_id uuid,p_capability text)
returns void language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_allowed boolean;
begin
  if v_uid is null then
    raise exception 'portal_action_not_allowed' using errcode='42501';
  end if;
  select case p_capability
    when 'member' then true
    when 'can_decide' then cu.can_decide
    when 'can_comment' then cu.can_comment
    when 'can_submit_requests' then cu.can_submit_requests
    when 'can_manage_schedule' then cu.can_manage_schedule
    when 'can_use_assistant' then cu.can_use_assistant
    else false end
  into v_allowed
  from public.client_users cu
  where cu.client_id=p_client_id and cu.auth_user_id=v_uid;
  if not found or not coalesce(v_allowed,false)
     or not public.portal_feature_enabled(p_client_id,'client_portal_launch')
     or not public.portal_feature_enabled(p_client_id,'client_mutations') then
    raise exception 'portal_action_not_allowed' using errcode='42501';
  end if;
end;
$$;

revoke all on function public.portal_feature_enabled(uuid,text),
  public.portal_require_client_action(uuid,text) from public,anon,authenticated,service_role;

-- The app resolves membership and capabilities through one safe RPC. A disabled launch, an unknown
-- slug, and a wrong-tenant slug all return zero rows, so the route boundary does not reveal tenants.
create or replace function public.portal_client_session(p_slug text)
returns table (
  user_id uuid,email text,name text,role text,client_id uuid,client_slug text,
  can_decide boolean,can_comment boolean,can_submit_requests boolean,
  can_manage_schedule boolean,can_use_assistant boolean
)
language sql stable security definer set search_path='' as $$
  select cu.auth_user_id,cu.email,cu.name,cu.role,cu.client_id,c.slug,
    cu.can_decide,cu.can_comment,cu.can_submit_requests,cu.can_manage_schedule,cu.can_use_assistant
  from public.client_users cu
  join public.clients c on c.id=cu.client_id
  where cu.auth_user_id=(select auth.uid())
    and c.slug=pg_catalog.lower(pg_catalog.btrim(p_slug))
    and public.portal_feature_enabled(cu.client_id,'client_portal_launch')
  limit 1
$$;

revoke all on function public.portal_client_session(text) from public,anon,service_role;
grant execute on function public.portal_client_session(text) to authenticated;

-- Freeze the existing writer bodies as private cores, then restore their public signatures as
-- capability/switch-enforcing wrappers. The cores retain their existing tenant/version invariants.
alter function public.record_content_decision(uuid,int,text,text)
  rename to portal_core_record_content_decision;
alter function public.add_comment(uuid,text,text,text) rename to portal_core_add_comment;
drop function public.add_comment(uuid,text,text);
alter function public.add_idea(uuid,text,text) rename to portal_core_add_idea;
alter function public.edit_idea(uuid,text,text) rename to portal_core_edit_idea;
alter function public.touch_seen(uuid) rename to portal_core_touch_seen;
alter function public.set_content_plan(uuid,int,date,text) rename to portal_core_set_content_plan;
alter function public.request_content_reschedule(uuid,int,timestamp,text,int,text)
  rename to portal_core_request_content_reschedule;

revoke all on function public.portal_core_record_content_decision(uuid,int,text,text),
  public.portal_core_add_comment(uuid,text,text,text),public.portal_core_add_idea(uuid,text,text),
  public.portal_core_edit_idea(uuid,text,text),public.portal_core_touch_seen(uuid),
  public.portal_core_set_content_plan(uuid,int,date,text),
  public.portal_core_request_content_reschedule(uuid,int,timestamp,text,int,text)
  from public,anon,authenticated,service_role;

create function public.record_content_decision(
  p_content_id uuid,p_content_version int,p_decision text,p_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_client_id uuid;
begin
  select ci.client_id into v_client_id from public.content_items ci where ci.id=p_content_id;
  if v_client_id is null then raise exception 'portal_action_not_allowed' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_client_id,'can_decide');
  return public.portal_core_record_content_decision(p_content_id,p_content_version,p_decision,p_note);
end;
$$;

create function public.add_comment(
  p_content_id uuid,p_body text,p_quoted_text text,p_copy_block_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_client_id uuid;
begin
  select ci.client_id into v_client_id from public.content_items ci where ci.id=p_content_id;
  if v_client_id is null then raise exception 'portal_action_not_allowed' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_client_id,'can_comment');
  return public.portal_core_add_comment(p_content_id,p_body,p_quoted_text,p_copy_block_key);
end;
$$;

create function public.add_comment(
  p_content_id uuid,p_body text,p_quoted_text text default null
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  if nullif(pg_catalog.btrim(p_quoted_text),'') is not null then
    raise exception 'refresh the page before quoting released copy';
  end if;
  return public.add_comment(p_content_id,p_body,null,null);
end;
$$;

create function public.add_idea(p_client_id uuid,p_title text,p_body text default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform public.portal_require_client_action(p_client_id,'can_submit_requests');
  return public.portal_core_add_idea(p_client_id,p_title,p_body);
end;
$$;

create function public.edit_idea(p_idea_id uuid,p_title text,p_body text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_client_id uuid;
begin
  select i.client_id into v_client_id from public.content_ideas i where i.id=p_idea_id;
  if v_client_id is null then raise exception 'portal_action_not_allowed' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_client_id,'can_submit_requests');
  return public.portal_core_edit_idea(p_idea_id,p_title,p_body);
end;
$$;

create function public.touch_seen(p_client_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.portal_require_client_action(p_client_id,'member');
  perform public.portal_core_touch_seen(p_client_id);
end;
$$;

create function public.set_content_plan(
  p_content_id uuid,p_content_version int,p_planned_date date,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_client_id uuid;
begin
  select ci.client_id into v_client_id from public.content_items ci where ci.id=p_content_id;
  if v_client_id is null then raise exception 'portal_action_not_allowed' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_client_id,'can_manage_schedule');
  return public.portal_core_set_content_plan(p_content_id,p_content_version,p_planned_date,p_idempotency_key);
end;
$$;

create function public.request_content_reschedule(
  p_content_id uuid,p_content_version int,p_requested_local timestamp without time zone,
  p_timezone text,p_utc_offset_minutes int,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_client_id uuid;
begin
  select ci.client_id into v_client_id from public.content_items ci where ci.id=p_content_id;
  if v_client_id is null then raise exception 'portal_action_not_allowed' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_client_id,'can_manage_schedule');
  return public.portal_core_request_content_reschedule(p_content_id,p_content_version,
    p_requested_local,p_timezone,p_utc_offset_minutes,p_idempotency_key);
end;
$$;

revoke all on function public.record_content_decision(uuid,int,text,text),
  public.add_comment(uuid,text,text,text),public.add_comment(uuid,text,text),
  public.add_idea(uuid,text,text),public.edit_idea(uuid,text,text),public.touch_seen(uuid),
  public.set_content_plan(uuid,int,date,text),
  public.request_content_reschedule(uuid,int,timestamp,text,int,text)
  from public,anon,service_role;
grant execute on function public.record_content_decision(uuid,int,text,text),
  public.add_comment(uuid,text,text,text),public.add_comment(uuid,text,text),
  public.add_idea(uuid,text,text),public.edit_idea(uuid,text,text),public.touch_seen(uuid),
  public.set_content_plan(uuid,int,date,text),
  public.request_content_reschedule(uuid,int,timestamp,text,int,text) to authenticated;

-- Agency-only audited control-plane operations. They remain operable while feature switches are
-- off, otherwise an emergency disable could not be reversed.
create or replace function public.set_portal_feature_switch(
  p_client_id uuid,p_feature text,p_enabled boolean,p_reason text,
  p_actor_key text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.agency_actors%rowtype; v_existing public.portal_access_commands%rowtype;
  v_reason text:=pg_catalog.btrim(p_reason); v_fingerprint text; v_response jsonb;
begin
  if p_feature not in ('client_portal_launch','client_mutations','assistant','agency_mutations',
      'cron_drain','notion_projection','client_alerts','repository_worker')
     or v_reason is null or pg_catalog.char_length(v_reason) not between 3 and 1000
     or p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid feature switch request';
  end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_client_id is not null and not exists(select 1 from public.clients c where c.id=p_client_id) then
    raise exception 'client not found';
  end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('feature',p_feature,'enabled',p_enabled,'reason',v_reason)::text,
    'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    coalesce(p_client_id::text,'global')||':'||p_idempotency_key,0));
  select * into v_existing from public.portal_access_commands c
    where c.client_id is not distinct from p_client_id and c.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.operation<>'set_feature_switch' or v_existing.request_fingerprint<>v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return v_existing.response;
  end if;
  insert into public.portal_feature_switches(client_id,feature,enabled,reason,updated_by,updated_at)
  values(p_client_id,p_feature,p_enabled,v_reason,v_actor.id,pg_catalog.now())
  on conflict(client_id,feature) do update set enabled=excluded.enabled,reason=excluded.reason,
    updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  v_response:=pg_catalog.jsonb_build_object('feature',p_feature,'enabled',p_enabled,
    'scope',coalesce(p_client_id::text,'global'));
  insert into public.portal_access_commands(client_id,operation,actor_id,idempotency_key,
    request_fingerprint,response) values(p_client_id,'set_feature_switch',v_actor.id,
    p_idempotency_key,v_fingerprint,v_response);
  return v_response;
end;
$$;

create or replace function public.upsert_portal_membership(
  p_client_id uuid,p_auth_user_id uuid,p_email text,p_name text,
  p_can_decide boolean,p_can_comment boolean,p_can_submit_requests boolean,
  p_can_manage_schedule boolean,p_can_use_assistant boolean,
  p_actor_key text,p_idempotency_key text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor public.agency_actors%rowtype; v_existing public.portal_access_commands%rowtype;
  v_email text:=pg_catalog.lower(pg_catalog.btrim(p_email)); v_auth_email text;
  v_name text:=nullif(pg_catalog.btrim(p_name),''); v_fingerprint text; v_id uuid;
begin
  if p_client_id is null or p_auth_user_id is null or v_email is null or v_email=''
     or pg_catalog.char_length(v_email)>320 or (v_name is not null and pg_catalog.char_length(v_name)>200)
     or p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid client membership payload';
  end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  select pg_catalog.lower(u.email) into v_auth_email from auth.users u where u.id=p_auth_user_id;
  if not found or v_auth_email is distinct from v_email then
    raise exception 'auth user email does not match membership email'; end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('auth_user_id',p_auth_user_id,'email',v_email,'name',v_name,
      'can_decide',p_can_decide,'can_comment',p_can_comment,
      'can_submit_requests',p_can_submit_requests,'can_manage_schedule',p_can_manage_schedule,
      'can_use_assistant',p_can_use_assistant)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_client_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.portal_access_commands c
    where c.client_id=p_client_id and c.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.operation<>'upsert_membership' or v_existing.request_fingerprint<>v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return (v_existing.response->>'id')::uuid;
  end if;
  insert into public.client_users(client_id,auth_user_id,email,name,role,can_decide,can_comment,
    can_submit_requests,can_manage_schedule,can_use_assistant)
  values(p_client_id,p_auth_user_id,v_email,v_name,'client',p_can_decide,p_can_comment,
    p_can_submit_requests,p_can_manage_schedule,p_can_use_assistant)
  on conflict(client_id,auth_user_id) do update set email=excluded.email,name=excluded.name,
    role='client',can_decide=excluded.can_decide,can_comment=excluded.can_comment,
    can_submit_requests=excluded.can_submit_requests,can_manage_schedule=excluded.can_manage_schedule,
    can_use_assistant=excluded.can_use_assistant returning id into v_id;
  insert into public.portal_access_commands(client_id,auth_user_id,operation,actor_id,
    idempotency_key,request_fingerprint,response) values(p_client_id,p_auth_user_id,
    'upsert_membership',v_actor.id,p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_id,'email',v_email,'name',v_name,
      'can_decide',p_can_decide,'can_comment',p_can_comment,
      'can_submit_requests',p_can_submit_requests,'can_manage_schedule',p_can_manage_schedule,
      'can_use_assistant',p_can_use_assistant));
  return v_id;
end;
$$;

create or replace function public.offboard_portal_membership(
  p_client_id uuid,p_auth_user_id uuid,p_reason text,p_actor_key text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.agency_actors%rowtype; v_existing public.portal_access_commands%rowtype;
  v_reason text:=pg_catalog.btrim(p_reason); v_fingerprint text; v_id uuid; v_response jsonb;
begin
  if v_reason is null or pg_catalog.char_length(v_reason) not between 3 and 1000
     or p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid offboarding request'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('auth_user_id',p_auth_user_id,'reason',v_reason)::text,'UTF8'),
    'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_client_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.portal_access_commands c
    where c.client_id=p_client_id and c.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.operation<>'offboard_membership' or v_existing.request_fingerprint<>v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return v_existing.response;
  end if;
  delete from public.client_users cu where cu.client_id=p_client_id and cu.auth_user_id=p_auth_user_id
    returning cu.id into v_id;
  v_response:=pg_catalog.jsonb_build_object('membership_id',v_id,'removed',v_id is not null,
    'reason',v_reason);
  insert into public.portal_access_commands(client_id,auth_user_id,operation,actor_id,
    idempotency_key,request_fingerprint,response) values(p_client_id,p_auth_user_id,
    'offboard_membership',v_actor.id,p_idempotency_key,v_fingerprint,v_response);
  return v_response;
end;
$$;

create or replace function public.transfer_portal_primary_decider(
  p_client_id uuid,p_from_auth_user_id uuid,p_to_auth_user_id uuid,p_reason text,
  p_actor_key text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.agency_actors%rowtype; v_existing public.portal_access_commands%rowtype;
  v_reason text:=pg_catalog.btrim(p_reason); v_fingerprint text; v_response jsonb;
begin
  if p_from_auth_user_id=p_to_auth_user_id or v_reason is null
     or pg_catalog.char_length(v_reason) not between 3 and 1000
     or p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid primary-decider transfer'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('from',p_from_auth_user_id,'to',p_to_auth_user_id,
      'reason',v_reason)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_client_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.portal_access_commands c
    where c.client_id=p_client_id and c.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.operation<>'transfer_primary_decider' or v_existing.request_fingerprint<>v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return v_existing.response;
  end if;
  perform 1 from public.client_users cu where cu.client_id=p_client_id
    and cu.auth_user_id in (p_from_auth_user_id,p_to_auth_user_id) for update;
  if (select pg_catalog.count(*) from public.client_users cu where cu.client_id=p_client_id
      and cu.auth_user_id in (p_from_auth_user_id,p_to_auth_user_id))<>2
     or not exists(select 1 from public.client_users cu where cu.client_id=p_client_id
       and cu.auth_user_id=p_from_auth_user_id and cu.can_decide) then
    raise exception 'primary-decider transfer memberships are invalid';
  end if;
  update public.client_users set can_decide=false
    where client_id=p_client_id and auth_user_id=p_from_auth_user_id;
  update public.client_users set can_decide=true
    where client_id=p_client_id and auth_user_id=p_to_auth_user_id;
  v_response:=pg_catalog.jsonb_build_object('from',p_from_auth_user_id,'to',p_to_auth_user_id,
    'reason',v_reason);
  insert into public.portal_access_commands(client_id,auth_user_id,operation,actor_id,
    idempotency_key,request_fingerprint,response) values(p_client_id,p_to_auth_user_id,
    'transfer_primary_decider',v_actor.id,p_idempotency_key,v_fingerprint,v_response);
  return v_response;
end;
$$;

create or replace function public.list_portal_access()
returns table(client_id uuid,auth_user_id uuid,email text,name text,role text,
  can_decide boolean,can_comment boolean,can_submit_requests boolean,
  can_manage_schedule boolean,can_use_assistant boolean)
language sql stable security definer set search_path='' as $$
  select cu.client_id,cu.auth_user_id,cu.email,cu.name,cu.role,cu.can_decide,cu.can_comment,
    cu.can_submit_requests,cu.can_manage_schedule,cu.can_use_assistant
  from public.client_users cu order by cu.client_id,cu.email
$$;

create or replace function public.list_portal_feature_switches()
returns table(client_id uuid,feature text,enabled boolean,reason text,
  actor_key text,actor_name text,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
  select s.client_id,s.feature,s.enabled,s.reason,a.actor_key,a.display_name,s.updated_at
  from public.portal_feature_switches s
  join public.agency_actors a on a.id=s.updated_by
  order by s.client_id nulls first,s.feature
$$;

create or replace function public.list_portal_access_commands(p_client_id uuid default null)
returns table(id uuid,client_id uuid,auth_user_id uuid,operation text,
  actor_key text,actor_name text,response jsonb,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select c.id,c.client_id,c.auth_user_id,c.operation,a.actor_key,a.display_name,
    c.response,c.created_at
  from public.portal_access_commands c
  join public.agency_actors a on a.id=c.actor_id
  where p_client_id is null or c.client_id=p_client_id
  order by c.created_at desc,c.id desc
$$;

revoke all on function public.set_portal_feature_switch(uuid,text,boolean,text,text,text),
  public.upsert_portal_membership(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean,text,text),
  public.offboard_portal_membership(uuid,uuid,text,text,text),
  public.transfer_portal_primary_decider(uuid,uuid,uuid,text,text,text),
  public.list_portal_access(),public.list_portal_feature_switches(),
  public.list_portal_access_commands(uuid) from public,anon,authenticated;
grant execute on function public.set_portal_feature_switch(uuid,text,boolean,text,text,text),
  public.upsert_portal_membership(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean,text,text),
  public.offboard_portal_membership(uuid,uuid,text,text,text),
  public.transfer_portal_primary_decider(uuid,uuid,uuid,text,text,text),
  public.list_portal_access(),public.list_portal_feature_switches(),
  public.list_portal_access_commands(uuid) to service_role;

-- Keep the old service-only provisioning signature for rolling tooling, but make it least-
-- privilege and audited. New tooling uses upsert_portal_membership directly.
create or replace function public.upsert_client_membership(
  p_client_id uuid,p_auth_user_id uuid,p_email text,p_name text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_hash text;
begin
  v_hash:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('email',p_email,'name',p_name)::text,'UTF8'),'sha256'),'hex');
  return public.upsert_portal_membership(p_client_id,p_auth_user_id,p_email,p_name,
    false,false,false,false,false,'thedot-admin',
    'legacy-membership:'||pg_catalog.left(v_hash,32));
end;
$$;
revoke all on function public.upsert_client_membership(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.upsert_client_membership(uuid,uuid,text,text) to service_role;

-- Disabling cron drain stops NEW claims while letting already-leased jobs finish normally.
create or replace function public.claim_calendar_sync_jobs(p_limit int,p_lease_seconds int)
returns setof public.calendar_sync_jobs language plpgsql security definer set search_path='' as $$
begin
  if p_limit not between 1 and 25 or p_lease_seconds not between 30 and 900 then
    raise exception 'invalid lease request'; end if;
  return query
  with selected as (
    select candidate.id from public.calendar_integrations i
    cross join lateral (
      select j.id from public.calendar_sync_jobs j
      where j.integration_id=i.id
        and public.portal_feature_enabled(j.client_id,'cron_drain')
        and (j.status='pending' or (j.status='processing' and j.lease_expires_at<pg_catalog.now()))
        and j.next_attempt_at<=pg_catalog.now()
        and not exists(select 1 from public.calendar_sync_jobs active
          where active.integration_id=i.id and active.status='processing'
            and active.lease_expires_at>=pg_catalog.now() and active.id<>j.id)
      order by j.created_at for update skip locked limit 1
    ) candidate
    where i.status='active' limit p_limit
  )
  update public.calendar_sync_jobs j set status='processing',attempts=j.attempts+1,
    lease_token=gen_random_uuid(),lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>p_lease_seconds)
  from selected where j.id=selected.id returning j.*;
end;
$$;

create or replace function public.retry_portal_projections(p_client_id uuid)
returns int language plpgsql security definer set search_path='' as $$
declare v_count int;
begin
  if not exists(select 1 from public.clients c where c.id=p_client_id) then raise exception 'client not found'; end if;
  if not public.portal_feature_enabled(p_client_id,'notion_projection') then
    raise exception 'notion_projection_disabled' using errcode='42501'; end if;
  update public.projection_outbox set status='pending',next_attempt_at=pg_catalog.now(),last_error=null
    where client_id=p_client_id and status='failed';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

-- Cumulative catalog assertion for the new security boundary.
create or replace function public.assert_portal_access_control_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_features text[]; v_actual text[]; v_expected text[];
begin
  select pg_catalog.array_agg(feature order by feature) into v_features
  from public.portal_feature_switches where client_id is null;
  if v_features is distinct from array['agency_mutations','assistant','client_alerts',
    'client_mutations','client_portal_launch','cron_drain','notion_projection','repository_worker']::text[] then
    raise exception 'global feature switch set is incomplete or unexpected: %',v_features; end if;
  if exists(select 1 from information_schema.table_privileges tp where tp.table_schema='public'
    and tp.table_name in ('portal_feature_switches','portal_access_commands')
    and tp.grantee in ('PUBLIC','anon','authenticated','service_role')) then
    raise exception 'access-control relation privilege detected'; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
    from information_schema.column_privileges cp where cp.table_schema='public'
      and cp.table_name='client_users' and cp.grantee='authenticated' and cp.privilege_type='SELECT';
  v_expected:=array['auth_user_id','client_id','created_at','email','id','name','role'];
  if v_actual is distinct from v_expected then
    raise exception 'membership capability columns leaked through grants: %',v_actual; end if;
  if not exists(select 1 from pg_catalog.pg_indexes i where i.schemaname='public'
    and i.indexname='client_users_one_primary_decider' and i.indexdef like '%UNIQUE%'
    and i.indexdef like '%WHERE can_decide%') then raise exception 'primary decider index missing'; end if;
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('portal_client_session','record_content_decision',
      'add_comment','add_idea','edit_idea','touch_seen','set_content_plan','request_content_reschedule',
      'set_portal_feature_switch','upsert_portal_membership','offboard_portal_membership',
      'transfer_portal_primary_decider') and (not p.prosecdef
        or not(coalesce(p.proconfig,'{}'::text[])@>array['search_path=""']))) then
    raise exception 'access-control RPC is not hardened'; end if;
  if not pg_catalog.has_function_privilege('authenticated','public.portal_client_session(text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_client_session(text)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_client_session(text)','EXECUTE') then
    raise exception 'unsafe portal_client_session privilege'; end if;
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'portal_core_%'
      and (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
        or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
        or pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE'))) then
    raise exception 'private client writer core is executable'; end if;
  if pg_catalog.has_function_privilege('authenticated',
       'public.set_portal_feature_switch(uuid,text,boolean,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.set_portal_feature_switch(uuid,text,boolean,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.upsert_portal_membership(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.upsert_portal_membership(uuid,uuid,text,text,boolean,boolean,boolean,boolean,boolean,text,text)','EXECUTE') then
    raise exception 'unsafe access-control writer privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.list_portal_access()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.list_portal_feature_switches()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.list_portal_access_commands(uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.list_portal_access()','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.list_portal_feature_switches()','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.list_portal_access_commands(uuid)','EXECUTE') then
    raise exception 'unsafe access-control inspection privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.portal_feature_enabled(uuid,text)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_feature_enabled(uuid,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.portal_require_client_action(uuid,text)','EXECUTE') then
    raise exception 'internal access-control helper exposed'; end if;
end;
$$;

revoke all on function public.assert_portal_access_control_security()
  from public,anon,authenticated;
grant execute on function public.assert_portal_access_control_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice7_security();
  perform public.assert_portal_access_control_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
