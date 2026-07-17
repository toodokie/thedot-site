-- 0003_copy_blocks_and_comments.sql
-- Phase 2: per-surface labeled copy blocks on content_items + a client comment thread per piece.
-- Apply AFTER 0001 and 0002.

-- === labeled copy blocks ===
-- shape: [{ "label": "Instagram + Facebook caption", "body": "..." }, { "label": "YouTube title", "body": "..." }, ...]
alter table public.content_items
  add column if not exists copy_blocks jsonb not null default '[]'::jsonb;
grant select (copy_blocks) on public.content_items to authenticated;

-- recreate the derived view to expose copy_blocks (drop clears its grants, so re-grant after)
drop view if exists public.content_with_state;
create view public.content_with_state with (security_invoker = true) as
select ci.id, ci.content_id, ci.client_id, ci.title, ci.format, ci.pillar, ci.platforms,
  ci.status, ci.scheduled_date, ci.canva_url, ci.drive_url, ci.version, ci.fact_check,
  ci.client_body, ci.copy_blocks, ci.updated_at,
  (select a.state from public.approvals a
     where a.content_id = ci.id and a.content_version = ci.version
     order by a.created_at desc limit 1) as current_decision
from public.content_items ci;
revoke all on public.content_with_state from public;
revoke all on public.content_with_state from anon, authenticated;
grant select on public.content_with_state to authenticated;

-- === comment thread per piece ===
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  author_type text not null check (author_type in ('client','anastasia','agent')),
  author_name text not null,
  body text not null,
  quoted_text text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (content_id, client_id) references public.content_items(id, client_id) on delete cascade
);
create index if not exists comments_by_content on public.comments (content_id, created_at);

alter table public.comments enable row level security;
create policy comments_read on public.comments for select using (client_id in (select public.my_client_ids()));
-- reads only for authenticated; the add_comment RPC (security definer) + service role are the writers
revoke all on public.comments from anon;
revoke all on public.comments from authenticated;
grant select (id, content_id, client_id, author_type, author_name, body, quoted_text, resolved, created_at)
  on public.comments to authenticated;
grant select, insert, update, delete on public.comments to service_role;

-- allow a 'comment_added' activity event.
-- If the DROP is a no-op because the constraint has a non-default name, find the real name via the
-- Supabase table view (or \d activity_log) and drop it, or the old check will reject comment_added.
alter table public.activity_log drop constraint if exists activity_log_event_type_check;
alter table public.activity_log add constraint activity_log_event_type_check check (event_type in
  ('needs_review','approved','change_requested','scheduled','posted',
   'recommendation_added','monthly_report_added','meeting_email_note_added','idea_captured','comment_added'));

-- === add_comment RPC (the only authenticated writer; validates membership, logs activity) ===
create or replace function public.add_comment(
  p_content_id uuid, p_body text, p_quoted_text text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_client_id uuid;
  v_title text;
  v_version int;
  v_actor text;
  v_body text := pg_catalog.btrim(p_body);
  v_quote text := nullif(pg_catalog.btrim(p_quoted_text), '');
  v_id uuid;
begin
  if v_body is null or v_body = '' then raise exception 'comment body is required'; end if;
  if pg_catalog.char_length(v_body) > 4000 then raise exception 'comment is too long'; end if;
  if v_quote is not null and pg_catalog.char_length(v_quote) > 2000 then raise exception 'quoted text is too long'; end if;

  select ci.client_id, ci.title, ci.version into v_client_id, v_title, v_version
  from public.content_items ci
  join public.client_users cu on cu.client_id = ci.client_id and cu.auth_user_id = v_uid
  where ci.id = p_content_id
  for update of ci;
  if v_client_id is null then raise exception 'not authorized for this content'; end if;

  select coalesce(cu.name, cu.email) into v_actor
  from public.client_users cu where cu.auth_user_id = v_uid and cu.client_id = v_client_id limit 1;

  insert into public.comments (content_id, client_id, author_type, author_name, body, quoted_text)
  values (p_content_id, v_client_id, 'client', coalesce(v_actor, 'Client'), v_body, v_quote)
  returning id into v_id;

  insert into public.activity_log (client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name)
  values (v_client_id, p_content_id, v_version, 'comment_added',
    'Comment: ' || v_title, v_body, 'client', coalesce(v_actor, 'Client'));

  return v_id;
end;
$$;
revoke all on function public.add_comment(uuid,text,text) from public, anon;
grant execute on function public.add_comment(uuid,text,text) to authenticated;
