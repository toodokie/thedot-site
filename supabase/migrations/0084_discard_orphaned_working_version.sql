-- A reconciliation that fails its guard AFTER writing leaves a working version row behind.
-- Every retry then dies on "version N already exists with a different checksum", and there was
-- no supported way to clear it: service_role holds SELECT only on content_item_versions (0006,
-- 0007, 0025), by design, so no script can remove the row. The only remaining options were raw
-- SQL against production or abandoning the piece. On 2026-09-15 that blocked a reel due to post
-- the following day, after apply-edit-batch wrote the client's raw text while its guard compared
-- against the approved review candidate.
--
-- This adds the missing operation and nothing else. It is deliberately the narrowest function
-- that solves the problem, because the same select-only grant that caused the dead end is also
-- what stops a bad script from destroying client history.
--
-- It refuses unless ALL of these hold:
--   1. the version is strictly greater than client_visible_version, so the client never saw it
--   2. it is the item's current working_version, so we remove the tip and never punch a hole
--   3. no review asset points at it
--   4. no change request records it as its canonical outcome
--   5. no publication target and no schedule target references it
-- A caller must also supply a reason of at least ten characters, which is written to the
-- activity log so the removal is never silent. The log entry is agency housekeeping: the event
-- type is not on the client-email list, and src/lib/portal/data.ts excludes it from the client
-- activity feed, so a cleanup never shows up as news for Maria.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.content_item_versions') is null
     or pg_catalog.to_regclass('public.content_items') is null
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0084 requires the versioned content system';
  end if;
end;
$$;

-- activity_log.event_type carries a foreign key to activity_event_types. Without this row the
-- insert below fails and the whole discard rolls back, which the first happy-path test caught.
insert into public.activity_event_types (event_type)
values ('working_version_discarded')
on conflict (event_type) do nothing;

create or replace function public.discard_orphaned_working_version(
  p_client_id uuid,
  p_content_id text,
  p_version integer,
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
  v_row public.content_item_versions%rowtype;
  v_refs integer;
begin
  -- Same actor gate as every other audited agency write (0011 conventions, 0020 is the
  -- nearest precedent): an unknown or retired actor key cannot remove anything.
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then
    raise exception 'unknown or inactive agency actor';
  end if;

  if p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) < 10 then
    raise exception 'a reason of at least 10 characters is required';
  end if;

  select * into v_item from public.content_items
   where client_id = p_client_id and content_id = p_content_id
   for update;
  if not found then
    raise exception 'no content item % for this client', p_content_id;
  end if;

  -- 1. Never touch anything the client has seen. A released version is permanent.
  if p_version <= coalesce(v_item.client_visible_version, 0) then
    raise exception 'v% is at or below client_visible_version v%: it has been released and is permanent',
      p_version, coalesce(v_item.client_visible_version, 0);
  end if;

  -- 2. Only the tip, so version numbering can never develop a hole.
  if v_item.working_version is distinct from p_version then
    raise exception 'v% is not the working tip (working_version is v%)', p_version, v_item.working_version;
  end if;

  select * into v_row from public.content_item_versions
   where content_item_id = v_item.id and version = p_version;
  if not found then
    raise exception 'no version row v% for %', p_version, p_content_id;
  end if;

  -- 3, 4, 5. Nothing may depend on it.
  select count(*) into v_refs from public.content_review_assets
   where content_item_id = v_item.id and content_version = p_version;
  if v_refs > 0 then
    raise exception 'v% has % review asset(s) attached; detach them first', p_version, v_refs;
  end if;

  select count(*) into v_refs from public.content_change_requests
   where content_id = v_item.id and canonical_version = p_version;
  if v_refs > 0 then
    raise exception 'v% is the recorded outcome of % change request(s); supersede them instead', p_version, v_refs;
  end if;

  -- Both target tables key on content_id (the uuid), not content_item_id. Checked against
  -- the live schema 2026-09-15; an earlier draft used the wrong column and would have failed
  -- at runtime rather than at deploy.
  select count(*) into v_refs from public.content_publication_targets
   where content_id = v_item.id and content_version = p_version;
  if v_refs > 0 then
    raise exception 'v% has % publication target(s); it is part of the published record', p_version, v_refs;
  end if;

  select count(*) into v_refs from public.content_schedule_targets
   where content_id = v_item.id and content_version = p_version;
  if v_refs > 0 then
    raise exception 'v% has % schedule target(s); it is committed to a provider', p_version, v_refs;
  end if;

  delete from public.content_item_versions where id = v_row.id;
  update public.content_items set working_version = p_version - 1 where id = v_item.id;

  -- The removal is agency-only and never client-visible, but it must never be silent.
  -- activity_log carries no payload column, so the summary has to hold the whole record:
  -- what was removed, why, and the checksum that identified it.
  insert into public.activity_log (client_id, content_id, content_version, event_type,
    title, summary, actor_type, actor_name, event_key)
  values (p_client_id, v_item.id, p_version, 'working_version_discarded',
    'Working version discarded: ' || coalesce(v_item.title, p_content_id),
    'v' || p_version || ' removed before release, checksum '
      || coalesce(pg_catalog.left(v_row.content_checksum, 12), 'none') || '. ' || p_reason,
    'anastasia', v_actor.display_name,
    'discard:' || v_item.id::text || ':' || p_version::text || ':' || p_idempotency_key::text);

  return jsonb_build_object(
    'content_id', p_content_id,
    'discarded_version', p_version,
    'working_version', p_version - 1
  );
end;
$$;

revoke all on function public.discard_orphaned_working_version(uuid, text, integer, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.discard_orphaned_working_version(uuid, text, integer, text, text, uuid)
  to service_role;

-- Security assertion, in the house style: the guards must still be present in the live
-- definition, and the function must never become reachable by a client role.
create or replace function public.assert_discard_working_version_security() returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare v_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.discard_orphaned_working_version(uuid,text,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%client_visible_version%'
     or v_def not ilike '%is not the working tip%'
     or v_def not ilike '%review asset%'
     or v_def not ilike '%change request%'
     or v_def not ilike '%publication target%'
     or v_def not ilike '%schedule target%'
     or v_def not ilike '%working_version_discarded%'
     or v_def not ilike '%content_checksum%'
  then
    raise exception 'discard working version guards drifted';
  end if;
  if not exists (select 1 from public.activity_event_types t
    where t.event_type = 'working_version_discarded') then
    raise exception 'working_version_discarded event type missing';
  end if;
  if pg_catalog.has_function_privilege('anon',
       'public.discard_orphaned_working_version(uuid,text,integer,text,text,uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.discard_orphaned_working_version(uuid,text,integer,text,text,uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role',
       'public.discard_orphaned_working_version(uuid,text,integer,text,text,uuid)','EXECUTE') then
    raise exception 'discard working version grants are unsafe';
  end if;
end;
$$;

revoke all on function public.assert_discard_working_version_security() from public, anon, authenticated;
grant execute on function public.assert_discard_working_version_security() to service_role;

select public.assert_discard_working_version_security();

-- Extend the cumulative fold, per the manual's schema-change recipe. The previous slice
-- (0081) folded slice80 + unified piece review; this snapshots that as slice81 and adds
-- the new assertion, so one call still checks everything that came before.
create or replace function public.assert_portal_slice81_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice80_security();
  perform public.assert_portal_unified_piece_review_security();
end;
$$;
revoke all on function public.assert_portal_slice81_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice81_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice81_security();
  perform public.assert_discard_working_version_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
