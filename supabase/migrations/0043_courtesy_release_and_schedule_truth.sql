-- A courtesy release is an explicit agency policy for a particular released snapshot.
-- It is not, and must never render as, a client approval. It exists for material such as
-- a studio-owned, already-live cut where the agency has deliberately decided that Maria's
-- approval is a non-blocking courtesy review. The record is immutable and version-bound.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_fact_check_release_complete(jsonb,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_ensure_schedule_targets(uuid,integer)') is null
     or pg_catalog.to_regprocedure('public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null then
    raise exception '0043 requires the release, schedule, publication, and receipt boundaries';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice36_security;
revoke all on function public.assert_portal_slice36_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice36_security() to service_role;

insert into public.activity_event_types(event_type) values ('courtesy_release_recorded')
on conflict (event_type) do nothing;

-- There is deliberately no `client_approved` row type here. Client approval continues to
-- live only in approvals. This table exists solely for an explicit agency decision to make
-- client approval non-blocking for one already released snapshot.
create table public.content_courtesy_releases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  content_id uuid not null,
  content_version int not null check (content_version > 0),
  reason text not null check (
    pg_catalog.char_length(reason) between 10 and 2000
    and public.portal_client_summary_shape_valid(reason)
  ),
  recorded_by_actor_id uuid not null references public.agency_actors(id),
  recorded_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  unique (client_id, content_id, content_version),
  foreign key (content_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade
);

alter table public.content_courtesy_releases enable row level security;
revoke all on public.content_courtesy_releases from public, anon, authenticated, service_role;
grant select on public.content_courtesy_releases to service_role;

-- Shared private predicate. Existing client-approved items remain exactly as before; a
-- courtesy release is the only narrowly-scoped alternate basis accepted by publication
-- evidence. It is intentionally not callable through the Data API.
create function public.portal_content_publication_authorized(
  p_content_id uuid,
  p_client_id uuid,
  p_content_version int
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.approvals a
    where a.content_id = p_content_id
      and a.client_id = p_client_id
      and a.content_version = p_content_version
      and a.state = 'approved'
      and not exists (
        select 1 from public.approvals newer
        where newer.content_id = a.content_id
          and newer.client_id = a.client_id
          and newer.content_version = a.content_version
          and (newer.created_at, newer.id) > (a.created_at, a.id)
      )
  ) or exists (
    select 1
    from public.content_courtesy_releases cr
    where cr.client_id = p_client_id
      and cr.content_id = p_content_id
      and cr.content_version = p_content_version
  )
$$;
revoke all on function public.portal_content_publication_authorized(uuid,uuid,integer)
  from public, anon, authenticated, service_role;

create function public.record_content_courtesy_release(
  p_content_id uuid,
  p_content_version int,
  p_reason text,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items%rowtype;
  v_actor public.agency_actors%rowtype;
  v_existing public.content_courtesy_releases%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_title text;
  v_fact_check text;
  v_scope text;
  v_exemption text;
  v_ledger jsonb;
  v_body text;
  v_producer text;
  v_reason text := pg_catalog.btrim(p_reason);
  v_fingerprint text;
  v_response jsonb;
  v_revision bigint;
begin
  if p_content_id is null or p_content_version is null or p_content_version < 1
     or p_idempotency_key is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 10 and 2000
     or not public.portal_client_summary_shape_valid(v_reason) then
    raise exception 'invalid courtesy release';
  end if;

  select * into v_actor
  from public.agency_actors a
  where a.actor_key = p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;

  select * into v_item
  from public.content_items ci
  where ci.id = p_content_id
  for update;
  if not found then raise exception 'content item not found'; end if;
  if not public.portal_feature_enabled(v_item.client_id, 'agency_mutations') then
    raise exception 'agency_mutations_disabled' using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'content_id', p_content_id, 'content_version', p_content_version,
      'reason', v_reason, 'actor', p_actor_key
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'content-courtesy-release:' || v_item.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_receipt from public.portal_command_receipts r
  where r.client_id = v_item.client_id and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'record_content_courtesy_release'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different courtesy release';
    end if;
    return v_receipt.response;
  end if;

  if v_item.archived_at is not null
     or not v_item.client_visible
     or v_item.client_visible_version is distinct from p_content_version
     or v_item.working_version is distinct from p_content_version
     or v_item.revision_in_progress
     or v_item.status <> 'draft'
     or v_item.review_ready_at is null then
    raise exception 'content is not eligible for a courtesy release';
  end if;
  if exists (
    select 1 from public.approvals a
    where a.client_id = v_item.client_id and a.content_id = v_item.id
      and a.content_version = p_content_version
  ) then
    raise exception 'courtesy release cannot replace a recorded client decision';
  end if;
  select * into v_existing from public.content_courtesy_releases cr
  where cr.client_id = v_item.client_id and cr.content_id = v_item.id
    and cr.content_version = p_content_version;
  if found then
    raise exception 'courtesy release already recorded';
  end if;

  select cv.title, cv.fact_check, cv.fact_check_scope, cv.fact_check_exemption,
         cv.fact_check_ledger, cv.client_body, cv.producer
    into v_title, v_fact_check, v_scope, v_exemption, v_ledger, v_body, v_producer
  from public.content_item_versions cv
  where cv.content_item_id = v_item.id and cv.client_id = v_item.client_id
    and cv.version = p_content_version;
  if not found then raise exception 'released content snapshot not found'; end if;
  if v_fact_check <> 'confirmed'
     or not public.portal_fact_check_ledger_release_valid(v_ledger, v_scope, v_exemption)
     or not public.portal_fact_check_release_complete(v_ledger, v_scope, v_exemption)
     or pg_catalog.btrim(v_body) = '' then
    raise exception 'content is not release-complete';
  end if;
  if v_producer is distinct from 'studio' then
    raise exception 'courtesy release is reserved for studio-produced content';
  end if;

  insert into public.content_courtesy_releases(
    client_id, content_id, content_version, reason, recorded_by_actor_id
  ) values (
    v_item.client_id, v_item.id, p_content_version, v_reason, v_actor.id
  ) returning id into v_existing.id;

  update public.content_items
  set status = 'approved', review_ready_at = null, revision_in_progress = false,
      projection_revision = projection_revision + 1, updated_at = pg_catalog.now()
  where id = v_item.id
  returning projection_revision into v_revision;
  perform public.portal_ensure_schedule_targets(v_item.id, p_content_version);

  insert into public.activity_log(
    client_id, content_id, content_version, event_type, event_key, title, summary, actor_type, actor_name
  ) values (
    v_item.client_id, v_item.id, p_content_version, 'courtesy_release_recorded',
    'courtesy-release:' || v_existing.id::text,
    'Courtesy release: ' || v_title, v_reason, 'anastasia', v_actor.display_name
  );
  insert into public.portal_inbox_events(
    client_id, event_key, event_type, object_type, object_id, actor_type, actor_name, payload,
    requires_reconciliation
  ) values (
    v_item.client_id, 'courtesy-release:' || v_existing.id::text, 'courtesy_release_recorded',
    'content_courtesy_release', v_existing.id, 'anastasia', v_actor.display_name,
    pg_catalog.jsonb_build_object('content_id', v_item.id, 'content_version', p_content_version), false
  );
  insert into public.projection_outbox(
    client_id, event_key, destination, operation, object_type, object_key, object_revision, payload
  ) values (
    v_item.client_id, 'courtesy-release:' || v_existing.id::text, 'notion', 'upsert', 'content',
    v_item.id::text, v_revision, pg_catalog.jsonb_build_object('reason', 'courtesy_release_recorded')
  );
  v_response := pg_catalog.jsonb_build_object(
    'courtesy_release_id', v_existing.id, 'content_id', v_item.id,
    'content_version', p_content_version, 'outcome', 'recorded'
  );
  insert into public.portal_command_receipts(
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_item.client_id, 'record_content_courtesy_release', p_idempotency_key::text, v_fingerprint, v_response
  );
  return v_response;
end;
$$;
revoke all on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_content_courtesy_release(uuid,integer,text,text,uuid)
  to service_role;

-- Publication confirmation previously required a client approval row. Replace just that
-- predicate with the narrowly-scoped shared authorization predicate above. The migration
-- refuses to proceed if the reviewed predecessor body drifts, rather than guessing.
do $rewrite$
declare
  v_def text;
  v_old text := $old$
  if v_ci.status not in ('approved','scheduled','posted') or v_ci.revision_in_progress
     or not exists (
       select 1 from public.approvals a where a.content_id = v_ci.id
         and a.client_id = v_ci.client_id and a.content_version = v_target.content_version
         and a.state = 'approved'
         and not exists (select 1 from public.approvals newer
           where newer.content_id = a.content_id and newer.client_id = a.client_id
             and newer.content_version = a.content_version
             and (newer.created_at,newer.id) > (a.created_at,a.id))
     ) then raise exception 'content is not approved for publication'; end if;$old$;
  v_new text := $new$
  if v_ci.status not in ('approved','scheduled','posted') or v_ci.revision_in_progress
     or not public.portal_content_publication_authorized(
       v_ci.id, v_ci.client_id, v_target.content_version
     ) then raise exception 'content is not authorized for publication'; end if;$new$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)'::regprocedure
  ) into v_def;
  if v_def is null or pg_catalog.strpos(v_def, v_old) = 0 then
    raise exception 'record_publication_observation approval predicate drifted';
  end if;
  v_def := pg_catalog.replace(v_def, v_old, v_new);
  execute v_def;
end;
$rewrite$;
revoke all on function public.record_publication_observation(
  uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_publication_observation(
  uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text
) to service_role;

create or replace function public.assert_portal_courtesy_release_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
  v_columns text[];
begin
  select pg_catalog.array_agg(column_name order by column_name) into v_columns
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'content_courtesy_releases'
    and grantee = 'service_role' and privilege_type = 'SELECT';
  if v_columns is distinct from array[
    'client_id','content_id','content_version','id','reason','recorded_at','recorded_by_actor_id'
  ] then
    raise exception 'content_courtesy_releases service_role select grant drifted';
  end if;
  if pg_catalog.has_table_privilege('anon','public.content_courtesy_releases','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.content_courtesy_releases','SELECT')
     or pg_catalog.has_table_privilege('service_role','public.content_courtesy_releases','INSERT')
     or pg_catalog.has_table_privilege('service_role','public.content_courtesy_releases','UPDATE')
     or pg_catalog.has_table_privilege('service_role','public.content_courtesy_releases','DELETE')
     or exists (select 1 from pg_catalog.pg_policies p
       where p.schemaname='public' and p.tablename='content_courtesy_releases') then
    raise exception 'content_courtesy_releases privileges or RLS are unsafe';
  end if;
  if pg_catalog.has_function_privilege(
       'anon','public.record_content_courtesy_release(uuid,integer,text,text,uuid)','EXECUTE'
     ) or pg_catalog.has_function_privilege(
       'authenticated','public.record_content_courtesy_release(uuid,integer,text,text,uuid)','EXECUTE'
     ) or not pg_catalog.has_function_privilege(
       'service_role','public.record_content_courtesy_release(uuid,integer,text,text,uuid)','EXECUTE'
     ) then
    raise exception 'courtesy release writer privileges are unsafe';
  end if;
  if pg_catalog.has_function_privilege(
       'service_role','public.portal_content_publication_authorized(uuid,uuid,integer)','EXECUTE'
     ) then
    raise exception 'private publication authorization predicate is executable';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_content_courtesy_release(uuid,integer,text,text,uuid)'::regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%portal_feature_enabled%agency_mutations%'
     or v_def not ilike '%portal_fact_check_release_complete%'
     or v_def not ilike '%v_producer is distinct from ''studio''%'
     or v_def not ilike '%portal_ensure_schedule_targets%'
     or v_def not ilike '%status = ''approved''%'
     or v_def not ilike '%review_ready_at = null%'
     or v_def not ilike '%content_courtesy_releases%'
     or v_def not ilike '%for update%' then
    raise exception 'courtesy release writer is missing a required guard';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.record_publication_observation(uuid,text,text,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,uuid,text)'::regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%portal_content_publication_authorized%'
     or v_def ilike '%content is not approved for publication%' then
    raise exception 'publication writer did not adopt the reviewed authorization predicate';
  end if;
end;
$$;
revoke all on function public.assert_portal_courtesy_release_security() from public, anon, authenticated;
grant execute on function public.assert_portal_courtesy_release_security() to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice36_security();
  perform public.assert_portal_courtesy_release_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
