-- A Kanset Talks episode is four pieces (Anastasia, 2026-10-06), and the agency can take review
-- media back off a working version.
--
-- 1. Podcast readiness. Every episode is now four separate pieces: the YouTube episode (format
--    'podcast'), an Instagram and Facebook trailer (format 'reel'), a LinkedIn post and a website
--    article. The 0073 final-package rule still bundled Instagram and Facebook into the episode, so
--    a YouTube-only episode could never be approved. The rule now requires, for a format 'podcast'
--    version: the youtube-title, youtube-description and youtube-tags blocks and a youtube-cover
--    asset. The Instagram and Facebook parts (social-caption or ig-facebook-caption, social-cover and
--    a social-teaser with verified burned-in captions) are required only when that version's own
--    platforms list Instagram or Facebook, which keeps older combined pieces honest. Platform names
--    are compared trimmed and lower-cased. The app mirrors this exactly in
--    src/lib/portal/podcast-review.ts (podcastCarriesSocial, reviewPackageReadiness).
--
--    Changed: portal_core_review_flow_record_content_decision, the 0073 body (renamed in 0081 and
--    not redefined since), with only the podcast branch and the platforms read changed. The 0081
--    wrapper record_content_decision is untouched, so the 0073 assertion over it still holds.
--
-- 2. Agency removal of review media. agency_remove_review_assets removes named review assets, and
--    named portal previews, from the current UNRELEASED working version only. It refuses a
--    publication-locked piece, a version with a client decision or courtesy release, a version the
--    client has seen (at or below the released pointer) and any version other than the working one.
--    It also deletes the content_review_previews rows that preview a removed asset or that are named
--    directly, which queues their Storage objects through the 0092 removal queue under the new reason
--    'removed'. It refuses to leave the version with no media at all (no review asset, no preview,
--    no design link and no no-media override), so the 0092 release media guard still passes for the
--    release that follows. Each removed asset is snapshotted into content_review_asset_events. The
--    audit row is 'review_asset_removed', flagged agency_internal: recorded, readable through
--    agency_internal_activity, never notified. A repeat with nothing left to remove returns
--    'unchanged' and writes nothing.
--
--    Changed for the queue: the content_review_preview_removals reason CHECK (dropped and re-added
--    under the same name), portal_review_preview_queue_removal and
--    agency_complete_review_preview_removal, both on their 0092 bodies (not redefined since) with
--    only the new reason added.
--
-- Not touched here: set_content_review_asset and the option picks (0098), and
-- record_agency_applied_release and the visual revision functions (0099). Removing an asset that
-- 0098 lets a seat pick cascades the pick away through 0098's own foreign key.

begin;
set local lock_timeout = '5s';

do $$
begin
  -- 0097 is the prerequisite: its digest excerpt helper is the newest object it creates.
  if not exists (
       select 1 from pg_catalog.pg_proc p
       where p.pronamespace = 'public'::pg_catalog.regnamespace
         and p.proname = 'portal_agency_digest_excerpt')
     or pg_catalog.to_regprocedure('public.portal_core_review_flow_record_content_decision(uuid,integer,text,text)') is null
     or pg_catalog.to_regprocedure('public.agency_release_media_status(uuid,integer)') is null
     or pg_catalog.to_regprocedure('public.agency_complete_review_preview_removal(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.portal_review_preview_queue_removal()') is null
     or pg_catalog.to_regprocedure('public.agency_internal_activity(uuid,uuid)') is null
     or pg_catalog.to_regclass('public.content_review_previews') is null
     or pg_catalog.to_regclass('public.content_review_preview_removals') is null
     or pg_catalog.to_regclass('public.content_courtesy_releases') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0100 requires migrations through 0097 (review media 0092, digest edit detail 0097)';
  end if;
end;
$$;

select public.assert_portal_security();

-- ---------------------------------------------------------------------------------------------
-- 1. YouTube-only podcast readiness.
create or replace function public.portal_core_review_flow_record_content_decision(
  p_content_id uuid,
  p_content_version int,
  p_decision text,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_is_visible boolean;
  v_has_design boolean;
  v_format text;
  v_blocks jsonb;
  v_platforms text[];
  v_social boolean := false;
  v_pack_ready boolean := true;
begin
  select ci.client_id,
    (ci.client_visible and ci.client_visible_version is not distinct from p_content_version),
    cv.format,
    cv.copy_blocks,
    cv.platforms,
    (
      exists (
        select 1
        from public.content_item_versions cv2
        left join public.content_design_links dl
          on dl.content_item_id = ci.id and dl.client_id = ci.client_id
        where cv2.content_item_id = ci.id
          and cv2.client_id = ci.client_id
          and cv2.version = p_content_version
          and (
            dl.canva_url is not null or dl.drive_url is not null
            or cv2.canva_url is not null or cv2.drive_url is not null
          )
      )
      or exists (
        select 1 from public.content_review_assets a
        where a.client_id = ci.client_id
          and a.content_item_id = ci.id
          and a.content_version = p_content_version
      )
    )
  into v_client_id, v_is_visible, v_format, v_blocks, v_platforms, v_has_design
  from public.content_items ci
  left join public.content_item_versions cv
    on cv.content_item_id = ci.id
   and cv.client_id = ci.client_id
   and cv.version = p_content_version
  where ci.id = p_content_id
  for update of ci;

  if v_client_id is null then
    raise exception 'portal_action_not_allowed' using errcode='42501';
  end if;
  perform public.portal_require_client_action(v_client_id,'can_decide');
  if not coalesce(v_is_visible,false) then
    return public.portal_core_record_content_decision(
      p_content_id,p_content_version,p_decision,p_note
    );
  end if;

  if v_format = 'podcast' then
    -- 0100: the episode piece is YouTube-only. Instagram and Facebook parts are required only
    -- when this version itself lists Instagram or Facebook (older combined pieces).
    v_social := exists (
      select 1 from pg_catalog.unnest(coalesce(v_platforms, '{}'::text[])) p(name)
      where pg_catalog.lower(pg_catalog.btrim(p.name)) in ('instagram','facebook')
    );
    v_pack_ready :=
      exists (
        select 1 from pg_catalog.jsonb_array_elements(v_blocks) b
        where b->>'key' = 'youtube-title'
      )
      and exists (
        select 1 from pg_catalog.jsonb_array_elements(v_blocks) b
        where b->>'key' = 'youtube-description'
      )
      and exists (
        select 1 from pg_catalog.jsonb_array_elements(v_blocks) b
        where b->>'key' = 'youtube-tags'
      )
      and exists (
        select 1 from public.content_review_assets a
        where a.client_id = v_client_id and a.content_item_id = p_content_id
          and a.content_version = p_content_version and a.asset_key = 'youtube-cover'
          and a.channel = 'youtube' and a.asset_kind = 'cover'
      );
    if v_social then
      v_pack_ready := v_pack_ready
        and exists (
          select 1 from pg_catalog.jsonb_array_elements(v_blocks) b
          where b->>'key' in ('social-caption','ig-facebook-caption')
        )
        and exists (
          select 1 from public.content_review_assets a
          where a.client_id = v_client_id and a.content_item_id = p_content_id
            and a.content_version = p_content_version and a.asset_key = 'social-cover'
            and a.channel = 'social' and a.asset_kind = 'cover'
        )
        and exists (
          select 1 from public.content_review_assets a
          where a.client_id = v_client_id and a.content_item_id = p_content_id
            and a.content_version = p_content_version and a.asset_key = 'social-teaser'
            and a.channel = 'social' and a.asset_kind = 'video'
            and a.caption_status = 'burned_in_verified'
        );
    end if;
  elsif v_format = 'podcast_article' then
    v_pack_ready :=
      exists (
        select 1 from pg_catalog.jsonb_array_elements(v_blocks) b
        where b->>'key' = 'article-body'
      )
      and exists (
        select 1 from public.content_review_assets a
        where a.client_id = v_client_id and a.content_item_id = p_content_id
          and a.content_version = p_content_version and a.asset_key = 'website-cover'
          and a.channel = 'website' and a.asset_kind = 'cover'
      );
  end if;

  if not coalesce(v_pack_ready,false) then
    raise exception 'final_package_incomplete' using errcode='23514',
      detail='The podcast review pack is missing required copy, assets, or verified burned-in captions.';
  end if;
  if not coalesce(v_has_design,false) then
    raise exception 'final_package_design_required' using errcode='23514',
      detail='Use the plan review and comments surface until a linked design is ready.';
  end if;
  return public.portal_core_record_content_decision(
    p_content_id,p_content_version,p_decision,p_note
  );
end;
$$;
revoke all on function public.portal_core_review_flow_record_content_decision(uuid,integer,text,text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. The removal queue learns the reason 'removed'.
insert into public.activity_event_types (event_type)
values ('review_asset_removed')
on conflict (event_type) do nothing;
update public.activity_event_types set agency_internal = true
  where event_type = 'review_asset_removed';

alter table public.content_review_preview_removals
  drop constraint content_review_preview_removals_reason_check;
alter table public.content_review_preview_removals
  add constraint content_review_preview_removals_reason_check check (reason in (
    'live_everywhere','planned_date_past','superseded','archived','replaced','cascade','removed'
  ));

create or replace function public.portal_review_preview_queue_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := coalesce(
    nullif(pg_catalog.current_setting('portal.review_preview_removal_reason', true), ''),
    'cascade'
  );
  v_paths text[];
begin
  if v_reason not in ('live_everywhere','planned_date_past','superseded','archived','replaced','cascade','removed') then
    v_reason := 'cascade';
  end if;
  select pg_catalog.array_remove(array[old.video_path, old.poster_path], null)
      || coalesce(pg_catalog.array_agg(f.value->>'path' order by f.ordinality), array[]::text[])
    into v_paths
  from pg_catalog.jsonb_array_elements(old.frames) with ordinality as f(value, ordinality);
  if pg_catalog.cardinality(v_paths) > 0 then
    insert into public.content_review_preview_removals (
      client_id, content_item_id, content_version, preview_key, preview_id, object_paths, reason
    ) values (
      old.client_id, old.content_item_id, old.content_version, old.preview_key, old.id, v_paths, v_reason
    );
  end if;
  return old;
end;
$$;
revoke all on function public.portal_review_preview_queue_removal()
  from public, anon, authenticated, service_role;

create or replace function public.agency_complete_review_preview_removal(
  p_removal_id uuid,
  p_error text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.content_review_preview_removals%rowtype;
  v_title text;
  v_summary text;
begin
  select * into v_row from public.content_review_preview_removals where id = p_removal_id for update;
  if not found then raise exception 'preview removal not found'; end if;
  if v_row.completed_at is not null then
    return pg_catalog.jsonb_build_object('removal_id', v_row.id, 'outcome', 'already_completed');
  end if;
  if p_error is not null then
    update public.content_review_preview_removals
      set attempts = attempts + 1, last_error = pg_catalog.left(p_error, 500)
      where id = v_row.id;
    return pg_catalog.jsonb_build_object('removal_id', v_row.id, 'outcome', 'failed');
  end if;

  update public.content_review_preview_removals
    set attempts = attempts + 1, last_error = null, completed_at = pg_catalog.now()
    where id = v_row.id;

  if exists (select 1 from public.clients c where c.id = v_row.client_id) then
    select cv.title into v_title from public.content_item_versions cv
      where cv.content_item_id = v_row.content_item_id and cv.client_id = v_row.client_id
        and cv.version = v_row.content_version;
    v_summary := case v_row.reason
      when 'live_everywhere' then 'Live on every destination, so the portal copy was deleted. Drive keeps the master.'
      when 'planned_date_past' then 'The planned date is more than 7 days past, so the portal copy was deleted. Drive keeps the master.'
      when 'superseded' then 'A newer version replaced this one, so its portal copy was deleted.'
      when 'archived' then 'The piece was archived, so its portal copy was deleted.'
      when 'replaced' then 'A new preview replaced this one.'
      when 'removed' then 'The agency removed this preview from the version, so its portal copy was deleted. Drive keeps the master.'
      else 'The version was removed, so its portal copy was deleted.'
    end;
    insert into public.activity_log (client_id, content_id, content_version, event_type,
      title, summary, actor_type, actor_name, event_key)
    values (v_row.client_id, v_row.content_item_id, v_row.content_version, 'review_preview_deleted',
      'Preview removed: ' || coalesce(v_title, v_row.preview_key), v_summary,
      'agent', 'Preview retention', 'review-preview-removed:' || v_row.id::text)
    on conflict do nothing;
  end if;
  return pg_catalog.jsonb_build_object('removal_id', v_row.id, 'outcome', 'completed');
end;
$$;
revoke all on function public.agency_complete_review_preview_removal(uuid, text)
  from public, anon, authenticated;
grant execute on function public.agency_complete_review_preview_removal(uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Agency removal of review assets and previews from an unreleased working version.
create function public.agency_remove_review_assets(
  p_client_id uuid,
  p_content_id text,
  p_content_version int,
  p_asset_keys text[],
  p_preview_keys text[],
  p_reason text,
  p_actor_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_asset_keys text[];
  v_preview_keys text[];
  v_key text;
  v_title text;
  v_removed_assets text[];
  v_removed_previews text[];
  v_absent text[];
  v_status jsonb;
begin
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if v_reason is null or pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500
     or v_reason ~ '[[:cntrl:]]' then
    raise exception 'a removal reason of 10 to 500 characters, on one line, is required';
  end if;

  v_asset_keys := array(
    select distinct pg_catalog.lower(pg_catalog.btrim(k))
    from pg_catalog.unnest(coalesce(p_asset_keys, '{}'::text[])) k
    order by 1);
  v_preview_keys := array(
    select distinct pg_catalog.lower(pg_catalog.btrim(k))
    from pg_catalog.unnest(coalesce(p_preview_keys, '{}'::text[])) k
    order by 1);
  if pg_catalog.cardinality(v_asset_keys) + pg_catalog.cardinality(v_preview_keys) = 0 then
    raise exception 'name at least one review asset or preview key to remove';
  end if;
  if pg_catalog.cardinality(v_asset_keys) > 40 or pg_catalog.cardinality(v_preview_keys) > 40 then
    raise exception 'at most 40 asset keys and 40 preview keys per removal';
  end if;
  foreach v_key in array v_asset_keys || v_preview_keys loop
    if v_key is null or v_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
      raise exception 'invalid review asset or preview key';
    end if;
  end loop;

  select * into v_item from public.content_items ci
    where ci.client_id = p_client_id and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content does not belong to client'; end if;
  if v_item.archived_at is not null then raise exception 'archived pieces are not edited'; end if;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_item.id and cv.client_id = p_client_id and cv.version = p_content_version;
  if not found then raise exception 'content version not found'; end if;

  -- Order matters only for the message: the strongest reason to refuse is named first.
  if v_item.publication_locked_version is not null then
    raise exception 'review_asset_removal_refused: % is publication-locked (live since v%); a shipped piece is never edited',
      v_item.content_id, v_item.publication_locked_version;
  end if;
  if exists (
       select 1 from public.approvals a
       where a.client_id = p_client_id and a.content_id = v_item.id and a.content_version = p_content_version)
     or exists (
       select 1 from public.content_courtesy_releases r
       where r.client_id = p_client_id and r.content_id = v_item.id and r.content_version = p_content_version) then
    raise exception 'review_asset_removal_refused: v% carries a decision; its review media is part of the record',
      p_content_version;
  end if;
  if p_content_version <= coalesce(v_item.client_visible_version, 0) then
    raise exception 'review_asset_removal_refused: the client has seen v%; open a new revision and remove the media there',
      p_content_version;
  end if;
  if p_content_version is distinct from v_item.working_version then
    raise exception 'review_asset_removal_refused: v% is not the current working version v%',
      p_content_version, v_item.working_version;
  end if;

  -- Previews first: a removed asset would otherwise leave its preview behind with a null key.
  perform pg_catalog.set_config('portal.review_preview_removal_reason', 'removed', true);
  with gone as (
    delete from public.content_review_previews p
    where p.client_id = p_client_id and p.content_item_id = v_item.id
      and p.content_version = p_content_version
      and (p.preview_key = any(v_preview_keys) or p.review_asset_key = any(v_asset_keys))
    returning p.preview_key
  )
  select coalesce(pg_catalog.array_agg(g.preview_key order by g.preview_key), '{}'::text[])
    into v_removed_previews from gone g;
  perform pg_catalog.set_config('portal.review_preview_removal_reason', '', true);

  insert into public.content_review_asset_events (
    client_id, content_item_id, content_version, asset_key, asset_snapshot, actor_key, idempotency_key)
  select a.client_id, a.content_item_id, a.content_version, a.asset_key,
    pg_catalog.to_jsonb(a) || pg_catalog.jsonb_build_object('removed', true, 'removal_reason', v_reason),
    v_actor.actor_key, 'review-asset-removed:' || a.id::text
  from public.content_review_assets a
  where a.client_id = p_client_id and a.content_item_id = v_item.id
    and a.content_version = p_content_version and a.asset_key = any(v_asset_keys)
  on conflict (client_id, idempotency_key) do nothing;

  with gone as (
    delete from public.content_review_assets a
    where a.client_id = p_client_id and a.content_item_id = v_item.id
      and a.content_version = p_content_version and a.asset_key = any(v_asset_keys)
    returning a.asset_key
  )
  select coalesce(pg_catalog.array_agg(g.asset_key order by g.asset_key), '{}'::text[])
    into v_removed_assets from gone g;

  v_absent := array(
    select k from pg_catalog.unnest(v_asset_keys) k where not (k = any(v_removed_assets))
    union
    select k from pg_catalog.unnest(v_preview_keys) k where not (k = any(v_removed_previews))
    order by 1);

  if pg_catalog.cardinality(v_removed_assets) + pg_catalog.cardinality(v_removed_previews) = 0 then
    return pg_catalog.jsonb_build_object('outcome', 'unchanged', 'content_version', p_content_version,
      'removed_assets', '[]'::jsonb, 'removed_previews', '[]'::jsonb, 'absent', pg_catalog.to_jsonb(v_absent));
  end if;

  -- The release that follows must still pass the 0092 release media guard.
  v_status := public.agency_release_media_status(v_item.id, p_content_version);
  if coalesce((v_status->>'review_assets')::int, 0) = 0
     and coalesce((v_status->>'previews')::int, 0) = 0
     and not coalesce((v_status->>'design_link')::boolean, false)
     and (v_status->>'override_reason') is null then
    raise exception 'review_asset_removal_leaves_no_media: v% would have no review asset, preview or design link left; keep at least one',
      p_content_version using errcode = '23514';
  end if;

  insert into public.activity_log (client_id, content_id, content_version, event_type,
    title, summary, actor_type, actor_name, event_key)
  values (p_client_id, v_item.id, p_content_version, 'review_asset_removed',
    'Review media removed: ' || coalesce(v_title, v_item.content_id),
    pg_catalog.left(pg_catalog.format('Removed from v%s: %s. %s', p_content_version,
      pg_catalog.array_to_string(
        array(select 'asset ' || k from pg_catalog.unnest(v_removed_assets) k
              union all select 'preview ' || k from pg_catalog.unnest(v_removed_previews) k), ', '),
      v_reason), 2000),
    'anastasia', v_actor.display_name,
    'review-asset-removed:' || v_item.id::text || ':v' || p_content_version::text || ':' || gen_random_uuid()::text);

  return pg_catalog.jsonb_build_object('outcome', 'removed', 'content_version', p_content_version,
    'removed_assets', pg_catalog.to_jsonb(v_removed_assets),
    'removed_previews', pg_catalog.to_jsonb(v_removed_previews),
    'absent', pg_catalog.to_jsonb(v_absent),
    'media', v_status);
end;
$$;
revoke all on function public.agency_remove_review_assets(uuid,text,integer,text[],text[],text,text)
  from public, anon, authenticated;
grant execute on function public.agency_remove_review_assets(uuid,text,integer,text[],text[],text,text)
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Assertion, folded into assert_portal_security() with the 0081/0094/0095 rename pattern.
create function public.assert_podcast_split_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
  v_fn text := 'public.agency_remove_review_assets(uuid,text,integer,text[],text[],text,text)';
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_core_review_flow_record_content_decision(uuid,integer,text,text)'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null
     or v_def not like '%youtube-title%' or v_def not like '%youtube-description%'
     or v_def not like '%youtube-tags%' or v_def not like '%''youtube-cover''%'
     or v_def not like '%v_social%' or v_def not like '%''instagram'',''facebook''%'
     or v_def not like '%social-teaser%' or v_def not like '%burned_in_verified%'
     or v_def not like '%final_package_incomplete%'
     or v_def not like '%portal_require_client_action%' then
    raise exception 'podcast final-package rule drifted from the YouTube-only episode rule';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.portal_core_review_flow_record_content_decision(uuid,integer,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.portal_core_review_flow_record_content_decision(uuid,integer,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.portal_core_review_flow_record_content_decision(uuid,integer,text,text)', 'EXECUTE') then
    raise exception 'the wrapped decision core became directly callable';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = v_fn::pg_catalog.regprocedure and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'agency_remove_review_assets is not a hardened security definer';
  end if;
  if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception 'agency_remove_review_assets grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(v_fn::pg_catalog.regprocedure) into v_def;
  if v_def not like '%publication_locked_version is not null%'
     or v_def not like '%public.approvals%' or v_def not like '%public.content_courtesy_releases%'
     or v_def not like '%client_visible_version, 0)%'
     or v_def not like '%working_version%'
     or v_def not like '%review_asset_removal_leaves_no_media%'
     or v_def not like '%''removed''%'
     or v_def not like '%review_asset_removed%' then
    raise exception 'review asset removal guards drifted';
  end if;
  if not exists (select 1 from public.activity_event_types t
                 where t.event_type = 'review_asset_removed' and t.agency_internal) then
    raise exception 'review asset removal would notify';
  end if;
  if pg_catalog.pg_get_functiondef('public.portal_review_preview_queue_removal()'::pg_catalog.regprocedure)
       not like '%''removed''%'
     or pg_catalog.pg_get_constraintdef((
          select c.oid from pg_catalog.pg_constraint c
          where c.conrelid = 'public.content_review_preview_removals'::pg_catalog.regclass
            and c.conname = 'content_review_preview_removals_reason_check')) not like '%removed%' then
    raise exception 'the preview removal queue does not accept the removed reason';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_podcast_split_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_podcast_split_security()', 'EXECUTE') then
    raise exception 'podcast split assertion exposed';
  end if;
end;
$$;
revoke all on function public.assert_podcast_split_security() from public, anon, authenticated;
grant execute on function public.assert_podcast_split_security() to service_role;

select public.assert_podcast_split_security();

alter function public.assert_portal_security() rename to assert_portal_pre_podcast_split_security;
revoke all on function public.assert_portal_pre_podcast_split_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_podcast_split_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_pre_podcast_split_security();
  perform public.assert_podcast_split_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
