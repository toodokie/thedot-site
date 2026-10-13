-- Applying Maria's own edits and moving the piece forward is not a review request, but the
-- database had no way to say so. `mark_content_ready` welds two separate things together:
--   1. promote this version to the one the client sees
--   2. tell the client a package is waiting for her review
-- The client rule (PORTAL-OPERATIONS-PLAYBOOK section 5) forbids (2) once she has decided, and
-- `record_content_courtesy_release` (0043) refuses to run until (1) has happened, because it
-- requires client_visible_version = working_version. So the only route from "her edits are
-- applied" to "the piece is approved" ran through the one command that emails her.
--
-- The documented workaround was to switch `client_alerts` off, release, switch them back on.
-- That is hand-maintenance standing in for a missing operation, and it leaves a window in which
-- any other client email for that tenant is silently dropped. It also still wrote "Needs review"
-- into her activity feed, which the switch does not suppress.
--
-- This adds the missing operation: promote, resolve the requests, and record the agency release,
-- in one transaction, with no review arming at any point and therefore no way to email her.
--
-- Implementation note, and the objection to it. The single `needs_review` insert lives four
-- layers down in `portal_unchecked_mark_content_ready`, behind an early-return retry contract
-- (0006/0007), a fact-check gate (0027) and two wrappers that carry the unresolved-request check
-- (0081) and the prepared-to-applied resolution (0014). Reproducing that chain would duplicate three layers of guards and invite
-- exactly the drift this codebase keeps getting bitten by. Lifting the insert into an outer
-- layer would break the retry contract, because the outer layer cannot see whether the core
-- actually promoted. So the insert is made conditional on a transaction-local setting instead.
-- A setting used as control flow is a smell and a reviewer should push on it. It is chosen
-- because it changes the behaviour of no existing caller: the flag is unset everywhere except
-- inside the new function, `set_config(..., true)` cannot outlive its transaction, and only
-- `service_role` can reach any of these functions at all. The new function also verifies
-- afterwards that no review was armed, so a failure of the mechanism refuses rather than emails.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.portal_unchecked_mark_content_ready(uuid,integer)') is null
     or pg_catalog.to_regprocedure('public.mark_content_ready(uuid,integer)') is null
     or pg_catalog.to_regprocedure(
          'public.record_content_courtesy_release(uuid,integer,text,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0085 requires the release and courtesy-release system';
  end if;
end;
$$;

select public.assert_portal_security();

-- 1. Make the review arming conditional, and nothing else. The rewrite is done against the live
--    definition with a drift guard, in the style of 0083, so it cannot depend on how the
--    definition happens to be formatted or on which earlier migration last replaced it.
do $rewrite$
declare
  v_def text;
  v_old text := $old$  insert into public.activity_log (
    client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name
  ) values (
    v_ci.client_id, v_ci.id, p_content_version, 'needs_review',
    'Needs review: ' || v_title, null, 'agent', 'The Dot'
  );$old$;
  v_new text := $new$  -- Arming the client's review is the caller's decision, not an automatic
  -- consequence of promoting a version. record_agency_applied_release (0085) promotes without
  -- arming, because applying edits Maria already submitted must never ask her to look again.
  if coalesce(pg_catalog.current_setting('portal.suppress_review_arm', true), 'off') <> 'on' then
    insert into public.activity_log (
      client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name
    ) values (
      v_ci.client_id, v_ci.id, p_content_version, 'needs_review',
      'Needs review: ' || v_title, null, 'agent', 'The Dot'
    );
  end if;$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_unchecked_mark_content_ready(uuid,integer)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'review arming drifted; 0085 will not rewrite it blindly';
  end if;
  execute pg_catalog.replace(v_def, v_old, v_new);
end;
$rewrite$;

revoke all on function public.portal_unchecked_mark_content_ready(uuid,integer)
  from public, anon, authenticated, service_role;

-- 2. The missing operation.
-- The signature mirrors record_content_courtesy_release deliberately, so the agency tooling
-- resolves the piece the same way and nothing special-cases this command.
create or replace function public.record_agency_applied_release(
  p_content_id uuid,
  p_content_version integer,
  p_reason text,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_armed integer;
  v_result jsonb;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;

  select * into v_item from public.content_items ci
   where ci.id = p_content_id
   for update;
  if not found then raise exception 'content item not found'; end if;

  -- The version being released must be strictly ahead of what she sees, and must not be work
  -- she has already decided on. Releasing over her own decision is a different operation.
  if p_content_version <= coalesce(v_item.client_visible_version, 0) then
    raise exception 'v% is not ahead of the released version v%',
      p_content_version, coalesce(v_item.client_visible_version, 0);
  end if;
  if exists (
    select 1 from public.approvals a
    where a.client_id = v_item.client_id and a.content_id = v_item.id
      and a.content_version = p_content_version
  ) then
    raise exception 'v% already carries a client decision; this is not an agency release',
      p_content_version;
  end if;

  -- Promote without arming. mark_content_ready keeps every guard it has: the unresolved-request
  -- check from 0081, the agency_mutations switch and the prepared-to-applied resolution from
  -- 0014, and the release-quality gate from 0007. Only the review signal is withheld.
  perform pg_catalog.set_config('portal.suppress_review_arm', 'on', true);
  perform public.mark_content_ready(v_item.id, p_content_version);
  perform pg_catalog.set_config('portal.suppress_review_arm', 'off', true);

  -- Fail loudly rather than quietly if the suppression ever stops working, because the whole
  -- point of this function is that it cannot ask Maria to review something twice.
  select pg_catalog.count(*)::integer into v_armed from public.activity_log a
   where a.client_id = v_item.client_id and a.content_id = v_item.id
     and a.content_version = p_content_version and a.event_type = 'needs_review';
  if v_armed > 0 then
    raise exception 'release armed a client review; refusing to complete an agency release';
  end if;

  -- Land it. The courtesy release sets approved, clears review_ready_at, creates the schedule
  -- targets and writes its own audit row, inbox event and projection.
  v_result := public.record_content_courtesy_release(
    p_content_id, p_content_version, p_reason, p_actor_key, p_idempotency_key);

  return v_result || pg_catalog.jsonb_build_object('released_version', p_content_version,
    'review_armed', false);
end;
$$;

revoke all on function public.record_agency_applied_release(uuid, integer, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_agency_applied_release(uuid, integer, text, text, uuid)
  to service_role;

create or replace function public.assert_agency_applied_release_security() returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_unchecked_mark_content_ready(uuid,integer)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%portal.suppress_review_arm%'
     or v_def not ilike '%needs_review%'
  then
    raise exception 'conditional review arming drifted';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.record_agency_applied_release(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%unknown or inactive agency actor%'
     or v_def not ilike '%suppress_review_arm%'
     or v_def not ilike '%already carries a client decision%'
     or v_def not ilike '%is not ahead of the released version%'
     or v_def not ilike '%refusing to complete an agency release%'
     or v_def not ilike '%record_content_courtesy_release%'
  then
    raise exception 'agency applied release guards drifted';
  end if;

  if pg_catalog.has_function_privilege('anon',
       'public.record_agency_applied_release(uuid,integer,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.record_agency_applied_release(uuid,integer,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.record_agency_applied_release(uuid,integer,text,text,uuid)','EXECUTE') then
    raise exception 'agency applied release grants are unsafe';
  end if;

  -- The inner promotion must stay unreachable except through its wrappers, so nothing can
  -- promote a version while skipping the fact-check gate or the unresolved-request check.
  if pg_catalog.has_function_privilege('service_role',
       'public.portal_unchecked_mark_content_ready(uuid,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.portal_unchecked_mark_content_ready(uuid,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role',
       'public.portal_core_mark_content_ready(uuid,integer)','EXECUTE') then
    raise exception 'an inner mark_content_ready layer is directly reachable';
  end if;
end;
$$;

revoke all on function public.assert_agency_applied_release_security() from public, anon, authenticated;
grant execute on function public.assert_agency_applied_release_security() to service_role;

select public.assert_agency_applied_release_security();

create or replace function public.assert_portal_slice84_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice81_security();
  perform public.assert_discard_working_version_security();
end;
$$;
revoke all on function public.assert_portal_slice84_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice84_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice84_security();
  perform public.assert_agency_applied_release_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
