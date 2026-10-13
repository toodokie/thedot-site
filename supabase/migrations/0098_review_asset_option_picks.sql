-- Cover option picker (piece page, Anastasia's review of Kanset Talks ep4, 2026-10-06).
--
-- A podcast package can carry alternative covers: a reel cover in teal or rust, a third YouTube
-- test cover in rust or teal. Until now the review note asked Maria to "reply teal or rust", which
-- put the choice in an email instead of the portal. This slice lets her pick in the page.
--
--   * content_review_assets.option_group / option_label: agency-set, through the existing
--     portal-write review-asset path (set_content_review_asset). Assets that share an option_group
--     on one version are the alternatives; option_label is the short name shown on her choice.
--     Fixed parts of a set (youtube-cover and youtube-cover-test-2 in a YouTube Test & compare set)
--     carry no option_group: they are not options. Both columns are nullable with no default, so
--     the change needs no backfill and no table rewrite; both are set together or not at all.
--   * set_content_review_asset gains p_option_group and p_option_label, both defaulting to null,
--     so callers that pass the old 14 arguments keep working. The request fingerprint carries the
--     option fields only when they are set, so a replayed pre-0098 receipt still matches.
--   * content_review_option_picks: one current pick per seat, piece, version and option group.
--     The seat reads only its own rows; nobody writes the table directly.
--   * pick_review_asset_option: the only writer. Seat from auth.uid(), the seat must hold the
--     piece's client with can_decide (portal_require_client_action, so the launch and mutation
--     switches apply), released version only, the asset must carry an option_group, and the pick
--     can change until the piece is decided (approved, scheduled or posted). A changed pick writes
--     one client activity row (portal_activity_notify routes a client actor to the agency: an
--     agency in-app row and the agency email, never the client) and one agency inbox event. It is
--     not an edit request: no content_change_requests row, no bundle, the review state and the
--     decision are untouched. Re-picking the current option writes nothing.
--   * The agency reads picks with the service role (agency panel, scheduling reader).
--   * assert_review_option_security() joins assert_portal_security(); the 0073 review-pack
--     assertion is replaced so its pinned column grants and writer signature include this slice.

begin;
set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.content_review_assets') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.content_review_previews') is null
     or pg_catalog.to_regprocedure('public.set_content_review_asset(uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.assert_portal_podcast_review_pack_security()') is null
     or pg_catalog.to_regprocedure('public.portal_require_client_action(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_agency_digest_excerpt(text,text,integer)') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0098 requires 0097 (agency digest edit detail) and the 0073 review assets';
  end if;
end;
$$;

select public.assert_portal_security();

insert into public.activity_event_types (event_type)
values ('review_option_picked')
on conflict (event_type) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Option grouping on review assets.
alter table public.content_review_assets
  add column option_group text,
  add column option_label text;
alter table public.content_review_assets
  add constraint content_review_assets_option_group_check
    check (option_group is null or option_group ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  add constraint content_review_assets_option_label_check
    check (option_label is null or (
      pg_catalog.char_length(option_label) between 1 and 80 and option_label !~ '[[:cntrl:]]')),
  add constraint content_review_assets_option_pair_check
    check ((option_group is null) = (option_label is null));

grant select (option_group, option_label) on public.content_review_assets to authenticated;

drop function public.set_content_review_asset(
  uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text);

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
  p_idempotency_key text,
  p_option_group text default null,
  p_option_label text default null
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
  v_group text := nullif(pg_catalog.lower(pg_catalog.btrim(p_option_group)), '');
  v_option_label text := nullif(pg_catalog.btrim(p_option_label), '');
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
  -- 0098: an option is a group key and a short label, set together.
  if (v_group is null) <> (v_option_label is null) then
    raise exception 'option group and option label are set together';
  end if;
  if v_group is not null and (
    v_group !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or pg_catalog.char_length(v_option_label) > 80 or v_option_label ~ '[[:cntrl:]]'
  ) then raise exception 'invalid review asset option'; end if;
  if p_idempotency_key is null
     or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    (pg_catalog.jsonb_build_object(
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
    ) || case when v_group is null then '{}'::jsonb
         else pg_catalog.jsonb_build_object('option_group', v_group, 'option_label', v_option_label) end
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
    asset_kind, url, width_px, height_px, caption_status, review_note, option_group, option_label
  ) values (
    p_client_id, v_item.id, p_content_version, v_asset_key, v_label, p_channel,
    p_asset_kind, p_url, p_width_px, p_height_px, p_caption_status, v_note, v_group, v_option_label
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
        option_group = excluded.option_group,
        option_label = excluded.option_label,
        updated_at = pg_catalog.now();

  v_response := pg_catalog.jsonb_build_object(
    'content_item_id', v_item.id,
    'content_version', p_content_version,
    'asset_key', v_asset_key,
    'url', p_url
  ) || case when v_group is null then '{}'::jsonb
       else pg_catalog.jsonb_build_object('option_group', v_group, 'option_label', v_option_label) end;
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
  uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.set_content_review_asset(
  uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text,text,text
) to service_role;

-- ---------------------------------------------------------------------------------------------
-- The seat's picks.
create table public.content_review_option_picks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  option_group text not null check (option_group ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  asset_key text not null check (asset_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  picked_at timestamptz not null default pg_catalog.now(),
  unique (auth_user_id, content_item_id, content_version, option_group),
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade,
  -- The picked asset must exist on that exact version; removing the asset removes the pick.
  foreign key (client_id, content_item_id, content_version, asset_key)
    references public.content_review_assets(client_id, content_item_id, content_version, asset_key)
    on delete cascade
);
create index content_review_option_picks_by_item
  on public.content_review_option_picks (content_item_id, content_version);
create index content_review_option_picks_by_asset
  on public.content_review_option_picks (client_id, content_item_id, content_version, asset_key);

alter table public.content_review_option_picks enable row level security;
create policy content_review_option_picks_seat_read on public.content_review_option_picks
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));

revoke all on public.content_review_option_picks from public, anon, authenticated, service_role;
grant select (content_item_id, content_version, option_group, asset_key, picked_at)
  on public.content_review_option_picks to authenticated;
grant select on public.content_review_option_picks to service_role;

create function public.pick_review_asset_option(
  p_content_id uuid,
  p_content_version int,
  p_asset_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_asset public.content_review_assets%rowtype;
  v_name text;
  v_title text;
  v_previous text;
  v_pick_id uuid;
  v_change uuid := gen_random_uuid();
begin
  if v_uid is null then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  if p_content_id is null or p_content_version is null
     or p_asset_key is null or p_asset_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'invalid review option pick';
  end if;
  -- The content row lock serialises a pick with record_content_decision (0094 takes it too).
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id for update;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  perform public.portal_require_client_action(v_item.client_id, 'can_decide');
  select coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client') into v_name
    from public.client_users cu where cu.auth_user_id = v_uid and cu.client_id = v_item.client_id;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  if not v_item.client_visible or v_item.archived_at is not null
     or v_item.client_visible_version is distinct from p_content_version then
    raise exception 'review_option_version_not_released';
  end if;
  if v_item.status <> 'draft' or exists (
    select 1 from (
      select a.state from public.approvals a
      where a.content_id = v_item.id and a.client_id = v_item.client_id
        and a.content_version = p_content_version
      order by a.created_at desc, a.id desc limit 1
    ) latest where latest.state = 'approved'
  ) then
    raise exception 'review_option_piece_decided';
  end if;
  select a.* into v_asset from public.content_review_assets a
    where a.client_id = v_item.client_id and a.content_item_id = v_item.id
      and a.content_version = p_content_version and a.asset_key = p_asset_key;
  if not found or v_asset.option_group is null then
    raise exception 'review_option_not_an_option';
  end if;

  select p.asset_key into v_previous from public.content_review_option_picks p
    where p.auth_user_id = v_uid and p.content_item_id = v_item.id
      and p.content_version = p_content_version and p.option_group = v_asset.option_group;
  if v_previous = v_asset.asset_key then
    return pg_catalog.jsonb_build_object('outcome', 'unchanged', 'option_group', v_asset.option_group,
      'asset_key', v_asset.asset_key);
  end if;

  insert into public.content_review_option_picks (client_id, auth_user_id, content_item_id,
    content_version, option_group, asset_key)
  values (v_item.client_id, v_uid, v_item.id, p_content_version, v_asset.option_group, v_asset.asset_key)
  on conflict (auth_user_id, content_item_id, content_version, option_group) do update
    set asset_key = excluded.asset_key, picked_at = pg_catalog.now()
  returning id into v_pick_id;

  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
      and cv.version = p_content_version;
  -- actor_type 'client' routes this to the agency (0078): agency in-app and email, never the client.
  insert into public.activity_log (client_id, content_id, content_version, event_type, event_key,
    title, summary, actor_type, actor_name, related_url)
  values (v_item.client_id, v_item.id, p_content_version, 'review_option_picked',
    'review-option-pick:' || v_change::text,
    pg_catalog.split_part(v_name, ' ', 1) || ' chose ' || v_asset.label,
    coalesce(v_title, v_item.content_id) || ' v' || p_content_version::text || ', option group '
      || v_asset.option_group || ': ' || v_asset.option_label || ' (' || v_asset.asset_key || ').'
      || case when v_previous is null then '' else ' Replaces ' || v_previous || '.' end
      || ' A choice, not an edit request: the review is unchanged.',
    'client', v_name,
    'https://www.thedotcreative.co/admin/portal/pieces/' || v_item.content_id)
  on conflict do nothing;
  insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation)
  values (v_item.client_id, 'review-option-pick:' || v_change::text, 'review_option_picked',
    'content_review_option_pick', v_pick_id, 'client', v_name,
    pg_catalog.jsonb_build_object('content_item_id', v_item.id, 'content_key', v_item.content_id,
      'content_version', p_content_version, 'option_group', v_asset.option_group,
      'asset_key', v_asset.asset_key, 'option_label', v_asset.option_label,
      'previous_asset_key', v_previous, 'auth_user_id', v_uid),
    false)
  on conflict (client_id, event_key) do nothing;
  return pg_catalog.jsonb_build_object('outcome', 'picked', 'option_group', v_asset.option_group,
    'asset_key', v_asset.asset_key);
end;
$$;
revoke all on function public.pick_review_asset_option(uuid,integer,text)
  from public, anon, authenticated, service_role;
grant execute on function public.pick_review_asset_option(uuid,integer,text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 0073's review-pack assertion with this slice's column grants and writer signature. Everything
-- else is 0073's body verbatim.
create or replace function public.assert_portal_podcast_review_pack_security()
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
    'content_version','created_at','height_px','id','label','option_group','option_label',
    'review_note','updated_at','url','width_px'
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
  if pg_catalog.to_regprocedure(
       'public.set_content_review_asset(uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text)'
     ) is not null then
    raise exception 'the pre-0098 review asset writer must not survive';
  end if;
  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.set_content_review_asset(uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.set_content_review_asset(uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text,text,text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.set_content_review_asset(uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text,text,text)',
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

-- ---------------------------------------------------------------------------------------------
create function public.assert_review_option_security()
returns void language plpgsql security definer set search_path = '' as $$
declare v_def text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.content_review_option_picks'::pg_catalog.regclass) then
    raise exception 'review option picks need row level security';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'content_review_option_picks') <> 1
     or not exists (select 1 from pg_catalog.pg_policies p
       where p.schemaname = 'public' and p.tablename = 'content_review_option_picks'
         and p.policyname = 'content_review_option_picks_seat_read' and p.cmd = 'SELECT') then
    raise exception 'review option picks must carry exactly the seat read policy';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.content_review_option_picks','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_option_picks','UPDATE')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_option_picks','DELETE')
     or pg_catalog.has_any_column_privilege('anon','public.content_review_option_picks','SELECT')
     or pg_catalog.has_column_privilege('authenticated','public.content_review_option_picks','auth_user_id','SELECT')
     or pg_catalog.has_column_privilege('authenticated','public.content_review_option_picks','client_id','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.content_review_option_picks','SELECT')
     or pg_catalog.has_table_privilege('service_role','public.content_review_option_picks','INSERT,UPDATE,DELETE') then
    raise exception 'review option pick table grants are unsafe';
  end if;
  if pg_catalog.has_function_privilege('anon','public.pick_review_asset_option(uuid,integer,text)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.pick_review_asset_option(uuid,integer,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.pick_review_asset_option(uuid,integer,text)','EXECUTE') then
    raise exception 'review option pick function grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.pick_review_asset_option(uuid,integer,text)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%client_visible_version%'
     or v_def not ilike '%portal_require_client_action%can_decide%'
     or v_def not ilike '%option_group is null%'
     or v_def not ilike '%review_option_piece_decided%'
     or v_def not ilike '%for update%'
     or v_def not ilike '%portal_inbox_events%'
     or v_def ilike '%content_change_requests%' then
    raise exception 'review option pick guards drifted';
  end if;
  if not exists (select 1 from public.activity_event_types t where t.event_type = 'review_option_picked')
     or exists (select 1 from public.activity_event_types t
                where t.event_type = 'review_option_picked' and t.agency_internal) then
    raise exception 'review option picks must reach the agency';
  end if;
  if pg_catalog.has_function_privilege('anon','public.assert_review_option_security()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.assert_review_option_security()','EXECUTE') then
    raise exception 'review option assertion exposed';
  end if;
end;
$$;
revoke all on function public.assert_review_option_security() from public, anon, authenticated;
grant execute on function public.assert_review_option_security() to service_role;

select public.assert_review_option_security();

-- Cumulative fold, the 0081, 0094 and 0095 rename pattern.
alter function public.assert_portal_security() rename to assert_portal_pre_review_option_security;
revoke all on function public.assert_portal_pre_review_option_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_review_option_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_pre_review_option_security();
  perform public.assert_review_option_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
