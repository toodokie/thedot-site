-- Version-bound review assets and podcast pack readiness.
--
-- Podcast episodes need more than one generic design link. Maria must be able to
-- review the social cover, captioned teaser, YouTube cover, and each copy surface.
-- The companion website article remains a separate content identity with its own
-- cover and decision. A transcript-proof task opens automatically when the portal
-- first knows that the YouTube upload was scheduled or published.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.record_content_decision(uuid,integer,text,text)') is null
     or pg_catalog.to_regprocedure('public.add_design_comment(uuid,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_design_link_valid(text,text)') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regclass('public.content_publication_observations') is null
     or pg_catalog.to_regclass('public.content_schedule_targets') is null
     or pg_catalog.to_regclass('public.ops_tasks') is null then
    raise exception '0073 requires the current content, review, schedule, publication, and task boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security()
  rename to assert_portal_slice72_security;
revoke all on function public.assert_portal_slice72_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_slice72_security()
  to service_role;

create function public.portal_review_asset_url_valid(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is not null and (
    public.portal_design_link_valid(p_url, 'canva')
    or public.portal_design_link_valid(p_url, 'drive')
  )
$$;
revoke all on function public.portal_review_asset_url_valid(text)
  from public, anon, authenticated, service_role;

create table public.content_review_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  asset_key text not null check (asset_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  label text not null check (
    pg_catalog.char_length(label) between 1 and 120 and label !~ '[[:cntrl:]]'
  ),
  channel text not null check (channel in ('social','youtube','website')),
  asset_kind text not null check (asset_kind in ('cover','video','document')),
  url text not null check (public.portal_review_asset_url_valid(url)),
  width_px int not null check (width_px between 100 and 10000),
  height_px int not null check (height_px between 100 and 10000),
  caption_status text not null default 'not_applicable'
    check (caption_status in ('not_applicable','burned_in_pending','burned_in_verified')),
  review_note text check (
    review_note is null or (
      pg_catalog.char_length(review_note) between 1 and 500 and review_note !~ '[[:cntrl:]]'
    )
  ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (client_id, content_item_id, content_version, asset_key),
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade,
  check (
    asset_key <> 'social-teaser'
    or (
      channel = 'social'
      and asset_kind = 'video'
      and caption_status in ('burned_in_pending','burned_in_verified')
    )
  ),
  check (asset_kind = 'video' or caption_status = 'not_applicable')
);

alter table public.content_review_assets enable row level security;
create policy content_review_assets_client_read on public.content_review_assets
  for select to authenticated
  using (
    client_id in (select public.my_client_ids())
    and exists (
      select 1 from public.content_items ci
      where ci.id = content_item_id
        and ci.client_id = client_id
        and ci.client_visible
        and ci.archived_at is null
        and ci.client_visible_version = content_version
    )
  );

revoke all on public.content_review_assets
  from public, anon, authenticated, service_role;
grant select (
  id, client_id, content_item_id, content_version, asset_key, label, channel,
  asset_kind, url, width_px, height_px, caption_status, review_note, created_at, updated_at
) on public.content_review_assets to authenticated;
grant select on public.content_review_assets to service_role;

create trigger content_review_assets_client_id_immutable
  before update on public.content_review_assets
  for each row execute function public.portal_assistant_client_id_immutable();

create table public.content_review_asset_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  asset_key text not null,
  asset_snapshot jsonb not null check (pg_catalog.jsonb_typeof(asset_snapshot) = 'object'),
  actor_key text not null,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade,
  unique (client_id, idempotency_key)
);
create index content_review_asset_events_item
  on public.content_review_asset_events(client_id, content_item_id, content_version, created_at);
create trigger content_review_asset_events_immutable
  before update or delete on public.content_review_asset_events
  for each row execute function public.portal_reject_immutable_history_mutation();

revoke all on public.content_review_asset_events
  from public, anon, authenticated, service_role;
grant select on public.content_review_asset_events to service_role;

create function public.set_content_review_asset(
  p_client_id uuid,
  p_content_id text,
  p_content_version int,
  p_asset_key text,
  p_label text,
  p_channel text,
  p_asset_kind text,
  p_url text,
  p_width_px int,
  p_height_px int,
  p_caption_status text,
  p_review_note text,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_asset_key text := pg_catalog.lower(pg_catalog.btrim(p_asset_key));
  v_label text := pg_catalog.btrim(p_label);
  v_note text := nullif(pg_catalog.btrim(p_review_note), '');
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_response jsonb;
begin
  select * into v_actor from public.agency_actors
    where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;
  select * into v_item from public.content_items ci
    where ci.client_id = p_client_id
      and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content does not belong to client'; end if;
  if p_content_version is null or p_content_version not in (
    v_item.working_version, v_item.client_visible_version
  ) then
    raise exception 'review asset version is not the current working or released version';
  end if;
  if not exists (
    select 1 from public.content_item_versions cv
    where cv.content_item_id = v_item.id
      and cv.client_id = p_client_id
      and cv.version = p_content_version
  ) then
    raise exception 'content version not found';
  end if;
  if v_asset_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'invalid asset key';
  end if;
  if v_label is null or pg_catalog.char_length(v_label) not between 1 and 120
     or v_label ~ '[[:cntrl:]]' then
    raise exception 'invalid asset label';
  end if;
  if p_channel not in ('social','youtube','website') then raise exception 'invalid asset channel'; end if;
  if p_asset_kind not in ('cover','video','document') then raise exception 'invalid asset kind'; end if;
  if not public.portal_review_asset_url_valid(p_url) then raise exception 'invalid review asset URL'; end if;
  if p_width_px not between 100 and 10000 or p_height_px not between 100 and 10000 then
    raise exception 'invalid review asset dimensions';
  end if;
  if p_caption_status not in ('not_applicable','burned_in_pending','burned_in_verified') then
    raise exception 'invalid caption status';
  end if;
  if v_asset_key = 'social-teaser' and (
    p_channel <> 'social' or p_asset_kind <> 'video'
    or p_caption_status not in ('burned_in_pending','burned_in_verified')
  ) then
    raise exception 'social teaser must be a social video with burned-in caption status';
  end if;
  if p_asset_kind <> 'video' and p_caption_status <> 'not_applicable' then
    raise exception 'caption status applies only to video assets';
  end if;
  if v_note is not null and (
    pg_catalog.char_length(v_note) > 500 or v_note ~ '[[:cntrl:]]'
  ) then raise exception 'invalid review note'; end if;
  if p_idempotency_key is null
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'content_id', pg_catalog.btrim(p_content_id),
      'content_version', p_content_version,
      'asset_key', v_asset_key,
      'label', v_label,
      'channel', p_channel,
      'asset_kind', p_asset_kind,
      'url', p_url,
      'width_px', p_width_px,
      'height_px', p_height_px,
      'caption_status', p_caption_status,
      'review_note', v_note
    )::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'set_review_asset'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  insert into public.content_review_assets (
    client_id, content_item_id, content_version, asset_key, label, channel,
    asset_kind, url, width_px, height_px, caption_status, review_note
  ) values (
    p_client_id, v_item.id, p_content_version, v_asset_key, v_label, p_channel,
    p_asset_kind, p_url, p_width_px, p_height_px, p_caption_status, v_note
  )
  on conflict (client_id, content_item_id, content_version, asset_key) do update
    set label = excluded.label,
        channel = excluded.channel,
        asset_kind = excluded.asset_kind,
        url = excluded.url,
        width_px = excluded.width_px,
        height_px = excluded.height_px,
        caption_status = excluded.caption_status,
        review_note = excluded.review_note,
        updated_at = pg_catalog.now();

  v_response := pg_catalog.jsonb_build_object(
    'content_item_id', v_item.id,
    'content_version', p_content_version,
    'asset_key', v_asset_key,
    'url', p_url
  );
  insert into public.content_review_asset_events (
    client_id, content_item_id, content_version, asset_key, asset_snapshot,
    actor_key, idempotency_key
  ) values (
    p_client_id, v_item.id, p_content_version, v_asset_key, v_response,
    p_actor_key, p_idempotency_key
  );
  insert into public.portal_command_receipts (
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    p_client_id, 'set_review_asset', p_idempotency_key, v_fingerprint, v_response
  );
  return v_response;
end;
$$;
revoke all on function public.set_content_review_asset(
  uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.set_content_review_asset(
  uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text
) to service_role;

-- Let Maria comment on any asset attached to the exact released version. The
-- existing design-link path remains valid for all older pieces.
create or replace function public.add_design_comment(
  p_content_id uuid,
  p_body text,
  p_design_url text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_visible_version int;
  v_canva_url text;
  v_drive_url text;
  v_url text := nullif(pg_catalog.btrim(p_design_url), '');
  v_comment_id uuid;
begin
  if v_url is null or pg_catalog.char_length(v_url) > 2048 or v_url !~ '^https://[^[:space:]]+$' then
    raise exception 'design link is invalid';
  end if;
  select ci.client_id, ci.client_visible_version,
    coalesce(dl.canva_url, cv.canva_url), coalesce(dl.drive_url, cv.drive_url)
    into v_client_id, v_visible_version, v_canva_url, v_drive_url
  from public.content_items ci
  join public.client_users cu
    on cu.client_id = ci.client_id and cu.auth_user_id = (select auth.uid())
  join public.content_item_versions cv
    on cv.content_item_id = ci.id
   and cv.client_id = ci.client_id
   and cv.version = ci.client_visible_version
  left join public.content_design_links dl
    on dl.content_item_id = ci.id and dl.client_id = ci.client_id
  where ci.id = p_content_id and ci.client_visible and ci.archived_at is null
  for update of ci;
  if not found then raise exception 'not authorized for this content'; end if;
  perform public.portal_require_client_action(v_client_id, 'can_comment');
  if v_url is distinct from v_canva_url and v_url is distinct from v_drive_url
     and not exists (
       select 1 from public.content_review_assets a
       where a.client_id = v_client_id
         and a.content_item_id = p_content_id
         and a.content_version = v_visible_version
         and a.url = v_url
     ) then
    raise exception 'design link is not attached to the released piece';
  end if;

  v_comment_id := public.portal_core_add_comment(p_content_id, p_body, null, null);
  update public.comments
  set target_kind = 'design', target_url = v_url
  where id = v_comment_id and client_id = v_client_id;
  return v_comment_id;
end;
$$;
revoke all on function public.add_design_comment(uuid,text,text) from public, anon;
grant execute on function public.add_design_comment(uuid,text,text)
  to authenticated, service_role;

-- Final decisions for the two new podcast formats are fail-closed. Copy blocks
-- and version-bound assets must all be present, and the teaser captions must have
-- been verified, before Maria can approve or request a package change.
create or replace function public.record_content_decision(
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
  v_pack_ready boolean := true;
begin
  select ci.client_id,
    (ci.client_visible and ci.client_visible_version is not distinct from p_content_version),
    cv.format,
    cv.copy_blocks,
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
  into v_client_id, v_is_visible, v_format, v_blocks, v_has_design
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
    v_pack_ready :=
      exists (
        select 1 from pg_catalog.jsonb_array_elements(v_blocks) b
        where b->>'key' in ('social-caption','ig-facebook-caption')
      )
      and exists (
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
          and a.content_version = p_content_version and a.asset_key = 'social-cover'
          and a.channel = 'social' and a.asset_kind = 'cover'
      )
      and exists (
        select 1 from public.content_review_assets a
        where a.client_id = v_client_id and a.content_item_id = p_content_id
          and a.content_version = p_content_version and a.asset_key = 'social-teaser'
          and a.channel = 'social' and a.asset_kind = 'video'
          and a.caption_status = 'burned_in_verified'
      )
      and exists (
        select 1 from public.content_review_assets a
        where a.client_id = v_client_id and a.content_item_id = p_content_id
          and a.content_version = p_content_version and a.asset_key = 'youtube-cover'
          and a.channel = 'youtube' and a.asset_kind = 'cover'
      );
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
revoke all on function public.record_content_decision(uuid,integer,text,text)
  from public, anon, service_role;
grant execute on function public.record_content_decision(uuid,integer,text,text)
  to authenticated;

-- An observed YouTube schedule means the provider upload exists. An immediate
-- public upload may skip scheduling, so the publication trigger is a second entry
-- point. Both use one deterministic task key.
create function public.portal_open_podcast_transcript_task(
  p_client_id uuid,
  p_content_item_id uuid,
  p_content_version int,
  p_due_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_format text;
  v_title text;
  v_content_key text;
  v_task_key text;
  v_source text;
  v_fingerprint text;
begin
  select cv.format, cv.title, ci.content_id
    into v_format, v_title, v_content_key
  from public.content_item_versions cv
  join public.content_items ci
    on ci.id = cv.content_item_id and ci.client_id = cv.client_id
  where cv.client_id = p_client_id
    and cv.content_item_id = p_content_item_id
    and cv.version = p_content_version;
  if not found or v_format is distinct from 'podcast' then return; end if;

  v_task_key := 'podcast-transcript:' || p_content_item_id::text || ':' || p_content_version::text;
  v_source := 'YouTube upload confirmed for ' || v_content_key || ' v' || p_content_version::text
    || '. Review automatic captions against the Kanset jargon list, correct them in YouTube Studio, and record the proof.';
  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'client_id', p_client_id,
      'content_item_id', p_content_item_id,
      'content_version', p_content_version,
      'task', 'youtube_transcript_review'
    )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.ops_tasks (
    client_id, title, category, due_date, trigger_note, owner_label, status,
    source, idempotency_key, request_fingerprint
  ) values (
    p_client_id,
    'Review YouTube transcript: ' || pg_catalog.left(v_title, 265),
    'portal',
    (coalesce(p_due_at, pg_catalog.now()) at time zone 'America/Toronto')::date,
    'Opens when the podcast upload is scheduled or confirmed live.',
    'agent',
    'open',
    v_source,
    v_task_key,
    v_fingerprint
  ) on conflict (idempotency_key) do nothing;
end;
$$;
revoke all on function public.portal_open_podcast_transcript_task(uuid,uuid,integer,timestamptz)
  from public, anon, authenticated, service_role;

create function public.portal_podcast_transcript_from_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.destination = 'youtube' and new.status = 'scheduled' then
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
      perform public.portal_open_podcast_transcript_task(
        new.client_id, new.content_id, new.content_version, new.scheduled_at
      );
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.portal_podcast_transcript_from_schedule()
  from public, anon, authenticated, service_role;
create trigger podcast_transcript_after_schedule
  after insert or update of status on public.content_schedule_targets
  for each row execute function public.portal_podcast_transcript_from_schedule();

create function public.portal_podcast_transcript_from_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.content_publication_targets%rowtype;
begin
  if new.provider_state <> 'live' then return new; end if;
  select * into v_target from public.content_publication_targets t
    where t.id = new.publication_target_id and t.client_id = new.client_id;
  if found and v_target.destination = 'youtube' then
    perform public.portal_open_podcast_transcript_task(
      new.client_id, v_target.content_id, v_target.content_version,
      coalesce(new.published_at, new.observed_at)
    );
  end if;
  return new;
end;
$$;
revoke all on function public.portal_podcast_transcript_from_publication()
  from public, anon, authenticated, service_role;
create trigger podcast_transcript_after_publication
  after insert on public.content_publication_observations
  for each row execute function public.portal_podcast_transcript_from_publication();

create function public.assert_portal_podcast_review_pack_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual text[];
  v_expected text[];
  v_def text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'public.content_review_assets'::pg_catalog.regclass
      and c.relrowsecurity
  ) then raise exception 'content_review_assets RLS is disabled'; end if;
  if not exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'content_review_assets'
      and p.policyname = 'content_review_assets_client_read'
      and p.cmd = 'SELECT'
  ) then raise exception 'content_review_assets client read policy is missing'; end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
  from information_schema.column_privileges cp
  where cp.table_schema = 'public'
    and cp.table_name = 'content_review_assets'
    and cp.grantee = 'authenticated'
    and cp.privilege_type = 'SELECT';
  v_expected := array[
    'asset_key','asset_kind','caption_status','channel','client_id','content_item_id',
    'content_version','created_at','height_px','id','label','review_note','updated_at',
    'url','width_px'
  ];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected content_review_assets grants: %', v_actual;
  end if;
  if pg_catalog.has_table_privilege(
       'authenticated','public.content_review_assets','INSERT,UPDATE,DELETE'
     )
     or pg_catalog.has_table_privilege(
       'anon','public.content_review_assets','SELECT,INSERT,UPDATE,DELETE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role','public.content_review_assets','SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.content_review_assets','INSERT,UPDATE,DELETE'
     ) then
    raise exception 'unsafe content_review_assets table privileges';
  end if;
  if pg_catalog.has_table_privilege(
       'authenticated','public.content_review_asset_events','SELECT,INSERT,UPDATE,DELETE'
     )
     or pg_catalog.has_table_privilege(
       'anon','public.content_review_asset_events','SELECT,INSERT,UPDATE,DELETE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role','public.content_review_asset_events','SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.content_review_asset_events','INSERT,UPDATE,DELETE'
     ) then
    raise exception 'unsafe content_review_asset_events table privileges';
  end if;
  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.set_content_review_asset(uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.set_content_review_asset(uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.set_content_review_asset(uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text)',
       'EXECUTE'
     ) then
    raise exception 'unsafe review asset writer privileges';
  end if;
  if not pg_catalog.has_function_privilege(
       'authenticated','public.add_design_comment(uuid,text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon','public.add_design_comment(uuid,text,text)','EXECUTE'
     ) then
    raise exception 'unsafe asset comment privileges';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_content_decision(uuid,integer,text,text)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%content_review_assets%'
     or v_def not ilike '%final_package_incomplete%'
     or v_def not ilike '%burned_in_verified%'
     or v_def not ilike '%portal_core_record_content_decision%' then
    raise exception 'podcast final-package decision guard is incomplete';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_schedule_targets'::pg_catalog.regclass
      and t.tgname = 'podcast_transcript_after_schedule'
      and not t.tgisinternal
  ) or not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_publication_observations'::pg_catalog.regclass
      and t.tgname = 'podcast_transcript_after_publication'
      and not t.tgisinternal
  ) then
    raise exception 'podcast transcript task triggers are missing';
  end if;
  if not public.portal_review_asset_url_valid('https://www.canva.com/design/ABC/view')
     or not public.portal_review_asset_url_valid('https://drive.google.com/open?id=ABC')
     or public.portal_review_asset_url_valid('http://drive.google.com/open?id=ABC')
     or public.portal_review_asset_url_valid('https://drive.google.com.evil.example/ABC') then
    raise exception 'review asset URL boundary failed';
  end if;
end;
$$;
revoke all on function public.assert_portal_podcast_review_pack_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_podcast_review_pack_security()
  to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice72_security();
  perform public.assert_portal_podcast_review_pack_security();
end;
$$;
revoke all on function public.assert_portal_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_security()
  to service_role;

select public.assert_portal_security();

commit;
