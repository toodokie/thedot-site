-- There is no supported way to retire a piece the client has never seen.
--
-- Every studio set mints content IDs up front, which is what the lifecycle contract asks for: the
-- identity exists before the copy. Some of those never become pieces. Four were sitting on
-- 2026-09-26, synced from studio material on 28 July and 7 August, still v1 drafts, never
-- released, never dated. The My-tasks page had been presenting them as upcoming work ever since,
-- because an action with no planned date can never be "current" and so can never leave
-- "Coming up".
--
-- The one archive path in the system, apply_content_archive_request (0014), requires a CLIENT
-- removal request against a released version. It refuses these correctly. And content_items is
-- select-only for service_role by design, so no script can retire them either. The remaining
-- options were raw SQL against production or leaving them there forever.
--
-- This is the narrowest function that closes the gap. It refuses unless the piece has NEVER been
-- released, which is what makes it safe: if the client has never seen a piece, retiring it cannot
-- surprise her, cannot contradict anything she approved, and needs no notification. Anything she
-- HAS seen keeps going through the client request path, where she asked for the removal herself.
--
-- Agency housekeeping, never silent: a reason is required and written to the activity log, and the
-- event type is excluded from the client feed in src/lib/portal/data.ts, the same treatment
-- working_version_discarded (0084) and agency_supersession_recorded (0087) already get.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.content_items') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0090 requires the versioned content system';
  end if;
end;
$$;

select public.assert_portal_security();

-- activity_log.event_type carries a foreign key to activity_event_types; without this the insert
-- below fails and the whole archive rolls back (the lesson 0084 records).
insert into public.activity_event_types (event_type)
values ('agency_draft_archived')
on conflict (event_type) do nothing;

create or replace function public.agency_archive_unreleased_content(
  p_client_id uuid,
  p_content_id text,
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
  v_title text;
  v_refs integer;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then
    raise exception 'unknown or inactive agency actor';
  end if;

  if p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required';
  end if;

  select * into v_item from public.content_items
    where client_id = p_client_id and content_id = p_content_id for update;
  if not found then
    raise exception 'no such piece: %', p_content_id;
  end if;

  -- Idempotent: archiving an already-archived piece is a no-op, not an error, so a retried
  -- command cannot fail a batch halfway through.
  if v_item.archived_at is not null then
    return jsonb_build_object('content_id', p_content_id, 'outcome', 'already_archived');
  end if;

  -- The whole safety of this function. A released piece is one the client has seen, decided on,
  -- or had scheduled; retiring it is her call and goes through the removal request path.
  if v_item.client_visible_version is not null then
    raise exception 'released piece: % has been visible to the client at v%; use the client removal request path',
      p_content_id, v_item.client_visible_version;
  end if;

  -- Belt and braces against a piece that shipped without a release pointer: a publication target
  -- means it reached an audience, whatever the version bookkeeping says.
  select count(*) into v_refs from public.content_publication_targets
    where content_id = v_item.id;
  if v_refs > 0 then
    raise exception 'published piece: % has % publication target(s)', p_content_id, v_refs;
  end if;

  update public.content_items
    set archived_at = pg_catalog.now(),
        projection_revision = projection_revision + 1,
        updated_at = pg_catalog.now()
    where id = v_item.id;

  select cv.title into v_title from public.content_item_versions cv
    where cv.content_item_id = v_item.id and cv.client_id = p_client_id
    order by cv.version desc limit 1;

  insert into public.activity_log (client_id, content_id, content_version, event_type,
    title, summary, actor_type, actor_name, event_key)
  values (p_client_id, v_item.id, v_item.working_version, 'agency_draft_archived',
    'Draft archived: ' || coalesce(v_title, p_content_id),
    'Never released to the client. ' || p_reason,
    'anastasia', v_actor.display_name,
    'archive-draft:' || v_item.id::text || ':' || p_idempotency_key::text);

  return jsonb_build_object('content_id', p_content_id, 'outcome', 'archived',
    'title', coalesce(v_title, p_content_id));
end;
$$;

revoke all on function public.agency_archive_unreleased_content(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.agency_archive_unreleased_content(uuid, text, text, text, uuid)
  to service_role;

create or replace function public.assert_archive_unreleased_draft_security() returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.agency_archive_unreleased_content(uuid,text,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     -- The released-piece refusal is the entire safety of this function. If it ever goes missing,
     -- this becomes a way to delete work the client has approved.
     or v_def not ilike '%client_visible_version is not null%'
     or v_def not ilike '%publication target%'
     or v_def not ilike '%at least 10 characters%'
     or v_def not ilike '%agency_draft_archived%'
  then
    raise exception 'archive unreleased draft guards drifted';
  end if;
  if not exists (select 1 from public.activity_event_types t
    where t.event_type = 'agency_draft_archived') then
    raise exception 'agency_draft_archived event type missing';
  end if;
  if pg_catalog.has_function_privilege('anon',
       'public.agency_archive_unreleased_content(uuid,text,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.agency_archive_unreleased_content(uuid,text,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.agency_archive_unreleased_content(uuid,text,text,text,uuid)','EXECUTE') then
    raise exception 'archive unreleased draft grants are unsafe';
  end if;
end;
$$;

revoke all on function public.assert_archive_unreleased_draft_security() from public, anon, authenticated;
grant execute on function public.assert_archive_unreleased_draft_security() to service_role;

select public.assert_archive_unreleased_draft_security();

create or replace function public.assert_portal_slice89_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice88_security();
  perform public.assert_client_request_failure_security();
end;
$$;
revoke all on function public.assert_portal_slice89_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice89_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice89_security();
  perform public.assert_archive_unreleased_draft_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
