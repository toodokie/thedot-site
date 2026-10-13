-- Provider reality can include a destination omitted from the released package.
-- Add that destination without rewriting the immutable content snapshot, but only
-- for an exact version with an explicit Anastasia agency override already recorded.
begin;

do $$
begin
  if pg_catalog.to_regclass('public.content_schedule_targets') is null
     or pg_catalog.to_regclass('public.content_courtesy_releases') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0061 requires scheduling, publication, and agency overrides';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice60_security;
revoke all on function public.assert_portal_slice60_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice60_security() to service_role;

insert into public.activity_event_types(event_type)
values ('agency_override_destination_added')
on conflict (event_type) do nothing;

create function public.add_content_agency_override_destination(
  p_content_id uuid,
  p_content_version int,
  p_destination text,
  p_reason text,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items%rowtype;
  v_actor public.agency_actors%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_destination text := pg_catalog.lower(pg_catalog.btrim(p_destination));
  v_reason text := pg_catalog.btrim(p_reason);
  v_title text;
  v_target_id uuid;
  v_fingerprint text;
  v_response jsonb;
begin
  if p_content_id is null or p_content_version is null or p_content_version < 1
     or p_idempotency_key is null
     or v_destination not in ('instagram','facebook','youtube','squarespace')
     or v_reason is null or pg_catalog.char_length(v_reason) not between 10 and 2000
     or pg_catalog.lower(v_reason) not like 'agency override authorized by anastasia:%'
     or not public.portal_client_summary_shape_valid(v_reason) then
    raise exception 'invalid agency override destination';
  end if;

  select * into v_actor from public.agency_actors a
  where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;

  select * into v_item from public.content_items ci
  where ci.id = p_content_id for update;
  if not found then raise exception 'content item not found'; end if;
  if not public.portal_feature_enabled(v_item.client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode='42501';
  end if;
  if v_item.archived_at is not null
     or not v_item.client_visible
     or v_item.client_visible_version is distinct from p_content_version
     or v_item.working_version is distinct from p_content_version
     or v_item.revision_in_progress
     or v_item.status not in ('approved','scheduled','posted') then
    raise exception 'content is not eligible for an agency override destination';
  end if;
  if not exists (
    select 1 from public.content_courtesy_releases cr
    where cr.client_id = v_item.client_id and cr.content_id = v_item.id
      and cr.content_version = p_content_version
  ) then
    raise exception 'agency override destination requires a version-bound agency release override';
  end if;
  if exists (
    select 1 from public.content_change_requests r
    where r.client_id = v_item.client_id and r.content_id = v_item.id
      and r.status in ('pending','applying','prepared')
  ) then
    raise exception 'unresolved client edit request';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('content_id',p_content_id,'content_version',p_content_version,
      'destination',v_destination,'reason',v_reason,'actor',p_actor_key)::text,
    'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-override-destination:' || v_item.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_receipt from public.portal_command_receipts r
  where r.client_id = v_item.client_id and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'add_content_agency_override_destination'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different agency override destination';
    end if;
    return v_receipt.response;
  end if;

  select cv.title into v_title from public.content_item_versions cv
  where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
    and cv.version = p_content_version;
  if not found then raise exception 'released content snapshot not found'; end if;

  insert into public.content_schedule_targets(
    client_id,content_id,content_version,destination,required
  ) values (
    v_item.client_id,v_item.id,p_content_version,v_destination,true
  ) on conflict (client_id,content_id,content_version,destination)
    do update set required=true,updated_at=pg_catalog.now()
  returning id into v_target_id;

  insert into public.activity_log(
    client_id,content_id,content_version,event_type,event_key,title,summary,actor_type,actor_name
  ) values (
    v_item.client_id,v_item.id,p_content_version,'agency_override_destination_added',
    'agency-override-destination:' || p_idempotency_key::text,
    'Agency override destination: ' || v_title,v_reason,'anastasia',v_actor.display_name
  );

  v_response := pg_catalog.jsonb_build_object('content_id',v_item.id,'content_version',p_content_version,
    'destination',v_destination,'schedule_target_id',v_target_id,'outcome','recorded');
  insert into public.portal_command_receipts(
    client_id,command_type,idempotency_key,request_fingerprint,response
  ) values (
    v_item.client_id,'add_content_agency_override_destination',p_idempotency_key::text,v_fingerprint,v_response
  );
  return v_response;
end;
$$;
revoke all on function public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)
  to service_role;

create function public.assert_portal_agency_override_destination_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%agency override authorized by anastasia:%'
     or v_def not ilike '%content_courtesy_releases%'
     or v_def not ilike '%unresolved client edit request%'
     or v_def not ilike '%for update%'
     or v_def not ilike '%portal_feature_enabled%agency_mutations%' then
    raise exception 'agency override destination writer is missing a required guard';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p
    where p.oid='public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)'::pg_catalog.regprocedure
      and p.prosecdef and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']) then
    raise exception 'agency override destination writer has an unsafe search path';
  end if;
  if pg_catalog.has_function_privilege('anon','public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.add_content_agency_override_destination(uuid,integer,text,text,text,uuid)','EXECUTE') then
    raise exception 'agency override destination writer grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_agency_override_destination_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_agency_override_destination_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice60_security();
  perform public.assert_portal_agency_override_destination_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
