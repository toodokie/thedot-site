-- Piece page review ticks and the unsent-draft approval guard (piece page redesign, spec
-- 2026-10-03 sections 4.3 and 6; plan 4a).
--
-- Ticks: the copy switcher shows one text at a time (On-screen text, Caption, YouTube). Each tab
-- gets a tick once the seat opens it, and Approve stays off until every tab is ticked, so an
-- unseen tab cannot be skipped (on 2026-10-02 Maria approved a reel's copy without seeing its
-- on-screen text). Ticks are per seat, per piece, per version: a new version starts at zero by
-- construction. A seat reads only its own rows; the only write is tick_review_tabs, which accepts
-- ticks only on the released version. The database does not enforce ticks; they gate the button.
--
-- Approve guard: 0093 made drafts server records. Approve was still gated only in the browser.
-- record_content_decision now refuses 'approved' while the approving seat has unsent drafts on the
-- piece, checked under the same content row lock the bundle (0081) and draft writes (0093) take,
-- so an approval and a draft save serialise. Only the approving seat's drafts count: other seats'
-- drafts are invisible to her by RLS, and their sent edits already block through the unresolved
-- request check. Nothing here emails anyone.

begin;

set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.content_review_drafts') is null
     or pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regclass('public.client_users') is null
     or pg_catalog.to_regprocedure('public.record_content_decision(uuid,integer,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_core_review_flow_record_content_decision(uuid,integer,text,text)') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0094 requires durable review drafts (0093) and the unified review bundle (0081)';
  end if;
end;
$$;

select public.assert_portal_security();

create table public.content_review_tab_ticks (
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  tab_key text not null check (tab_key ~ '^[a-z0-9][a-z0-9:_-]{0,63}$'),
  ticked_at timestamptz not null default pg_catalog.now(),
  primary key (auth_user_id, content_item_id, content_version, tab_key),
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade
);
create index content_review_tab_ticks_by_item
  on public.content_review_tab_ticks (content_item_id, content_version);

alter table public.content_review_tab_ticks enable row level security;
create policy content_review_tab_ticks_seat_read on public.content_review_tab_ticks
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));

revoke all on public.content_review_tab_ticks from public, anon, authenticated, service_role;
grant select (content_item_id, content_version, tab_key, ticked_at)
  on public.content_review_tab_ticks to authenticated;
grant select on public.content_review_tab_ticks to service_role;

create function public.tick_review_tabs(
  p_content_id uuid,
  p_content_version int,
  p_tab_keys text[]
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_count int;
begin
  if v_uid is null or p_content_id is null or p_content_version is null or p_tab_keys is null
     or pg_catalog.cardinality(p_tab_keys) not between 1 and 20
     or exists (
       select 1 from pg_catalog.unnest(p_tab_keys) as u(value)
       where u.value is null or u.value !~ '^[a-z0-9][a-z0-9:_-]{0,63}$'
     ) then
    raise exception 'invalid review tick';
  end if;
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id;
  if not found or not exists (
    select 1 from public.client_users cu
    where cu.auth_user_id = v_uid and cu.client_id = v_item.client_id
  ) then
    raise exception 'portal_action_not_allowed' using errcode = '42501';
  end if;
  if not v_item.client_visible
     or v_item.client_visible_version is distinct from p_content_version
     or v_item.archived_at is not null then
    raise exception 'review_tick_version_not_released';
  end if;
  insert into public.content_review_tab_ticks (
    client_id, auth_user_id, content_item_id, content_version, tab_key)
  select v_item.client_id, v_uid, v_item.id, p_content_version, k.value
  from (select distinct u.value from pg_catalog.unnest(p_tab_keys) as u(value)) k
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.tick_review_tabs(uuid,integer,text[]) from public, anon, service_role;
grant execute on function public.tick_review_tabs(uuid,integer,text[]) to authenticated;

-- Same wrapper as 0081, plus the unsent-draft check. create or replace keeps the grants.
create or replace function public.record_content_decision(
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
  -- 0094: the approving seat's own unsent drafts block approval, including drafts carried over
  -- from an earlier version (plan 3, decision 4).
  if p_decision='approved' and exists (
    select 1 from public.content_review_drafts d
    where d.client_id=v_item.client_id and d.content_item_id=v_item.id
      and d.auth_user_id=(select auth.uid()) and d.status='unsent'
  ) then raise exception 'unsent_review_drafts' using errcode='23514'; end if;
  return public.portal_core_review_flow_record_content_decision(
    p_content_id,p_content_version,p_decision,p_note);
end;
$$;

create function public.assert_review_tick_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_def text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid='public.content_review_tab_ticks'::pg_catalog.regclass) then
    raise exception 'review ticks need row level security';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.content_review_tab_ticks','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_tab_ticks','UPDATE')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_tab_ticks','DELETE')
     or pg_catalog.has_table_privilege('anon','public.content_review_tab_ticks','SELECT') then
    raise exception 'review tick table grants are unsafe';
  end if;
  if pg_catalog.has_function_privilege('anon','public.tick_review_tabs(uuid,integer,text[])','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.tick_review_tabs(uuid,integer,text[])','EXECUTE') then
    raise exception 'review tick function grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_content_decision(uuid,integer,text,text)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%content_review_drafts%' or v_def not ilike '%''unsent''%'
     or v_def not ilike '%''conflicted''%' or v_def not ilike '%for update%'
     or v_def not ilike '%portal_core_record_content_decision%' then
    raise exception 'approval unsent-draft guard is incomplete';
  end if;
end;
$$;
revoke all on function public.assert_review_tick_security() from public, anon, authenticated;
grant execute on function public.assert_review_tick_security() to service_role;

select public.assert_review_tick_security();

-- ---------------------------------------------------------------------------------------------
-- Playback failure reports (amended 2026-10-03, Anastasia). The seat's browser calls
-- report_review_playback_failure when a review video fails to load, stalls after play, or its signed
-- link has expired and cannot be refreshed. It records the piece, version, preview, error code and a
-- device and browser name from fixed lists (never the raw user agent). A seat reports a preview at
-- most once every 10 minutes and 20 times a day. The first report per preview per Toronto day writes
-- a client-actor activity row, which portal_activity_notify (0078) routes to the agency as one email
-- and one in-app row, never to the client, plus a review_playback_failed inbox event for Ops (plan
-- 5). Later reports that day are recorded only. The seat reads only its own reports.

do $$
begin
  if pg_catalog.to_regclass('public.content_review_previews') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null then
    raise exception '0094 playback reports require review previews (0092) and the portal inbox';
  end if;
end;
$$;

insert into public.activity_event_types (event_type)
values ('review_playback_failed')
on conflict (event_type) do nothing;

create table public.content_review_playback_failures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  content_item_id uuid not null,
  content_version int not null check (content_version > 0),
  -- Not a foreign key: retention deletes previews (0092) and the failure log outlives them.
  preview_id uuid,
  preview_key text not null check (preview_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  error_code text not null check (error_code in ('media_err_aborted','media_err_network',
    'media_err_decode','media_err_src_not_supported','stalled','link_expired','unknown')),
  device text not null check (device in ('iPhone','iPad','Android phone','Android tablet','Mac',
    'Windows PC','Linux PC','Other device')),
  browser text not null check (browser in ('Safari','Chrome','Firefox','Edge','Samsung Internet',
    'In-app browser','Other browser')),
  occurred_at timestamptz not null default pg_catalog.now(),
  notified boolean not null default false,
  foreign key (content_item_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade
);
create index content_review_playback_failures_by_seat
  on public.content_review_playback_failures (auth_user_id, preview_key, occurred_at desc);
create index content_review_playback_failures_by_item
  on public.content_review_playback_failures (content_item_id, preview_key, occurred_at desc);

alter table public.content_review_playback_failures enable row level security;
create policy content_review_playback_failures_seat_read on public.content_review_playback_failures
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));
revoke all on public.content_review_playback_failures from public, anon, authenticated, service_role;
grant select (id, content_item_id, content_version, preview_key, error_code, device, browser, occurred_at)
  on public.content_review_playback_failures to authenticated;
grant select on public.content_review_playback_failures to service_role;

create function public.report_review_playback_failure(
  p_content_id uuid,
  p_content_version int,
  p_preview_key text,
  p_error_code text,
  p_device text,
  p_browser text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_name text;
  v_preview public.content_review_previews%rowtype;
  v_title text;
  v_day date := (pg_catalog.now() at time zone 'America/Toronto')::date;
  v_id uuid;
  v_notify boolean;
  v_what text;
begin
  if v_uid is null then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  if p_content_id is null or p_content_version is null
     or p_preview_key is null or p_preview_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or p_error_code is null or p_error_code not in ('media_err_aborted','media_err_network',
       'media_err_decode','media_err_src_not_supported','stalled','link_expired','unknown')
     or p_device is null or p_device not in ('iPhone','iPad','Android phone','Android tablet','Mac',
       'Windows PC','Linux PC','Other device')
     or p_browser is null or p_browser not in ('Safari','Chrome','Firefox','Edge','Samsung Internet',
       'In-app browser','Other browser') then
    raise exception 'invalid playback report';
  end if;
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  select coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client') into v_name
    from public.client_users cu where cu.auth_user_id = v_uid and cu.client_id = v_item.client_id;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  if not v_item.client_visible or v_item.archived_at is not null
     or v_item.client_visible_version is distinct from p_content_version then
    raise exception 'review_playback_version_not_released';
  end if;
  select p.* into v_preview from public.content_review_previews p
    where p.client_id = v_item.client_id and p.content_item_id = v_item.id
      and p.content_version = p_content_version and p.preview_key = p_preview_key;
  if not found then raise exception 'review_playback_preview_not_found'; end if;

  -- One writer at a time per preview, so the rate limit and the once-a-day notice cannot race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'review-playback:' || v_item.id::text || ':' || p_preview_key, 0));
  if exists (
       select 1 from public.content_review_playback_failures f
       where f.auth_user_id = v_uid and f.content_item_id = v_item.id and f.preview_key = p_preview_key
         and f.occurred_at > pg_catalog.now() - interval '10 minutes')
     or (select pg_catalog.count(*) from public.content_review_playback_failures f
         where f.auth_user_id = v_uid and f.occurred_at > pg_catalog.now() - interval '1 day') >= 20 then
    return pg_catalog.jsonb_build_object('outcome', 'rate_limited');
  end if;

  v_notify := not exists (
    select 1 from public.content_review_playback_failures f
    where f.content_item_id = v_item.id and f.preview_key = p_preview_key and f.notified
      and (f.occurred_at at time zone 'America/Toronto')::date = v_day);

  insert into public.content_review_playback_failures (client_id, auth_user_id, content_item_id,
    content_version, preview_id, preview_key, error_code, device, browser, notified)
  values (v_item.client_id, v_uid, v_item.id, p_content_version, v_preview.id, p_preview_key,
    p_error_code, p_device, p_browser, v_notify)
  returning id into v_id;

  if not v_notify then
    return pg_catalog.jsonb_build_object('outcome', 'recorded', 'failure_id', v_id);
  end if;

  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
      and cv.version = p_content_version;
  v_what := case when v_preview.media_kind = 'video' then 'video didn''t play' else 'pages didn''t load' end;
  -- actor_type 'client' routes this to the agency (0078): one email and one in-app row, never the client.
  insert into public.activity_log (client_id, content_id, content_version, event_type, event_key,
    title, summary, actor_type, actor_name, related_url)
  values (v_item.client_id, v_item.id, p_content_version, 'review_playback_failed',
    'review-playback:' || v_id::text,
    pg_catalog.split_part(v_name, ' ', 1) || '''s ' || v_what || ': ' || p_device || ', ' || p_browser,
    coalesce(v_title, v_item.content_id) || ' v' || p_content_version::text || ', ' || p_preview_key
      || ' (' || pg_catalog.replace(p_error_code, '_', ' ')
      || '). Any further failures on this preview today are logged without another email.',
    'client', v_name,
    'https://www.thedotcreative.co/admin/portal/pieces/' || v_item.content_id)
  on conflict do nothing;
  insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation)
  values (v_item.client_id, 'review-playback:' || v_id::text, 'review_playback_failed',
    'content_review_playback_failure', v_id, 'client', v_name,
    pg_catalog.jsonb_build_object('content_item_id', v_item.id, 'content_key', v_item.content_id,
      'content_version', p_content_version, 'preview_key', p_preview_key,
      'media_kind', v_preview.media_kind, 'error_code', p_error_code,
      'device', p_device, 'browser', p_browser, 'auth_user_id', v_uid),
    false)
  on conflict (client_id, event_key) do nothing;
  return pg_catalog.jsonb_build_object('outcome', 'notified', 'failure_id', v_id);
end;
$$;
revoke all on function public.report_review_playback_failure(uuid,integer,text,text,text,text)
  from public, anon, service_role;
grant execute on function public.report_review_playback_failure(uuid,integer,text,text,text,text)
  to authenticated;

create function public.assert_review_playback_security()
returns void language plpgsql security definer set search_path='' as $$
declare v_def text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid='public.content_review_playback_failures'::pg_catalog.regclass) then
    raise exception 'playback failures need row level security';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname='public' and p.tablename='content_review_playback_failures') <> 1 then
    raise exception 'playback failures must carry exactly the seat read policy';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.content_review_playback_failures','INSERT')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_playback_failures','UPDATE')
     or pg_catalog.has_table_privilege('authenticated','public.content_review_playback_failures','DELETE')
     or pg_catalog.has_any_column_privilege('anon','public.content_review_playback_failures','SELECT')
     or pg_catalog.has_column_privilege('authenticated','public.content_review_playback_failures','auth_user_id','SELECT')
     or pg_catalog.has_column_privilege('authenticated','public.content_review_playback_failures','client_id','SELECT') then
    raise exception 'playback failure table grants are unsafe';
  end if;
  if pg_catalog.has_function_privilege('anon','public.report_review_playback_failure(uuid,integer,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.report_review_playback_failure(uuid,integer,text,text,text,text)','EXECUTE') then
    raise exception 'playback report function grants are unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.report_review_playback_failure(uuid,integer,text,text,text,text)'::pg_catalog.regprocedure) into v_def;
  if v_def is null or v_def not ilike '%client_visible_version%' or v_def not ilike '%client_users%'
     or v_def not ilike '%interval ''10 minutes''%' or v_def not ilike '%f.notified%'
     or v_def not ilike '%portal_inbox_events%' then
    raise exception 'playback report guards drifted';
  end if;
  if not exists (select 1 from public.activity_event_types t where t.event_type='review_playback_failed')
     or exists (select 1 from public.activity_event_types t
                where t.event_type='review_playback_failed' and t.agency_internal) then
    raise exception 'playback failures must reach the agency';
  end if;
end;
$$;
revoke all on function public.assert_review_playback_security() from public, anon, authenticated;
grant execute on function public.assert_review_playback_security() to service_role;

select public.assert_review_playback_security();

-- Cumulative fold, the 0081 rename pattern.
alter function public.assert_portal_security() rename to assert_portal_pre_review_ticks_security;
revoke all on function public.assert_portal_pre_review_ticks_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_review_ticks_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_pre_review_ticks_security();
  perform public.assert_review_tick_security();
  perform public.assert_review_playback_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
