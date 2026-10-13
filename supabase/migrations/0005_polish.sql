-- 0005_polish.sql
-- Post-review polish: a platform tag on recommendations (Strategy badge), a 'posting' Library
-- category, and per-viewer "seen" state for the "new since your last visit" activity markers.
-- Apply AFTER 0001-0004. Additive.

-- === Strategy: an optional platform tag on recommendations (for a platform badge) ===
alter table public.recommendations add column if not exists platform text;
grant select (platform) on public.recommendations to authenticated;

-- === Library: allow a 'posting' category alongside brand + video ===
alter table public.links drop constraint if exists links_category_check;
alter table public.links add constraint links_category_check check (category in ('brand','video','posting'));

-- === "New since your last visit": per-viewer last-seen timestamp ===
-- Both viewers (the client MG and Anastasia) are client_users; each gets one row per client.
create table if not exists public.portal_seen (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (auth_user_id, client_id)
);
alter table public.portal_seen enable row level security;
create policy portal_seen_read on public.portal_seen
  for select using (auth_user_id = (select auth.uid()));
revoke all on public.portal_seen from anon;
revoke all on public.portal_seen from authenticated;
grant select (auth_user_id, client_id, last_seen_at) on public.portal_seen to authenticated;
grant select, insert, update, delete on public.portal_seen to service_role;

-- touch_seen: upsert the current user's last-seen for a client to now(). Called client-side on
-- mount (not during server render / prefetch), so it reflects a real visit. Validates membership.
create or replace function public.touch_seen(p_client_id uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.client_users cu where cu.auth_user_id = v_uid and cu.client_id = p_client_id
  ) then
    raise exception 'not authorized for this client';
  end if;
  insert into public.portal_seen (auth_user_id, client_id, last_seen_at)
  values (v_uid, p_client_id, pg_catalog.now())
  on conflict (auth_user_id, client_id) do update set last_seen_at = pg_catalog.now();
end;
$$;
revoke all on function public.touch_seen(uuid) from public, anon;
grant execute on function public.touch_seen(uuid) to authenticated;
