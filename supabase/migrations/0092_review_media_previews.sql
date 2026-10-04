-- Portal-hosted review previews (piece page redesign, spec 2026-10-03 section 7).
--
-- Maria cannot see what she approves. Videos, carousels and PDFs are buttons that open Drive, and
-- Drive video playback has failed for her since about 2026-09-07. On 2026-10-02 she approved a
-- reel's copy without seeing its on-screen text. The fix is to play the final render inside the
-- portal.
--
-- Drive stays the master and the delivery copy. A preview is a temporary second copy of the same
-- local render, uploaded by the agency for one exact content version, read through short-lived
-- signed links and deleted again once the piece is live everywhere or its planned date is more
-- than 7 days past. Anastasia still supplies every Drive link; nothing here creates or changes one.
--
-- Security model, the same fail-closed shape 0009 uses for publication evidence:
--   * The bucket is private and storage.objects gets NO policy for anon or authenticated. The
--     cumulative assertion already refuses any such policy, because policies are OR-combined and
--     one broad policy would expose every private bucket.
--   * Access is decided on the metadata row instead. content_review_previews has RLS: a client
--     seat reads only its own tenant's rows, only for the released version of a visible,
--     unarchived piece. The server reads the row with the seat's own JWT and only then signs the
--     object paths with the service role.
--   * All writes are SECURITY DEFINER RPCs callable by service_role only.
--
-- Full podcast episodes are never uploaded (spec 7): videos are capped at 240 seconds and a
-- podcast-format piece accepts only a teaser, trailer or cut key.
--
-- Deleting a preview row (retention, replacement, or a cascade from a removed version) queues its
-- object paths in content_review_preview_removals. Postgres cannot delete Storage objects itself,
-- so the app drains the queue through the Storage API and completes each removal, which writes the
-- 'review_preview_deleted' activity row. Uploads write 'review_preview_uploaded'. Both are agency
-- housekeeping: excluded from the client feed in src/lib/portal/data.ts, and flagged
-- agency_internal so portal_activity_notify queues no in-app row or email for anyone.

begin;
set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.content_review_assets') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regclass('public.content_publication_targets') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_slice89_security()') is null
     or pg_catalog.to_regprocedure('public.assert_archive_unreleased_draft_security()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0092 requires review assets (0073), publication targets (0009) and the 0090 security fold';
  end if;
end;
$$;

select public.assert_portal_security();

-- activity_log.event_type has a foreign key to activity_event_types (0008); without these rows the
-- first upload would roll back (the lesson 0084 and 0090 record).
insert into public.activity_event_types (event_type)
values ('review_preview_uploaded'), ('review_preview_deleted')
on conflict (event_type) do nothing;

-- Agency housekeeping raises no notification (cross-review 2026-10-03). Every activity row runs
-- portal_activity_notify (latest body 0078), and portal_notification_recipient() (0015) sends every
-- non-client actor ('anastasia', 'agent') to the client: an in_app outbox row addressed to Maria
-- that she never sees but scripts/portal-notification-audit.ts counts. No actor_type avoids it
-- ('client' instead emails the agency), so the routing is per event type: activity_event_types
-- gains agency_internal, and the trigger returns before enqueueing anything for a flagged type.
-- The activity row itself is still written, so the audit trail is unchanged. This block is
-- identical in 0092 and 0093 and safe to run twice, so either plan may land first.
alter table public.activity_event_types
  add column if not exists agency_internal boolean not null default false;

-- 0078's body, verbatim, plus the agency_internal early return.
create or replace function public.portal_activity_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text;
  v_block_key text;
  v_target_label text;
begin
  if new.event_type in ('comment_added','agency_comment_added','idea_comment_added','agency_idea_comment_added') then
    return new;
  end if;
  -- Agency housekeeping: the activity row is the record; no in-app row and no email for anyone.
  if exists (select 1 from public.activity_event_types t
             where t.event_type = new.event_type and t.agency_internal) then
    return new;
  end if;
  v_recipient := public.portal_notification_recipient(new.actor_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'activity', new.id,
    new.title, coalesce(new.summary,''), new.related_url);

  if v_recipient = 'agency' and new.event_type = 'edit_requested' and new.content_id is not null then
    select r.payload->>'block_key' into v_block_key
    from public.content_change_requests r
    where r.client_id = new.client_id
      and 'content-request:' || r.id::text = new.event_key;
    select e.value->>'label' into v_target_label
    from public.content_item_versions cv
    cross join lateral pg_catalog.jsonb_array_elements(cv.copy_blocks) e(value)
    where cv.content_item_id = new.content_id
      and cv.client_id = new.client_id
      and cv.version = new.content_version
      and e.value->>'key' = v_block_key;
    perform public.portal_enqueue_agency_piece_digest(
      new.client_id, new.content_id, 'activity', new.id, new.actor_name, 'edit',
      coalesce(v_target_label, pg_catalog.initcap(pg_catalog.replace(v_block_key, '-', ' ')), 'Copy')
    );
  elsif v_recipient = 'agency' then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  elsif public.portal_feature_enabled(new.client_id, 'client_alerts')
     and public.portal_client_activity_email_required(new.event_type) then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  end if;
  return new;
end;
$$;
revoke all on function public.portal_activity_notify() from public, anon, authenticated, service_role;

update public.activity_event_types set agency_internal = true
  where event_type in ('review_preview_uploaded', 'review_preview_deleted');

do $$
begin
  if pg_catalog.to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('portal-review-previews', 'portal-review-previews', false, 52428800,
      array['video/mp4','image/jpeg','image/png','image/webp']::text[])
    on conflict (id) do update set public = false, file_size_limit = 52428800,
      allowed_mime_types = excluded.allowed_mime_types;
    if exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects'
        and p.roles && array['public','anon','authenticated']::name[]
    ) then
      raise exception 'review existing authenticated storage.objects policies before creating the review preview bucket';
    end if;
  end if;
end;
$$;

create function public.portal_review_preview_path_valid(p_path text, p_prefix text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is not null and p_prefix is not null
    and pg_catalog.starts_with(p_path, p_prefix)
    and p_path <> p_prefix
    and pg_catalog.char_length(p_path) <= 300
    and p_path ~ '^[a-z0-9/_.-]+$'
    and pg_catalog.strpos(p_path, '..') = 0
$$;
revoke all on function public.portal_review_preview_path_valid(text, text)
  from public, anon, authenticated, service_role;

create table public.content_review_previews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  preview_key text not null check (preview_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  -- Optional link to the review asset this render previews (0073). The asset row carries the
  -- Drive or Canva link Anastasia supplied; the preview never replaces it.
  review_asset_key text,
  media_kind text not null check (media_kind in ('video','pages')),
  object_prefix text not null check (pg_catalog.char_length(object_prefix) between 1 and 300),
  video_path text,
  poster_path text,
  frames jsonb not null default '[]'::jsonb,
  width_px int not null check (width_px between 100 and 10000),
  height_px int not null check (height_px between 100 and 10000),
  duration_seconds numeric(7,2)
    check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 240)),
  byte_total bigint not null check (byte_total between 1 and 138412032),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now(),
  unique (client_id, content_item_id, content_version, preview_key),
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade,
  foreign key (client_id, content_item_id, content_version, review_asset_key)
    references public.content_review_assets(client_id, content_item_id, content_version, asset_key)
    on delete set null (review_asset_key),
  check (pg_catalog.jsonb_typeof(frames) = 'array' and pg_catalog.jsonb_array_length(frames) <= 40),
  check (
    (media_kind = 'video' and video_path is not null and poster_path is not null
      and duration_seconds is not null)
    or (media_kind = 'pages' and video_path is null and poster_path is null
      and duration_seconds is null and pg_catalog.jsonb_array_length(frames) >= 1)
  )
);

alter table public.content_review_previews enable row level security;
create policy content_review_previews_client_read on public.content_review_previews
  for select to authenticated
  using (
    content_review_previews.client_id in (select public.my_client_ids())
    and exists (
      select 1 from public.content_items ci
      where ci.id = content_review_previews.content_item_id
        and ci.client_id = content_review_previews.client_id
        and ci.client_visible
        and ci.archived_at is null
        and ci.client_visible_version = content_review_previews.content_version
    )
  );

revoke all on public.content_review_previews from public, anon, authenticated, service_role;
grant select (
  id, client_id, content_item_id, content_version, preview_key, review_asset_key, media_kind,
  object_prefix, video_path, poster_path, frames, width_px, height_px, duration_seconds, created_at
) on public.content_review_previews to authenticated;
grant select on public.content_review_previews to service_role;

-- Removal queue. No foreign keys on purpose: a row must survive the cascade that created it (a
-- discarded version, a deleted client) until its Storage objects are actually gone.
create table public.content_review_preview_removals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  content_item_id uuid not null,
  content_version int not null,
  preview_key text not null,
  preview_id uuid not null,
  object_paths text[] not null check (pg_catalog.cardinality(object_paths) between 1 and 42),
  reason text not null check (reason in (
    'live_everywhere','planned_date_past','superseded','archived','replaced','cascade'
  )),
  attempts int not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or pg_catalog.char_length(last_error) <= 500),
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz
);
create index content_review_preview_removals_pending
  on public.content_review_preview_removals (created_at) where completed_at is null;

alter table public.content_review_preview_removals enable row level security;
-- Deliberately no policies: agency-only. service_role bypasses RLS; client roles get nothing.
revoke all on public.content_review_preview_removals from public, anon, authenticated, service_role;
grant select on public.content_review_preview_removals to service_role;

create function public.portal_review_preview_queue_removal()
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
  if v_reason not in ('live_everywhere','planned_date_past','superseded','archived','replaced','cascade') then
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
create trigger content_review_previews_queue_removal
  after delete on public.content_review_previews
  for each row execute function public.portal_review_preview_queue_removal();

create function public.agency_register_review_preview(
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
    p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 240
  ) then
    raise exception 'preview video must be longer than 0 and at most 240 seconds; full episodes are never uploaded';
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

-- Retention (spec 7): a preview is retired when the piece is confirmed live on every required
-- destination, when its version is no longer working or released, when the piece is archived, or
-- when its planned date is more than 7 days past (Toronto calendar date). p_now exists so the
-- nightly sweep and the tests can ask "as of when".
create function public.agency_retire_review_previews(
  p_now timestamptz,
  p_content_item_id uuid default null
) returns table (preview_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (coalesce(p_now, pg_catalog.now()) at time zone 'America/Toronto')::date;
  v_row record;
begin
  for v_row in
    select c.id, c.reason from (
      select p.id,
        case
          when ci.archived_at is not null then 'archived'
          when ci.client_visible_version is not null
            and p.content_version <= ci.client_visible_version
            and exists (
              select 1 from public.content_publication_targets t
              where t.client_id = ci.client_id and t.content_id = ci.id
                and t.content_version = ci.client_visible_version and t.required)
            and not exists (
              select 1 from public.content_publication_targets t
              where t.client_id = ci.client_id and t.content_id = ci.id
                and t.content_version = ci.client_visible_version and t.required
                and not (t.status = 'live' and t.reconciliation_status = 'verified'))
            then 'live_everywhere'
          when p.content_version <> ci.working_version
            and p.content_version is distinct from ci.client_visible_version then 'superseded'
          when ci.planned_date is not null and ci.planned_date < v_today - 7 then 'planned_date_past'
        end as reason
      from public.content_review_previews p
      join public.content_items ci on ci.id = p.content_item_id and ci.client_id = p.client_id
      where p_content_item_id is null or p.content_item_id = p_content_item_id
    ) c
    where c.reason is not null
    order by c.id
  loop
    perform pg_catalog.set_config('portal.review_preview_removal_reason', v_row.reason, true);
    delete from public.content_review_previews where id = v_row.id;
    preview_id := v_row.id;
    reason := v_row.reason;
    return next;
  end loop;
  perform pg_catalog.set_config('portal.review_preview_removal_reason', '', true);
end;
$$;
revoke all on function public.agency_retire_review_previews(timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.agency_retire_review_previews(timestamptz, uuid) to service_role;

-- Pending removals, with any path that a CURRENT preview still uses filtered out, so an identical
-- re-upload (same content-addressed prefix) is never deleted by an older queued removal.
create function public.agency_pending_review_preview_removals(p_limit int)
returns table (id uuid, object_paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
    array(
      select x.object_path from pg_catalog.unnest(r.object_paths) as x(object_path)
      where not exists (
        select 1 from public.content_review_previews p
        where pg_catalog.starts_with(x.object_path, p.object_prefix))
    )
  from public.content_review_preview_removals r
  where r.completed_at is null and r.attempts < 10
  order by r.created_at, r.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;
revoke all on function public.agency_pending_review_preview_removals(integer)
  from public, anon, authenticated;
grant execute on function public.agency_pending_review_preview_removals(integer) to service_role;

create function public.agency_complete_review_preview_removal(
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

create function public.assert_review_preview_security()
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
  -- The podcast refusal and the 240-second cap are what keep full episodes out of storage.
  if v_def not ilike '%full podcast episodes are not uploaded%'
     or v_def not ilike '%p_duration_seconds > 240%'
     or v_def not ilike '%client_visible_version%'
     or v_def not ilike '%review_preview_uploaded%' then
    raise exception 'review preview registration guards drifted';
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

-- ---------------------------------------------------------------------------------------------
-- Release media guard (amended 2026-10-03, Anastasia). An agent released a version to Maria with
-- nothing for her to look at. Releasing now needs, for that exact version, at least one of: a
-- review asset (0073), a portal preview (this migration) or a design link (the 0020 item link, or a
-- link sealed in the version). The only way past it is an override recorded for that exact version
-- whose reason starts "Approved by Anastasia:". Formats that never carry media use the override
-- too; there is no silent exemption.
--
-- mark_content_ready is the one promotion every release reaches (portal-admin ready, update-portal
-- --re-share, the --quiet supersession 0087, the applied release 0085), and
-- record_content_courtesy_release (0043) is the one approval that does not promote. Both get one
-- perform, rewritten against the live definition with a drift guard (the 0085/0086 pattern).
-- The override writes an agency_internal activity row: recorded, shown in Ops, never notified.

insert into public.activity_event_types (event_type)
values ('release_media_override')
on conflict (event_type) do nothing;
update public.activity_event_types set agency_internal = true
  where event_type = 'release_media_override';

create table public.content_release_media_overrides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  reason text not null check (
    pg_catalog.starts_with(reason, 'Approved by Anastasia:')
    and pg_catalog.char_length(pg_catalog.btrim(pg_catalog.substr(reason, 23))) >= 3
    and pg_catalog.char_length(reason) <= 500
    and reason !~ '[[:cntrl:]]'
  ),
  recorded_by_actor_id uuid not null references public.agency_actors(id),
  recorded_at timestamptz not null default pg_catalog.now(),
  unique (client_id, content_item_id, content_version),
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade
);
alter table public.content_release_media_overrides enable row level security;
-- Deliberately no policies: agency-only. Written only by agency_record_release_media_override.
revoke all on public.content_release_media_overrides from public, anon, authenticated, service_role;
grant select on public.content_release_media_overrides to service_role;

-- What the exact version carries. Used by the guard, the CLI pre-check and the Ops alert (0095).
create function public.agency_release_media_status(p_content_item_id uuid, p_content_version int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'review_assets', (select pg_catalog.count(*)::int from public.content_review_assets a
      where a.content_item_id = p_content_item_id and a.content_version = p_content_version),
    'previews', (select pg_catalog.count(*)::int from public.content_review_previews p
      where p.content_item_id = p_content_item_id and p.content_version = p_content_version),
    'design_link', exists (
        select 1 from public.content_design_links dl
        where dl.content_item_id = p_content_item_id
          and (dl.canva_url is not null or dl.drive_url is not null))
      or exists (
        select 1 from public.content_item_versions v
        where v.content_item_id = p_content_item_id and v.version = p_content_version
          and (nullif(pg_catalog.btrim(v.canva_url), '') is not null
            or nullif(pg_catalog.btrim(v.drive_url), '') is not null)),
    'override_reason', (select o.reason from public.content_release_media_overrides o
      where o.content_item_id = p_content_item_id and o.content_version = p_content_version)
  )
$$;
revoke all on function public.agency_release_media_status(uuid, integer) from public, anon, authenticated;
grant execute on function public.agency_release_media_status(uuid, integer) to service_role;

-- The guard. Reachable only from inside the release functions (owner privileges), never directly.
create function public.portal_assert_release_media(p_content_item_id uuid, p_content_version int)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status jsonb := public.agency_release_media_status(p_content_item_id, p_content_version);
begin
  if coalesce((v_status->>'review_assets')::int, 0) > 0
     or coalesce((v_status->>'previews')::int, 0) > 0
     or coalesce((v_status->>'design_link')::boolean, false)
     or (v_status->>'override_reason') is not null then
    return;
  end if;
  raise exception 'release_media_missing: v% has no review asset, no portal preview and no design link. Attach one, or record a no-media override whose reason starts "Approved by Anastasia:".',
    p_content_version using errcode = '23514';
end;
$$;
revoke all on function public.portal_assert_release_media(uuid, integer)
  from public, anon, authenticated, service_role;

create function public.agency_record_release_media_override(
  p_client_id uuid,
  p_content_id text,
  p_content_version int,
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
  v_existing public.content_release_media_overrides%rowtype;
  v_title text;
  v_id uuid;
begin
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if v_reason is null or not pg_catalog.starts_with(v_reason, 'Approved by Anastasia:')
     or pg_catalog.char_length(pg_catalog.btrim(pg_catalog.substr(v_reason, 23))) < 3
     or pg_catalog.char_length(v_reason) > 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception 'a no-media override reason must start "Approved by Anastasia:" and say why';
  end if;
  select * into v_item from public.content_items ci
    where ci.client_id = p_client_id and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content does not belong to client'; end if;
  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_item.id and cv.client_id = p_client_id and cv.version = p_content_version;
  if not found then raise exception 'content version not found'; end if;

  select * into v_existing from public.content_release_media_overrides o
    where o.client_id = p_client_id and o.content_item_id = v_item.id
      and o.content_version = p_content_version;
  if found then
    if v_existing.reason = v_reason then
      return pg_catalog.jsonb_build_object('override_id', v_existing.id, 'outcome', 'unchanged');
    end if;
    raise exception 'v% already has a no-media override with a different reason', p_content_version;
  end if;

  insert into public.content_release_media_overrides (
    client_id, content_item_id, content_version, reason, recorded_by_actor_id)
  values (p_client_id, v_item.id, p_content_version, v_reason, v_actor.id)
  returning id into v_id;

  insert into public.activity_log (client_id, content_id, content_version, event_type,
    title, summary, actor_type, actor_name, event_key)
  values (p_client_id, v_item.id, p_content_version, 'release_media_override',
    'Released without media: ' || coalesce(v_title, v_item.content_id), v_reason,
    'anastasia', v_actor.display_name, 'release-media-override:' || v_id::text);

  return pg_catalog.jsonb_build_object('override_id', v_id, 'outcome', 'recorded');
end;
$$;
revoke all on function public.agency_record_release_media_override(uuid, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.agency_record_release_media_override(uuid, text, integer, text, text)
  to service_role;

-- Promotion: one perform before the wrapped core (0081's wrapper, unchanged otherwise).
do $rewrite$
declare
  v_def text;
  v_old text := $old$  perform public.portal_core_review_flow_mark_content_ready(p_content_id,p_content_version);$old$;
  v_new text := $new$  -- 0092 release media guard: no promotion without media or a named override.
  perform public.portal_assert_release_media(v_item.id, p_content_version);
  perform public.portal_core_review_flow_mark_content_ready(p_content_id,p_content_version);$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.mark_content_ready(uuid,integer)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'mark_content_ready drifted; 0092 will not rewrite it blindly';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;
revoke all on function public.mark_content_ready(uuid,integer) from public, anon, authenticated;
grant execute on function public.mark_content_ready(uuid,integer) to service_role;

-- Courtesy release: the same check right after the 0086 override guard, before anything is written.
do $rewrite$
declare
  v_def text;
  v_old text := $old$    raise exception 'courtesy release requires studio content or an explicit Anastasia agency override';
  end if;$old$;
  v_new text := $new$    raise exception 'courtesy release requires studio content or an explicit Anastasia agency override';
  end if;
  -- 0092 release media guard: an agency approval of a version Maria cannot see is refused too.
  perform public.portal_assert_release_media(v_item.id, p_content_version);$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_content_courtesy_release(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'courtesy release body drifted; 0092 will not rewrite it blindly';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;
revoke all on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  to service_role;

create function public.assert_release_media_guard_security()
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
          where c.oid = 'public.content_release_media_overrides'::pg_catalog.regclass)
     or exists (select 1 from pg_catalog.pg_policies p
                where p.schemaname = 'public' and p.tablename = 'content_release_media_overrides') then
    raise exception 'release media overrides must keep RLS on and take no policies';
  end if;
  if pg_catalog.has_any_column_privilege('anon', 'public.content_release_media_overrides', 'SELECT')
     or pg_catalog.has_any_column_privilege('authenticated', 'public.content_release_media_overrides', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.content_release_media_overrides', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_release_media_overrides', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_release_media_overrides', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_release_media_overrides', 'DELETE') then
    raise exception 'release media override privileges are unsafe';
  end if;
  foreach v_fn in array array[
    'public.agency_release_media_status(uuid,integer)',
    'public.agency_record_release_media_override(uuid,text,integer,text,text)'
  ] loop
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'release media function grants are unsafe: %', v_fn;
    end if;
  end loop;
  if pg_catalog.has_function_privilege('anon', 'public.portal_assert_release_media(uuid,integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.portal_assert_release_media(uuid,integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.portal_assert_release_media(uuid,integer)', 'EXECUTE') then
    raise exception 'the release media check must be reachable only through the release functions';
  end if;
  select pg_catalog.pg_get_functiondef('public.mark_content_ready(uuid,integer)'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%portal_assert_release_media%' then
    raise exception 'mark_content_ready lost the release media guard';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_content_courtesy_release(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%portal_assert_release_media%' then
    raise exception 'record_content_courtesy_release lost the release media guard';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.agency_record_release_media_override(uuid,text,integer,text,text)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not like '%Approved by Anastasia:%' then
    raise exception 'the no-media override prefix rule drifted';
  end if;
  if not exists (select 1 from public.activity_event_types t
                 where t.event_type = 'release_media_override' and t.agency_internal) then
    raise exception 'release media overrides would notify';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_release_media_guard_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_release_media_guard_security()', 'EXECUTE') then
    raise exception 'release media assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_release_media_guard_security() from public, anon, authenticated;
grant execute on function public.assert_release_media_guard_security() to service_role;

select public.assert_release_media_guard_security();

-- ---------------------------------------------------------------------------------------------
-- agency_internal activity is agency-only at the database (amended 2026-10-04). The client feed
-- in src/lib/portal/data.ts already hides these rows, but act_read (0001) let a client seat read
-- every activity row of its tenant with its own JWT, including a no-media override's reason and
-- preview housekeeping. act_read keeps its tenant condition and now also drops every row whose
-- event type is flagged agency_internal. Client seats cannot read activity_event_types (0008), so
-- the flag is read through a narrow definer helper that returns only the flagged type names. The
-- service role still has no select on activity_log (0064); the agency reads these rows through
-- agency_internal_activity, which returns flagged rows only and is service-role only.

create or replace function public.portal_agency_internal_event_types()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select t.event_type from public.activity_event_types t where t.agency_internal
$$;
revoke all on function public.portal_agency_internal_event_types() from public, anon, service_role;
grant execute on function public.portal_agency_internal_event_types() to authenticated;

drop policy if exists act_read on public.activity_log;
create policy act_read on public.activity_log for select using (
  client_id in (select public.my_client_ids())
  and event_type not in (select public.portal_agency_internal_event_types())
);

create or replace function public.agency_internal_activity(p_client_id uuid, p_content_item_id uuid default null)
returns table (
  id uuid, content_id uuid, content_version int, event_type text, title text, summary text,
  actor_type text, actor_name text, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.content_id, a.content_version, a.event_type, a.title, a.summary,
         a.actor_type, a.actor_name, a.created_at
  from public.activity_log a
  join public.activity_event_types t on t.event_type = a.event_type and t.agency_internal
  where a.client_id = p_client_id
    and (p_content_item_id is null or a.content_id = p_content_item_id)
  order by a.created_at, a.id
$$;
revoke all on function public.agency_internal_activity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agency_internal_activity(uuid, uuid) to service_role;

create or replace function public.assert_agency_internal_activity_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qual text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.activity_log'::pg_catalog.regclass) then
    raise exception 'activity_log must keep RLS on';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'activity_log') <> 1 then
    raise exception 'activity_log must carry exactly one policy (act_read)';
  end if;
  select p.qual into v_qual from pg_catalog.pg_policies p
  where p.schemaname = 'public' and p.tablename = 'activity_log' and p.policyname = 'act_read'
    and p.cmd = 'SELECT';
  if v_qual is null or v_qual not like '%my_client_ids()%'
     or v_qual not like '%portal_agency_internal_event_types()%' then
    raise exception 'act_read no longer hides agency_internal activity from client seats';
  end if;
  if pg_catalog.has_table_privilege('service_role', 'public.activity_log', 'SELECT')
     or pg_catalog.has_function_privilege('anon', 'public.agency_internal_activity(uuid,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_internal_activity(uuid,uuid)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.agency_internal_activity(uuid,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.portal_agency_internal_event_types()', 'EXECUTE') then
    raise exception 'agency_internal activity grants are unsafe';
  end if;
  if (select pg_catalog.count(*) from public.activity_event_types t
      where t.event_type in ('review_preview_uploaded','review_preview_deleted','release_media_override')
        and t.agency_internal) <> 3 then
    raise exception 'agency_internal activity flags drifted';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_agency_internal_activity_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_agency_internal_activity_security()', 'EXECUTE') then
    raise exception 'agency_internal activity assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_agency_internal_activity_security() from public, anon, authenticated;
grant execute on function public.assert_agency_internal_activity_security() to service_role;

select public.assert_agency_internal_activity_security();

-- ---------------------------------------------------------------------------------------------
-- Copy revisions carry the review media forward (amended 2026-10-04, Anastasia). When a new
-- version is created because only the words changed, its review media is the previous version's:
-- applying Maria's copy edits, an agency copy re-share, a quiet supersession, an applied release,
-- or the agency sync that bumps the working version. Before this, only
-- begin_visual_request_revision (0081) copied content_review_assets forward, so with the release
-- media guard above a piece whose media was version-level only was refused when her edits were
-- applied.
--
-- Every one of those paths creates the new snapshot in exactly one place: the version_inserted
-- branch of portal_core_evaluate_content_item_version (0025 body, renamed in 0029), reached via
-- sync_content_item_versions / portal_sync_content_item_version -> portal_evaluate_content_item_version.
-- begin_content_revision (0042), begin_content_request_revision (0047), record_agency_applied_release
-- (0085), record_agency_supersession (0087) and supersede_content_request_with_released_version
-- (0042) only move pointers and flags; none inserts a version. The idea-hydration branch (0029)
-- creates v1, which has no predecessor. begin_visual_request_revision is left exactly as it is.
--
-- That branch now copies, from the version it supersedes (the old working version), (a) its
-- content_review_assets rows with 0081's insert-select and (b) its live content_review_previews
-- rows with the same object prefix and paths under the new version number. Both inserts are
-- on conflict do nothing, so a retry adds nothing. Retention stays correct: when the superseded
-- preview is retired its paths are queued, and agency_pending_review_preview_removals filters out
-- every path that a current preview's object_prefix still covers, so the carried row keeps them.
--
-- Copy-only changes only (amended again 2026-10-04, Anastasia). Both inserts run only when
-- portal_on_screen_copy_unchanged(previous copy_blocks, new copy_blocks) is true: every block
-- whose key is in the on-screen key set (the same nine keys as ON_SCREEN_TEXT_BLOCK_KEYS in
-- src/lib/portal/on-screen-text-rule.ts: reel-script, on-screen-copy, carousel-copy and the rest)
-- has the same body on both versions, and none was added or removed. If the on-screen words
-- changed, the render must have changed too, so the new version starts with no media and the
-- release media guard refuses it until fresh media is attached. Without this, Maria could approve
-- new on-screen words while looking at the old video (the 2026-10-02 failure). Caption, YouTube
-- and other block changes still carry.
create or replace function public.portal_on_screen_copy_unchanged(p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Keep this key set equal to ON_SCREEN_TEXT_BLOCK_KEYS in src/lib/portal/on-screen-text-rule.ts.
  with keys(k) as (
    select pg_catalog.unnest(array['reel-script','on-screen-copy','onscreen-script','video-script',
      'carousel-copy','carousel-slides','carousel','document-copy','linkedin-document-copy']::text[])
  ), o as (
    select b.value->>'key' as k, b.value->'body' as body
    from pg_catalog.jsonb_array_elements(p_old) b(value)
    where b.value->>'key' in (select k from keys)
  ), n as (
    select b.value->>'key' as k, b.value->'body' as body
    from pg_catalog.jsonb_array_elements(p_new) b(value)
    where b.value->>'key' in (select k from keys)
  )
  select coalesce(pg_catalog.jsonb_typeof(p_old) = 'array' and pg_catalog.jsonb_typeof(p_new) = 'array'
    and not exists (
      select 1 from o full join n on n.k = o.k
      where o.k is null or n.k is null or o.body is distinct from n.body
    ), false)
$$;
revoke all on function public.portal_on_screen_copy_unchanged(jsonb,jsonb)
  from public, anon, authenticated, service_role;

do $rewrite$
declare
  v_def text;
  v_old text := $old$  update public.content_items set working_version = v_version, updated_at = pg_catalog.now()
  where id = v_item_id;$old$;
  v_new text := $new$  update public.content_items set working_version = v_version, updated_at = pg_catalog.now()
  where id = v_item_id;
  -- 0092 copy-revision media carry: the new version shows the media of the version it replaces.
  insert into public.content_review_assets(client_id,content_item_id,content_version,asset_key,
    label,channel,asset_kind,url,width_px,height_px,caption_status,review_note)
  select a.client_id,a.content_item_id,v_version,a.asset_key,a.label,a.channel,a.asset_kind,a.url,
    a.width_px,a.height_px,a.caption_status,a.review_note from public.content_review_assets a
  where a.client_id=v_client_id and a.content_item_id=v_item_id
    and a.content_version=v_ci.working_version
    and public.portal_on_screen_copy_unchanged((select pv.copy_blocks
      from public.content_item_versions pv
      where pv.content_item_id=v_item_id and pv.version=v_ci.working_version), v_copy_blocks)
  on conflict(client_id,content_item_id,content_version,asset_key) do nothing;
  insert into public.content_review_previews(client_id,content_item_id,content_version,preview_key,
    review_asset_key,media_kind,object_prefix,video_path,poster_path,frames,width_px,height_px,
    duration_seconds,byte_total,source_sha256)
  select p.client_id,p.content_item_id,v_version,p.preview_key,p.review_asset_key,p.media_kind,
    p.object_prefix,p.video_path,p.poster_path,p.frames,p.width_px,p.height_px,
    p.duration_seconds,p.byte_total,p.source_sha256 from public.content_review_previews p
  where p.client_id=v_client_id and p.content_item_id=v_item_id
    and p.content_version=v_ci.working_version
    and public.portal_on_screen_copy_unchanged((select pv.copy_blocks
      from public.content_item_versions pv
      where pv.content_item_id=v_item_id and pv.version=v_ci.working_version), v_copy_blocks)
  on conflict(client_id,content_item_id,content_version,preview_key) do nothing;$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_core_evaluate_content_item_version(jsonb,boolean)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0
     or pg_catalog.strpos(pg_catalog.substr(v_def, pg_catalog.strpos(v_def, v_old) + 1), v_old) <> 0 then
    raise exception 'portal_core_evaluate_content_item_version drifted; 0092 will not rewrite it blindly';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;
-- Grants unchanged from 0029: owner only, reachable through portal_evaluate_content_item_version.
revoke all on function public.portal_core_evaluate_content_item_version(jsonb,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.assert_copy_revision_media_carry_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_core_evaluate_content_item_version(jsonb,boolean)'::pg_catalog.regprocedure) into v_def;
  if v_def is null
     or v_def not like '%insert into public.content_review_assets%a.content_version=v_ci.working_version%do nothing%'
     or v_def not like '%insert into public.content_review_previews%p.content_version=v_ci.working_version%do nothing%' then
    raise exception 'copy revisions no longer carry the review media forward';
  end if;
  if v_def not like '%insert into public.content_review_assets%a.content_version=v_ci.working_version%portal_on_screen_copy_unchanged(%v_copy_blocks)%do nothing%insert into public.content_review_previews%'
     or v_def not like '%insert into public.content_review_previews%p.content_version=v_ci.working_version%portal_on_screen_copy_unchanged(%v_copy_blocks)%do nothing%' then
    raise exception 'copy revisions carry review media even when the on-screen text changed';
  end if;
  if pg_catalog.to_regprocedure('public.portal_on_screen_copy_unchanged(jsonb,jsonb)') is null
     or public.portal_on_screen_copy_unchanged(
          '[{"key":"reel-script","label":"s","body":"a"}]'::jsonb,
          '[{"key":"reel-script","label":"s","body":"b"}]'::jsonb)
     or public.portal_on_screen_copy_unchanged(
          '[{"key":"caption","label":"c","body":"a"}]'::jsonb,
          '[{"key":"caption","label":"c","body":"a"},{"key":"carousel-copy","label":"s","body":"a"}]'::jsonb)
     or not public.portal_on_screen_copy_unchanged(
          '[{"key":"caption","label":"c","body":"a"},{"key":"on-screen-copy","label":"s","body":"x"}]'::jsonb,
          '[{"key":"caption","label":"c","body":"b"},{"key":"on-screen-copy","label":"t","body":"x"}]'::jsonb) then
    raise exception 'portal_on_screen_copy_unchanged no longer tells on-screen changes from copy-only changes';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.portal_on_screen_copy_unchanged(jsonb,jsonb)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.portal_on_screen_copy_unchanged(jsonb,jsonb)', 'EXECUTE') then
    raise exception 'the on-screen copy comparison became callable by clients';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.portal_core_evaluate_content_item_version(jsonb,boolean)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.portal_core_evaluate_content_item_version(jsonb,boolean)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.portal_core_evaluate_content_item_version(jsonb,boolean)', 'EXECUTE') then
    raise exception 'the sync evaluator core became directly callable';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.begin_visual_request_revision(uuid[],text,uuid)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%insert into public.content_review_assets%' then
    raise exception 'begin_visual_request_revision lost its review asset carry';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_copy_revision_media_carry_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_copy_revision_media_carry_security()', 'EXECUTE') then
    raise exception 'copy revision media carry assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_copy_revision_media_carry_security() from public, anon, authenticated;
grant execute on function public.assert_copy_revision_media_carry_security() to service_role;

select public.assert_copy_revision_media_carry_security();

-- Cumulative fold. 0090 made assert_portal_security() = slice89 + archive guard; that pair becomes
-- slice91 (0091 changed only an assertion already inside the fold), and the review preview,
-- release media, agency_internal activity and copy revision media carry assertions join it.
create or replace function public.assert_portal_slice91_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice89_security();
  perform public.assert_archive_unreleased_draft_security();
end;
$$;
revoke all on function public.assert_portal_slice91_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice91_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice91_security();
  perform public.assert_review_preview_security();
  perform public.assert_release_media_guard_security();
  perform public.assert_agency_internal_activity_security();
  perform public.assert_copy_revision_media_carry_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
