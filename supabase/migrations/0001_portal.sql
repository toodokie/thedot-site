-- 0001_portal.sql: client portal foundation (tables, RLS, decision RPC, derived view, seed)
-- === tables ===
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'client' check (role in ('client')),
  created_at timestamptz not null default now(),
  unique (client_id, auth_user_id)
);

create table content_items (
  id uuid primary key default gen_random_uuid(),
  content_id text unique not null,
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  format text,
  pillar text,
  platforms text[] not null default '{}',
  scheduled_date date,
  status text not null default 'draft' check (status in ('idea','draft','approved','scheduled','posted')),
  canva_url text,
  drive_url text,
  version int not null default 1 check (version > 0),
  fact_check text check (fact_check is null or fact_check in ('confirmed','needs-confirm','flagged')),
  client_body text,               -- the ONLY client-facing content; internal notes are NOT stored in Supabase
  source_path text,
  updated_at timestamptz not null default now(),
  unique (id, client_id)          -- enables composite tenant FKs
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  client_id uuid not null references clients(id) on delete cascade,
  content_version int not null check (content_version > 0),
  state text not null check (state in ('approved','change_requested')),
  note text,
  decided_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (content_id, client_id) references content_items(id, client_id) on delete cascade
);
-- idempotency: one decision per user per content per version
create unique index approvals_one_per_version on approvals (content_id, content_version, decided_by);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  content_id uuid,
  content_version int,
  event_type text not null check (event_type in
    ('needs_review','approved','change_requested','scheduled','posted',
     'recommendation_added','monthly_report_added','meeting_email_note_added','idea_captured')),
  title text not null,
  summary text,
  actor_type text not null check (actor_type in ('client','anastasia','agent')),
  actor_name text not null,
  related_url text,
  created_at timestamptz not null default now(),
  -- Append-only audit log: no FK on content_id, so it keeps the historical content UUID even after
  -- the content is deleted. Tenant integrity is guaranteed procedurally by the RPC (the only writer);
  -- client deletion still cascades this table via client_id. (Review-3: dropped the content_id FK,
  -- whose ON DELETE SET NULL nulled only content_id and tripped the pairing CHECK below.)
  check ((content_id is null and content_version is null)
      or (content_id is not null and content_version is not null))
);

-- === tenant helper (hardened) ===
create or replace function public.my_client_ids() returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select cu.client_id from public.client_users cu where cu.auth_user_id = (select auth.uid())
$$;
revoke execute on function public.my_client_ids() from public, anon;
grant execute on function public.my_client_ids() to authenticated;

-- === derived read view (respects caller RLS) ===
create view public.content_with_state with (security_invoker = true) as
select ci.id, ci.content_id, ci.client_id, ci.title, ci.format, ci.pillar, ci.platforms,
  ci.status, ci.scheduled_date, ci.canva_url, ci.drive_url, ci.version, ci.fact_check,
  ci.client_body, ci.updated_at,
  (select a.state from public.approvals a
     where a.content_id = ci.id and a.content_version = ci.version
     order by a.created_at desc limit 1) as current_decision
from public.content_items ci;
-- Explicit columns only: no internal_notes (dropped) and no source_path reach the client.

-- === decision RPC (the ONLY writer for approvals + activity) ===
create or replace function public.record_content_decision(
  p_content_id uuid, p_content_version int, p_decision text, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_client_id uuid;
  v_title text;
  v_current_version int;
  v_status text;
  v_note text := nullif(pg_catalog.btrim(p_note), '');  -- normalize: trim, and treat blank as null
  v_actor text;
  v_approval uuid;
begin
  -- Business invariants live HERE. The RPC is granted to authenticated and IS the write boundary,
  -- so the Server Action's checks are UX-only; a direct rpc() call must not bypass these.
  if p_decision not in ('approved','change_requested') then
    raise exception 'invalid decision: %', p_decision;
  end if;
  if p_decision = 'change_requested' and v_note is null then
    raise exception 'change request note is required';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 2000 then
    raise exception 'decision note is too long';
  end if;
  -- Lock the content row and validate membership + current version atomically, so a concurrent
  -- service-role version bump cannot slip a stale decision past the guard. (Review-3: was two
  -- separate unlocked statements.)
  select ci.client_id, ci.title, ci.version, ci.status
    into v_client_id, v_title, v_current_version, v_status
  from public.content_items ci
  join public.client_users cu on cu.client_id = ci.client_id and cu.auth_user_id = v_uid
  where ci.id = p_content_id
  for update of ci;
  if v_client_id is null then raise exception 'not authorized for this content'; end if;
  -- Transition matrix, enforced at the boundary (not inferred from UI form visibility):
  -- approve only while under review (draft); request a change anytime except an unstarted idea.
  if p_decision = 'approved' and v_status <> 'draft' then
    raise exception 'this piece is not open for approval';
  end if;
  if p_decision = 'change_requested' and v_status = 'idea' then
    raise exception 'this piece is not open for review';
  end if;
  if v_current_version is distinct from p_content_version then
    raise exception 'stale content version';
  end if;

  select coalesce(cu.name, cu.email) into v_actor
  from public.client_users cu where cu.auth_user_id = v_uid and cu.client_id = v_client_id limit 1;

  v_approval := null;
  insert into public.approvals (content_id, client_id, content_version, state, note, decided_by)
  values (p_content_id, v_client_id, p_content_version, p_decision, v_note, v_uid)
  on conflict (content_id, content_version, decided_by)
  do update set state = excluded.state, note = excluded.note, created_at = pg_catalog.now()
    where (public.approvals.state, public.approvals.note)
          is distinct from (excluded.state, excluded.note)
  returning id into v_approval;

  if v_approval is null then
    -- exact retry / no change: return the existing decision, log NO new activity
    select a.id into v_approval from public.approvals a
    where a.content_id = p_content_id and a.content_version = p_content_version and a.decided_by = v_uid;
    return v_approval;
  end if;

  insert into public.activity_log (client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name)
  values (v_client_id, p_content_id, p_content_version, p_decision,
    case when p_decision = 'approved' then 'Approved: ' else 'Change requested: ' end || v_title,
    v_note, 'client', coalesce(v_actor, 'Client'));

  return v_approval;
end;
$$;
revoke all on function public.record_content_decision(uuid,int,text,text) from public, anon;
grant execute on function public.record_content_decision(uuid,int,text,text) to authenticated;

-- === RLS: reads only; all writes go through the RPC / service role ===
alter table clients enable row level security;
alter table client_users enable row level security;
alter table content_items enable row level security;
alter table approvals enable row level security;
alter table activity_log enable row level security;

create policy client_read on clients for select using (id in (select public.my_client_ids()));
create policy cu_read on client_users for select using (auth_user_id = (select auth.uid()));
create policy ci_read on content_items for select using (client_id in (select public.my_client_ids()));
create policy appr_read on approvals for select using (client_id in (select public.my_client_ids()));
create policy act_read on activity_log for select using (client_id in (select public.my_client_ids()));

-- === explicit grants ===
-- Do NOT rely on legacy Supabase auto-grants: new projects default to opt-in Data API exposure
-- (2026-05-30). Reads only for authenticated; the security-definer RPC and the service-role sync
-- are the only writers. (Review-3 replaced the earlier partial revoke/grant block with this.)

-- Anonymous users get no portal relations.
revoke all on public.clients, public.client_users, public.content_items,
  public.approvals, public.activity_log, public.content_with_state
  from anon;

-- Clear any project-default authenticated privileges, then grant only what readers need.
revoke all on public.clients, public.client_users, public.content_items,
  public.approvals, public.activity_log, public.content_with_state
  from authenticated;

grant select (id, name, slug, created_at)
  on public.clients to authenticated;

grant select (id, client_id, auth_user_id, email, name, role, created_at)
  on public.client_users to authenticated;

-- source_path (and any internal-only column) is intentionally excluded here.
grant select (id, content_id, client_id, title, format, pillar, platforms, status,
  scheduled_date, canva_url, drive_url, version, fact_check, client_body, updated_at)
  on public.content_items to authenticated;

-- Columns the security-invoker view's approvals subquery reads as the caller.
grant select (content_id, client_id, content_version, state, created_at)
  on public.approvals to authenticated;

grant select (id, client_id, content_id, content_version, event_type, title,
  summary, actor_type, actor_name, related_url, created_at)
  on public.activity_log to authenticated;

grant select on public.content_with_state to authenticated;

-- Minimum service-role (sync) privileges. NOTE: when a later task has the sync emit lifecycle
-- activity events (needs_review / scheduled / posted), also add:
--   grant insert on public.activity_log to service_role;
grant select on public.clients to service_role;
grant select, insert, update, delete on public.content_items to service_role;

-- === seed ===
insert into clients (name, slug) values ('Kanset Services Inc.', 'kanset');
