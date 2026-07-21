-- Item-level design links (Anastasia's directive; analysis in the workspace's
-- portal-design-links-2026-07-20.md).
--
-- Ruling: canva_url/drive_url are ITEM-LEVEL PRESENTATION METADATA, not authored copy.
-- They live inside the immutable version checksum (0006), so editing a released piece's
-- frontmatter to add a link reads as rewriting a shipped version and the sync refuses
-- batch-atomically (correct for authored copy, wrong for a design pointer).
--
-- Home: a dedicated 1:1 table (content_design_links) rather than the legacy
-- content_items.canva_url/drive_url columns. Two reasons: (1) the frozen slice1/slice2
-- assertion fold pins the EXACT authenticated column-grant set on content_items, and the
-- security_invoker view would need new column grants there (replacing two large
-- historical assertion bodies is a far riskier edit than a dedicated table); (2) the
-- legacy columns' stated contract is first-insert rollback compatibility, and
-- repurposing them would entangle sync-time population with agency overrides. The table
-- is tenant-RLS'd, written only by the audited RPC below, and content_with_state serves
-- COALESCE(design_links, sealed version) for the two fields: an agency-set value wins
-- the moment it is set, while pieces whose released version already carries a link keep
-- rendering it with no double entry. Presentation metadata rides the item-level table;
-- authored copy rides the sealed version.
--
-- CANONICAL-REPO CONTRACT (stated here per the round brief; the repository contract doc
-- is the content pen's to update): canonical frontmatter SHOULD NOT carry design links
-- going forward. Where present they stay sealed in the version snapshot as historical
-- record; the portal renders the item-level value first. The sync's checksum behavior is
-- deliberately untouched.
--
-- This migration flips no switch and grants no capability.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_assistant_client_id_immutable()') is null
     or pg_catalog.to_regclass('public.agency_actors') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.activity_event_types') is null
     or pg_catalog.to_regclass('public.content_with_state') is null then
    raise exception '0019/base portal objects must exist before applying 0020';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice14_security;
revoke all on function public.assert_portal_slice14_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice14_security() to service_role;

-- --- URL shape (client-safe hosts only) --------------------------------------
-- https only, no whitespace, no userinfo/port tricks, exact-host allow-list:
-- canva links on canva.com/www.canva.com, drive links on drive.google.com.
create or replace function public.portal_design_link_valid(p_url text, p_kind text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  v_host text;
begin
  if p_url is null then return true; end if;
  if p_url !~ '^https://' or pg_catalog.char_length(p_url) > 2048
     or p_url ~ '[[:space:]]' then
    return false;
  end if;
  v_host := pg_catalog.lower((pg_catalog.regexp_match(p_url, '^https://([^/?#]+)'))[1]);
  if v_host is null or v_host ~ '[@:]' then return false; end if;
  if p_kind = 'canva' then
    return v_host in ('canva.com', 'www.canva.com');
  elsif p_kind = 'drive' then
    return v_host = 'drive.google.com';
  end if;
  return false;
end;
$$;
revoke all on function public.portal_design_link_valid(text,text)
  from public,anon,authenticated,service_role;

-- --- the item-level home -----------------------------------------------------
create table public.content_design_links (
  content_item_id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  canva_url text check (public.portal_design_link_valid(canva_url, 'canva')),
  drive_url text check (public.portal_design_link_valid(drive_url, 'drive')),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (content_item_id, client_id)
    references public.content_items(id, client_id) on delete cascade
);

alter table public.content_design_links enable row level security;
create policy content_design_links_client_read on public.content_design_links
  for select to authenticated
  using (client_id in (select public.my_client_ids()));

-- The revoke includes service_role: hosted default privileges pre-grant DML on new
-- tables (prod push incident 2026-07-21). Revoke everything, grant back the minimal set.
revoke all on public.content_design_links from public,anon,authenticated,service_role;
grant select (content_item_id, client_id, canva_url, drive_url, updated_at)
  on public.content_design_links to authenticated;
grant select on public.content_design_links to service_role;

-- tenancy invariant, same as every indexed source table
create trigger client_id_immutable before update on public.content_design_links
  for each row execute function public.portal_assistant_client_id_immutable();

-- --- activity vocabulary -----------------------------------------------------
insert into public.activity_event_types (event_type) values ('design_link_updated')
on conflict do nothing;

-- --- the audited agency write (0011 conventions) -----------------------------
-- Sets BOTH links in one call (full overwrite; both null deletes the item-level
-- override row and the sealed version value, if any, renders again). Never touches
-- content_item_versions: released checksums, approvals, and publication locks are
-- untouched by construction (asserted at runtime in test-rls).
create or replace function public.set_content_design_links(
  p_client_id uuid, p_content_id text, p_canva_url text, p_drive_url text,
  p_actor_key text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_item public.content_items%rowtype;
  v_title text;
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found'; end if;
  if p_content_id is null or pg_catalog.char_length(pg_catalog.btrim(p_content_id)) not between 1 and 200 then
    raise exception 'content id is required'; end if;
  select * into v_item from public.content_items ci
    where ci.client_id = p_client_id and ci.content_id = pg_catalog.btrim(p_content_id)
    for update;
  if not found then raise exception 'content does not belong to client'; end if;
  if not public.portal_design_link_valid(p_canva_url, 'canva') then
    raise exception 'canva_url must be an https canva.com/www.canva.com link'; end if;
  if not public.portal_design_link_valid(p_drive_url, 'drive') then
    raise exception 'drive_url must be an https drive.google.com link'; end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required'; end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('content_id', pg_catalog.btrim(p_content_id),
      'canva_url', p_canva_url, 'drive_url', p_drive_url)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'set_design_links' or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return v_receipt.response;
  end if;

  if p_canva_url is null and p_drive_url is null then
    delete from public.content_design_links dl
      where dl.content_item_id = v_item.id and dl.client_id = p_client_id;
  else
    insert into public.content_design_links (content_item_id, client_id, canva_url, drive_url)
    values (v_item.id, p_client_id, p_canva_url, p_drive_url)
    on conflict (content_item_id) do update
      set canva_url = excluded.canva_url, drive_url = excluded.drive_url,
          updated_at = pg_catalog.now();
  end if;

  select v.title into v_title from public.content_item_versions v
    where v.content_item_id = v_item.id and v.client_id = p_client_id
      and v.version = v_item.client_visible_version;

  -- activity_log requires content_id and content_version together; the released version
  -- when one exists, otherwise the working version (always >= 1 for a synced item)
  insert into public.activity_log (client_id, content_id, content_version, event_type,
    event_key, title, summary, actor_type, actor_name)
  values (p_client_id, v_item.id,
    coalesce(nullif(v_item.client_visible_version, 0), v_item.working_version),
    'design_link_updated',
    'agency:design-link:' || p_idempotency_key,
    'Design link updated: ' || coalesce(v_title, pg_catalog.btrim(p_content_id)),
    null, 'anastasia', v_actor.display_name);

  insert into public.portal_command_receipts (client_id, command_type, idempotency_key,
    request_fingerprint, response)
  values (p_client_id, 'set_design_links', p_idempotency_key, v_fingerprint,
    pg_catalog.jsonb_build_object('id', v_item.id,
      'canva_url', p_canva_url, 'drive_url', p_drive_url));
  return pg_catalog.jsonb_build_object('id', v_item.id,
    'canva_url', p_canva_url, 'drive_url', p_drive_url);
end;
$$;
revoke all on function public.set_content_design_links(uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.set_content_design_links(uuid,text,text,text,text,text)
  to service_role;

-- --- repoint the client view: item-level presentation metadata wins ----------
-- Identical to the 0009 definition except canva_url/drive_url now read
-- COALESCE(item-level design link, sealed version value).
drop view public.content_with_state;
create view public.content_with_state
with (security_invoker = true)
as
select
  ci.id,ci.content_id,ci.client_id,v.title,v.format,v.pillar,v.platforms,ci.status,
  ci.planned_date,schedule.schedule_state,publication.publication_state,
  coalesce(dl.canva_url, v.canva_url) as canva_url,
  coalesce(dl.drive_url, v.drive_url) as drive_url,
  v.version,v.fact_check,v.fact_check_scope,
  v.fact_check_exemption,v.fact_check_ledger,v.client_body,v.copy_blocks,
  v.synced_at as updated_at,ci.review_ready_at,ci.revision_in_progress,ci.archived_at,
  decision.state as current_decision,
  case
    when ci.archived_at is not null then 'archived'
    when publication.publication_state = 'live' then 'live'
    when schedule.schedule_state = 'cancel_pending' then 'cancel_pending'
    when decision.state = 'change_requested' or ci.revision_in_progress then 'with_dot'
    when publication.publication_state = 'partially_live' then 'partially_live'
    when publication.publication_state = 'failed' then 'publish_failed'
    when schedule.schedule_state = 'reschedule_pending' then 'reschedule_pending'
    when schedule.schedule_state = 'failed' then 'schedule_failed'
    when schedule.schedule_state = 'partially_scheduled' then 'partially_scheduled'
    when schedule.schedule_state = 'scheduled' then 'scheduled'
    when ci.status = 'approved' then 'approved'
    when ci.status = 'draft' and ci.review_ready_at is not null then 'needs_review'
    else 'with_dot'
  end::text as client_state
from public.content_items ci
join public.content_item_versions v on v.content_item_id = ci.id
  and v.client_id = ci.client_id and v.version = ci.client_visible_version
left join public.content_design_links dl on dl.content_item_id = ci.id
  and dl.client_id = ci.client_id
cross join lateral (select public.portal_content_schedule_state(
  ci.id,ci.client_visible_version) as schedule_state) schedule
cross join lateral (select public.portal_publication_state(
  ci.id,ci.client_visible_version) as publication_state) publication
left join lateral (
  select a.state from public.approvals a where a.content_id = ci.id
    and a.client_id = ci.client_id and a.content_version = ci.client_visible_version
  order by a.created_at desc,a.id desc limit 1
) decision on true;

revoke all on public.content_with_state from public,anon,authenticated,service_role;
grant select on public.content_with_state to authenticated, service_role;

-- --- in-migration security assertion -----------------------------------------
create or replace function public.assert_portal_design_links_security()
returns void language plpgsql security definer set search_path='' as $$
declare
  v_actual text[];
  v_expected text[];
begin
  -- the view must stay security_invoker and client-readable
  if not exists (select 1 from pg_catalog.pg_class c
    where c.oid = 'public.content_with_state'::pg_catalog.regclass
      and coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true']) then
    raise exception 'content_with_state must be security_invoker'; end if;
  if not pg_catalog.has_table_privilege('authenticated','public.content_with_state','SELECT')
     or not pg_catalog.has_table_privilege('service_role','public.content_with_state','SELECT')
     or pg_catalog.has_table_privilege('anon','public.content_with_state','SELECT') then
    raise exception 'unsafe content_with_state grants'; end if;

  -- design-links table: RLS on, tenant policy, exact client columns, no client writes
  if not (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.content_design_links'::pg_catalog.regclass) then
    raise exception 'content_design_links RLS disabled'; end if;
  if not exists (select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename = 'content_design_links'
      and p.policyname = 'content_design_links_client_read') then
    raise exception 'content_design_links tenant read policy missing'; end if;
  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_actual
    from information_schema.column_privileges cp where cp.table_schema = 'public'
      and cp.table_name = 'content_design_links' and cp.grantee = 'authenticated'
      and cp.privilege_type = 'SELECT';
  v_expected := array['canva_url','client_id','content_item_id','drive_url','updated_at'];
  if v_actual is distinct from v_expected then
    raise exception 'unexpected content_design_links grants: %', v_actual; end if;
  if pg_catalog.has_table_privilege('authenticated','public.content_design_links','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('anon','public.content_design_links','SELECT,INSERT,UPDATE,DELETE')
     or not pg_catalog.has_table_privilege('service_role','public.content_design_links','SELECT')
     or pg_catalog.has_table_privilege('service_role','public.content_design_links','INSERT,UPDATE,DELETE') then
    raise exception 'unsafe content_design_links table privilege'; end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_design_links'::pg_catalog.regclass
      and t.tgname = 'client_id_immutable' and not t.tgisinternal) then
    raise exception 'content_design_links immutability trigger missing'; end if;

  -- design-link writer: hardened definer, service_role only; validator locked down
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_content_design_links'
      and (not p.prosecdef or not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']))) then
    raise exception 'design link writer is not hardened'; end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'portal_design_link_valid'
      and not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""'])) then
    raise exception 'design link validator is not hardened'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.set_content_design_links(uuid,text,text,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.set_content_design_links(uuid,text,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.set_content_design_links(uuid,text,text,text,text,text)','EXECUTE') then
    raise exception 'unsafe design link writer privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.portal_design_link_valid(text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_design_link_valid(text,text)','EXECUTE') then
    raise exception 'unsafe design link validator privilege'; end if;

  -- vocabulary present; validator behaves on the boundary cases
  if not exists (select 1 from public.activity_event_types t
    where t.event_type = 'design_link_updated') then
    raise exception 'design_link_updated event type missing'; end if;
  if not public.portal_design_link_valid('https://www.canva.com/design/X/view', 'canva')
     or not public.portal_design_link_valid('https://drive.google.com/open?id=Y', 'drive')
     or public.portal_design_link_valid('http://www.canva.com/design/X', 'canva')
     or public.portal_design_link_valid('https://canva.com.evil.example/x', 'canva')
     or public.portal_design_link_valid('https://www.dropbox.com/s/x', 'drive')
     or public.portal_design_link_valid('https://drive.google.com@evil.example/x', 'drive') then
    raise exception 'design link validator boundary failure'; end if;
end;
$$;
revoke all on function public.assert_portal_design_links_security() from public,anon,authenticated;
grant execute on function public.assert_portal_design_links_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice14_security();
  perform public.assert_portal_design_links_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
