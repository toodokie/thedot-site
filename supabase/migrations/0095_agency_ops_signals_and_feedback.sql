-- Agency Ops signals and the client feedback card (piece page redesign, plan 5; spec 8, 9.1).
--
--   * portal_feedback_responses: one answer per seat per prompt. The seat reads only its own row,
--     so the card never returns after she answers, on any device. Nobody writes the table directly;
--     submit_portal_feedback is the only writer. An answer writes a client activity row (agency
--     email + agency in-app through portal_activity_notify, never the client) and an agency inbox
--     event.
--   * agency_inbox_resolutions: the agency marks a client signal handled. Rows are never deleted.
--   * agency_open_client_signals: what My Tasks shows. A send failure closes itself once a retry
--     resolves its failure rows; carried drafts close themselves once she keeps or discards them;
--     feedback stays open until the agency marks it handled.
--   * agency_raise_unsent_draft_alert_events: the hourly cron turns 0093's live unsent-draft
--     alert into one inbox event per seat, piece and Toronto day.
--   * ack_portal_inbox: an agency-resolved signal no longer blocks the inbox cursor. 0093 already
--     lets a send failure whose rows are all resolved through; that clause is kept verbatim.
begin;
set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.portal_inbox_consumers') is null
     or pg_catalog.to_regclass('public.agency_actors') is null
     or pg_catalog.to_regclass('public.client_request_failures') is null
     or pg_catalog.to_regclass('public.content_review_drafts') is null
     or pg_catalog.to_regprocedure('public.agency_unsent_review_draft_alerts(timestamptz)') is null
     or pg_catalog.to_regprocedure('public.portal_activity_notify()') is null
     or pg_catalog.to_regprocedure('public.portal_note_grammar_safe(text)') is null
     or pg_catalog.to_regprocedure('public.portal_require_client_action(uuid,text)') is null then
    raise exception '0095 requires durable review drafts (0093), request failures (0089) and the portal inbox';
  end if;
end;
$$;

select public.assert_portal_security();

-- activity_log.event_type references activity_event_types (0008).
insert into public.activity_event_types (event_type)
values ('portal_feedback_submitted')
on conflict (event_type) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Feedback card answers (spec 9.1).
create table public.portal_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null check (prompt_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  rating int not null check (rating between 1 and 5),
  comment text check (comment is null or pg_catalog.char_length(comment) between 1 and 2000),
  -- The piece she was looking at when she answered, for context only. Not a foreign key, so an
  -- archived or removed piece never removes her answer.
  content_item_id uuid,
  seat_name text not null check (pg_catalog.char_length(seat_name) between 1 and 200),
  created_at timestamptz not null default pg_catalog.now(),
  unique (client_id, auth_user_id, prompt_key)
);
alter table public.portal_feedback_responses enable row level security;
create policy portal_feedback_responses_read_own on public.portal_feedback_responses
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));
revoke all on public.portal_feedback_responses from public, anon, authenticated, service_role;
grant select (client_id, prompt_key, rating, comment, created_at)
  on public.portal_feedback_responses to authenticated;
grant select on public.portal_feedback_responses to service_role;

create function public.submit_portal_feedback(
  p_client_id uuid,
  p_prompt_key text,
  p_rating int,
  p_comment text,
  p_content_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_comment text := nullif(pg_catalog.btrim(p_comment), '');
  v_row public.portal_feedback_responses%rowtype;
  v_key text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  -- Same boundary as every client writer (0013): a seat of this client, launch and mutations on.
  perform public.portal_require_client_action(p_client_id, 'member');
  if p_client_id is null or p_prompt_key is null or p_prompt_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid feedback';
  end if;
  -- Newlines and tabs are fine in a comment; every other control character is refused.
  if v_comment is not null and (pg_catalog.char_length(v_comment) > 2000
     or pg_catalog.regexp_replace(v_comment, E'[\\n\\r\\t]', '', 'g') ~ '[[:cntrl:]]') then
    raise exception 'invalid feedback comment';
  end if;
  select coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client') into v_name
    from public.client_users cu
    where cu.auth_user_id = v_uid and cu.client_id = p_client_id;
  if not found then raise exception 'not authorized for this client'; end if;
  if p_content_item_id is not null and not exists (
    select 1 from public.content_items ci
    where ci.id = p_content_item_id and ci.client_id = p_client_id
      and ci.client_visible_version is not null
  ) then
    raise exception 'invalid feedback piece';
  end if;

  insert into public.portal_feedback_responses (
    client_id, auth_user_id, prompt_key, rating, comment, content_item_id, seat_name)
  values (p_client_id, v_uid, p_prompt_key, p_rating, v_comment, p_content_item_id, v_name)
  on conflict (client_id, auth_user_id, prompt_key) do nothing
  returning * into v_row;
  if not found then
    -- One prompt per seat: a second answer (another device, a double tap) changes nothing.
    return pg_catalog.jsonb_build_object('outcome', 'already_submitted');
  end if;

  v_key := 'portal-feedback:' || v_row.id::text;
  -- actor_type 'client' routes this to the agency (0078): one email and one in-app row, never the client.
  -- Every seat of the client can read activity_log, so this row carries no rating and no comment.
  -- The answer lives only in portal_feedback_responses (own-seat RLS) and the agency inbox payload.
  insert into public.activity_log (client_id, event_type, event_key, title, summary,
    actor_type, actor_name, related_url)
  values (p_client_id, 'portal_feedback_submitted', v_key,
    'Review page feedback received',
    'See Agency Ops.',
    'client', v_name, 'https://www.thedotcreative.co/admin/portal')
  on conflict do nothing;
  insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation)
  values (p_client_id, v_key, 'portal_feedback_submitted', 'portal_feedback_response', v_row.id,
    'client', v_name,
    pg_catalog.jsonb_build_object('prompt_key', p_prompt_key, 'rating', p_rating,
      'comment', v_comment, 'content_item_id', p_content_item_id, 'auth_user_id', v_uid),
    false)
  on conflict (client_id, event_key) do nothing;
  return pg_catalog.jsonb_build_object('outcome', 'submitted', 'submitted_at', v_row.created_at);
end;
$$;
revoke all on function public.submit_portal_feedback(uuid,text,int,text,uuid)
  from public, anon, service_role;
grant execute on function public.submit_portal_feedback(uuid,text,int,text,uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Agency handling of client signals (spec 8).
create table public.agency_inbox_resolutions (
  event_id uuid primary key references public.portal_inbox_events(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  resolved_at timestamptz not null default pg_catalog.now(),
  resolved_by uuid not null references public.agency_actors(id),
  note text check (note is null or pg_catalog.char_length(note) between 1 and 1000),
  idempotency_key text not null unique
    check (pg_catalog.char_length(idempotency_key) between 1 and 200)
);
alter table public.agency_inbox_resolutions enable row level security;
revoke all on public.agency_inbox_resolutions from public, anon, authenticated, service_role;
grant select on public.agency_inbox_resolutions to service_role;

create function public.agency_resolve_inbox_event(
  p_event_id uuid,
  p_note text,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_event public.portal_inbox_events%rowtype;
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_row public.agency_inbox_resolutions%rowtype;
begin
  select * into v_actor from public.agency_actors a where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;
  if v_note is not null and (pg_catalog.char_length(v_note) > 1000
     or not public.portal_note_grammar_safe(v_note)) then
    raise exception 'invalid resolution note';
  end if;
  select * into v_event from public.portal_inbox_events e where e.id = p_event_id;
  if not found then raise exception 'inbox event not found'; end if;
  if v_event.event_type not in ('review_send_failed', 'review_drafts_carried_over',
      'portal_feedback_submitted', 'review_unsent_drafts_due', 'review_playback_failed') then
    raise exception 'not a client signal';
  end if;
  insert into public.agency_inbox_resolutions (event_id, client_id, resolved_by, note, idempotency_key)
  values (v_event.id, v_event.client_id, v_actor.id, v_note, p_idempotency_key)
  on conflict (event_id) do nothing
  returning * into v_row;
  if not found then
    -- Already handled (another tab, a double click): report the first resolution, change nothing.
    select * into v_row from public.agency_inbox_resolutions r where r.event_id = v_event.id;
    return pg_catalog.jsonb_build_object('event_id', v_row.event_id, 'resolved_at', v_row.resolved_at,
      'outcome', 'already_resolved');
  end if;
  return pg_catalog.jsonb_build_object('event_id', v_row.event_id, 'resolved_at', v_row.resolved_at,
    'outcome', 'resolved');
end;
$$;
revoke all on function public.agency_resolve_inbox_event(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.agency_resolve_inbox_event(uuid,text,text,text) to service_role;

-- What My Tasks shows. review_unsent_drafts_due is left out on purpose: My Tasks renders the live
-- 0093 alert instead, which clears itself the moment she sends or discards.
create function public.agency_open_client_signals(p_limit int default 100)
returns table (
  event_id uuid,
  seq bigint,
  client_id uuid,
  event_type text,
  created_at timestamptz,
  actor_name text,
  content_item_id uuid,
  content_key text,
  title text,
  payload jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.seq, e.client_id, e.event_type, e.created_at, e.actor_name,
    ci.id, ci.content_id, coalesce(cv.title, ci.content_id), e.payload
  from public.portal_inbox_events e
  cross join lateral (
    select case when v.raw ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then v.raw::uuid end as item_id
    from (select coalesce(e.payload->>'content_item_id', e.payload->>'content_id') as raw) v
  ) p
  left join public.content_items ci on ci.id = p.item_id and ci.client_id = e.client_id
  left join public.content_item_versions cv
    on cv.content_item_id = ci.id and cv.client_id = ci.client_id
   and cv.version = coalesce(ci.client_visible_version, ci.working_version)
  where e.event_type in ('review_send_failed', 'review_drafts_carried_over', 'portal_feedback_submitted',
      'review_playback_failed')
    and not exists (select 1 from public.agency_inbox_resolutions r where r.event_id = e.id)
    and (
      e.event_type in ('portal_feedback_submitted', 'review_playback_failed')
      or (e.event_type = 'review_send_failed' and exists (
        select 1 from public.client_request_failures f
        where f.client_id = e.client_id and f.attempt_id = e.object_id and f.resolved_at is null))
      or (e.event_type = 'review_drafts_carried_over' and exists (
        select 1 from public.content_review_drafts d
        where d.client_id = e.client_id and d.content_item_id = p.item_id
          and d.auth_user_id::text = e.payload->>'auth_user_id'
          and d.status = 'unsent'
          and d.base_version < (e.payload->>'to_version')::int))
    )
  order by e.seq desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;
revoke all on function public.agency_open_client_signals(int) from public, anon, authenticated;
grant execute on function public.agency_open_client_signals(int) to service_role;

-- Hourly cron (spec 8): "Maria has 2 unsent edits on X", once per seat, piece and Toronto day.
create function public.agency_raise_unsent_draft_alert_events(p_now timestamptz default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, pg_catalog.now());
  v_day date := (v_now at time zone 'America/Toronto')::date;
  v_alert record;
  v_inserted int;
  v_count int := 0;
begin
  for v_alert in select * from public.agency_unsent_review_draft_alerts(v_now) loop
    insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
      actor_type, actor_name, payload, requires_reconciliation)
    values (v_alert.client_id,
      'review-unsent-drafts:' || v_alert.content_item_id::text || ':' || v_alert.auth_user_id::text
        || ':' || v_day::text,
      'review_unsent_drafts_due', 'content_item', v_alert.content_item_id, 'system', 'Review drafts',
      pg_catalog.jsonb_build_object('content_item_id', v_alert.content_item_id,
        'content_key', v_alert.content_id, 'title', v_alert.title,
        'planned_date', v_alert.planned_date, 'auth_user_id', v_alert.auth_user_id,
        'seat_name', v_alert.seat_name, 'unsent_count', v_alert.unsent_count,
        'stale_count', v_alert.stale_count, 'oldest_saved_at', v_alert.oldest_saved_at),
      false)
    on conflict (client_id, event_key) do nothing;
    get diagnostics v_inserted = row_count;
    v_count := v_count + v_inserted;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.agency_raise_unsent_draft_alert_events(timestamptz)
  from public, anon, authenticated;
grant execute on function public.agency_raise_unsent_draft_alert_events(timestamptz) to service_role;

-- Same body as 0093 (0014 plus the send-failure case plan 3 added) plus one terminal case: an
-- agency-resolved signal. The client_request_failure_attempt clause is 0093's, kept verbatim;
-- assert_review_draft_security() checks it, so dropping it fails the fold below.
create or replace function public.ack_portal_inbox(
  p_consumer_key text, p_client_id uuid, p_seq bigint
) returns bigint language plpgsql security definer set search_path = '' as $$
declare v_current bigint;
begin
  if not exists(select 1 from public.portal_inbox_events e
    where e.client_id = p_client_id and e.seq = p_seq) then
    raise exception 'event does not belong to client'; end if;
  if exists(select 1 from public.portal_inbox_events e
    where e.client_id = p_client_id and e.seq <= p_seq and e.requires_reconciliation
      and not (e.object_type = 'content_change_request' and exists(
        select 1 from public.content_change_requests r where r.id = e.object_id and r.client_id = e.client_id
          and r.status in ('applied','conflicted','rejected','superseded')))
      and not exists(select 1 from public.agency_inbox_resolutions ar where ar.event_id = e.id)
      and not (e.object_type = 'client_request_failure_attempt' and not exists(
        select 1 from public.client_request_failures f
        where f.client_id = e.client_id and f.attempt_id = e.object_id and f.resolved_at is null)))
  then raise exception 'unresolved reconciliation events cannot be cursor-acknowledged'; end if;
  update public.portal_inbox_consumers set last_ack_seq = greatest(last_ack_seq, p_seq),
    updated_at = pg_catalog.now() where consumer_key = p_consumer_key and client_id = p_client_id
    returning last_ack_seq into v_current;
  if not found then raise exception 'unknown inbox consumer'; end if;
  return v_current;
end;
$$;
revoke all on function public.ack_portal_inbox(text,uuid,bigint) from public, anon, authenticated;
grant execute on function public.ack_portal_inbox(text,uuid,bigint) to service_role;

-- ---------------------------------------------------------------------------------------------
create function public.assert_agency_ops_feedback_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actual text[];
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.portal_feedback_responses'::pg_catalog.regclass)
     or not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.agency_inbox_resolutions'::pg_catalog.regclass) then
    raise exception 'agency ops feedback RLS disabled';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'portal_feedback_responses') <> 1
     or exists (select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'agency_inbox_resolutions') then
    raise exception 'agency ops feedback policy set changed';
  end if;
  if exists (select 1 from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.table_name in ('portal_feedback_responses', 'agency_inbox_resolutions')
      and (tp.grantee in ('PUBLIC', 'anon')
        or (tp.grantee in ('authenticated', 'service_role') and tp.privilege_type <> 'SELECT')
        or (tp.table_name = 'agency_inbox_resolutions' and tp.grantee = 'authenticated'))) then
    raise exception 'agency ops feedback table privilege';
  end if;
  select pg_catalog.array_agg(cp.column_name::text order by cp.column_name) into v_actual
    from information_schema.column_privileges cp
    where cp.table_schema = 'public' and cp.table_name = 'portal_feedback_responses'
      and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  if v_actual is distinct from array['client_id','comment','created_at','prompt_key','rating'] then
    raise exception 'unsafe feedback grants: %', v_actual;
  end if;
  if not pg_catalog.has_function_privilege('authenticated',
       'public.submit_portal_feedback(uuid,text,integer,text,uuid)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.submit_portal_feedback(uuid,text,integer,text,uuid)', 'EXECUTE') then
    raise exception 'feedback writer boundary changed';
  end if;
  if pg_catalog.has_function_privilege('authenticated', 'public.agency_resolve_inbox_event(uuid,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.agency_resolve_inbox_event(uuid,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_open_client_signals(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.agency_open_client_signals(integer)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_raise_unsent_draft_alert_events(timestamp with time zone)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.agency_raise_unsent_draft_alert_events(timestamp with time zone)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE') then
    raise exception 'agency signal function exposed to a client role';
  end if;
  if pg_catalog.pg_get_functiondef('public.ack_portal_inbox(text,uuid,bigint)'::pg_catalog.regprocedure)
       not like '%content_change_request%'
     or pg_catalog.pg_get_functiondef('public.ack_portal_inbox(text,uuid,bigint)'::pg_catalog.regprocedure)
       not like '%agency_inbox_resolutions%' then
    raise exception 'ack_portal_inbox lost a terminal rule';
  end if;
  if pg_catalog.pg_get_functiondef('public.submit_portal_feedback(uuid,text,integer,text,uuid)'::pg_catalog.regprocedure)
       not like '%portal_require_client_action(p_client_id, ''member'')%'
     or pg_catalog.pg_get_functiondef('public.submit_portal_feedback(uuid,text,integer,text,uuid)'::pg_catalog.regprocedure)
       like '%of 5%' then
    raise exception 'feedback writer lost its client boundary or leaks the answer into activity_log';
  end if;
  if not exists (select 1 from public.activity_event_types t where t.event_type = 'portal_feedback_submitted') then
    raise exception 'portal_feedback_submitted event type missing';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_agency_ops_feedback_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_agency_ops_feedback_security()', 'EXECUTE') then
    raise exception 'agency ops feedback assertion exposed';
  end if;
end;
$$;
revoke all on function public.assert_agency_ops_feedback_security() from public, anon, authenticated;
grant execute on function public.assert_agency_ops_feedback_security() to service_role;

select public.assert_agency_ops_feedback_security();

-- ---------------------------------------------------------------------------------------------
-- Media signals (amended 2026-10-03, Anastasia).
--   * review_playback_failed (0094): listed by agency_open_client_signals until Done.
--   * agency_release_media_alerts: every piece currently with Maria (released and visible, not
--     archived, status draft / approved / scheduled, and not yet live and verified on every required
--     destination) whose released version has no review asset, no portal preview and no design link.
--     It clears itself when media is attached or the piece goes live. An approved no-media override
--     (0092, reason starting "Approved by Anastasia:") on that exact released version silences it
--     (Anastasia, 2026-10-03); a newer released version without media or its own override alerts
--     again, because the status is read for client_visible_version only. override_reason is kept in
--     the result for shape stability and is always null here.
do $$
begin
  if pg_catalog.to_regprocedure('public.agency_release_media_status(uuid,integer)') is null
     or pg_catalog.to_regclass('public.content_review_playback_failures') is null
     or not exists (select 1 from public.activity_event_types t where t.event_type = 'review_playback_failed') then
    raise exception '0095 media signals require the release media guard (0092) and playback reports (0094)';
  end if;
end;
$$;

create function public.agency_release_media_alerts()
returns table (
  client_id uuid,
  content_item_id uuid,
  content_key text,
  title text,
  content_version int,
  planned_date date,
  waiting_on text,
  override_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select ci.client_id, ci.id, ci.content_id, coalesce(cv.title, ci.content_id), ci.client_visible_version,
    ci.planned_date,
    case when ci.status = 'draft' then 'review' else 'posting' end,
    m.status->>'override_reason'
  from public.content_items ci
  join public.content_item_versions cv
    on cv.content_item_id = ci.id and cv.client_id = ci.client_id and cv.version = ci.client_visible_version
  cross join lateral (
    select public.agency_release_media_status(ci.id, ci.client_visible_version) as status
  ) m
  where ci.client_visible and ci.archived_at is null and ci.client_visible_version is not null
    and ci.status in ('draft', 'approved', 'scheduled')
    and coalesce((m.status->>'review_assets')::int, 0) = 0
    and coalesce((m.status->>'previews')::int, 0) = 0
    and not coalesce((m.status->>'design_link')::boolean, false)
    and (m.status->>'override_reason') is null
    and not (
      exists (
        select 1 from public.content_publication_targets t
        where t.client_id = ci.client_id and t.content_id = ci.id
          and t.content_version = ci.client_visible_version and t.required)
      and not exists (
        select 1 from public.content_publication_targets t
        where t.client_id = ci.client_id and t.content_id = ci.id
          and t.content_version = ci.client_visible_version and t.required
          and not (t.status = 'live' and t.reconciliation_status = 'verified')))
  order by ci.planned_date nulls last, ci.content_id
$$;
revoke all on function public.agency_release_media_alerts() from public, anon, authenticated;
grant execute on function public.agency_release_media_alerts() to service_role;

create function public.assert_agency_media_signal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.has_function_privilege('anon', 'public.agency_release_media_alerts()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.agency_release_media_alerts()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.agency_release_media_alerts()', 'EXECUTE') then
    raise exception 'release media alerts are exposed to a client role';
  end if;
  if pg_catalog.pg_get_functiondef('public.agency_open_client_signals(integer)'::pg_catalog.regprocedure)
       not like '%review_playback_failed%'
     or pg_catalog.pg_get_functiondef('public.agency_resolve_inbox_event(uuid,text,text,text)'::pg_catalog.regprocedure)
       not like '%review_playback_failed%' then
    raise exception 'playback failures dropped out of the agency signals';
  end if;
  if pg_catalog.pg_get_functiondef('public.agency_release_media_alerts()'::pg_catalog.regprocedure)
       not like '%override_reason'') is null%' then
    raise exception 'an approved no-media override must silence the media alert';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_agency_media_signal_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_agency_media_signal_security()', 'EXECUTE') then
    raise exception 'agency media signal assertion exposed';
  end if;
end;
$$;
revoke all on function public.assert_agency_media_signal_security() from public, anon, authenticated;
grant execute on function public.assert_agency_media_signal_security() to service_role;

select public.assert_agency_media_signal_security();

-- Cumulative fold, the 0081 and 0093 rename pattern: whatever assert_portal_security() is now
-- keeps running under a new name, and this slice's assertion joins it.
alter function public.assert_portal_security() rename to assert_portal_pre_ops_feedback_security;
revoke all on function public.assert_portal_pre_ops_feedback_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_ops_feedback_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_pre_ops_feedback_security();
  perform public.assert_agency_ops_feedback_security();
  perform public.assert_agency_media_signal_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
