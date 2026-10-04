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

-- Cumulative fold, the 0081 rename pattern.
alter function public.assert_portal_security() rename to assert_portal_pre_review_ticks_security;
revoke all on function public.assert_portal_pre_review_ticks_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_review_ticks_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_pre_review_ticks_security();
  perform public.assert_review_tick_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
