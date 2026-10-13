-- Durable review drafts (piece page redesign, spec 2026-10-03 section 6, "Edits never disappear").
--
-- Until now a client's unsent edits lived only in one browser, on one device, scoped by version.
-- Maria now reviews on her phone and her desktop, and edits have been lost or refused silently
-- (the ep3 article, 0088 and 0089). This makes a draft a server record:
--
--   * One unsent draft per seat, piece, review target and frame or page anchor. Autosave writes it
--     a few seconds after typing stops; the newest saved_at always wins, so an older tab can never
--     overwrite a newer edit from another device.
--   * A seat reads only its own rows (RLS). Nobody writes the table directly; every write is a
--     SECURITY DEFINER RPC. The agency reads through service_role and cannot change a draft.
--   * Sending composes the drafts into the existing 0081 bundle by calling
--     request_content_edit_bundle in the same transaction, then marks them sent. If the bundle is
--     refused, the transaction rolls back and every draft stays unsent. Per-frame notes on one
--     visual are composed into that visual's single edit, so the bundle contract is unchanged.
--   * Releasing a new version never drops a draft: a trigger marks unsent drafts carried over,
--     keeping their original base version, and raises an agency inbox event.
--   * A refused send is still written to client_request_failures (0089). The new agency function
--     adds an activity row and an inbox event for the attempt and marks her drafts as failed, so
--     every device shows "Couldn't send. Retry". A later successful send resolves the failure.
--   * agency_unsent_review_draft_alerts finds unsent drafts older than 24 hours on a piece due
--     within 3 days, for Agency Ops (plan 5).
--
-- Sent and discarded drafts are kept as rows. She never sees them again; the agency can, and a
-- stale browser copy cannot resurrect a draft that was already sent.
--
-- Amended 2026-10-03 (cross-review):
--   * ack_portal_inbox gains one terminal case, so a review_send_failed event (which requires
--     reconciliation) stops holding the agency inbox cursor once its failure rows are resolved.
--   * Carry-over and retry-success activity is agency housekeeping: flagged agency_internal so
--     portal_activity_notify queues no in-app row or email for anyone.

begin;

set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regprocedure('public.request_content_edit_bundle(uuid,integer,jsonb,text,uuid)') is null
     or pg_catalog.to_regclass('public.content_edit_review_bundles') is null
     or pg_catalog.to_regclass('public.client_request_failures') is null
     or pg_catalog.to_regclass('public.content_review_assets') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null
     or pg_catalog.to_regprocedure('public.portal_require_client_action(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0093 requires the review bundle (0081), request failures (0089) and the portal security fold';
  end if;
end;
$$;

select public.assert_portal_security();

-- activity_log.event_type references activity_event_types (0008); without these rows the first
-- carry-over or failure would roll back the release or the refusal log.
insert into public.activity_event_types (event_type)
values ('review_drafts_carried_over'), ('review_send_failed'), ('review_send_retry_succeeded')
on conflict (event_type) do nothing;

-- Agency housekeeping raises no notification (cross-review 2026-10-03). Every activity row runs
-- portal_activity_notify, and portal_notification_recipient() (0015) sends every non-client actor
-- ('anastasia', 'agent') to the client: an in_app outbox row addressed to Maria that she never sees
-- but scripts/portal-notification-audit.ts counts. No actor_type avoids it ('client' instead emails
-- the agency), so the routing is per event type: activity_event_types.agency_internal, and the
-- trigger returns before enqueueing anything for a flagged type.
--
-- 0092 already added the column, re-created portal_activity_notify (0078's body plus the
-- agency_internal early return) and made act_read hide flagged rows from client seats. This
-- migration does not replace either: the column add is a no-op after 0092, and the guard below
-- refuses to continue unless 0092's trigger body is the one in place. The activity row itself is
-- still written, so the audit trail is unchanged.
alter table public.activity_event_types
  add column if not exists agency_internal boolean not null default false;

do $$
begin
  if pg_catalog.to_regprocedure('public.agency_internal_activity(uuid,uuid)') is null
     or pg_catalog.pg_get_functiondef('public.portal_activity_notify()'::pg_catalog.regprocedure)
          not ilike '%t.agency_internal%' then
    raise exception '0093 requires the agency_internal activity routing from 0092';
  end if;
end;
$$;

-- Carry-over and retry success are records for the agency, not news for anyone. review_send_failed
-- is deliberately NOT flagged: it is a client-actor row that emails the agency (decision 1).
update public.activity_event_types set agency_internal = true
  where event_type in ('review_drafts_carried_over', 'review_send_retry_succeeded');

-- Two refusal reasons the durable send path adds: drafts changed on another device between load
-- and send, and a send that never reached the server (reported when the connection returns).
alter table public.client_request_failures
  drop constraint client_request_failures_reason_code_check;
alter table public.client_request_failures
  add constraint client_request_failures_reason_code_check check (reason_code in (
    'cannot_submit_requests',
    'expired_review',
    'empty_bundle',
    'draft_too_long',
    'draft_invalid',
    'url_invalid',
    'note_too_long',
    'piece_unavailable',
    'version_stale',
    'revision_in_progress',
    'stale_or_locked',
    'rate_limited',
    'write_failed',
    'drafts_changed',
    'network_unreachable'
  ));

create table public.content_review_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- No cascade on purpose: removing a login must never silently remove her unsent words.
  auth_user_id uuid not null references auth.users(id),
  content_item_id uuid not null,
  -- The version the draft was written against. It stays the original version when the draft is
  -- carried over, and moves only when she keeps or edits the draft on the new version.
  base_version int not null check (base_version > 0),
  target_kind text not null check (target_kind in ('copy_block','asset','design_link')),
  target_key text not null check (target_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  -- '' is the whole block or a general note on the whole visual; 'frame:3' or 'page:2' is one
  -- frame or page of a visual.
  anchor text not null default '' check (anchor = '' or anchor ~ '^(frame|page):[1-9][0-9]{0,2}$'),
  anchor_label text check (anchor_label is null or (
    pg_catalog.char_length(anchor_label) between 1 and 80 and anchor_label !~ '[[:cntrl:]]')),
  target_label text not null check (pg_catalog.char_length(target_label) between 1 and 120),
  url_snapshot text check (url_snapshot is null or (
    url_snapshot ~ '^https://[^[:space:]]+$' and pg_catalog.char_length(url_snapshot) <= 2048)),
  quoted_text text check (quoted_text is null or pg_catalog.char_length(quoted_text) <= 50000),
  -- Kept well above the 50,000 a send allows, so an over-long draft is still SAVED; the send then
  -- refuses it with a reason and her text survives.
  body text not null check (pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 200000),
  status text not null default 'unsent' check (status in ('unsent','sent','discarded')),
  -- The device's save time, clamped to at most five minutes ahead of the server. Newest wins.
  saved_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  carried_over_at timestamptz,
  carried_over_to_version int,
  sent_at timestamptz,
  sent_bundle_id uuid references public.content_edit_review_bundles(id),
  discarded_at timestamptz,
  discard_reason text check (discard_reason is null
    or discard_reason in ('client_discarded','reverted','emptied')),
  send_failed_at timestamptz,
  last_send_error text check (last_send_error is null or pg_catalog.char_length(last_send_error) <= 64),
  last_send_attempt_id uuid,
  send_attempts int not null default 0 check (send_attempts >= 0),
  foreign key (content_item_id, client_id, base_version)
    references public.content_item_versions(content_item_id, client_id, version),
  check ((status = 'sent') = (sent_at is not null and sent_bundle_id is not null)),
  check ((status = 'discarded') = (discarded_at is not null and discard_reason is not null)),
  check ((carried_over_at is null) = (carried_over_to_version is null)),
  check (carried_over_to_version is null or carried_over_to_version > base_version),
  check (anchor = '' or target_kind = 'asset')
);

create unique index content_review_drafts_one_unsent
  on public.content_review_drafts (client_id, auth_user_id, content_item_id, target_kind, target_key, anchor)
  where status = 'unsent';
create index content_review_drafts_unsent_by_item
  on public.content_review_drafts (content_item_id, saved_at) where status = 'unsent';
create index content_review_drafts_by_seat_item
  on public.content_review_drafts (auth_user_id, content_item_id, saved_at desc);

alter table public.content_review_drafts enable row level security;
create policy content_review_drafts_seat_read on public.content_review_drafts
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));

revoke all on public.content_review_drafts from public, anon, authenticated, service_role;
grant select (
  id, content_item_id, base_version, target_kind, target_key, anchor, anchor_label, target_label,
  url_snapshot, quoted_text, body, status, saved_at, created_at, updated_at, carried_over_at,
  carried_over_to_version, sent_at, discarded_at, discard_reason, send_failed_at, last_send_error,
  send_attempts
) on public.content_review_drafts to authenticated;
grant select on public.content_review_drafts to service_role;

create function public.portal_review_draft_json(p public.content_review_drafts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p.id, 'content_item_id', p.content_item_id, 'base_version', p.base_version,
    'target_kind', p.target_kind, 'target_key', p.target_key, 'anchor', p.anchor,
    'anchor_label', p.anchor_label, 'target_label', p.target_label, 'url_snapshot', p.url_snapshot,
    'quoted_text', p.quoted_text, 'body', p.body, 'status', p.status, 'saved_at', p.saved_at,
    'updated_at', p.updated_at, 'carried_over_at', p.carried_over_at,
    'carried_over_to_version', p.carried_over_to_version, 'send_failed_at', p.send_failed_at,
    'last_send_error', p.last_send_error)
$$;
revoke all on function public.portal_review_draft_json(public.content_review_drafts)
  from public, anon, authenticated, service_role;

-- Autosave. A base version below the released one is accepted and stored as carried over, so an
-- edit typed offline before a release still reaches the server instead of being refused.
create function public.save_review_draft(
  p_content_id uuid,
  p_base_version int,
  p_target_kind text,
  p_target_key text,
  p_anchor text,
  p_anchor_label text,
  p_target_label text,
  p_url_snapshot text,
  p_quoted_text text,
  p_body text,
  p_saved_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_blocks jsonb;
  v_kind text := pg_catalog.btrim(p_target_kind);
  v_key text := pg_catalog.lower(pg_catalog.btrim(p_target_key));
  v_anchor text := coalesce(pg_catalog.lower(pg_catalog.btrim(p_anchor)), '');
  v_anchor_label text := nullif(pg_catalog.btrim(p_anchor_label), '');
  v_label text := pg_catalog.btrim(p_target_label);
  v_url text := nullif(pg_catalog.btrim(p_url_snapshot), '');
  v_saved timestamptz := least(coalesce(p_saved_at, pg_catalog.now()), pg_catalog.now() + interval '5 minutes');
  v_row public.content_review_drafts%rowtype;
  v_carried boolean;
  v_count int;
begin
  if v_uid is null or p_content_id is null or p_base_version is null or p_base_version < 1 then
    raise exception 'invalid review draft';
  end if;
  -- FOR SHARE serialises against a release, which takes the row FOR UPDATE, so a draft is either
  -- saved before the release (and carried by the trigger) or after it (and carried here).
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id for share;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  perform public.portal_require_client_action(v_item.client_id, 'can_submit_requests');
  if not v_item.client_visible or v_item.client_visible_version is null
     or v_item.archived_at is not null or v_item.publication_locked_version is not null
     or v_item.status = 'posted' then
    raise exception 'review_draft_locked';
  end if;
  if p_base_version > v_item.client_visible_version then
    raise exception 'review_draft_stale_version';
  end if;
  if v_kind is null or v_kind not in ('copy_block','asset','design_link')
     or v_key is null or v_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or v_label is null or pg_catalog.char_length(v_label) not between 1 and 120
     or p_body is null or pg_catalog.char_length(pg_catalog.btrim(p_body)) not between 1 and 200000
     or (p_quoted_text is not null and pg_catalog.char_length(p_quoted_text) > 50000)
     or (v_anchor <> '' and (v_kind <> 'asset' or v_anchor !~ '^(frame|page):[1-9][0-9]{0,2}$'))
     or (v_anchor_label is not null and (
       pg_catalog.char_length(v_anchor_label) > 80 or v_anchor_label ~ '[[:cntrl:]]'))
     or (v_url is not null and (
       v_url !~ '^https://[^[:space:]]+$' or pg_catalog.char_length(v_url) > 2048))
     or (v_kind = 'design_link' and v_key not in ('canva','drive')) then
    raise exception 'invalid review draft';
  end if;

  select cv.copy_blocks into v_blocks from public.content_item_versions cv
    where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
      and cv.version = p_base_version;
  if not found then raise exception 'review_draft_target_not_found'; end if;
  if v_kind = 'copy_block' and not exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(v_blocks, '[]'::jsonb)) b(value)
    where b.value->>'key' = v_key
  ) then
    raise exception 'review_draft_target_not_found';
  end if;
  if v_kind = 'asset' and not exists (
    select 1 from public.content_review_assets a
    where a.client_id = v_item.client_id and a.content_item_id = v_item.id
      and a.content_version = p_base_version and a.asset_key = v_key
  ) then
    raise exception 'review_draft_target_not_found';
  end if;

  v_carried := p_base_version < v_item.client_visible_version;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'review-draft:' || v_uid::text || ':' || v_item.id::text, 0));
  select d.* into v_row from public.content_review_drafts d
    where d.client_id = v_item.client_id and d.auth_user_id = v_uid
      and d.content_item_id = v_item.id and d.target_kind = v_kind and d.target_key = v_key
      and d.anchor = v_anchor and d.status = 'unsent'
    for update;
  if found then
    if v_row.saved_at > v_saved then
      return pg_catalog.jsonb_build_object(
        'outcome', 'stale', 'draft', public.portal_review_draft_json(v_row));
    end if;
    update public.content_review_drafts d set
      base_version = p_base_version,
      anchor_label = v_anchor_label,
      target_label = v_label,
      url_snapshot = v_url,
      quoted_text = p_quoted_text,
      body = p_body,
      saved_at = v_saved,
      updated_at = pg_catalog.now(),
      carried_over_at = case when v_carried then coalesce(d.carried_over_at, pg_catalog.now()) end,
      carried_over_to_version = case when v_carried then v_item.client_visible_version end
    where d.id = v_row.id
    returning d.* into v_row;
  else
    select pg_catalog.count(*) into v_count from public.content_review_drafts d
      where d.client_id = v_item.client_id and d.auth_user_id = v_uid
        and d.content_item_id = v_item.id and d.status = 'unsent';
    if v_count >= 100 then raise exception 'too_many_review_drafts'; end if;
    insert into public.content_review_drafts (
      client_id, auth_user_id, content_item_id, base_version, target_kind, target_key, anchor,
      anchor_label, target_label, url_snapshot, quoted_text, body, saved_at,
      carried_over_at, carried_over_to_version
    ) values (
      v_item.client_id, v_uid, v_item.id, p_base_version, v_kind, v_key, v_anchor,
      v_anchor_label, v_label, v_url, p_quoted_text, p_body, v_saved,
      case when v_carried then pg_catalog.now() end,
      case when v_carried then v_item.client_visible_version end
    ) returning * into v_row;
  end if;
  return pg_catalog.jsonb_build_object('outcome', 'saved', 'draft', public.portal_review_draft_json(v_row));
end;
$$;
revoke all on function public.save_review_draft(
  uuid,integer,text,text,text,text,text,text,text,text,timestamptz
) from public, anon, service_role;
grant execute on function public.save_review_draft(
  uuid,integer,text,text,text,text,text,text,text,text,timestamptz
) to authenticated;

-- Explicit discard (confirmed in the UI), or the editor clearing a draft that went back to the
-- original text or to nothing. A discard older than the stored draft is refused as stale, so a
-- discard on one device never throws away a newer edit made on another.
create function public.discard_review_draft(
  p_content_id uuid,
  p_target_kind text,
  p_target_key text,
  p_anchor text,
  p_reason text,
  p_saved_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_row public.content_review_drafts%rowtype;
  v_key text := pg_catalog.lower(pg_catalog.btrim(p_target_key));
  v_anchor text := coalesce(pg_catalog.lower(pg_catalog.btrim(p_anchor)), '');
  v_saved timestamptz := least(coalesce(p_saved_at, pg_catalog.now()), pg_catalog.now() + interval '5 minutes');
begin
  if v_uid is null or p_content_id is null or p_reason is null
     or p_reason not in ('client_discarded','reverted','emptied') then
    raise exception 'invalid review draft discard';
  end if;
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  perform public.portal_require_client_action(v_item.client_id, 'can_submit_requests');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'review-draft:' || v_uid::text || ':' || v_item.id::text, 0));
  select d.* into v_row from public.content_review_drafts d
    where d.client_id = v_item.client_id and d.auth_user_id = v_uid
      and d.content_item_id = v_item.id and d.target_kind = p_target_kind
      and d.target_key = v_key and d.anchor = v_anchor and d.status = 'unsent'
    for update;
  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found');
  end if;
  if v_row.saved_at > v_saved then
    return pg_catalog.jsonb_build_object(
      'outcome', 'stale', 'draft', public.portal_review_draft_json(v_row));
  end if;
  update public.content_review_drafts d set
    status = 'discarded', discarded_at = pg_catalog.now(), discard_reason = p_reason,
    updated_at = pg_catalog.now()
  where d.id = v_row.id
  returning d.* into v_row;
  return pg_catalog.jsonb_build_object(
    'outcome', 'discarded', 'draft', public.portal_review_draft_json(v_row));
end;
$$;
revoke all on function public.discard_review_draft(uuid,text,text,text,text,timestamptz)
  from public, anon, service_role;
grant execute on function public.discard_review_draft(uuid,text,text,text,text,timestamptz)
  to authenticated;

-- Send. Every unsent draft of this seat on the released version must be included, so a draft
-- added on another device cannot be silently left behind. The bundle itself is the unchanged
-- 0081 function: if it raises, this whole transaction rolls back and nothing is marked sent.
create function public.send_review_drafts(
  p_content_id uuid,
  p_content_version int,
  p_draft_ids uuid[],
  p_note text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.content_items%rowtype;
  v_ids uuid[];
  v_found int;
  v_existing public.content_edit_review_bundles%rowtype;
  v_edits jsonb;
  v_result jsonb;
  v_bundle_id uuid;
  v_retried int;
  v_title text;
begin
  select pg_catalog.array_agg(distinct x) into v_ids
    from pg_catalog.unnest(p_draft_ids) as u(x) where x is not null;
  if v_uid is null or p_content_id is null or p_idempotency_key is null
     or p_content_version is null or p_content_version < 1
     or coalesce(pg_catalog.cardinality(v_ids), 0) not between 1 and 50
     or pg_catalog.cardinality(v_ids) <> pg_catalog.cardinality(p_draft_ids) then
    raise exception 'invalid review draft send';
  end if;
  select ci.* into v_item from public.content_items ci where ci.id = p_content_id for update;
  if not found then raise exception 'portal_action_not_allowed' using errcode = '42501'; end if;
  perform public.portal_require_client_action(v_item.client_id, 'can_submit_requests');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'review-draft:' || v_uid::text || ':' || v_item.id::text, 0));

  -- A retry of a send that already landed (the answer was lost on the way back to her phone).
  select b.* into v_existing from public.content_edit_review_bundles b
    where b.client_id = v_item.client_id and b.requested_by = v_uid
      and b.idempotency_key = p_idempotency_key;
  -- A true retry names exactly drafts that this bundle already sent. Any other id (a new unsent
  -- draft, a discarded one, one sent elsewhere, or someone else's) means the key was reused for a
  -- different request: refuse it and leave every draft as it is.
  if found then
    select pg_catalog.count(*) into v_found from public.content_review_drafts d
      where d.id = any(v_ids) and d.client_id = v_item.client_id and d.auth_user_id = v_uid
        and d.content_item_id = v_item.id and d.status = 'sent'
        and d.sent_bundle_id = v_existing.id;
    if v_found <> pg_catalog.cardinality(v_ids) then
      raise exception 'idempotency key reused with different request';
    end if;
    return pg_catalog.jsonb_build_object('bundle_id', v_existing.id,
      'request_ids', v_existing.request_ids, 'outcome', 'unchanged',
      'sent_draft_ids', pg_catalog.to_jsonb(v_ids));
  end if;

  select pg_catalog.count(*) into v_found from public.content_review_drafts d
    where d.id = any(v_ids) and d.client_id = v_item.client_id and d.auth_user_id = v_uid
      and d.content_item_id = v_item.id and d.status = 'unsent';
  if v_found <> pg_catalog.cardinality(v_ids) then raise exception 'drafts_changed'; end if;
  perform 1 from public.content_review_drafts d where d.id = any(v_ids) for update;
  if exists (
    select 1 from public.content_review_drafts d
    where d.id = any(v_ids) and d.base_version <> p_content_version
  ) then
    raise exception 'drafts_carried_over';
  end if;
  if exists (
    select 1 from public.content_review_drafts d
    where d.client_id = v_item.client_id and d.auth_user_id = v_uid
      and d.content_item_id = v_item.id and d.status = 'unsent'
      and d.base_version = p_content_version and not (d.id = any(v_ids))
  ) then
    raise exception 'drafts_changed';
  end if;

  select pg_catalog.jsonb_agg(g.edit order by g.first_created, g.target_kind, g.target_key)
    into v_edits
  from (
    select d.target_kind, d.target_key, pg_catalog.min(d.created_at) as first_created,
      pg_catalog.jsonb_build_object(
        'target_kind', d.target_kind,
        'target_key', d.target_key,
        'target_label', (pg_catalog.array_agg(d.target_label order by (d.anchor <> ''), d.created_at))[1],
        'url_snapshot', (pg_catalog.array_agg(d.url_snapshot order by d.saved_at desc))[1],
        'proposed_text', case
          when pg_catalog.count(*) = 1 and pg_catalog.bool_and(d.anchor = '') then pg_catalog.min(d.body)
          else pg_catalog.string_agg(
            case when d.anchor = '' then 'General note: '
              else coalesce(d.anchor_label,
                pg_catalog.initcap(pg_catalog.split_part(d.anchor, ':', 1)) || ' '
                  || pg_catalog.split_part(d.anchor, ':', 2)) || ': '
            end || pg_catalog.btrim(d.body),
            E'\n\n'
            order by (d.anchor <> ''), pg_catalog.split_part(d.anchor, ':', 1),
              (nullif(pg_catalog.split_part(d.anchor, ':', 2), ''))::int)
        end) as edit
    from public.content_review_drafts d
    where d.id = any(v_ids)
    group by d.target_kind, d.target_key
  ) g;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_edits) e(value)
    where pg_catalog.char_length(pg_catalog.btrim(e.value->>'proposed_text')) > 50000
  ) then
    raise exception 'review_draft_too_long';
  end if;

  v_result := public.request_content_edit_bundle(
    v_item.id, p_content_version, v_edits, p_note, p_idempotency_key);
  v_bundle_id := (v_result->>'bundle_id')::uuid;

  select pg_catalog.count(*) into v_retried from public.content_review_drafts d
    where d.id = any(v_ids) and d.send_failed_at is not null;
  update public.content_review_drafts d set
    status = 'sent', sent_at = pg_catalog.now(), sent_bundle_id = v_bundle_id,
    updated_at = pg_catalog.now()
  where d.id = any(v_ids);

  if v_retried > 0 then
    update public.client_request_failures f set
      resolved_at = pg_catalog.now(), resolved_by = 'system:retry',
      resolution_note = 'Sent on retry in review bundle ' || v_bundle_id::text
    where f.client_id = v_item.client_id and f.content_item_id = v_item.id
      and f.requested_by = v_uid and f.resolved_at is null
      and exists (
        select 1 from public.content_review_drafts d
        where d.id = any(v_ids) and d.target_kind = f.target_kind and d.target_key = f.target_key);
    select cv.title into v_title from public.content_item_versions cv
      where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
        and cv.version = p_content_version;
    insert into public.activity_log (client_id, content_id, content_version, event_type, event_key,
      title, summary, actor_type, actor_name)
    values (v_item.client_id, v_item.id, p_content_version, 'review_send_retry_succeeded',
      'review-send-retry:' || v_bundle_id::text,
      'Edits sent after a failed attempt: ' || coalesce(v_title, v_item.content_id),
      pg_catalog.format('%s of the edits in this send had failed before. They are now with The Dot.', v_retried),
      'agent', 'Review drafts')
    on conflict do nothing;
  end if;

  return v_result || pg_catalog.jsonb_build_object('sent_draft_ids', pg_catalog.to_jsonb(v_ids));
end;
$$;
revoke all on function public.send_review_drafts(uuid,integer,uuid[],text,uuid)
  from public, anon, service_role;
grant execute on function public.send_review_drafts(uuid,integer,uuid[],text,uuid) to authenticated;

-- Carry-over (spec 6.2). Fires on every path that moves the released pointer: portal-admin ready,
-- courtesy-release, applied-release, re-share.
create function public.portal_review_drafts_carry_over()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_groups jsonb;
  v_group jsonb;
  v_title text;
  v_count int;
  v_key text;
begin
  if new.client_visible_version is null
     or new.client_visible_version is not distinct from old.client_visible_version then
    return null;
  end if;
  with moved as (
    update public.content_review_drafts d set
      carried_over_at = pg_catalog.now(),
      carried_over_to_version = new.client_visible_version,
      updated_at = pg_catalog.now()
    where d.content_item_id = new.id and d.client_id = new.client_id and d.status = 'unsent'
      and d.base_version < new.client_visible_version
      and d.carried_over_to_version is distinct from new.client_visible_version
    returning d.auth_user_id, d.id, d.base_version
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'auth_user_id', g.auth_user_id, 'n', g.n, 'from_version', g.from_version, 'ids', g.ids)),
    '[]'::jsonb)
  into v_groups
  from (
    select m.auth_user_id, pg_catalog.count(*)::int as n, pg_catalog.min(m.base_version) as from_version,
      pg_catalog.array_agg(m.id order by m.id) as ids
    from moved m group by m.auth_user_id
  ) g;
  if pg_catalog.jsonb_array_length(v_groups) = 0 then return null; end if;

  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = new.id and cv.client_id = new.client_id
      and cv.version = new.client_visible_version;
  for v_group in select value from pg_catalog.jsonb_array_elements(v_groups) loop
    v_count := (v_group->>'n')::int;
    v_key := 'review-drafts-carried:' || new.id::text || ':v' || new.client_visible_version::text
      || ':' || (v_group->>'auth_user_id');
    insert into public.activity_log (client_id, content_id, content_version, event_type, event_key,
      title, summary, actor_type, actor_name)
    values (new.client_id, new.id, new.client_visible_version, 'review_drafts_carried_over', v_key,
      'Unsent edits carried over: ' || coalesce(v_title, new.content_id),
      pg_catalog.format('%s unsent %s written against version %s kept for review against version %s.',
        v_count, case when v_count = 1 then 'edit' else 'edits' end,
        v_group->>'from_version', new.client_visible_version),
      'agent', 'Review drafts')
    on conflict do nothing;
    insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
      actor_type, actor_name, payload, requires_reconciliation)
    values (new.client_id, v_key, 'review_drafts_carried_over', 'content_item', new.id,
      'system', 'Review drafts',
      pg_catalog.jsonb_build_object('content_id', new.id,
        'from_version', (v_group->>'from_version')::int,
        'to_version', new.client_visible_version,
        'auth_user_id', v_group->>'auth_user_id',
        'draft_ids', v_group->'ids', 'draft_count', v_count),
      false)
    on conflict (client_id, event_key) do nothing;
  end loop;
  return null;
end;
$$;
revoke all on function public.portal_review_drafts_carry_over()
  from public, anon, authenticated, service_role;
create trigger content_items_review_drafts_carry_over
  after update of client_visible_version on public.content_items
  for each row
  when (new.client_visible_version is distinct from old.client_visible_version)
  execute function public.portal_review_drafts_carry_over();

-- Raise a refused send in Agency Ops (spec 6.3, 8). Called by the app right after it writes the
-- 0089 failure rows for an attempt. Idempotent per attempt.
create function public.agency_record_review_send_failure(
  p_attempt_id uuid,
  p_draft_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first public.client_request_failures%rowtype;
  v_count int;
  v_title text;
  v_content_key text;
  v_piece text;
  v_marked int := 0;
  v_key text := 'review-send-failed:' || p_attempt_id::text;
begin
  if p_attempt_id is null then raise exception 'invalid send failure'; end if;
  select f.* into v_first from public.client_request_failures f
    where f.attempt_id = p_attempt_id order by f.created_at, f.id limit 1;
  if not found then raise exception 'send failure attempt not found'; end if;
  select (pg_catalog.count(*) filter (where f.proposed_text is not null))::int into v_count
    from public.client_request_failures f where f.attempt_id = p_attempt_id;
  if v_first.content_item_id is not null then
    select ci.content_id, cv.title into v_content_key, v_title
    from public.content_items ci
    left join public.content_item_versions cv
      on cv.content_item_id = ci.id and cv.client_id = ci.client_id
     and cv.version = coalesce(v_first.content_version, ci.client_visible_version)
    where ci.id = v_first.content_item_id and ci.client_id = v_first.client_id;
  end if;
  v_piece := coalesce(v_content_key, v_first.content_id);

  insert into public.activity_log (client_id, content_id, content_version, event_type, event_key,
    title, summary, actor_type, actor_name, related_url)
  values (v_first.client_id, v_first.content_item_id,
    case when v_first.content_item_id is null then null else v_first.content_version end,
    'review_send_failed', v_key,
    'Edits not sent: ' || coalesce(v_title, v_piece, 'a piece'),
    pg_catalog.format('%s could not send %s (%s). The text is saved in the portal and in the failure log.',
      coalesce(nullif(pg_catalog.btrim(v_first.requester_name), ''), 'The client'),
      case when v_count = 0 then 'an edit' when v_count = 1 then 'one edit' else v_count || ' edits' end,
      v_first.reason_code),
    'client', coalesce(nullif(pg_catalog.btrim(v_first.requester_name), ''), 'Client'),
    case when v_piece is not null
      then 'https://www.thedotcreative.co/admin/portal/pieces/' || v_piece end)
  on conflict do nothing;

  insert into public.portal_inbox_events (client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation)
  values (v_first.client_id, v_key, 'review_send_failed', 'client_request_failure_attempt',
    p_attempt_id, 'client', coalesce(nullif(pg_catalog.btrim(v_first.requester_name), ''), 'Client'),
    pg_catalog.jsonb_build_object('content_id', v_first.content_item_id, 'content_key', v_piece,
      'base_version', v_first.content_version, 'reason_code', v_first.reason_code,
      'edit_count', v_count, 'draft_ids', pg_catalog.to_jsonb(coalesce(p_draft_ids, '{}'::uuid[]))),
    true)
  on conflict (client_id, event_key) do nothing;

  if v_first.requested_by is not null and coalesce(pg_catalog.cardinality(p_draft_ids), 0) > 0 then
    update public.content_review_drafts d set
      send_failed_at = pg_catalog.now(), last_send_error = v_first.reason_code,
      last_send_attempt_id = p_attempt_id, send_attempts = d.send_attempts + 1,
      updated_at = pg_catalog.now()
    where d.id = any(p_draft_ids) and d.client_id = v_first.client_id
      and d.auth_user_id = v_first.requested_by and d.status = 'unsent'
      and d.last_send_attempt_id is distinct from p_attempt_id;
    get diagnostics v_marked = row_count;
  end if;
  return pg_catalog.jsonb_build_object('attempt_id', p_attempt_id, 'drafts_marked', v_marked);
end;
$$;
revoke all on function public.agency_record_review_send_failure(uuid,uuid[])
  from public, anon, authenticated;
grant execute on function public.agency_record_review_send_failure(uuid,uuid[]) to service_role;

-- The agency inbox cursor (amended 2026-10-03). ack_portal_inbox (latest body 0014) refuses to move
-- past any requires_reconciliation event except a content_change_request in a terminal status, so
-- the review_send_failed event above would freeze the inbox for every consumer from the first
-- refused send. Same body as 0014 plus one terminal case: a send failure whose failure rows are all
-- resolved (send_review_drafts resolves them on a successful retry; the agency sets resolved_at by
-- hand when it applies her text, as 0089 records). Plan 5 widens this again for
-- agency_inbox_resolutions and must keep this clause; assert_review_draft_security checks it.
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

-- Spec 8: "Maria has 2 unsent edits on X". One row per seat and piece that has at least one
-- unsent draft last saved more than 24 hours ago, on an unposted piece whose planned date is on or
-- before today + 3 (Toronto), overdue pieces included.
create function public.agency_unsent_review_draft_alerts(p_now timestamptz default null)
returns table (
  client_id uuid,
  content_item_id uuid,
  content_id text,
  title text,
  planned_date date,
  auth_user_id uuid,
  seat_name text,
  unsent_count int,
  stale_count int,
  carried_count int,
  oldest_saved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.client_id, ci.id, ci.content_id, coalesce(cv.title, ci.content_id), ci.planned_date,
    d.auth_user_id, coalesce(nullif(pg_catalog.btrim(cu.name), ''), 'Client'),
    pg_catalog.count(*)::int,
    (pg_catalog.count(*) filter (
      where d.saved_at < coalesce(p_now, pg_catalog.now()) - interval '24 hours'))::int,
    (pg_catalog.count(*) filter (where d.carried_over_at is not null))::int,
    pg_catalog.min(d.saved_at)
  from public.content_review_drafts d
  join public.content_items ci on ci.id = d.content_item_id and ci.client_id = d.client_id
  left join public.content_item_versions cv
    on cv.content_item_id = ci.id and cv.client_id = ci.client_id
   and cv.version = ci.client_visible_version
  left join public.client_users cu on cu.client_id = d.client_id and cu.auth_user_id = d.auth_user_id
  where d.status = 'unsent'
    and ci.archived_at is null and ci.publication_locked_version is null and ci.status <> 'posted'
    and ci.planned_date is not null
    and ci.planned_date <= (coalesce(p_now, pg_catalog.now()) at time zone 'America/Toronto')::date + 3
  group by d.client_id, ci.id, ci.content_id, cv.title, ci.planned_date, d.auth_user_id, cu.name
  having pg_catalog.count(*) filter (
    where d.saved_at < coalesce(p_now, pg_catalog.now()) - interval '24 hours') > 0
  order by ci.planned_date, ci.content_id
$$;
revoke all on function public.agency_unsent_review_draft_alerts(timestamptz)
  from public, anon, authenticated;
grant execute on function public.agency_unsent_review_draft_alerts(timestamptz) to service_role;

create function public.assert_review_draft_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fn text;
  v_def text;
  v_constraint text;
begin
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.content_review_drafts'::pg_catalog.regclass) then
    raise exception 'content_review_drafts RLS is disabled';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'content_review_drafts') <> 1
     or not exists (
       select 1 from pg_catalog.pg_policies p
       where p.schemaname = 'public' and p.tablename = 'content_review_drafts'
         and p.policyname = 'content_review_drafts_seat_read' and p.cmd = 'SELECT'
         and p.roles = array['authenticated']::name[]
         and p.qual like '%auth.uid()%' and p.qual like '%my_client_ids()%') then
    raise exception 'content_review_drafts must carry exactly the seat read policy';
  end if;
  if pg_catalog.has_any_column_privilege('anon', 'public.content_review_drafts', 'SELECT')
     or not pg_catalog.has_any_column_privilege('authenticated', 'public.content_review_drafts', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.content_review_drafts', 'auth_user_id', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.content_review_drafts', 'last_send_attempt_id', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_drafts', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_drafts', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_review_drafts', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.content_review_drafts', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_drafts', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_drafts', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_review_drafts', 'DELETE') then
    raise exception 'review draft table privileges are unsafe';
  end if;

  foreach v_fn in array array[
    'public.save_review_draft(uuid,integer,text,text,text,text,text,text,text,text,timestamptz)',
    'public.discard_review_draft(uuid,text,text,text,text,timestamptz)',
    'public.send_review_drafts(uuid,integer,uuid[],text,uuid)'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid = v_fn::pg_catalog.regprocedure and p.prosecdef
        and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
    ) then
      raise exception 'review draft function is not a hardened security definer: %', v_fn;
    end if;
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'review draft client function grants are unsafe: %', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.agency_record_review_send_failure(uuid,uuid[])',
    'public.agency_unsent_review_draft_alerts(timestamptz)'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid = v_fn::pg_catalog.regprocedure and p.prosecdef
        and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
    ) then
      raise exception 'review draft agency function is not a hardened security definer: %', v_fn;
    end if;
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'review draft agency function grants are unsafe: %', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.portal_review_draft_json(public.content_review_drafts)',
    'public.portal_review_drafts_carry_over()'
  ] loop
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'review draft internal function is exposed: %', v_fn;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(
    'public.send_review_drafts(uuid,integer,uuid[],text,uuid)'::pg_catalog.regprocedure) into v_def;
  -- The send must go through the one reviewed bundle path and keep both refusal guards.
  if v_def not like '%public.request_content_edit_bundle(%'
     or v_def not like '%drafts_changed%' or v_def not like '%drafts_carried_over%' then
    raise exception 'review draft send guards drifted';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.save_review_draft(uuid,integer,text,text,text,text,text,text,text,text,timestamptz)'::pg_catalog.regprocedure)
    into v_def;
  if v_def not like '%can_submit_requests%' or v_def not like '%review_draft_locked%'
     or v_def not like '%v_row.saved_at > v_saved%' then
    raise exception 'review draft save guards drifted';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_items'::pg_catalog.regclass
      and t.tgname = 'content_items_review_drafts_carry_over' and not t.tgisinternal
  ) then
    raise exception 'review draft carry-over trigger is missing';
  end if;
  if (select pg_catalog.count(*) from public.activity_event_types t
      where t.event_type in ('review_drafts_carried_over','review_send_failed',
        'review_send_retry_succeeded')) <> 3 then
    raise exception 'review draft activity event types are missing';
  end if;
  -- Amended 2026-10-03: housekeeping stays out of every notification path, and the inbox cursor
  -- can move past a resolved send failure.
  if (select pg_catalog.count(*) from public.activity_event_types t
      where t.event_type in ('review_drafts_carried_over','review_send_retry_succeeded')
        and t.agency_internal) <> 2
     or pg_catalog.pg_get_functiondef('public.portal_activity_notify()'::pg_catalog.regprocedure)
          not ilike '%t.agency_internal%' then
    raise exception 'review draft housekeeping would notify';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.ack_portal_inbox(text,uuid,bigint)'::pg_catalog.regprocedure) into v_def;
  if v_def not like '%content_change_request%'
     or v_def not like '%client_request_failure_attempt%'
     or v_def not like '%f.resolved_at is null%' then
    raise exception 'ack_portal_inbox would freeze on a send failure';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.ack_portal_inbox(text,uuid,bigint)', 'EXECUTE') then
    raise exception 'ack_portal_inbox grants changed';
  end if;
  select pg_catalog.pg_get_constraintdef(con.oid) into v_constraint
  from pg_catalog.pg_constraint con
  where con.conrelid = 'public.client_request_failures'::pg_catalog.regclass
    and con.conname = 'client_request_failures_reason_code_check';
  if coalesce(v_constraint, '') not like '%network_unreachable%'
     or coalesce(v_constraint, '') not like '%drafts_changed%'
     or coalesce(v_constraint, '') not like '%write_failed%' then
    raise exception 'client request failure reasons are missing the durable draft codes';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.assert_review_draft_security()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.assert_review_draft_security()', 'EXECUTE') then
    raise exception 'review draft assertion is exposed';
  end if;
end;
$$;
revoke all on function public.assert_review_draft_security() from public, anon, authenticated;
grant execute on function public.assert_review_draft_security() to service_role;

select public.assert_review_draft_security();

-- Cumulative fold, the 0081 rename pattern: whatever assert_portal_security() is now (0092's
-- slice91 + review previews, or 0090's fold if plan 2 has not landed) keeps running under a new
-- name, and the review draft assertion joins it.
alter function public.assert_portal_security() rename to assert_portal_pre_review_drafts_security;
revoke all on function public.assert_portal_pre_review_drafts_security() from public, anon, authenticated;
grant execute on function public.assert_portal_pre_review_drafts_security() to service_role;

create function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_pre_review_drafts_security();
  perform public.assert_review_draft_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
