-- 0102: reverse an agency courtesy release and return the same visible version to client review.
-- The active courtesy row is removed because every publication reader treats its presence as
-- approval. Its complete contents are preserved in a private reversal audit row first.

begin;

set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_content_publication_authorized(uuid,uuid,integer)') is null
     or pg_catalog.to_regprocedure('public.portal_client_summary_shape_valid(text)') is null
     or pg_catalog.to_regclass('public.content_courtesy_releases') is null
     or pg_catalog.to_regclass('public.content_review_drafts') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.projection_outbox') is null then
    raise exception '0102 requires courtesy releases, durable review drafts, and the portal security fold';
  end if;
end;
$$;

select public.assert_portal_security();

insert into public.activity_event_types (event_type)
values ('courtesy_release_reversed')
on conflict (event_type) do nothing;

update public.activity_event_types
set agency_internal = true
where event_type = 'courtesy_release_reversed';

create table public.content_courtesy_release_reversals (
  id uuid primary key default gen_random_uuid(),
  original_release_id uuid not null unique,
  client_id uuid not null references public.clients(id) on delete cascade,
  content_id uuid not null,
  content_version int not null check (content_version > 0),
  original_reason text not null,
  original_recorded_by_actor_id uuid not null references public.agency_actors(id),
  original_recorded_at timestamptz not null,
  reversal_reason text not null check (
    pg_catalog.char_length(reversal_reason) between 10 and 2000
    and public.portal_client_summary_shape_valid(reversal_reason)
    and pg_catalog.lower(reversal_reason) like 'agency correction authorized by anastasia:%'
  ),
  reversed_by_actor_id uuid not null references public.agency_actors(id),
  reversed_at timestamptz not null default pg_catalog.now(),
  unique (id, client_id),
  foreign key (content_id, client_id, content_version)
    references public.content_item_versions(content_item_id, client_id, version) on delete cascade
);

create index content_courtesy_release_reversals_by_content
  on public.content_courtesy_release_reversals (client_id, content_id, content_version, reversed_at desc);

alter table public.content_courtesy_release_reversals enable row level security;
revoke all on public.content_courtesy_release_reversals from public, anon, authenticated, service_role;
grant select on public.content_courtesy_release_reversals to service_role;

alter table public.content_review_drafts
  drop constraint content_review_drafts_discard_reason_check;
alter table public.content_review_drafts
  add constraint content_review_drafts_discard_reason_check check (
    discard_reason is null
    or discard_reason in ('client_discarded','reverted','emptied','agency_applied')
  );

create function public.agency_reopen_review(
  p_content_id uuid,
  p_content_version int,
  p_reason text,
  p_actor_key text,
  p_idempotency_key uuid,
  p_discard_draft_ids uuid[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.content_items%rowtype;
  v_actor public.agency_actors%rowtype;
  v_release public.content_courtesy_releases%rowtype;
  v_receipt public.portal_command_receipts%rowtype;
  v_title text;
  v_reason text := pg_catalog.btrim(p_reason);
  v_draft_ids uuid[] := coalesce(p_discard_draft_ids, '{}'::uuid[]);
  v_discarded_draft_ids uuid[] := '{}'::uuid[];
  v_fingerprint text;
  v_response jsonb;
  v_reversal_id uuid;
  v_revision bigint;
begin
  if p_content_id is null or p_content_version is null or p_content_version < 1
     or p_idempotency_key is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 10 and 2000
     or not public.portal_client_summary_shape_valid(v_reason)
     or pg_catalog.lower(v_reason) not like 'agency correction authorized by anastasia:%' then
    raise exception 'invalid reopen review request: reason must start "Agency correction authorized by Anastasia:"';
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
      'content_id', p_content_id,
      'content_version', p_content_version,
      'reason', v_reason,
      'actor', p_actor_key,
      'discard_draft_ids', v_draft_ids
    )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'agency-reopen-review:' || v_item.client_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_receipt
  from public.portal_command_receipts r
  where r.client_id = v_item.client_id
    and r.idempotency_key = p_idempotency_key::text;
  if found then
    if v_receipt.command_type <> 'agency_reopen_review'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different reopen review request';
    end if;
    return v_receipt.response;
  end if;

  if v_item.archived_at is not null then
    raise exception 'content item is archived';
  end if;
  if v_item.publication_locked_version is not null or v_item.first_live_at is not null then
    raise exception 'publication-locked content cannot be reopened for review';
  end if;
  if not v_item.client_visible
     or v_item.client_visible_version is distinct from p_content_version
     or v_item.working_version is distinct from p_content_version then
    raise exception 'reopen review version is not the current visible working version';
  end if;
  if v_item.revision_in_progress then
    raise exception 'content revision is already in progress';
  end if;
  if v_item.status <> 'approved' then
    raise exception 'only approved content can be reopened for review';
  end if;
  if exists (
    select 1 from public.approvals a
    where a.client_id = v_item.client_id
      and a.content_id = v_item.id
      and a.content_version = p_content_version
  ) then
    raise exception 'a client decision exists for this content version';
  end if;

  select * into v_release
  from public.content_courtesy_releases cr
  where cr.client_id = v_item.client_id
    and cr.content_id = v_item.id
    and cr.content_version = p_content_version
  for update;
  if not found then
    raise exception 'no courtesy release exists for this content version';
  end if;

  select cv.title into v_title
  from public.content_item_versions cv
  where cv.content_item_id = v_item.id
    and cv.client_id = v_item.client_id
    and cv.version = p_content_version;
  if not found then raise exception 'released content snapshot not found'; end if;

  if pg_catalog.array_position(v_draft_ids, null) is not null then
    raise exception 'discard draft ids must not contain null';
  end if;
  perform 1
  from public.content_review_drafts d
  where d.id = any(v_draft_ids)
  for update;
  if exists (
    select 1
    from pg_catalog.unnest(v_draft_ids) requested(id)
    left join public.content_review_drafts d on d.id = requested.id
    where d.id is null
       or d.client_id <> v_item.client_id
       or d.content_item_id <> v_item.id
       or d.status <> 'unsent'
       or d.base_version > p_content_version
  ) then
    raise exception 'draft is not an eligible unsent draft for this content version';
  end if;

  insert into public.content_courtesy_release_reversals (
    original_release_id, client_id, content_id, content_version,
    original_reason, original_recorded_by_actor_id, original_recorded_at,
    reversal_reason, reversed_by_actor_id
  ) values (
    v_release.id, v_release.client_id, v_release.content_id, v_release.content_version,
    v_release.reason, v_release.recorded_by_actor_id, v_release.recorded_at,
    v_reason, v_actor.id
  ) returning id into v_reversal_id;

  delete from public.content_courtesy_releases
  where id = v_release.id;

  update public.content_items
  set status = 'draft',
      review_ready_at = pg_catalog.now(),
      revision_in_progress = false,
      projection_revision = projection_revision + 1,
      updated_at = pg_catalog.now()
  where id = v_item.id
  returning projection_revision into v_revision;

  with discarded as (
    update public.content_review_drafts d
    set status = 'discarded',
        discarded_at = pg_catalog.now(),
        discard_reason = 'agency_applied',
        updated_at = pg_catalog.now()
    where d.id = any(v_draft_ids)
    returning d.id
  )
  select coalesce(pg_catalog.array_agg(discarded.id order by discarded.id), '{}'::uuid[])
    into v_discarded_draft_ids
  from discarded;

  insert into public.activity_log (
    client_id, content_id, content_version, event_type, event_key,
    title, summary, actor_type, actor_name
  ) values (
    v_item.client_id, v_item.id, p_content_version, 'courtesy_release_reversed',
    'reopen-review:' || v_reversal_id::text,
    'Courtesy release reversed: ' || v_title, v_reason, 'anastasia', v_actor.display_name
  );

  insert into public.activity_log (
    client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name
  ) values (
    v_item.client_id, v_item.id, p_content_version, 'needs_review',
    'Needs review: ' || v_title, null, 'agent', 'The Dot'
  );

  insert into public.portal_inbox_events (
    client_id, event_key, event_type, object_type, object_id,
    actor_type, actor_name, payload, requires_reconciliation
  ) values (
    v_item.client_id, 'reopen-review:' || v_reversal_id::text,
    'courtesy_release_reversed', 'content_courtesy_release_reversal', v_reversal_id,
    'anastasia', v_actor.display_name,
    pg_catalog.jsonb_build_object(
      'content_id', v_item.id,
      'content_version', p_content_version,
      'original_release_id', v_release.id,
      'discarded_draft_ids', v_discarded_draft_ids
    ), false
  );

  insert into public.projection_outbox (
    client_id, event_key, destination, operation, object_type,
    object_key, object_revision, payload
  ) values (
    v_item.client_id, 'reopen-review:' || v_reversal_id::text,
    'notion', 'upsert', 'content', v_item.id::text, v_revision,
    pg_catalog.jsonb_build_object(
      'reason', 'courtesy_release_reversed',
      'content_version', p_content_version,
      'reversal_id', v_reversal_id
    )
  );

  v_response := pg_catalog.jsonb_build_object(
    'outcome', 'reopened',
    'content_id', v_item.id,
    'content_version', p_content_version,
    'reversal_id', v_reversal_id,
    'discarded_draft_ids', v_discarded_draft_ids
  );

  insert into public.portal_command_receipts (
    client_id, command_type, idempotency_key, request_fingerprint, response
  ) values (
    v_item.client_id, 'agency_reopen_review', p_idempotency_key::text, v_fingerprint, v_response
  );

  return v_response;
end;
$$;

revoke all on function public.agency_reopen_review(uuid,integer,text,text,uuid,uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.agency_reopen_review(uuid,integer,text,text,uuid,uuid[])
  to service_role;

create function public.assert_reopen_review_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_columns text[];
  v_def text;
begin
  select pg_catalog.array_agg(column_name order by column_name) into v_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'content_courtesy_release_reversals'
    and grantee = 'service_role'
    and privilege_type = 'SELECT';
  if v_columns is distinct from array[
    'client_id', 'content_id', 'content_version', 'id', 'original_reason',
    'original_recorded_at', 'original_recorded_by_actor_id', 'original_release_id',
    'reversal_reason', 'reversed_at', 'reversed_by_actor_id'
  ] then
    raise exception 'content_courtesy_release_reversals service_role select grant drifted';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.content_courtesy_release_reversals', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.content_courtesy_release_reversals', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_courtesy_release_reversals', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.content_courtesy_release_reversals', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.content_courtesy_release_reversals', 'DELETE')
     or not (select c.relrowsecurity from pg_catalog.pg_class c
             where c.oid = 'public.content_courtesy_release_reversals'::pg_catalog.regclass)
     or exists (
       select 1 from pg_catalog.pg_policies p
       where p.schemaname = 'public' and p.tablename = 'content_courtesy_release_reversals'
     ) then
    raise exception 'content_courtesy_release_reversals privileges or RLS are unsafe';
  end if;

  if pg_catalog.has_function_privilege(
       'anon', 'public.agency_reopen_review(uuid,integer,text,text,uuid,uuid[])', 'EXECUTE'
     ) or pg_catalog.has_function_privilege(
       'authenticated', 'public.agency_reopen_review(uuid,integer,text,text,uuid,uuid[])', 'EXECUTE'
     ) or not pg_catalog.has_function_privilege(
       'service_role', 'public.agency_reopen_review(uuid,integer,text,text,uuid,uuid[])', 'EXECUTE'
     ) then
    raise exception 'agency_reopen_review privileges are unsafe';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.agency_reopen_review(uuid,integer,text,text,uuid,uuid[])'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null
     or v_def not ilike '%security definer%'
     or v_def not ilike '%set search_path to ''''%'
     or v_def not ilike '%portal_feature_enabled%agency_mutations%'
     or v_def not ilike '%publication_locked_version is not null%'
     or v_def not ilike '%first_live_at is not null%'
     or v_def not ilike '%content_courtesy_releases%delete%'
     or v_def not ilike '%content_courtesy_release_reversals%'
     or v_def not ilike '%agency correction authorized by anastasia:%'
     or v_def not ilike '%discard_reason = ''agency_applied''%'
     or v_def not ilike '%status = ''draft''%'
     or v_def not ilike '%review_ready_at = pg_catalog.now()%'
     or v_def not ilike '%for update%' then
    raise exception 'agency_reopen_review is missing a required guard';
  end if;

  if not exists (
    select 1 from public.activity_event_types t
    where t.event_type = 'courtesy_release_reversed' and t.agency_internal
  ) then
    raise exception 'courtesy_release_reversed must remain agency-internal';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.content_review_drafts'::pg_catalog.regclass
      and c.conname = 'content_review_drafts_discard_reason_check'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%agency_applied%'
  ) then
    raise exception 'content_review_drafts discard reasons do not allow agency_applied';
  end if;
end;
$$;

revoke all on function public.assert_reopen_review_security() from public, anon, authenticated;
grant execute on function public.assert_reopen_review_security() to service_role;

alter function public.assert_portal_security()
  rename to assert_portal_pre_reopen_review_security;
revoke all on function public.assert_portal_pre_reopen_review_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_pre_reopen_review_security()
  to service_role;

create function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_pre_reopen_review_security();
  perform public.assert_reopen_review_security();
end;
$$;

revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
