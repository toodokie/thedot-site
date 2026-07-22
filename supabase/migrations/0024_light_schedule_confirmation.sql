-- 0024: scheduled is an agency report, not publication proof.
-- Evidence and a provider URL remain mandatory for the publication observation path.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)') is null then
    raise exception '0023 portal objects must exist before applying 0024';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice18_security;
revoke all on function public.assert_portal_slice18_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice18_security() to service_role;

-- Manual schedule confirmation. p_evidence_id is deliberately nullable: the agency actor's
-- report and scheduled_at are the audit record. If evidence is supplied, it is still checked
-- for same-tenant ownership, actor ownership, and a non-attestation evidence kind. A URL, when
-- supplied, must pass the existing destination allow-list; null means no provider URL was known.
create or replace function public.confirm_schedule_target(
  p_schedule_target_id uuid,
  p_scheduled_at timestamptz,
  p_external_url text,
  p_external_id text,
  p_evidence_id uuid,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_target public.content_schedule_targets%rowtype;
  v_ci public.content_items%rowtype;
  v_actor public.agency_actors%rowtype;
  v_evidence public.publication_evidence%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_key text := pg_catalog.btrim(p_idempotency_key);
  v_fingerprint text;
  v_response jsonb;
  v_title text;
  v_revision bigint;
  v_fully_scheduled boolean;
begin
  select * into v_target from public.content_schedule_targets t
    where t.id = p_schedule_target_id for update;
  if not found then raise exception 'schedule target not found'; end if;

  select * into v_actor from public.agency_actors a
    where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'agency actor is unavailable'; end if;

  if p_evidence_id is not null then
    select * into v_evidence from public.publication_evidence e
      where e.id = p_evidence_id and e.client_id = v_target.client_id and e.deleted_at is null;
    if not found then raise exception 'valid same-tenant evidence is required'; end if;
    if v_evidence.actor_id <> v_actor.id then raise exception 'evidence actor mismatch'; end if;
    if v_evidence.evidence_kind = 'agency_attestation' then
      raise exception 'manual schedule confirmation does not accept agency attestation evidence';
    end if;
  end if;

  select * into v_ci from public.content_items ci where ci.id = v_target.content_id for update;
  if not found or v_ci.client_id <> v_target.client_id
     or v_ci.client_visible_version is distinct from v_target.content_version
     or v_ci.status not in ('approved','scheduled') or v_ci.revision_in_progress then
    raise exception 'schedule target is not eligible for confirmation';
  end if;
  if v_key !~ '^[A-Za-z0-9:_-]{8,128}$' then raise exception 'invalid idempotency key'; end if;
  if p_scheduled_at is null or p_scheduled_at < pg_catalog.now() - interval '10 years'
     or p_scheduled_at > pg_catalog.now() + interval '2 years' then
    raise exception 'scheduled time is out of range';
  end if;
  if p_external_url is not null
     and not public.portal_provider_url_valid(v_target.destination,p_external_url,'schedule') then
    raise exception 'provider schedule URL is not allowed for destination';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.concat_ws('|','confirm_schedule',v_target.id::text,p_scheduled_at::text,
      p_external_url,p_external_id,p_evidence_id::text,p_actor_key), 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts r
    where r.client_id = v_target.client_id and r.idempotency_key = v_key;
  if found then
    if v_receipt.command_type <> 'confirm_schedule_target'
       or v_receipt.request_fingerprint <> v_fingerprint then raise exception 'idempotency_key_conflict'; end if;
    return v_receipt.response;
  end if;

  update public.content_schedule_targets set
    scheduled_at = p_scheduled_at, status = 'scheduled', verified_at = pg_catalog.now(),
    source_type = 'manual', external_url = p_external_url,
    external_id = nullif(pg_catalog.btrim(p_external_id), ''), evidence_id = p_evidence_id,
    verifier_actor_id = v_actor.id, last_error = null, updated_at = pg_catalog.now()
    where id = v_target.id;
  update public.content_schedule_request_attempts a set
    status = 'succeeded', result_scheduled_at = p_scheduled_at, source_type = 'manual',
    external_url = p_external_url, external_id = nullif(pg_catalog.btrim(p_external_id),''),
    evidence_id = p_evidence_id, resolved_at = pg_catalog.now(), last_error = null
    where a.schedule_target_id = v_target.id and a.status in ('pending','applying');
  update public.content_schedule_requests r set
    status = case
      when exists (select 1 from public.content_schedule_request_attempts a
        where a.request_id = r.id and a.status in ('pending','applying')) then 'partially_applied'
      when exists (select 1 from public.content_schedule_request_attempts a
        where a.request_id = r.id and a.status in ('failed','conflicted')) then 'conflicted'
      else 'applied' end,
    resolution_code = 'agency_verified', client_message = 'The Dot verified the provider schedule.',
    resolved_at = case when not exists (select 1 from public.content_schedule_request_attempts a
      where a.request_id = r.id and a.status in ('pending','applying')) then pg_catalog.now() end,
    updated_at = pg_catalog.now()
    where r.id in (select a.request_id from public.content_schedule_request_attempts a
      where a.schedule_target_id = v_target.id);

  v_fully_scheduled := public.portal_content_schedule_state(
    v_target.content_id,v_target.content_version) = 'scheduled';
  update public.content_items set
    status = case when v_fully_scheduled then 'scheduled' else status end,
    projection_revision = projection_revision + 1, updated_at = pg_catalog.now()
    where id = v_target.content_id returning projection_revision into v_revision;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_target.content_id and cv.client_id = v_target.client_id
      and cv.version = v_target.content_version;
  insert into public.activity_log
    (client_id,content_id,content_version,event_type,event_key,title,summary,actor_type,actor_name)
    values (v_target.client_id,v_target.content_id,v_target.content_version,
      'schedule_target_confirmed',
      'schedule-confirm:' || v_target.client_id::text || ':' || v_key,
      'Schedule confirmed: ' || v_title,
      v_target.destination || ' · provider time ' || p_scheduled_at::text,
      'anastasia',v_actor.display_name);
  if v_fully_scheduled then
    insert into public.activity_log
      (client_id,content_id,content_version,event_type,event_key,title,summary,actor_type,actor_name)
      values (v_target.client_id,v_target.content_id,v_target.content_version,'fully_scheduled',
        'fully-scheduled:' || v_target.content_id::text || ':' || v_target.content_version::text,
        'Fully scheduled: ' || v_title,'Every required destination was manually verified.',
        'anastasia',v_actor.display_name)
      on conflict (client_id,event_key) where event_key is not null do nothing;
  end if;
  v_response := pg_catalog.jsonb_build_object('target_id',v_target.id,'outcome','confirmed',
    'fully_scheduled',v_fully_scheduled);
  insert into public.portal_command_receipts
    (client_id,command_type,idempotency_key,request_fingerprint,response)
    values (v_target.client_id,'confirm_schedule_target',v_key,v_fingerprint,v_response);
  insert into public.portal_inbox_events
    (client_id,event_key,event_type,object_type,object_id,actor_type,actor_name,payload,requires_reconciliation)
    values (v_target.client_id,'schedule-confirm:' || v_target.client_id::text || ':' || v_key,
      'schedule_target_confirmed','content_schedule_target',v_target.id,'anastasia',v_actor.display_name,
      pg_catalog.jsonb_build_object('content_id',v_target.content_id,
        'content_version',v_target.content_version,'destination',v_target.destination),false);
  insert into public.projection_outbox
    (client_id,event_key,destination,operation,object_type,object_key,object_revision,payload)
    values (v_target.client_id,'schedule-confirm:' || v_target.client_id::text || ':' || v_key,
      'notion','upsert','content',v_target.content_id::text,v_revision,
      pg_catalog.jsonb_build_object('reason','schedule_target_confirmed'));
  return v_response;
end;
$$;

revoke all on function public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)
  to service_role;

-- Keep the client wording honest: a no-evidence scheduled row is a report, not provider proof.
-- The view's columns and security-invoker boundary are unchanged.
create or replace view public.content_schedule_targets_client
with (security_invoker = true)
as
select
  t.id, t.client_id, t.content_id, t.content_version, t.destination, t.required,
  t.scheduled_at, t.status, t.verified_at,
  case
    when t.status = 'scheduled' and t.source_type = 'manual' and t.verified_at is not null
      then 'scheduled report by The Dot'
    else 'not yet verified'
  end::text as verification_label,
  t.created_at, t.updated_at
from public.content_schedule_targets t;

create or replace function public.assert_portal_light_schedule_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
  v_publication_def text;
  v_view_def text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.oid =
      'public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)'::regprocedure;
  if v_def is null or v_def not ilike '%if p_evidence_id is not null then%'
     or v_def not ilike '%p_external_url is not null%' then
    raise exception 'schedule confirmation is not evidence-optional';
  end if;
  select pg_catalog.pg_get_functiondef(p.oid) into v_publication_def
    from pg_catalog.pg_proc p
    where p.oid = 'public.record_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)'::regprocedure;
  if v_publication_def is null
     or v_publication_def not ilike '%valid same-tenant evidence is required%'
     or v_publication_def not ilike '%live URL is required for a verified publication%' then
    raise exception 'publication proof requirements were weakened';
  end if;
  select pg_catalog.pg_get_viewdef('public.content_schedule_targets_client'::regclass, true)
    into v_view_def;
  if v_view_def is null or v_view_def not ilike '%scheduled report by The Dot%'
     or not exists (select 1 from pg_catalog.pg_class c
       where c.oid = 'public.content_schedule_targets_client'::pg_catalog.regclass
         and coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']) then
    raise exception 'schedule client view is not the safe report-aware view';
  end if;
  if not (select p.prosecdef and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
    from pg_catalog.pg_proc p
    where p.oid = 'public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)'::regprocedure) then
    raise exception 'schedule confirmation is not hardened';
  end if;
  if pg_catalog.has_function_privilege('anon','public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.confirm_schedule_target(uuid,timestamptz,text,text,uuid,text,text)','EXECUTE') then
    raise exception 'unsafe schedule confirmation privileges';
  end if;
  if pg_catalog.to_regprocedure('public.record_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)') is null
     or not pg_catalog.has_function_privilege('service_role','public.record_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)','EXECUTE') then
    raise exception 'publication observation writer missing';
  end if;
end;
$$;
revoke all on function public.assert_portal_light_schedule_security() from public, anon, authenticated;
grant execute on function public.assert_portal_light_schedule_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice18_security();
  perform public.assert_portal_light_schedule_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
