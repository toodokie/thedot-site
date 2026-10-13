-- Review previews for YouTube cuts (2026-10-05, approved by Anastasia).
--
-- 0092 capped a preview video at 240 seconds. Maria must be able to watch YouTube cuts of an
-- episode in the portal, and the Ep3 cut runs 4:31, so the cap rises to 1200 seconds (20 minutes)
-- for every preview. The 50 MiB per-file bucket limit stays (the free plan's upload limit); a
-- longer render goes up as a compressed review copy.
--
-- Full podcast episodes stay refused exactly as 0092 refuses them: on a podcast-format piece a
-- video preview needs a teaser, trailer or cut key, and any other key raises 'full podcast
-- episodes are not uploaded as previews'. That rule is untouched; the security assertion now pins
-- the format test and the key pattern as well as the message, and the new cap and the table
-- constraint, so assert_portal_security() fails if either drifts.
--
-- Replaced here: the content_review_previews duration CHECK (dropped and re-added under the same
-- name; the table is small), agency_register_review_preview (0092 body, cap and message only) and
-- assert_review_preview_security (0092 body, pinned strings plus the constraint check).
-- assert_portal_security() reaches the last through the 0092 fold and needs no change.

begin;
set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.content_review_previews') is null
     or pg_catalog.to_regclass('public.portal_feedback_responses') is null
     or pg_catalog.to_regprocedure('public.assert_portal_pre_ops_feedback_security()') is null
     or pg_catalog.to_regprocedure('public.assert_review_preview_security()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0096 requires review previews (0092) and agency ops signals (0095)';
  end if;
end;
$$;

select public.assert_portal_security();

alter table public.content_review_previews
  drop constraint content_review_previews_duration_seconds_check;
alter table public.content_review_previews
  add constraint content_review_previews_duration_seconds_check
  check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 1200));

create or replace function public.agency_register_review_preview(
  p_client_id uuid,
  p_content_id text,
  p_content_version int,
  p_preview_key text,
  p_review_asset_key text,
  p_media_kind text,
  p_object_prefix text,
  p_video_path text,
  p_poster_path text,
  p_frames jsonb,
  p_width_px int,
  p_height_px int,
  p_duration_seconds numeric,
  p_byte_total bigint,
  p_source_sha256 text,
  p_actor_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_key text := pg_catalog.lower(pg_catalog.btrim(p_preview_key));
  v_asset_key text := nullif(pg_catalog.lower(pg_catalog.btrim(p_review_asset_key)), '');
  v_format text;
  v_title text;
  v_prefix text;
  v_path text;
  v_frame jsonb;
  v_existing public.content_review_previews%rowtype;
  v_outcome text := 'registered';
  v_id uuid;
  v_count int;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;

  select * into v_item from public.content_items ci
    where ci.client_id = p_client_id and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content does not belong to client'; end if;
  if v_item.archived_at is not null then raise exception 'archived pieces take no previews'; end if;
  if p_content_version is null or p_content_version not in (
    v_item.working_version, coalesce(v_item.client_visible_version, v_item.working_version)
  ) then
    raise exception 'preview version is not the current working or released version';
  end if;
  select cv.format, cv.title into v_format, v_title
  from public.content_item_versions cv
  where cv.content_item_id = v_item.id and cv.client_id = p_client_id and cv.version = p_content_version;
  if not found then raise exception 'content version not found'; end if;

  if v_key is null or v_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then raise exception 'invalid preview key'; end if;
  if v_asset_key is not null and not exists (
    select 1 from public.content_review_assets a
    where a.client_id = p_client_id and a.content_item_id = v_item.id
      and a.content_version = p_content_version and a.asset_key = v_asset_key
  ) then
    raise exception 'review asset % is not attached to this version', v_asset_key;
  end if;
  if p_media_kind is null or p_media_kind not in ('video','pages') then
    raise exception 'invalid preview media kind';
  end if;
  if p_media_kind = 'video' and v_format = 'podcast'
     and not (v_key = 'social-teaser' or v_key ~ '^(teaser|trailer|cut)([_-][a-z0-9_-]*)?$') then
    raise exception 'full podcast episodes are not uploaded as previews; upload the teaser or a cut';
  end if;
  if p_media_kind = 'video' and (
    p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 1200
  ) then
    raise exception 'preview video must be longer than 0 and at most 1200 seconds; full episodes are never uploaded';
  end if;
  if p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid source checksum';
  end if;

  v_prefix := p_client_id::text || '/' || v_item.id::text || '/v' || p_content_version::text
    || '/' || v_key || '/' || pg_catalog.left(p_source_sha256, 16) || '/';
  if p_object_prefix is distinct from v_prefix then
    raise exception 'object prefix does not match this preview';
  end if;
  if p_media_kind = 'video' and (p_video_path is null or p_poster_path is null) then
    raise exception 'a video preview needs a video and a poster';
  end if;
  if p_media_kind = 'pages' and (
    p_video_path is not null or p_poster_path is not null or p_duration_seconds is not null
  ) then
    raise exception 'a page preview has no video, poster or duration';
  end if;
  foreach v_path in array pg_catalog.array_remove(array[p_video_path, p_poster_path], null) loop
    if not public.portal_review_preview_path_valid(v_path, v_prefix) then
      raise exception 'invalid preview object path';
    end if;
  end loop;
  if p_frames is null or pg_catalog.jsonb_typeof(p_frames) <> 'array'
     or pg_catalog.jsonb_array_length(p_frames) > 40 then
    raise exception 'invalid preview frames';
  end if;
  if p_media_kind = 'pages' and pg_catalog.jsonb_array_length(p_frames) = 0 then
    raise exception 'a page preview needs at least one page';
  end if;
  for v_frame in select f.value from pg_catalog.jsonb_array_elements(p_frames) f loop
    if pg_catalog.jsonb_typeof(v_frame) <> 'object'
       or not public.portal_review_preview_path_valid(v_frame->>'path', v_prefix)
       or (v_frame->>'label') is null
       or pg_catalog.char_length(v_frame->>'label') not between 1 and 80
       or (v_frame->>'label') ~ '[[:cntrl:]]' then
      raise exception 'invalid preview frame';
    end if;
  end loop;
  if p_width_px is null or p_height_px is null
     or p_width_px not between 100 and 10000 or p_height_px not between 100 and 10000 then
    raise exception 'invalid preview dimensions';
  end if;
  if p_byte_total is null or p_byte_total not between 1 and 138412032 then
    raise exception 'preview exceeds the size limit';
  end if;

  select * into v_existing from public.content_review_previews p
    where p.client_id = p_client_id and p.content_item_id = v_item.id
      and p.content_version = p_content_version and p.preview_key = v_key
    for update;
  if found then
    if v_existing.source_sha256 = p_source_sha256 then
      return pg_catalog.jsonb_build_object(
        'preview_id', v_existing.id, 'outcome', 'unchanged', 'object_prefix', v_existing.object_prefix);
    end if;
    perform pg_catalog.set_config('portal.review_preview_removal_reason', 'replaced', true);
    delete from public.content_review_previews where id = v_existing.id;
    perform pg_catalog.set_config('portal.review_preview_removal_reason', '', true);
    v_outcome := 'replaced';
  end if;

  insert into public.content_review_previews (
    client_id, content_item_id, content_version, preview_key, review_asset_key, media_kind,
    object_prefix, video_path, poster_path, frames, width_px, height_px, duration_seconds,
    byte_total, source_sha256
  ) values (
    p_client_id, v_item.id, p_content_version, v_key, v_asset_key, p_media_kind,
    v_prefix, p_video_path, p_poster_path, p_frames, p_width_px, p_height_px, p_duration_seconds,
    p_byte_total, p_source_sha256
  ) returning id into v_id;

  v_count := pg_catalog.jsonb_array_length(p_frames);
  insert into public.activity_log (client_id, content_id, content_version, event_type,
    title, summary, actor_type, actor_name, event_key)
  values (p_client_id, v_item.id, p_content_version, 'review_preview_uploaded',
    'Preview uploaded: ' || coalesce(v_title, v_item.content_id),
    case when v_outcome = 'replaced' then 'Replaced the previous preview. ' else '' end
      || case when p_media_kind = 'video'
           then pg_catalog.format('Video preview for version %s with %s frames.', p_content_version, v_count)
           else pg_catalog.format('Page preview for version %s with %s pages.', p_content_version, v_count)
         end,
    'anastasia', v_actor.display_name, 'review-preview-upload:' || v_id::text);

  return pg_catalog.jsonb_build_object('preview_id', v_id, 'outcome', v_outcome, 'object_prefix', v_prefix);
end;
$$;
revoke all on function public.agency_register_review_preview(
  uuid,text,integer,text,text,text,text,text,text,jsonb,integer,integer,numeric,bigint,text,text
) from public, anon, authenticated;
grant execute on function public.agency_register_review_preview(
  uuid,text,integer,text,text,text,text,text,text,jsonb,integer,integer,numeric,bigint,text,text
) to service_role;

create or replace function public.assert_review_preview_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fn text;
  v_def text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.content_review_previews'::pg_catalog.regclass) then
    raise exception 'content_review_previews RLS is disabled';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.content_review_preview_removals'::pg_catalog.regclass) then
    raise exception 'content_review_preview_removals RLS is disabled';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'content_review_previews') <> 1
     or not exists (
       select 1 from pg_catalog.pg_policies p
       where p.schemaname = 'public' and p.tablename = 'content_review_previews'
         and p.policyname = 'content_review_previews_client_read'
         and p.cmd = 'SELECT' and p.roles = array['authenticated']::name[]) then
    raise exception 'content_review_previews must carry exactly the client read policy';
  end if;
  if exists (select 1 from pg_catalog.pg_policies p
             where p.schemaname = 'public' and p.tablename = 'content_review_preview_removals') then
    raise exception 'content_review_preview_removals is agency-only and takes no policies';
  end if;

  if pg_catalog.has_any_column_privilege('anon', 'public.content_review_previews', 'SELECT')
     or not pg_catalog.has_any_column_privilege('authenticated', 'public.content_review_previews', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_previews', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_previews', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_previews', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.content_review_previews', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_previews', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_previews', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_previews', 'DELETE')
     or pg_catalog.has_any_column_privilege('anon', 'public.content_review_preview_removals', 'SELECT')
     or pg_catalog.has_any_column_privilege('authenticated', 'public.content_review_preview_removals', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.content_review_preview_removals', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_preview_removals', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_preview_removals', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_preview_removals', 'DELETE') then
    raise exception 'review preview table privileges are unsafe';
  end if;

  if pg_catalog.to_regclass('storage.buckets') is not null then
    if not exists (
      select 1 from storage.buckets b
      where b.id = 'portal-review-previews' and b.public = false
        and b.file_size_limit = 52428800
        and b.allowed_mime_types = array['video/mp4','image/jpeg','image/png','image/webp']::text[]
    ) then
      raise exception 'review preview bucket is missing, public, or misconfigured';
    end if;
    if exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.roles && array['public','anon','authenticated']::name[]
    ) then
      raise exception 'an authenticated storage policy could expose review previews';
    end if;
  end if;

  foreach v_fn in array array[
    'public.agency_register_review_preview(uuid,text,integer,text,text,text,text,text,text,jsonb,integer,integer,numeric,bigint,text,text)',
    'public.agency_retire_review_previews(timestamptz,uuid)',
    'public.agency_pending_review_preview_removals(integer)',
    'public.agency_complete_review_preview_removal(uuid,text)'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid = v_fn::pg_catalog.regprocedure and p.prosecdef
        and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
    ) then
      raise exception 'review preview function is not a hardened security definer: %', v_fn;
    end if;
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'review preview function grants are unsafe: %', v_fn;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(
    'public.agency_register_review_preview(uuid,text,integer,text,text,text,text,text,text,jsonb,integer,integer,numeric,bigint,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  -- The podcast refusal keeps full episodes out of storage: on a podcast-format piece only a
  -- teaser, trailer or cut key is accepted. The 1200-second cap (0096) bounds a cut.
  if v_def not ilike '%full podcast episodes are not uploaded%'
     or v_def not ilike '%v_format = ''podcast''%'
     or v_def not ilike '%(teaser|trailer|cut)([_-][a-z0-9_-]*)?$%'
     or v_def not ilike '%p_duration_seconds > 1200%'
     or v_def not ilike '%client_visible_version%'
     or v_def not ilike '%review_preview_uploaded%' then
    raise exception 'review preview registration guards drifted';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.content_review_previews'::pg_catalog.regclass
      and c.conname = 'content_review_previews_duration_seconds_check' and c.contype = 'c'
      and c.convalidated
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%duration_seconds <= (1200)::numeric%'
  ) then
    raise exception 'review preview duration constraint drifted';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_review_previews'::pg_catalog.regclass
      and t.tgname = 'content_review_previews_queue_removal' and not t.tgisinternal
  ) then
    raise exception 'review preview removal trigger is missing';
  end if;
  if (select pg_catalog.count(*) from public.activity_event_types t
      where t.event_type in ('review_preview_uploaded','review_preview_deleted')) <> 2 then
    raise exception 'review preview activity event types are missing';
  end if;
  -- Housekeeping must stay out of every notification path (amended 2026-10-03).
  if (select pg_catalog.count(*) from public.activity_event_types t
      where t.event_type in ('review_preview_uploaded','review_preview_deleted') and t.agency_internal) <> 2
     or pg_catalog.pg_get_functiondef('public.portal_activity_notify()'::pg_catalog.regprocedure)
          not ilike '%t.agency_internal%' then
    raise exception 'review preview housekeeping would notify';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_review_preview_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_review_preview_security()', 'EXECUTE') then
    raise exception 'review preview assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_review_preview_security() from public, anon, authenticated;
grant execute on function public.assert_review_preview_security() to service_role;

select public.assert_review_preview_security();
select public.assert_portal_security();

commit;
