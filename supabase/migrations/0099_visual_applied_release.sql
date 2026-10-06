-- A video-only change Maria asked for must land on Approved quietly, exactly like applied copy
-- edits (client rule, PORTAL-OPERATIONS-PLAYBOOK section 5). Incident 2026-10-06:
-- kanset-2026-10-askkanset-remote-work, Maria's asset note "please make it faster" on v2.
--
-- What actually happened. The database path for a visual-only edit already existed and works:
-- visual-revision (begin_visual_request_revision, 0081) -> attach the new video to the new
-- working version -> visual-revision-ready (mark_visual_request_revision_prepared) ->
-- applied-release (record_agency_applied_release, 0085). The playbook never named it; section 7
-- told agents an asset request "cannot be applied" and to answer and close it. The agent did,
-- attached the new cut to the released v2 in place, and every quiet path then refused:
--   * visual-revision: the request is 'answered', not pending/conflicted
--     -> "visual request set is inconsistent".
--   * applied-release v2: "v2 is not ahead of the released version v2". No v3 can be cut, because
--     a sync with unchanged copy is a no-op.
--   * courtesy-release v2: revision_in_progress is true and review_ready_at is null
--     -> "content is not eligible for a courtesy release"; behind that, her change_requested
--     decision on v2 -> "courtesy release cannot replace a recorded client decision".
--   * supersede v2: "v2 already carries a client decision".
--
-- Changed here, each function based on its latest live body:
--   1. begin_visual_request_revision (0081 body): an asset or design-link request that was answered
--      and closed may be reopened into a new visual revision, but only in the exact stranded state:
--      its base is still the released and working version, the piece is back with The Dot after
--      her change_requested decision on that version, nothing newer exists and nothing is locked.
--      Everything else is unchanged.
--   2. mark_visual_request_revision_prepared (0081 body): an asset request cannot be prepared while
--      the working version still carries the exact asset URL she flagged. Re-attaching the old
--      file recorded an event and used to pass.
--   3. record_agency_applied_release (0085 body): explicit publication-lock and archive refusals
--      before anything else; the same unchanged-asset check at release time (the asset could be
--      reverted after prepare); and a real idempotent retry. Before, a retry with the same key hit
--      "not ahead of the released version" because the first call had already promoted.
-- No review is armed and no client email is possible on any of these paths, as before.

begin;
set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regprocedure('public.begin_visual_request_revision(uuid[],text,uuid)') is null
     or pg_catalog.to_regprocedure('public.mark_visual_request_revision_prepared(uuid[],text,uuid)') is null
     or pg_catalog.to_regprocedure('public.record_agency_applied_release(uuid,integer,text,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.record_content_courtesy_release(uuid,integer,text,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.portal_assert_release_media(uuid,integer)') is null
     or pg_catalog.to_regprocedure('public.assert_agency_media_signal_security()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0099 requires the visual revision, applied release and release media guard (0081, 0085, 0092, 0095)';
  end if;
end;
$$;

select public.assert_portal_security();

-- 1. Reopen a wrongly closed visual request, only from the stranded state.
create or replace function public.begin_visual_request_revision(
  p_request_ids uuid[], p_actor_key text, p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  v_reopen boolean := false;
  v_reopened int := 0;
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
  select ci.* into v_item from public.content_items ci
    where ci.id=v_lead.content_id and ci.client_id=v_lead.client_id for update;
  if not found or v_item.client_visible_version is distinct from v_lead.base_version
     or v_item.archived_at is not null or v_item.publication_locked_version is not null then
    raise exception 'visual request base version is stale or locked'; end if;
  -- 0099: the stranded state. She asked for a visual change on the released version, the request
  -- was answered and closed instead of revised, and the piece is still back with The Dot under her
  -- change_requested decision. Nothing newer exists. Only then may a closed visual request reopen.
  v_reopen := v_item.working_version=v_lead.base_version
    and v_item.revision_in_progress and v_item.status='draft' and v_item.review_ready_at is null
    and exists (
      select 1 from public.approvals a
      where a.client_id=v_item.client_id and a.content_id=v_item.id
        and a.content_version=v_lead.base_version and a.state='change_requested'
    )
    and not exists (
      select 1 from public.approvals a
      where a.client_id=v_item.client_id and a.content_id=v_item.id
        and a.content_version=v_lead.base_version and a.state='approved'
    );
  select pg_catalog.count(*) into v_count from public.content_change_requests r
    where r.id=any(v_ids) and r.client_id=v_lead.client_id and r.content_id=v_lead.content_id
      and r.base_version=v_lead.base_version and r.request_type='edit'
      and (r.status in ('pending','conflicted') or (v_reopen and r.status='answered'))
      and r.payload->>'target_kind' in ('asset','design_link');
  if v_count <> pg_catalog.cardinality(v_ids) then raise exception 'visual request set is inconsistent'; end if;
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
  select pg_catalog.count(*) into v_reopened from public.content_change_requests r
    where r.id=any(v_ids) and r.status='answered';
  update public.content_change_requests r set status='applying',canonical_content_id=v_item.id,
    canonical_version=v_version,reconciled_at=pg_catalog.now(),reconciled_by=v_actor.display_name,
    resolution_note=case when r.status='answered'
      then 'Visual revision reopened after the request was closed with a reply; replacement and proof are still required.'
      else 'Visual revision started; replacement and proof are still required.' end,
    updated_at=pg_catalog.now() where r.id=any(v_ids);
  v_response:=pg_catalog.jsonb_build_object('request_ids',v_ids,'content_id',v_item.id,
    'version',v_version,'status','applying','reopened',v_reopened);
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,
    request_fingerprint,response) values(v_item.client_id,'begin_visual_request_revision',
    p_idempotency_key::text,v_fingerprint,v_response);
  return v_response;
end;
$function$;

revoke all on function public.begin_visual_request_revision(uuid[],text,uuid)
  from public, anon, authenticated;
grant execute on function public.begin_visual_request_revision(uuid[],text,uuid) to service_role;

-- 2. A visual request is prepared only when the working version carries a different asset.
create or replace function public.mark_visual_request_revision_prepared(
  p_request_ids uuid[], p_actor_key text, p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
    -- 0099: the replacement must actually be a different file from the one she flagged.
    if v_request.payload->>'target_kind'='asset' and not exists (
      select 1 from public.content_review_assets a
      where a.client_id=v_request.client_id and a.content_item_id=v_request.content_id
        and a.content_version=v_request.canonical_version
        and a.asset_key=v_request.payload->>'asset_key'
        and a.url is distinct from v_request.payload->>'url_snapshot'
    ) then
      raise exception 'visual asset is unchanged: v% still carries the % file she flagged',
        v_request.canonical_version, v_request.payload->>'asset_key';
    end if;
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
$function$;

revoke all on function public.mark_visual_request_revision_prepared(uuid[],text,uuid)
  from public, anon, authenticated;
grant execute on function public.mark_visual_request_revision_prepared(uuid[],text,uuid) to service_role;

-- 3. Applied release: lock refusal first, the unchanged-asset check at release time, a real retry.
create or replace function public.record_agency_applied_release(
  p_content_id uuid,
  p_content_version integer,
  p_reason text,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_fingerprint text;
  v_flagged text;
  v_armed integer;
  v_result jsonb;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;

  select * into v_item from public.content_items ci
   where ci.id = p_content_id
   for update;
  if not found then raise exception 'content item not found'; end if;

  -- 0099: a retry with the same key returns the recorded outcome. The courtesy release writes the
  -- receipt under this key with this fingerprint, so a different payload under the key is refused.
  if p_idempotency_key is not null then
    select * into v_receipt from public.portal_command_receipts r
     where r.client_id = v_item.client_id and r.idempotency_key = p_idempotency_key::text;
    if found then
      v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'content_id', p_content_id, 'content_version', p_content_version,
          'reason', pg_catalog.btrim(p_reason), 'actor', p_actor_key
        )::text, 'UTF8'), 'sha256'), 'hex');
      if v_receipt.command_type <> 'record_content_courtesy_release'
         or v_receipt.request_fingerprint <> v_fingerprint then
        raise exception 'idempotency key reused with a different agency applied release';
      end if;
      return v_receipt.response || pg_catalog.jsonb_build_object(
        'released_version', p_content_version, 'review_armed', false);
    end if;
  end if;

  -- 0099: a published version never moves, and an archived piece is not released.
  if v_item.publication_locked_version is not null then
    raise exception 'publication-locked: v% has a verified live destination; a correction is a new linked version',
      v_item.publication_locked_version;
  end if;
  if v_item.archived_at is not null then
    raise exception 'content item is archived';
  end if;

  -- The version being released must be strictly ahead of what she sees, and must not be work
  -- she has already decided on. Releasing over her own decision is a different operation.
  if p_content_version <= coalesce(v_item.client_visible_version, 0) then
    raise exception 'v% is not ahead of the released version v%',
      p_content_version, coalesce(v_item.client_visible_version, 0);
  end if;
  if exists (
    select 1 from public.approvals a
    where a.client_id = v_item.client_id and a.content_id = v_item.id
      and a.content_version = p_content_version
  ) then
    raise exception 'v% already carries a client decision; this is not an agency release',
      p_content_version;
  end if;

  -- 0099: every visual request this release applies must carry a different file from the one she
  -- flagged. Checked here as well as at prepare, because the asset can be re-attached in between.
  select r.payload->>'asset_key' into v_flagged
    from public.content_change_requests r
   where r.client_id = v_item.client_id and r.canonical_content_id = v_item.id
     and r.canonical_version = p_content_version and r.request_type = 'edit'
     and r.status = 'prepared' and r.payload->>'target_kind' = 'asset'
     and not exists (
       select 1 from public.content_review_assets a
       where a.client_id = r.client_id and a.content_item_id = v_item.id
         and a.content_version = p_content_version and a.asset_key = r.payload->>'asset_key'
         and a.url is distinct from r.payload->>'url_snapshot'
     )
   limit 1;
  if v_flagged is not null then
    raise exception 'visual asset is unchanged: v% still carries the % file she flagged',
      p_content_version, v_flagged;
  end if;

  -- Promote without arming. mark_content_ready keeps every guard it has: the unresolved-request
  -- check from 0081, the release media guard from 0092, the agency_mutations switch and the
  -- prepared-to-applied resolution from 0014, and the release-quality gate from 0007. Only the
  -- review signal is withheld.
  perform pg_catalog.set_config('portal.suppress_review_arm', 'on', true);
  perform public.mark_content_ready(v_item.id, p_content_version);
  perform pg_catalog.set_config('portal.suppress_review_arm', 'off', true);

  -- Fail loudly rather than quietly if the suppression ever stops working, because the whole
  -- point of this function is that it cannot ask Maria to review something twice.
  select pg_catalog.count(*)::integer into v_armed from public.activity_log a
   where a.client_id = v_item.client_id and a.content_id = v_item.id
     and a.content_version = p_content_version and a.event_type = 'needs_review';
  if v_armed > 0 then
    raise exception 'release armed a client review; refusing to complete an agency release';
  end if;

  -- Land it. The courtesy release sets approved, clears review_ready_at, creates the schedule
  -- targets and writes its own audit row, inbox event, projection and receipt.
  v_result := public.record_content_courtesy_release(
    p_content_id, p_content_version, p_reason, p_actor_key, p_idempotency_key);

  return v_result || pg_catalog.jsonb_build_object('released_version', p_content_version,
    'review_armed', false);
end;
$$;

revoke all on function public.record_agency_applied_release(uuid, integer, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_agency_applied_release(uuid, integer, text, text, uuid)
  to service_role;

-- 4. Security assertion, folded into the chain.
create or replace function public.assert_visual_applied_release_security() returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.begin_visual_request_revision(uuid[],text,uuid)'::pg_catalog.regprocedure) into v_def;
  if v_def is null
     or v_def not ilike '%insert into public.content_review_assets%'
     or v_def not ilike '%publication_locked_version is not null%'
     or v_def not ilike '%v_reopen and r.status=''answered''%'
     or v_def not ilike '%a.state=''change_requested''%'
     or v_def not ilike '%copy requests must start the shared revision first%' then
    raise exception 'visual revision reopen guards drifted';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.mark_visual_request_revision_prepared(uuid[],text,uuid)'::pg_catalog.regprocedure) into v_def;
  if v_def is null
     or v_def not ilike '%visual asset replacement has not been recorded%'
     or v_def not ilike '%visual asset is unchanged%' then
    raise exception 'visual prepare guards drifted';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.record_agency_applied_release(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure) into v_def;
  if v_def is null
     or v_def not ilike '%publication-locked%'
     or v_def not ilike '%visual asset is unchanged%'
     or v_def not ilike '%idempotency key reused with a different agency applied release%'
     or v_def not ilike '%suppress_review_arm%'
     or v_def not ilike '%record_content_courtesy_release%' then
    raise exception 'visual applied release guards drifted';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.begin_visual_request_revision(uuid[],text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.begin_visual_request_revision(uuid[],text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.mark_visual_request_revision_prepared(uuid[],text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.mark_visual_request_revision_prepared(uuid[],text,uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.begin_visual_request_revision(uuid[],text,uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.mark_visual_request_revision_prepared(uuid[],text,uuid)', 'EXECUTE') then
    raise exception 'visual revision grants are unsafe';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_visual_applied_release_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_visual_applied_release_security()', 'EXECUTE') then
    raise exception 'visual applied release assertion is exposed';
  end if;
end;
$$;

revoke all on function public.assert_visual_applied_release_security() from public, anon, authenticated;
grant execute on function public.assert_visual_applied_release_security() to service_role;

select public.assert_visual_applied_release_security();

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_pre_ops_feedback_security();
  perform public.assert_agency_ops_feedback_security();
  perform public.assert_agency_media_signal_security();
  perform public.assert_visual_applied_release_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
