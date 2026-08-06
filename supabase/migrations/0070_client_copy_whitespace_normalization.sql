-- Canonical repository files reject trailing horizontal whitespace, while browser
-- textareas can retain it invisibly. Normalize that non-rendering whitespace at
-- request intake and at the legacy bundle boundary so every layer compares the
-- same visible client copy without weakening git diff --check.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.request_content_edit(uuid,integer,text,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.portal_core_request_content_edit(uuid,integer,text,text,uuid)') is not null
     or pg_catalog.to_regprocedure('public.portal_core_mark_content_request_bundle_prepared(uuid[],text,text,uuid)') is not null then
    raise exception '0070 requires the current content-request reconciliation boundary';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice69_security;
revoke all on function public.assert_portal_slice69_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice69_security() to service_role;

create function public.portal_normalize_client_copy(p_value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.replace(pg_catalog.replace(p_value, E'\r\n', E'\n'), E'\r', E'\n'),
      E'[ \t]+\n', E'\n', 'g'
    ),
    E' \t\n'
  )
$$;
revoke all on function public.portal_normalize_client_copy(text)
  from public, anon, authenticated, service_role;

-- Keep the mature intake writer intact and constrain its input at one boundary.
alter function public.request_content_edit(uuid,integer,text,text,uuid)
  rename to portal_core_request_content_edit;
revoke all on function public.portal_core_request_content_edit(uuid,integer,text,text,uuid)
  from public, anon, authenticated, service_role;

create function public.request_content_edit(
  p_content_id uuid,
  p_content_version integer,
  p_block_key text,
  p_proposed_text text,
  p_idempotency_key uuid
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.portal_core_request_content_edit(
    p_content_id,
    p_content_version,
    p_block_key,
    public.portal_normalize_client_copy(p_proposed_text),
    p_idempotency_key
  )
$$;
revoke all on function public.request_content_edit(uuid,integer,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_content_edit(uuid,integer,text,text,uuid)
  to authenticated;

-- Preserve the exact-block and reviewed-leading-segment verifier. Before it runs,
-- canonicalize any pre-0070 request rows and recompute the original intake fingerprint.
-- The updates and the core verifier share one transaction, so a verifier failure rolls
-- every normalization update back.
alter function public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)
  rename to portal_core_mark_content_request_bundle_prepared;
revoke all on function public.portal_core_mark_content_request_bundle_prepared(uuid[],text,text,uuid)
  from public, anon, authenticated, service_role;

create function public.mark_content_request_bundle_prepared(
  p_request_ids uuid[],
  p_commit_sha text,
  p_actor_key text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.content_change_requests%rowtype;
  v_payload jsonb;
begin
  for v_request in
    select *
    from public.content_change_requests r
    where r.id = any(p_request_ids)
      and r.request_type = 'edit'
      and r.payload->>'proposed_text' is not null
    order by r.id
    for update
  loop
    v_payload := pg_catalog.jsonb_set(
      v_request.payload,
      '{proposed_text}',
      pg_catalog.to_jsonb(public.portal_normalize_client_copy(v_request.payload->>'proposed_text')),
      true
    );
    update public.content_change_requests
    set payload = v_payload,
        request_fingerprint = pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(
              pg_catalog.jsonb_build_object(
                'content_id', v_request.content_id,
                'version', v_request.base_version,
                'payload', v_payload
              )::text,
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        )
    where id = v_request.id;
  end loop;

  return public.portal_core_mark_content_request_bundle_prepared(
    p_request_ids,
    p_commit_sha,
    p_actor_key,
    p_idempotency_key
  );
end;
$$;
revoke all on function public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)
  to service_role;

-- 0042 originally inspected the public intake writer directly. It now checks both
-- the normalizing boundary and the preserved core writer.
create or replace function public.assert_portal_content_request_recovery_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
  v_core_def text;
begin
  if not exists(select 1 from public.activity_event_types where event_type = 'request_superseded') then
    raise exception 'request superseded activity vocabulary is missing';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%client_visible_version%'
     or v_def not ilike '%portal_command_receipts%'
     or v_def not ilike '%portal_feature_enabled%'
     or v_def not ilike '%status <> ''pending''%'
     or v_def not ilike '%activity_log%'
     or v_def not ilike '%portal_inbox_events%' then
    raise exception 'content request recovery writer is incomplete';
  end if;
  select pg_catalog.pg_get_functiondef('public.begin_content_revision(uuid,integer)'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not ilike '%open_content_edit_request%'
     or v_def not ilike '%''applying''%' then
    raise exception 'agency revision does not block an open client edit';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.request_content_edit(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  select pg_catalog.pg_get_functiondef(
    'public.portal_core_request_content_edit(uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
  ) into v_core_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_normalize_client_copy%'
     or v_core_def is null or v_core_def not ilike '%content_revision_in_progress%'
     or v_core_def not ilike '%security definer%' then
    raise exception 'client edit normalization or revision guard is incomplete';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.begin_content_request_revision(uuid,uuid,integer)'::pg_catalog.regprocedure
  ) into v_def;
  if v_def is null or v_def not ilike '%another_open_content_edit_request%'
     or v_def not ilike '%repository_worker%'
     or v_def not ilike '%security definer%' then
    raise exception 'request-specific revision writer is incomplete';
  end if;
  if not exists(
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'content request recovery writer has an unsafe search path';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.supersede_content_request_with_released_version(uuid,uuid,integer,text,text,uuid)', 'EXECUTE'
     ) then
    raise exception 'content request recovery writer privileges are unsafe';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.begin_content_request_revision(uuid,uuid,integer)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.begin_content_request_revision(uuid,uuid,integer)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.begin_content_request_revision(uuid,uuid,integer)', 'EXECUTE'
     ) then
    raise exception 'request-specific revision writer privileges are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_content_request_recovery_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_content_request_recovery_security()
  to service_role;

-- 0056 and 0059 now inspect the preserved core verifier plus the normalizing wrapper.
create or replace function public.assert_portal_bundle_line_endings_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
  v_core_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  select pg_catalog.pg_get_functiondef(
    'public.portal_core_mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
  ) into v_core_def;
  if v_def is null
     or v_def not ilike '%portal_normalize_client_copy%'
     or v_core_def is null
     or v_core_def not ilike '%pg_catalog.replace(pg_catalog.replace%'
     or v_core_def ilike '%regexp_replace(v_working_body%' then
    raise exception 'content request bundle line-ending normalization drifted';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'content request bundle writer has an unsafe search path';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     ) then
    raise exception 'content request bundle writer grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_bundle_line_endings_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_bundle_line_endings_security()
  to service_role;

create or replace function public.assert_portal_request_bundle_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
  v_core_def text;
begin
  if not exists (
    select 1 from pg_catalog.pg_indexes i
    where i.schemaname = 'public'
      and i.indexname = 'content_change_requests_canonical_result_lookup'
      and i.indexdef not ilike '%unique%'
  ) then
    raise exception 'content request bundle lookup index is unsafe';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  select pg_catalog.pg_get_functiondef(
    'public.portal_core_mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
  ) into v_core_def;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_normalize_client_copy%'
     or v_def not ilike '%request_fingerprint%'
     or v_core_def is null or v_core_def not ilike '%security definer%'
     or v_core_def not ilike '%pg_advisory_xact_lock%'
     or v_core_def not ilike '%repository_reconciliation_disabled%'
     or v_core_def not ilike '%bundle must have exactly one applying lead request%'
     or v_core_def not ilike '%bundle request does not exactly match the synced copy%'
     or v_core_def not ilike '%for update%' then
    raise exception 'content request bundle normalization or core writer drifted';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'content request bundle writer has an unsafe search path';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     ) then
    raise exception 'content request bundle writer grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_request_bundle_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_request_bundle_security()
  to service_role;

create or replace function public.assert_portal_bundle_partial_segments_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_def text;
  v_core_def text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
  ) into v_def;
  select pg_catalog.pg_get_functiondef(
    'public.portal_core_mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
  ) into v_core_def;
  if v_def is null
     or v_def not ilike '%portal_normalize_client_copy%'
     or v_core_def is null
     or v_core_def not ilike '%exact block or leading segment%'
     or v_core_def not ilike '%char_length(v_proposed_body) >= 20%'
     or v_core_def not ilike '%original_checksum%'
     or v_core_def ilike '%regexp_replace(v_working_body%' then
    raise exception 'content request partial-segment normalization or verifier drifted';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'content request bundle writer has an unsafe search path';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     ) then
    raise exception 'content request bundle writer grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_bundle_partial_segments_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_bundle_partial_segments_security()
  to service_role;

create function public.assert_portal_client_copy_normalization_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized text;
begin
  v_normalized := public.portal_normalize_client_copy(
    E'  First line. \t\r\nSecond line.  \rThird line.\t\n  '
  );
  if v_normalized is distinct from E'First line.\nSecond line.\nThird line.' then
    raise exception 'client copy whitespace normalizer drifted';
  end if;
  if pg_catalog.has_function_privilege(
       'anon', 'public.request_content_edit(uuid,integer,text,text,uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.request_content_edit(uuid,integer,text,text,uuid)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.portal_core_request_content_edit(uuid,integer,text,text,uuid)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.portal_core_mark_content_request_bundle_prepared(uuid[],text,text,uuid)', 'EXECUTE'
     ) then
    raise exception 'client copy normalization boundary grants are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_client_copy_normalization_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_client_copy_normalization_security()
  to service_role;

create or replace function public.assert_portal_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_portal_slice69_security();
  perform public.assert_portal_client_copy_normalization_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
