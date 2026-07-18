-- 0004_surfaces.sql
-- Phase 3: the client-facing surfaces. New tables for Strategy (recommendations), Library
-- (brand + video links), Reports (report_snapshots), and the Ideas dump (content_ideas, the only
-- new CLIENT-WRITABLE table). Calendar / Plan / Communication feed reuse existing tables
-- (content_items, activity_log) and need no schema here.
-- Apply AFTER 0001, 0002, 0003. Same isolation pattern as those: RLS read scoped to my_client_ids(),
-- direct writes revoked from anon + authenticated, service_role owns agency writes, and a
-- security-definer RPC is the only authenticated write path (ideas).

-- =====================================================================================
-- STRATEGY: recommendations (read-only to the client; The Dot authors via service role)
-- =====================================================================================
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null check (category in ('content','platform','growth','copy')),
  created_at timestamptz not null default now()
);
create index if not exists recommendations_by_client on public.recommendations (client_id, created_at desc);

alter table public.recommendations enable row level security;
create policy recommendations_read on public.recommendations
  for select using (client_id in (select public.my_client_ids()));
revoke all on public.recommendations from anon;
revoke all on public.recommendations from authenticated;
grant select (id, client_id, title, body, category, created_at)
  on public.recommendations to authenticated;
grant select, insert, update, delete on public.recommendations to service_role;

-- =====================================================================================
-- LIBRARY: links (brand + video; read-only to the client). No hosted files (PII rule).
-- =====================================================================================
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null check (category in ('brand','video')),
  label text not null,
  url text not null,
  description text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists links_by_client on public.links (client_id, category, sort);

alter table public.links enable row level security;
create policy links_read on public.links
  for select using (client_id in (select public.my_client_ids()));
revoke all on public.links from anon;
revoke all on public.links from authenticated;
grant select (id, client_id, category, label, url, description, sort, created_at)
  on public.links to authenticated;
grant select, insert, update, delete on public.links to service_role;

-- =====================================================================================
-- REPORTS: report_snapshots (per platform, twice-monthly; read-only to the client)
-- =====================================================================================
create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period text not null,                 -- e.g. '2026-07-H1' (first half of July)
  platform text not null check (platform in ('instagram','facebook','youtube','website')),
  metrics jsonb not null default '{}'::jsonb,
  summary text,
  created_at timestamptz not null default now()
);
create index if not exists report_snapshots_by_client on public.report_snapshots (client_id, period desc, platform);

alter table public.report_snapshots enable row level security;
create policy report_snapshots_read on public.report_snapshots
  for select using (client_id in (select public.my_client_ids()));
revoke all on public.report_snapshots from anon;
revoke all on public.report_snapshots from authenticated;
grant select (id, client_id, period, platform, metrics, summary, created_at)
  on public.report_snapshots to authenticated;
grant select, insert, update, delete on public.report_snapshots to service_role;

-- =====================================================================================
-- IDEAS DUMP: content_ideas (CLIENT-WRITABLE via RPC; add + edit)
-- =====================================================================================
create table if not exists public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  author_type text not null check (author_type in ('client','anastasia','agent')),
  author_name text not null,
  title text not null,
  body text,
  status text not null default 'new' check (status in ('new','considering','planned','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_ideas_by_client on public.content_ideas (client_id, created_at desc);

alter table public.content_ideas enable row level security;
create policy content_ideas_read on public.content_ideas
  for select using (client_id in (select public.my_client_ids()));
-- reads only for authenticated; add_idea / edit_idea (security definer) + service role are the writers
revoke all on public.content_ideas from anon;
revoke all on public.content_ideas from authenticated;
grant select (id, client_id, author_type, author_name, title, body, status, created_at, updated_at)
  on public.content_ideas to authenticated;
grant select, insert, update, delete on public.content_ideas to service_role;

-- add_idea: the client (or The Dot on the client's behalf) adds an idea to their own board.
-- Validates membership of p_client_id via client_users, logs an 'idea_captured' activity.
create or replace function public.add_idea(
  p_client_id uuid, p_title text, p_body text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_actor text;
  v_title text := pg_catalog.btrim(p_title);
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_id uuid;
begin
  if v_title is null or v_title = '' then raise exception 'idea title is required'; end if;
  if pg_catalog.char_length(v_title) > 300 then raise exception 'idea title is too long'; end if;
  if v_body is not null and pg_catalog.char_length(v_body) > 4000 then raise exception 'idea is too long'; end if;

  select coalesce(cu.name, cu.email) into v_actor
  from public.client_users cu
  where cu.auth_user_id = v_uid and cu.client_id = p_client_id
  limit 1;
  if v_actor is null then raise exception 'not authorized for this client'; end if;

  insert into public.content_ideas (client_id, author_type, author_name, title, body)
  values (p_client_id, 'client', v_actor, v_title, v_body)
  returning id into v_id;

  insert into public.activity_log (client_id, event_type, title, summary, actor_type, actor_name)
  values (p_client_id, 'idea_captured', 'Idea: ' || v_title, v_body, 'client', v_actor);

  return v_id;
end;
$$;
revoke all on function public.add_idea(uuid,text,text) from public, anon;
grant execute on function public.add_idea(uuid,text,text) to authenticated;

-- edit_idea: any member of the idea's client can edit it (shared board). No activity spam on edits.
create or replace function public.edit_idea(
  p_idea_id uuid, p_title text, p_body text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_client_id uuid;
  v_title text := pg_catalog.btrim(p_title);
  v_body text := nullif(pg_catalog.btrim(p_body), '');
begin
  if v_title is null or v_title = '' then raise exception 'idea title is required'; end if;
  if pg_catalog.char_length(v_title) > 300 then raise exception 'idea title is too long'; end if;
  if v_body is not null and pg_catalog.char_length(v_body) > 4000 then raise exception 'idea is too long'; end if;

  -- lock the idea's client and confirm the caller is a member of it
  select ci.client_id into v_client_id
  from public.content_ideas ci
  join public.client_users cu on cu.client_id = ci.client_id and cu.auth_user_id = v_uid
  where ci.id = p_idea_id
  for update of ci;
  if v_client_id is null then raise exception 'not authorized for this idea'; end if;

  update public.content_ideas
    set title = v_title, body = v_body, updated_at = pg_catalog.now()
  where id = p_idea_id;

  return p_idea_id;
end;
$$;
revoke all on function public.edit_idea(uuid,text,text) from public, anon;
grant execute on function public.edit_idea(uuid,text,text) to authenticated;
