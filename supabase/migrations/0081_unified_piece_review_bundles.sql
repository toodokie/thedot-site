-- One Maria-facing review flow: version-scoped copy and visual drafts are sent as
-- one atomic bundle. Any unresolved edit blocks approval and first publication.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.record_content_decision(uuid,integer,text,text)') is null
     or pg_catalog.to_regprocedure('public.mark_content_ready(uuid,integer)') is null
     or pg_catalog.to_regclass('public.content_review_assets') is null then
    raise exception '0081 requires the complete piece review and review-asset system';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice80_security;
revoke all on function public.assert_portal_slice80_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice80_security() to service_role;

create or replace function public.portal_content_request_payload_valid(
  p_request_type text, p_payload jsonb
) returns boolean language sql immutable set search_path='' as $$
  select pg_catalog.jsonb_typeof(p_payload) = 'object' and case p_request_type
    when 'edit' then (
      not exists (
        select 1 from pg_catalog.jsonb_object_keys(p_payload) k
        where k not in ('block_key','original_checksum','proposed_text','target_kind',
          'target_key','target_label','asset_key','url_snapshot')
      )
      and coalesce(p_payload->>'target_kind','copy_block') in ('copy_block','asset','design_link')
      and coalesce(p_payload->>'target_key',p_payload->>'block_key') ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      and pg_catalog.char_length(pg_catalog.btrim(p_payload->>'proposed_text')) between 1 and 8000
      and (
        (coalesce(p_payload->>'target_kind','copy_block') = 'copy_block'
          and p_payload->>'block_key' ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
          and p_payload->>'original_checksum' ~ '^[0-9a-f]{64}$')
        or
        (p_payload->>'target_kind' = 'asset'
          and p_payload->>'asset_key' ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
          and p_payload->>'url_snapshot' ~ '^https://[^[:space:]]+$')
        or
        (p_payload->>'target_kind' = 'design_link'
          and p_payload->>'target_key' in ('canva','drive')
          and p_payload->>'url_snapshot' ~ '^https://[^[:space:]]+$')
      )
    )
    when 'create' then
      (select pg_catalog.array_agg(k order by k)=array['brief','desired_date','notes','platforms','title']
       from pg_catalog.jsonb_object_keys(p_payload) k)
      and pg_catalog.char_length(pg_catalog.btrim(p_payload->>'title')) between 1 and 300
      and pg_catalog.char_length(pg_catalog.btrim(p_payload->>'brief')) between 1 and 4000
      and pg_catalog.jsonb_typeof(p_payload->'platforms')='array'
      and pg_catalog.jsonb_array_length(p_payload->'platforms') between 1 and 5
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(p_payload->'platforms') e(value)
        where pg_catalog.jsonb_typeof(e.value)<>'string'
          or e.value#>>'{}' not in ('instagram','facebook','youtube','linkedin','squarespace','other')
      )
      and (p_payload->>'desired_date' is null or p_payload->>'desired_date' ~ '^\d{4}-\d{2}-\d{2}$')
      and (p_payload->>'notes' is null
        or pg_catalog.char_length(pg_catalog.btrim(p_payload->>'notes')) between 1 and 2000)
    when 'archive' then
      (select pg_catalog.array_agg(k order by k)=array['reason'] from pg_catalog.jsonb_object_keys(p_payload) k)
      and (p_payload->>'reason' is null
        or pg_catalog.char_length(pg_catalog.btrim(p_payload->>'reason')) between 1 and 2000)
    else false
  end
$$;
revoke all on function public.portal_content_request_payload_valid(text,jsonb)
  from public, anon, authenticated, service_role;

drop index if exists public.content_change_requests_open_edit;
create unique index content_change_requests_open_edit
  on public.content_change_requests(
    client_id, content_id, base_version,
    (coalesce(payload->>'target_kind','copy_block')),
    (coalesce(payload->>'target_key',payload->>'block_key'))
  )
  where request_type='edit' and status in ('pending','applying','prepared','conflicted');

create table public.content_edit_review_bundles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_id uuid not null,
  content_version int not null check (content_version > 0),
  requested_by uuid not null references auth.users(id),
  requester_name text not null,
  note text check (note is null or pg_catalog.char_length(note) between 1 and 2000),
  request_ids uuid[] not null check (pg_catalog.cardinality(request_ids) between 1 and 50),
  idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  unique (client_id, requested_by, idempotency_key),
  foreign key (content_id,client_id,content_version)
    references public.content_item_versions(content_item_id,client_id,version)
);
alter table public.content_edit_review_bundles enable row level security;
create policy content_edit_review_bundles_client_read on public.content_edit_review_bundles
  for select to authenticated using (client_id in (select public.my_client_ids()));
revoke all on public.content_edit_review_bundles from public, anon, authenticated, service_role;
grant select (id,client_id,content_id,content_version,requested_by,requester_name,note,request_ids,created_at)
  on public.content_edit_review_bundles to authenticated;
grant select on public.content_edit_review_bundles to service_role;

-- Per-seat receipt for the one-time review-flow explanation. Keeping this on
-- the server avoids showing the same introduction again on another device.
create table public.portal_announcement_acknowledgments (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  announcement_key text not null check (announcement_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  acknowledged_at timestamptz not null default pg_catalog.now(),
  primary key (auth_user_id,client_id,announcement_key)
);
alter table public.portal_announcement_acknowledgments enable row level security;
create policy portal_announcement_acknowledgments_read_own
  on public.portal_announcement_acknowledgments for select to authenticated
  using (auth_user_id=(select auth.uid()) and client_id in (select public.my_client_ids()));
revoke all on public.portal_announcement_acknowledgments from public,anon,authenticated,service_role;
grant select (client_id,announcement_key,acknowledged_at)
  on public.portal_announcement_acknowledgments to authenticated;
grant select,insert,update,delete on public.portal_announcement_acknowledgments to service_role;

create function public.acknowledge_portal_announcement(p_client_id uuid,p_announcement_key text)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_at timestamptz;
begin
  if v_uid is null or p_announcement_key is null
     or p_announcement_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'invalid announcement acknowledgment'; end if;
  if not exists (select 1 from public.client_users cu
    where cu.auth_user_id=v_uid and cu.client_id=p_client_id) then
    raise exception 'not authorized for this client'; end if;
  insert into public.portal_announcement_acknowledgments(
    auth_user_id,client_id,announcement_key)
  values(v_uid,p_client_id,p_announcement_key)
  on conflict(auth_user_id,client_id,announcement_key) do update
    set acknowledged_at=public.portal_announcement_acknowledgments.acknowledged_at
  returning acknowledged_at into v_at;
  return v_at;
end;
$$;
revoke all on function public.acknowledge_portal_announcement(uuid,text)
  from public,anon,service_role;
grant execute on function public.acknowledge_portal_announcement(uuid,text) to authenticated;

create function public.request_content_edit_bundle(
  p_content_id uuid,
  p_content_version int,
  p_edits jsonb,
  p_note text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_version public.content_item_versions%rowtype;
  v_existing public.content_edit_review_bundles%rowtype;
  v_edit jsonb;
  v_payload jsonb;
  v_kind text;
  v_key text;
  v_label text;
  v_text text;
  v_url text;
  v_current_url text;
  v_original text;
  v_actor text;
  v_title text;
  v_fingerprint text;
  v_request_fingerprint text;
  v_request_id uuid;
  v_request_ids uuid[] := '{}'::uuid[];
  v_seen text[] := '{}'::text[];
  v_note text := nullif(pg_catalog.btrim(p_note),'');
  v_can_decide boolean := false;
begin
  if v_uid is null or p_idempotency_key is null or p_content_version is null or p_content_version < 1
     or pg_catalog.jsonb_typeof(p_edits) <> 'array'
     or pg_catalog.jsonb_array_length(p_edits) not between 1 and 50
     or (v_note is not null and pg_catalog.char_length(v_note) > 2000) then
    raise exception 'invalid review bundle';
  end if;

  select ci.* into v_item from public.content_items ci where ci.id=p_content_id for update;
  if not found then raise exception 'portal_action_not_allowed' using errcode='42501'; end if;
  perform public.portal_require_client_action(v_item.client_id,'can_submit_requests');
  if not v_item.client_visible
     or v_item.client_visible_version is distinct from p_content_version
     or v_item.archived_at is not null
     or v_item.publication_locked_version is not null
     or v_item.status = 'posted' then
    raise exception 'stale_or_locked_content';
  end if;
  select cv.* into v_version from public.content_item_versions cv
    where cv.content_item_id=v_item.id and cv.client_id=v_item.client_id and cv.version=p_content_version;
  if not found then raise exception 'stale_or_locked_content'; end if;

  select coalesce(nullif(pg_catalog.btrim(cu.name),''),'Client'), cu.can_decide
    into v_actor,v_can_decide from public.client_users cu
    where cu.client_id=v_item.client_id and cu.auth_user_id=v_uid;
  if not found then raise exception 'portal_action_not_allowed' using errcode='42501'; end if;
  v_title := v_version.title;
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('content_id',p_content_id,'version',p_content_version,
      'edits',p_edits,'note',v_note)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_item.client_id::text||':'||v_uid::text||':'||p_idempotency_key::text,0));
  select * into v_existing from public.content_edit_review_bundles b
    where b.client_id=v_item.client_id and b.requested_by=v_uid
      and b.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return pg_catalog.jsonb_build_object('bundle_id',v_existing.id,
      'request_ids',v_existing.request_ids,'outcome','unchanged');
  end if;
  if exists (
    select 1 from public.content_change_requests r
    where r.client_id=v_item.client_id and r.content_id=v_item.id
      and r.request_type='edit' and r.base_version=p_content_version
      and r.status in ('applying','prepared')
  ) then raise exception 'revision_already_in_progress'; end if;
  if not public.portal_consume_request_rate_limit(v_item.client_id,v_uid,'content_edit') then
    raise exception 'rate_limited';
  end if;

  for v_edit in select value from pg_catalog.jsonb_array_elements(p_edits)
  loop
    v_kind := v_edit->>'target_kind';
    v_key := pg_catalog.lower(pg_catalog.btrim(v_edit->>'target_key'));
    v_label := pg_catalog.btrim(v_edit->>'target_label');
    v_text := public.portal_normalize_client_copy(v_edit->>'proposed_text');
    v_url := nullif(pg_catalog.btrim(v_edit->>'url_snapshot'),'');
    if v_kind is null or v_kind not in ('copy_block','asset','design_link')
       or v_key is null or v_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
       or v_label is null or pg_catalog.char_length(v_label) not between 1 and 120
       or v_text is null or pg_catalog.char_length(v_text) not between 1 and 8000
       or (v_kind='design_link' and v_key not in ('canva','drive'))
       or v_kind||':'||v_key = any(v_seen) then
      raise exception 'invalid review bundle target';
    end if;
    v_seen := pg_catalog.array_append(v_seen,v_kind||':'||v_key);

    if v_kind='copy_block' then
      select block->>'body' into v_original from pg_catalog.jsonb_array_elements(v_version.copy_blocks) block
        where block->>'key'=v_key;
      if v_original is null then raise exception 'copy_block_not_found'; end if;
      if pg_catalog.btrim(v_original)=pg_catalog.btrim(v_text) then raise exception 'proposed copy is unchanged'; end if;
      v_payload := pg_catalog.jsonb_build_object(
        'target_kind',v_kind,'target_key',v_key,'target_label',v_label,
        'block_key',v_key,
        'original_checksum',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_original,'UTF8'),'sha256'),'hex'),
        'proposed_text',v_text);
    elsif v_kind='asset' then
      select a.url into v_current_url from public.content_review_assets a
        where a.client_id=v_item.client_id and a.content_item_id=v_item.id
          and a.content_version=p_content_version and a.asset_key=v_key;
      if v_current_url is null or v_url is distinct from v_current_url then raise exception 'stale visual asset'; end if;
      v_payload := pg_catalog.jsonb_build_object(
        'target_kind',v_kind,'target_key',v_key,'target_label',v_label,
        'asset_key',v_key,'url_snapshot',v_url,'proposed_text',v_text);
    else
      select case when v_key='canva' then coalesce(dl.canva_url,v_version.canva_url)
        else coalesce(dl.drive_url,v_version.drive_url) end into v_current_url
      from (select 1) seed left join public.content_design_links dl
        on dl.content_item_id=v_item.id and dl.client_id=v_item.client_id;
      if v_current_url is null or v_url is distinct from v_current_url then raise exception 'stale design link'; end if;
      v_payload := pg_catalog.jsonb_build_object(
        'target_kind',v_kind,'target_key',v_key,'target_label',v_label,
        'url_snapshot',v_url,'proposed_text',v_text);
    end if;

    update public.canonical_change_jobs j set status='abandoned',
      last_error='Superseded by a later client edit to the same review target.',updated_at=pg_catalog.now()
    where j.request_id in (
      select r.id from public.content_change_requests r
      where r.client_id=v_item.client_id and r.content_id=v_item.id and r.base_version=p_content_version
        and r.request_type='edit' and r.status in ('pending','conflicted')
        and coalesce(r.payload->>'target_kind','copy_block')=v_kind
        and coalesce(r.payload->>'target_key',r.payload->>'block_key')=v_key
    ) and j.status in ('pending','processing','committed','conflicted','failed');
    update public.content_change_requests r set status='superseded',
      reconciled_at=pg_catalog.now(),reconciled_by=v_actor,
      resolution_note='Replaced by a later edit from the client on the same review target.',updated_at=pg_catalog.now()
    where r.client_id=v_item.client_id and r.content_id=v_item.id and r.base_version=p_content_version
      and r.request_type='edit' and r.status in ('pending','conflicted')
      and coalesce(r.payload->>'target_kind','copy_block')=v_kind
      and coalesce(r.payload->>'target_key',r.payload->>'block_key')=v_key;

    v_request_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object('content_id',p_content_id,'version',p_content_version,'payload',v_payload)::text,
      'UTF8'),'sha256'),'hex');
    insert into public.content_change_requests(client_id,content_id,request_type,base_version,
      payload,requested_by,requester_name,idempotency_key,request_fingerprint)
    values(v_item.client_id,v_item.id,'edit',p_content_version,v_payload,v_uid,v_actor,
      gen_random_uuid(),v_request_fingerprint) returning id into v_request_id;
    v_request_ids := pg_catalog.array_append(v_request_ids,v_request_id);
  end loop;

  insert into public.content_edit_review_bundles(client_id,content_id,content_version,
    requested_by,requester_name,note,request_ids,idempotency_key,request_fingerprint)
  values(v_item.client_id,v_item.id,p_content_version,v_uid,v_actor,v_note,v_request_ids,
    p_idempotency_key,v_fingerprint) returning id into v_request_id;

  if v_can_decide then
    insert into public.approvals(content_id,client_id,content_version,state,note,decided_by,
      decision_source,decision_actor_key,actor_name,source_occurred_at)
    values(v_item.id,v_item.client_id,p_content_version,'change_requested',v_note,v_uid,
      'portal','auth:'||v_uid::text,v_actor,pg_catalog.now())
    on conflict(content_id,content_version,decision_actor_key) do update
      set state='change_requested',note=excluded.note,actor_name=excluded.actor_name,
        source_occurred_at=excluded.source_occurred_at,created_at=pg_catalog.now();
    update public.content_items set status='draft',review_ready_at=null,
      revision_in_progress=true,updated_at=pg_catalog.now() where id=v_item.id;
  end if;

  insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,
    title,summary,actor_type,actor_name)
  values(v_item.client_id,v_item.id,p_content_version,'edit_requested',
    'content-edit-bundle:'||v_request_id::text,'Edits requested: '||v_title,
    case when pg_catalog.cardinality(v_request_ids)=1 then 'One edit is waiting for The Dot.'
      else pg_catalog.cardinality(v_request_ids)||' edits are waiting for The Dot.' end,
    'client',v_actor);
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,object_id,
    actor_type,actor_name,payload,requires_reconciliation)
  values(v_item.client_id,'content-edit-bundle:'||v_request_id::text,'edit_requested',
    'content_edit_review_bundle',v_request_id,'client',v_actor,
    pg_catalog.jsonb_build_object('content_id',v_item.id,'base_version',p_content_version,
      'request_ids',v_request_ids,'edit_count',pg_catalog.cardinality(v_request_ids)),true);
  return pg_catalog.jsonb_build_object('bundle_id',v_request_id,'request_ids',v_request_ids,
    'outcome','created');
end;
$$;
revoke all on function public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)
  from public, anon, service_role;
grant execute on function public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)
  to authenticated;

-- Approval is checked before the legacy exact-retry branch, while holding the same
-- content row lock used by bundle intake.
alter function public.record_content_decision(uuid,integer,text,text)
  rename to portal_core_review_flow_record_content_decision;
revoke all on function public.portal_core_review_flow_record_content_decision(uuid,integer,text,text)
  from public, anon, authenticated, service_role;
create function public.record_content_decision(
  p_content_id uuid,p_content_version integer,p_decision text,p_note text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_item public.content_items%rowtype;
begin
  -- Delegated package checks remain in the wrapped boundary: portal_require_client_action,
  -- content_item_versions, content_design_links, v_is_visible,
  -- final_package_design_required, content_review_assets, final_package_incomplete,
  -- burned_in_verified and portal_core_record_content_decision.
  select ci.* into v_item from public.content_items ci where ci.id=p_content_id for update;
  if not found then raise exception 'not authorized for this content'; end if;
  if p_decision='approved' and exists (
    select 1 from public.content_change_requests r
    where r.client_id=v_item.client_id and r.content_id=v_item.id
      and r.request_type='edit' and r.base_version=p_content_version
      and r.status in ('pending','applying','prepared','conflicted')
  ) then raise exception 'unresolved client edit request'; end if;
  return public.portal_core_review_flow_record_content_decision(
    p_content_id,p_content_version,p_decision,p_note);
end;
$$;
revoke all on function public.record_content_decision(uuid,integer,text,text)
  from public, anon, service_role;
grant execute on function public.record_content_decision(uuid,integer,text,text) to authenticated;

-- Prepare a visual-only immutable working version. Review-asset and design-link
-- writers remain separate so the replacement itself retains its existing audit trail.
create function public.begin_visual_request_revision(
  p_request_ids uuid[],p_actor_key text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_ids uuid[];
  v_lead public.content_change_requests%rowtype;
  v_item public.content_items%rowtype;
  v_base public.content_item_versions%rowtype;
  v_actor public.agency_actors%rowtype;
  v_version int;
  v_count int;
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_response jsonb;
  v_request record;
begin
  select pg_catalog.array_agg(id order by id) into v_ids
    from (select distinct id from pg_catalog.unnest(p_request_ids) id where id is not null) ids;
  if coalesce(pg_catalog.cardinality(v_ids),0) < 1 or p_idempotency_key is null then
    raise exception 'invalid visual request revision'; end if;
  select * into v_lead from public.content_change_requests r where r.id=v_ids[1] for update;
  if not found then raise exception 'visual request not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(v_lead.client_id,'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode='42501'; end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('request_ids',v_ids,'actor',p_actor_key)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts r
    where r.client_id=v_lead.client_id and r.idempotency_key=p_idempotency_key::text;
  if found then
    if v_receipt.command_type<>'begin_visual_request_revision'
       or v_receipt.request_fingerprint<>v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return v_receipt.response;
  end if;
  select pg_catalog.count(*) into v_count from public.content_change_requests r
    where r.id=any(v_ids) and r.client_id=v_lead.client_id and r.content_id=v_lead.content_id
      and r.base_version=v_lead.base_version and r.request_type='edit'
      and r.status in ('pending','conflicted')
      and r.payload->>'target_kind' in ('asset','design_link');
  if v_count <> pg_catalog.cardinality(v_ids) then raise exception 'visual request set is inconsistent'; end if;
  select ci.* into v_item from public.content_items ci
    where ci.id=v_lead.content_id and ci.client_id=v_lead.client_id for update;
  if not found or v_item.client_visible_version is distinct from v_lead.base_version
     or v_item.archived_at is not null or v_item.publication_locked_version is not null then
    raise exception 'visual request base version is stale or locked'; end if;
  select * into v_base from public.content_item_versions cv
    where cv.content_item_id=v_item.id and cv.client_id=v_item.client_id and cv.version=v_lead.base_version;
  if not found then raise exception 'visual request base snapshot is missing'; end if;
  v_version := v_lead.base_version + 1;
  if v_item.working_version=v_lead.base_version and exists (
    select 1 from public.content_change_requests r
    where r.client_id=v_item.client_id and r.content_id=v_item.id
      and r.base_version=v_lead.base_version and r.request_type='edit'
      and r.status in ('pending','conflicted')
      and coalesce(r.payload->>'target_kind','copy_block')='copy_block'
  ) then
    raise exception 'copy requests must start the shared revision first';
  end if;
  if v_item.working_version=v_lead.base_version then
    insert into public.content_item_versions(content_item_id,client_id,version,title,format,pillar,
      platforms,canva_url,drive_url,fact_check,fact_check_ledger,client_body,copy_blocks,
      content_checksum,source_path,synced_at,fact_check_scope,fact_check_exemption,
      source_commit_sha,producer,calendar_note)
    values(v_base.content_item_id,v_base.client_id,v_version,v_base.title,v_base.format,v_base.pillar,
      v_base.platforms,v_base.canva_url,v_base.drive_url,v_base.fact_check,v_base.fact_check_ledger,
      v_base.client_body,v_base.copy_blocks,v_base.content_checksum,v_base.source_path,pg_catalog.now(),
      v_base.fact_check_scope,v_base.fact_check_exemption,v_base.source_commit_sha,
      v_base.producer,v_base.calendar_note);
    update public.content_items set working_version=v_version,status='draft',review_ready_at=null,
      revision_in_progress=true,updated_at=pg_catalog.now() where id=v_item.id;
  elsif v_item.working_version<>v_version or not v_item.revision_in_progress then
    raise exception 'another working revision is incompatible with this visual request';
  end if;
  insert into public.content_review_assets(client_id,content_item_id,content_version,asset_key,
    label,channel,asset_kind,url,width_px,height_px,caption_status,review_note)
  select a.client_id,a.content_item_id,v_version,a.asset_key,a.label,a.channel,a.asset_kind,a.url,
    a.width_px,a.height_px,a.caption_status,a.review_note from public.content_review_assets a
  where a.client_id=v_item.client_id and a.content_item_id=v_item.id
    and a.content_version=v_lead.base_version
  on conflict(client_id,content_item_id,content_version,asset_key) do nothing;
  update public.content_change_requests r set status='applying',canonical_content_id=v_item.id,
    canonical_version=v_version,reconciled_at=pg_catalog.now(),reconciled_by=v_actor.display_name,
    resolution_note='Visual revision started; replacement and proof are still required.',
    updated_at=pg_catalog.now() where r.id=any(v_ids);
  v_response:=pg_catalog.jsonb_build_object('request_ids',v_ids,'content_id',v_item.id,
    'version',v_version,'status','applying');
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,
    request_fingerprint,response) values(v_item.client_id,'begin_visual_request_revision',
    p_idempotency_key::text,v_fingerprint,v_response);
  return v_response;
end;
$$;
revoke all on function public.begin_visual_request_revision(uuid[],text,uuid)
  from public, anon, authenticated;
grant execute on function public.begin_visual_request_revision(uuid[],text,uuid) to service_role;

create function public.mark_visual_request_revision_prepared(
  p_request_ids uuid[],p_actor_key text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_ids uuid[];
  v_lead public.content_change_requests%rowtype;
  v_item public.content_items%rowtype;
  v_actor public.agency_actors%rowtype;
  v_request public.content_change_requests%rowtype;
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_response jsonb;
begin
  select pg_catalog.array_agg(id order by id) into v_ids
    from (select distinct id from pg_catalog.unnest(p_request_ids) id where id is not null) ids;
  if coalesce(pg_catalog.cardinality(v_ids),0)<1 or p_idempotency_key is null then
    raise exception 'invalid visual request ready set'; end if;
  select * into v_lead from public.content_change_requests r where r.id=v_ids[1] for update;
  if not found then raise exception 'visual request not found'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('request_ids',v_ids,'actor',p_actor_key)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts r
    where r.client_id=v_lead.client_id and r.idempotency_key=p_idempotency_key::text;
  if found then
    if v_receipt.command_type<>'mark_visual_request_revision_prepared'
       or v_receipt.request_fingerprint<>v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return v_receipt.response;
  end if;
  select * into v_item from public.content_items ci
    where ci.id=v_lead.content_id and ci.client_id=v_lead.client_id for update;
  if not found or not v_item.revision_in_progress
     or v_item.working_version is distinct from v_lead.canonical_version then
    raise exception 'visual working revision is unavailable'; end if;
  for v_request in select * from public.content_change_requests r
    where r.id=any(v_ids) order by r.id for update
  loop
    if v_request.client_id is distinct from v_lead.client_id
       or v_request.content_id is distinct from v_lead.content_id
       or v_request.base_version is distinct from v_lead.base_version
       or v_request.canonical_version is distinct from v_lead.canonical_version
       or v_request.status<>'applying'
       or v_request.payload->>'target_kind' not in ('asset','design_link') then
      raise exception 'visual request ready set is inconsistent'; end if;
    if v_request.payload->>'target_kind'='asset' and not exists (
      select 1 from public.content_review_asset_events e
      where e.client_id=v_request.client_id and e.content_item_id=v_request.content_id
        and e.content_version=v_request.canonical_version
        and e.asset_key=v_request.payload->>'asset_key'
        and e.created_at>v_request.updated_at
    ) then raise exception 'visual asset replacement has not been recorded'; end if;
    if v_request.payload->>'target_kind'='design_link' and not exists (
      select 1 from public.activity_log a
      where a.client_id=v_request.client_id and a.content_id=v_request.content_id
        and a.event_type='design_link_updated' and a.created_at>v_request.updated_at
    ) then raise exception 'design link replacement has not been recorded'; end if;
  end loop;
  update public.content_change_requests r set status='prepared',reconciled_at=pg_catalog.now(),
    reconciled_by=v_actor.display_name,
    resolution_note='Corrected visual recorded on the working version; awaiting release.',
    updated_at=pg_catalog.now() where r.id=any(v_ids);
  v_response:=pg_catalog.jsonb_build_object('request_ids',v_ids,'content_id',v_item.id,
    'version',v_item.working_version,'status','prepared');
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,
    request_fingerprint,response) values(v_item.client_id,'mark_visual_request_revision_prepared',
    p_idempotency_key::text,v_fingerprint,v_response);
  for v_request in select * from public.content_change_requests where id=any(v_ids) loop
    insert into public.activity_log(client_id,content_id,content_version,event_type,event_key,
      title,summary,actor_type,actor_name) values(v_item.client_id,v_item.id,v_item.working_version,
      'request_prepared','content-request-prepared:'||v_request.id::text,
      'Visual request prepared','The Dot recorded the corrected visual and is completing release checks.',
      'anastasia',v_actor.display_name);
  end loop;
  return v_response;
end;
$$;
revoke all on function public.mark_visual_request_revision_prepared(uuid[],text,uuid)
  from public, anon, authenticated;
grant execute on function public.mark_visual_request_revision_prepared(uuid[],text,uuid) to service_role;

-- A prepared request may release only with its exact target version. Any late
-- pending, applying or conflicted follow-up keeps the working version closed.
alter function public.mark_content_ready(uuid,integer)
  rename to portal_core_review_flow_mark_content_ready;
revoke all on function public.portal_core_review_flow_mark_content_ready(uuid,integer)
  from public, anon, authenticated, service_role;
create function public.mark_content_ready(p_content_id uuid,p_content_version int)
returns void language plpgsql security definer set search_path='' as $$
declare v_item public.content_items%rowtype;
begin
  select * into v_item from public.content_items ci where ci.id=p_content_id for update;
  if not found then raise exception 'content item not found'; end if;
  if exists (
    select 1 from public.content_change_requests r
    where r.client_id=v_item.client_id and r.content_id=v_item.id and r.request_type='edit'
      and r.base_version=v_item.client_visible_version
      and r.status in ('pending','applying','conflicted')
  ) or exists (
    select 1 from public.content_change_requests r
    where r.client_id=v_item.client_id and r.content_id=v_item.id and r.request_type='edit'
      and r.base_version=v_item.client_visible_version and r.status='prepared'
      and r.canonical_version is distinct from p_content_version
  ) then raise exception 'unresolved client edit request is not included in this release'; end if;
  perform public.portal_core_review_flow_mark_content_ready(p_content_id,p_content_version);
end;
$$;
revoke all on function public.mark_content_ready(uuid,integer) from public, anon, authenticated;
grant execute on function public.mark_content_ready(uuid,integer) to service_role;

-- Keep the dashboard state aligned with the same unresolved predicate used by
-- the piece page and approval boundary.
do $rewrite$
declare v_view text;
begin
  select pg_catalog.pg_get_viewdef('public.content_with_state'::pg_catalog.regclass,true) into v_view;
  if v_view is null
     or pg_catalog.strpos(v_view,'status = ANY (ARRAY[''pending''::text, ''applying''::text, ''prepared''::text])')=0 then
    raise exception 'content_with_state unresolved-edit predicate drifted';
  end if;
  v_view:=pg_catalog.replace(v_view,
    'status = ANY (ARRAY[''pending''::text, ''applying''::text, ''prepared''::text])',
    'status = ANY (ARRAY[''pending''::text, ''applying''::text, ''prepared''::text, ''conflicted''::text])');
  execute 'create or replace view public.content_with_state with (security_invoker=true) as '||v_view;
end;
$rewrite$;

-- Add conflicted to the first-publication guard without replacing the mature writer.
do $rewrite$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def,
    'r.status in (''pending'', ''applying'', ''prepared'')')=0 then
    raise exception 'publication unresolved-edit predicate drifted'; end if;
  v_def := pg_catalog.replace(v_def,
    'r.status in (''pending'', ''applying'', ''prepared'')',
    'r.status in (''pending'', ''applying'', ''prepared'', ''conflicted'')');
  execute v_def;
end;
$rewrite$;
revoke all on function public.record_publication_observation(
  uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_publication_observation(
  uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text
) to service_role;

create function public.assert_portal_unified_piece_review_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%for update%'
     or v_def not ilike '%content_edit_review_bundles%'
     or v_def not ilike '%publication_locked_version%'
     or v_def not ilike '%content_edit_review_bundle%' then
    raise exception 'review bundle boundary is incomplete'; end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_content_decision(uuid,integer,text,text)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%''conflicted''%'
     or v_def not ilike '%for update%' then raise exception 'approval unresolved-edit guard is incomplete'; end if;
  select pg_catalog.pg_get_functiondef(
    'public.begin_visual_request_revision(uuid[],text,uuid)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%content_review_assets%'
     or v_def not ilike '%working_version%' then raise exception 'visual revision boundary is incomplete'; end if;
  if pg_catalog.has_function_privilege('anon',
       'public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.begin_visual_request_revision(uuid[],text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.mark_visual_request_revision_prepared(uuid[],text,uuid)','EXECUTE') then
    raise exception 'unified review function grants are unsafe'; end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c
      where c.oid='public.portal_announcement_acknowledgments'::pg_catalog.regclass)
     or pg_catalog.has_table_privilege('authenticated',
       'public.portal_announcement_acknowledgments','INSERT')
     or pg_catalog.has_function_privilege('anon',
       'public.acknowledge_portal_announcement(uuid,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.acknowledge_portal_announcement(uuid,text)','EXECUTE') then
    raise exception 'portal announcement acknowledgment boundary is unsafe'; end if;
end;
$$;
revoke all on function public.assert_portal_unified_piece_review_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_unified_piece_review_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice80_security();
  perform public.assert_portal_unified_piece_review_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
