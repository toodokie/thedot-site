-- When the portal refuses a client edit, nobody but the client finds out.
--
-- She sees a message. We receive nothing: no row, no activity, no flag. So from the agency side a
-- piece she tried and failed to change is indistinguishable from a piece she read and was content
-- with. Silence means both things. That is how the ep3 article nearly published against edits she
-- had tried to send: 0088 raised the character limit that refused her, but the only reason anyone
-- knew she had hit it was that she texted Anastasia.
--
-- This table closes that. Every refusal on the client edit path writes here, INCLUDING her text, so
-- a refused edit stops being a lost edit: we can apply her wording ourselves instead of asking her
-- to write it twice, which also keeps us inside the never-re-ask rule. Today her words survive only
-- in her own browser, on one device.
--
-- Agency-only by construction. RLS is on with no policies, so the client roles cannot reach it even
-- though it holds the client's own text; only service_role, which bypasses RLS, reads or writes it.
-- One row per attempted block, grouped by attempt_id, mirroring how content_change_requests stores
-- one row per edit rather than one per bundle.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.clients') is null
     or pg_catalog.to_regclass('public.content_items') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0089 requires the portal content system';
  end if;
end;
$$;

select public.assert_portal_security();

create table public.client_request_failures (
  id uuid primary key default gen_random_uuid(),
  -- Groups the rows of one attempted send, so a five-block bundle that was refused reads as one
  -- event rather than five unrelated ones.
  attempt_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete set null,
  -- Kept as text as well, so a row stays readable if the piece is ever removed.
  content_id text,
  content_version integer,
  target_kind text,
  target_key text,
  target_label text,
  -- Why it was refused, as a stable code. The free-text message is what she actually saw.
  reason_code text not null,
  client_message text,
  -- Her wording. The whole point of the table.
  proposed_text text,
  proposed_length integer,
  requested_by uuid,
  requester_name text,
  created_at timestamptz not null default pg_catalog.now(),
  -- Closed when someone has dealt with it: applied her text, or established it needed nothing.
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  constraint client_request_failures_reason_code_check check (reason_code in (
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
    'write_failed'
  )),
  -- A bound, not a correctness rule: this must never become a way to fill the database. Well above
  -- the 50,000 the edit path itself allows, so a refusal never silently loses the tail of her text.
  constraint client_request_failures_text_bound check (
    proposed_text is null or pg_catalog.char_length(proposed_text) <= 200000),
  constraint client_request_failures_length_sane check (
    proposed_length is null or proposed_length between 0 and 10000000),
  constraint client_request_failures_resolution_paired check (
    (resolved_at is null) = (resolved_by is null))
);

create index client_request_failures_open_idx
  on public.client_request_failures (client_id, created_at desc)
  where resolved_at is null;
create index client_request_failures_attempt_idx
  on public.client_request_failures (attempt_id);

alter table public.client_request_failures enable row level security;
-- Deliberately no policies: this is agency-only. RLS on with zero policies denies every role that
-- respects it, and service_role bypasses RLS. Explicit revokes so a future default-grant change
-- cannot quietly expose the client's own refused text back to the client roles.
revoke all on public.client_request_failures from public, anon, authenticated;
grant select, insert, update on public.client_request_failures to service_role;

create or replace function public.assert_client_request_failure_security() returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_relid oid := pg_catalog.to_regclass('public.client_request_failures');
begin
  if v_relid is null then
    raise exception 'client_request_failures is missing';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = v_relid) then
    raise exception 'client_request_failures must have row level security enabled';
  end if;
  -- A policy here would be a mistake, not a feature: the table holds the client's text but is an
  -- agency record, and the client already has her own copy in the request she was trying to send.
  if exists (select 1 from pg_catalog.pg_policies p
             where p.schemaname = 'public' and p.tablename = 'client_request_failures') then
    raise exception 'client_request_failures must have no policies; it is agency-only';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.client_request_failures', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.client_request_failures', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.client_request_failures', 'INSERT') then
    raise exception 'client_request_failures grants are wrong';
  end if;
end;
$$;

revoke all on function public.assert_client_request_failure_security() from public, anon, authenticated;
grant execute on function public.assert_client_request_failure_security() to service_role;

select public.assert_client_request_failure_security();

create or replace function public.assert_portal_slice88_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice87_security();
  perform public.assert_portal_edit_length_security();
end;
$$;
revoke all on function public.assert_portal_slice88_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice88_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice88_security();
  perform public.assert_client_request_failure_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
