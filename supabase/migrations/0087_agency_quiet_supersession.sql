-- Replacing copy on a version the client has been shown but has not decided on had no command.
--
-- 0085 gave us a release that does not arm a review, but it lands the piece on approved via the
-- courtesy release, which is right when Maria's own edits have been applied and wrong here: she
-- has not decided yet, and she still needs to. What this case wants is the other half on its own.
-- Promote the new version so the portal shows the corrected copy, leave the piece awaiting her
-- review exactly as it already was, and do not send a second email about a review she was already
-- asked for and has not answered.
--
-- Without it, the only route was the one the playbook still documented: switch client_alerts off,
-- run update-portal --re-share, switch them back on. On 2026-09-16 an agent tried that three times
-- on kanset-2026-09-podcast-ep3, was refused each time by the host's command classifier because it
-- is a three-command shell pipeline, and ended up handing Anastasia a line to paste by hand. The
-- work was correct and the switch was restored within a second, but the operation should never
-- have needed a switch, a shell pipeline or a human.
--
-- The precondition that makes this safe is that the client has not decided. If she has approved
-- the released version, quietly replacing what she approved is a different and much more serious
-- act, and this function refuses it. Everything else mark_content_ready enforces is inherited,
-- including 0081's refusal to release while an unresolved client edit request sits on the
-- released version, so a supersession can never strand a request she is waiting on.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.mark_content_ready(uuid,integer)') is null
     or pg_catalog.to_regprocedure('public.portal_unchecked_mark_content_ready(uuid,integer)') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0087 requires the release system and the 0085 conditional review arming';
  end if;
end;
$$;

select public.assert_portal_security();

insert into public.activity_event_types (event_type)
values ('agency_supersession_recorded')
on conflict (event_type) do nothing;

create or replace function public.record_agency_supersession(
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
  v_previous integer;
  v_armed integer;
  v_title text;
begin
  if p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required';
  end if;

  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;

  select * into v_item from public.content_items ci where ci.id = p_content_id for update;
  if not found then raise exception 'content item not found'; end if;

  v_previous := coalesce(v_item.client_visible_version, 0);
  if v_previous < 1 then
    raise exception 'nothing has been released yet; this is an ordinary first release, not a supersession';
  end if;
  if p_content_version <= v_previous then
    raise exception 'v% is not ahead of the released version v%', p_content_version, v_previous;
  end if;

  -- The whole justification for staying quiet is that she was already asked and has not answered.
  -- Once she has decided, replacing what she decided on is not a supersession.
  if exists (
    select 1 from public.approvals a
    where a.client_id = v_item.client_id and a.content_id = v_item.id
      and a.content_version = v_previous
  ) then
    raise exception 'v% already carries a client decision; superseding it quietly is not permitted',
      v_previous;
  end if;

  -- Promote without arming. Every other guard mark_content_ready carries still applies: the
  -- unresolved-request check (0081), agency_mutations, the fact-check gate (0027) and the
  -- release-quality gate (0007).
  perform pg_catalog.set_config('portal.suppress_review_arm', 'on', true);
  perform public.mark_content_ready(p_content_id, p_content_version);
  perform pg_catalog.set_config('portal.suppress_review_arm', 'off', true);

  select pg_catalog.count(*)::integer into v_armed from public.activity_log a
   where a.client_id = v_item.client_id and a.content_id = v_item.id
     and a.content_version = p_content_version and a.event_type = 'needs_review';
  if v_armed > 0 then
    raise exception 'supersession armed a client review; refusing to complete it';
  end if;

  select cv.title into v_title from public.content_item_versions cv
   where cv.content_item_id = v_item.id and cv.version = p_content_version;

  -- Agency housekeeping, never client news: the event is absent from the client email vocabulary
  -- and excluded from the client activity feed in src/lib/portal/data.ts. What she sees is the
  -- corrected copy on a piece that was already waiting for her.
  insert into public.activity_log (client_id, content_id, content_version, event_type,
    title, summary, actor_type, actor_name, event_key)
  values (v_item.client_id, v_item.id, p_content_version, 'agency_supersession_recorded',
    'Superseded before review: ' || coalesce(v_title, v_item.content_id),
    'v' || v_previous || ' replaced by v' || p_content_version
      || ' before the client decided. ' || p_reason,
    'anastasia', v_actor.display_name,
    'supersession:' || v_item.id::text || ':' || p_content_version::text || ':' || p_idempotency_key::text);

  return jsonb_build_object(
    'content_id', v_item.content_id,
    'superseded_version', v_previous,
    'released_version', p_content_version,
    'review_armed', false
  );
end;
$$;

revoke all on function public.record_agency_supersession(uuid, integer, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_agency_supersession(uuid, integer, text, text, uuid)
  to service_role;

create or replace function public.assert_agency_supersession_security() returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_agency_supersession(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%unknown or inactive agency actor%'
     or v_def not ilike '%already carries a client decision%'
     or v_def not ilike '%is not ahead of the released version%'
     or v_def not ilike '%suppress_review_arm%'
     or v_def not ilike '%refusing to complete it%'
  then
    raise exception 'agency supersession guards drifted';
  end if;
  if not exists (select 1 from public.activity_event_types t
    where t.event_type = 'agency_supersession_recorded') then
    raise exception 'agency_supersession_recorded event type missing';
  end if;
  if public.portal_client_activity_email_required('agency_supersession_recorded') then
    raise exception 'agency supersession must never be a client email event';
  end if;
  if pg_catalog.has_function_privilege('anon',
       'public.record_agency_supersession(uuid,integer,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.record_agency_supersession(uuid,integer,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.record_agency_supersession(uuid,integer,text,text,uuid)','EXECUTE') then
    raise exception 'agency supersession grants are unsafe';
  end if;
end;
$$;

revoke all on function public.assert_agency_supersession_security() from public, anon, authenticated;
grant execute on function public.assert_agency_supersession_security() to service_role;

select public.assert_agency_supersession_security();

create or replace function public.assert_portal_slice86_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice84_security();
  perform public.assert_agency_applied_release_security();
end;
$$;
revoke all on function public.assert_portal_slice86_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice86_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice86_security();
  perform public.assert_agency_supersession_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
