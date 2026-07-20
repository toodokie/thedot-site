-- Client Work Assistant, OpenAI rebuild (spec: portal-integration-task.md section 5.6 + 3.18).
-- Replaces the 0017 usage plane with the signed spec's shape:
--   assistant_documents / assistant_document_chunks: the tenant-scoped SAFE KNOWLEDGE INDEX,
--     a deliberately smaller assistant-readable projection built only from already
--     client-readable safe surfaces, with grounded_answer vs navigation_only trust classes;
--   assistant_runs: privacy-safe run telemetry (query HMAC, chunk/citation ids, outcome,
--     tokens, cost, latency). Raw questions and answers are NEVER persisted;
--   assistant_feedback: the monitored "report this answer" path;
--   portal_assistant_search: the ONLY client retrieval boundary (membership-derived tenant,
--     switch + capability checked inside, capped results, safe excerpts, opaque citation ids);
--   portal_assistant_reserve_run: ATOMIC launch guardrails, server-side only: 30 generations
--     per user/day, 120 per tenant/day, combined OpenAI soft alert 1500 cost-cents/month and
--     hard stop 2500 cost-cents/month. Capacity is RESERVED in one locked database operation
--     (global advisory xact lock + a reservation row at a conservative cost estimate) BEFORE
--     any model call, so two concurrent requests can never both pass a nearly-exhausted
--     limit. Fail closed;
--   portal_assistant_settle_run: settles a reservation with actual outcome/usage; an
--     unsettled reservation stays safety_outcome 'error' at the reserved cost (conservative);
--   portal_assistant_log_run: writer for NON-generation outcomes (refusals, no-grounding
--     without a call, pre-reservation errors); service role only;
--   portal_assistant_reindex: service-only rebuild/reconciliation of a tenant's index.
-- portal_assistant_gate (0017) survives unchanged. 0017's assistant_usage table and its
-- budget/logging RPCs are dropped (the feature has never been enabled anywhere, the table is
-- empty by construction: the 'assistant' switch shipped OFF and no capability was granted).
-- This migration flips no switch and grants no capability.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_assistant_gate(uuid)') is null
     or pg_catalog.to_regprocedure('public.portal_feature_enabled(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.my_client_ids()') is null
     or pg_catalog.to_regclass('public.assistant_usage') is null
     or pg_catalog.to_regclass('public.content_with_state') is null then
    raise exception '0017/base portal objects must exist before applying 0018';
  end if;
  if exists (select 1 from public.assistant_usage) then
    raise exception '0018 expects an empty assistant_usage (feature was never enabled); found rows';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice12_security;
revoke all on function public.assert_portal_slice12_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice12_security() to service_role;

-- --- retire the 0017 usage plane ---------------------------------------------
drop function public.portal_assistant_check_budget(uuid);
drop function public.portal_assistant_log_usage(uuid,text,text,int,int,numeric,text);
drop table public.assistant_usage;

-- 0017's assertion described the dropped plane; re-point it at what survives (the gate and
-- the absence of the retired objects) so the folded slice12 cumulative stays truthful.
create or replace function public.assert_portal_assistant_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  if pg_catalog.to_regclass('public.assistant_usage') is not null
     or pg_catalog.to_regprocedure('public.portal_assistant_check_budget(uuid)') is not null
     or pg_catalog.to_regprocedure('public.portal_assistant_log_usage(uuid,text,text,int,int,numeric,text)') is not null then
    raise exception '0017 assistant usage plane must be retired'; end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'portal_assistant_gate'
      and (not p.prosecdef or not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']))) then
    raise exception 'assistant gate is not hardened'; end if;
  if not pg_catalog.has_function_privilege('authenticated','public.portal_assistant_gate(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_gate(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_assistant_gate(uuid)','EXECUTE') then
    raise exception 'unsafe assistant gate privilege'; end if;
end;
$$;
revoke all on function public.assert_portal_assistant_security() from public,anon,authenticated;
grant execute on function public.assert_portal_assistant_security() to service_role;

-- --- safe knowledge index ----------------------------------------------------
-- One row per client-readable source object. answer_eligibility is the trust class:
-- grounded_answer only for approved/live client-facing material; free-form client-authored
-- bodies (ideas, comments, requests) are navigation_only METADATA (type/date/title/route),
-- their raw bodies are never chunked and so never reach OpenAI (PII / prompt-injection wall).
create table public.assistant_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_type text not null check (source_type in (
    'content_item','report','recommendation','link','idea','invoice','comment','request'
  )),
  source_id text not null check (pg_catalog.char_length(source_id) between 1 and 200),
  source_version text not null check (pg_catalog.char_length(source_version) between 1 and 100),
  title text not null check (pg_catalog.char_length(title) between 1 and 300),
  related_route text not null check (related_route ~ '^[a-z0-9][a-zA-Z0-9/_-]{0,199}$'),
  answer_eligibility text not null check (answer_eligibility in ('navigation_only','grounded_answer')),
  content_checksum text not null check (content_checksum ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (client_id, source_type, source_id, source_version)
);
create index assistant_documents_tenant on public.assistant_documents (client_id, source_type);

create table public.assistant_document_chunks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  document_id uuid not null references public.assistant_documents(id) on delete cascade,
  chunk_key text not null check (chunk_key ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  body text not null check (pg_catalog.char_length(body) between 1 and 4000),
  search_vector tsvector generated always as (to_tsvector('english'::regconfig, body)) stored,
  unique (document_id, chunk_key)
);
create index assistant_document_chunks_tenant on public.assistant_document_chunks (client_id);
create index assistant_document_chunks_search
  on public.assistant_document_chunks using gin (search_vector);

alter table public.assistant_documents enable row level security;
alter table public.assistant_document_chunks enable row level security;
revoke all on public.assistant_documents from public,anon,authenticated;
revoke all on public.assistant_document_chunks from public,anon,authenticated;
grant select on public.assistant_documents to service_role;
grant select on public.assistant_document_chunks to service_role;

-- --- run telemetry (privacy-safe; never the question or the answer) ----------
create table public.assistant_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null,
  mode text not null check (mode in (
    'portal_workspace','public_immigration_research','refused_case_specific'
  )),
  query_hmac text not null check (query_hmac ~ '^[0-9a-f]{64}$'),
  retrieved_chunk_ids uuid[] not null default '{}',
  citation_chunk_ids uuid[] not null default '{}',
  citation_urls text[] not null default '{}',
  safety_outcome text not null check (safety_outcome in (
    'answered','no_grounding','case_specific_refusal','moderation_refusal',
    'source_validation_failed','error'
  )),
  model text not null check (pg_catalog.char_length(model) between 1 and 100),
  prompt_version text not null check (pg_catalog.char_length(prompt_version) between 1 and 40),
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cost_cents numeric(12,4) not null default 0 check (cost_cents >= 0),
  latency_ms int not null default 0 check (latency_ms >= 0),
  -- generation: this run consumed (or reserved) an OpenAI generation and counts against the
  -- per-user/per-tenant daily caps. settled_at: reservation lifecycle; a generation row with
  -- settled_at null is a reservation whose request never completed (outcome stays 'error').
  generation boolean not null default false,
  settled_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);
create index assistant_runs_tenant_time on public.assistant_runs (client_id, created_at desc);
create index assistant_runs_user_time on public.assistant_runs (auth_user_id, created_at desc);

alter table public.assistant_runs enable row level security;
revoke all on public.assistant_runs from public,anon,authenticated;
grant select on public.assistant_runs to service_role;

-- --- "report this answer" ----------------------------------------------------
-- v1 stores run/category/comment only. answer_snapshot_encrypted stays null until the
-- separate consent + encryption design lands; expires_at bounds retention either way.
create table public.assistant_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null,
  run_id uuid not null references public.assistant_runs(id) on delete cascade,
  category text not null check (category in ('inaccurate','unsafe','other')),
  comment text check (comment is null or pg_catalog.char_length(comment) <= 2000),
  answer_snapshot_encrypted text,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now()
);
create index assistant_feedback_tenant_time on public.assistant_feedback (client_id, created_at desc);

alter table public.assistant_feedback enable row level security;
revoke all on public.assistant_feedback from public,anon,authenticated;
grant select on public.assistant_feedback to service_role;

-- --- service-only index rebuild/reconciliation -------------------------------
-- Atomically rebuilds one tenant's safe index from the already client-readable safe
-- surfaces. Reading THROUGH content_with_state (the released client projection) means
-- unreleased working copy can never enter the index; the other sources are the same
-- tables/views the tenant reads directly under RLS, projected to their client-safe fields.
-- Deterministic chunking: stable keys from source version/section, bounded bodies.
create or replace function public.portal_assistant_reindex(p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_docs bigint;
  v_chunks bigint;
begin
  if p_client_id is null or not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'assistant reindex: unknown client';
  end if;

  delete from public.assistant_documents d where d.client_id = p_client_id;

  -- content pieces: grounded once approved/externally committed/live; a piece still under
  -- review (or back with The Dot) is navigation_only so its claims are never presented as
  -- verified truth. Archived pieces are not indexed.
  insert into public.assistant_documents
    (client_id, source_type, source_id, source_version, title, related_route,
     answer_eligibility, content_checksum)
  select
    cws.client_id, 'content_item', cws.content_id, cws.version::text, cws.title,
    'piece/' || cws.content_id,
    case when cws.client_state in (
      'approved','scheduled','partially_scheduled','reschedule_pending',
      'cancel_pending','schedule_failed','live'
    ) then 'grounded_answer' else 'navigation_only' end,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      cws.title || '|' || coalesce(cws.client_body,'') || '|' || cws.copy_blocks::text
        || '|' || cws.client_state, 'UTF8'), 'sha256'), 'hex')
  from public.content_with_state cws
  where cws.client_id = p_client_id and cws.archived_at is null;

  -- every content doc gets a meta chunk (status/dates/platforms, plain words)
  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'meta', pg_catalog.left(
    'Piece: ' || cws.title || '. Status: '
      || case when cws.client_state = 'needs_review'
              then 'needs review (awaiting your approval)'
              else pg_catalog.replace(cws.client_state, '_', ' ') end
      || coalesce('. Planned date: ' || pg_catalog.to_char(cws.planned_date, 'FMMonth DD, YYYY'), '')
      || case when cws.platforms is not null and pg_catalog.cardinality(cws.platforms) > 0
              then '. Platforms: ' || pg_catalog.array_to_string(cws.platforms, ', ') else '' end
      || coalesce('. Format: ' || cws.format, '')
      || coalesce('. Latest decision: ' || pg_catalog.replace(cws.current_decision, '_', ' '), '')
      || '.', 4000)
  from public.assistant_documents d
  join public.content_with_state cws
    on cws.client_id = d.client_id and cws.content_id = d.source_id
   and cws.version::text = d.source_version
  where d.client_id = p_client_id and d.source_type = 'content_item';

  -- released body + copy blocks: grounded documents only (navigation_only stays metadata)
  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'body', pg_catalog.left(cws.client_body, 4000)
  from public.assistant_documents d
  join public.content_with_state cws
    on cws.client_id = d.client_id and cws.content_id = d.source_id
   and cws.version::text = d.source_version
  where d.client_id = p_client_id and d.source_type = 'content_item'
    and d.answer_eligibility = 'grounded_answer'
    and cws.client_body is not null and pg_catalog.char_length(cws.client_body) > 0;

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id,
    'block-' || (block.value->>'key'),
    pg_catalog.left(coalesce(block.value->>'label','Copy') || ': ' || (block.value->>'body'), 4000)
  from public.assistant_documents d
  join public.content_with_state cws
    on cws.client_id = d.client_id and cws.content_id = d.source_id
   and cws.version::text = d.source_version
  cross join lateral pg_catalog.jsonb_array_elements(cws.copy_blocks) block
  where d.client_id = p_client_id and d.source_type = 'content_item'
    and d.answer_eligibility = 'grounded_answer'
    and (block.value->>'key') ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    and coalesce(block.value->>'body','') <> '';

  -- performance reports (agency-fed, client-visible): grounded
  insert into public.assistant_documents
    (client_id, source_type, source_id, source_version, title, related_route,
     answer_eligibility, content_checksum)
  select r.client_id, 'report', r.id::text, pg_catalog.to_char(r.updated_at, 'YYYYMMDDHH24MISS'),
    pg_catalog.left('Performance report ' || r.period || ' (' || r.platform || ')', 300),
    'reports', 'grounded_answer',
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      r.period || '|' || r.platform || '|' || coalesce(r.summary,'') || '|' || r.metrics::text,
      'UTF8'), 'sha256'), 'hex')
  from public.report_snapshots r where r.client_id = p_client_id;

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'summary', pg_catalog.left(
    'Report ' || r.period || ' for ' || r.platform || ' ('
      || pg_catalog.to_char(r.period_start, 'FMMonth DD') || ' to '
      || pg_catalog.to_char(r.period_end, 'FMMonth DD, YYYY') || '): ' || r.summary, 4000)
  from public.assistant_documents d
  join public.report_snapshots r on r.id::text = d.source_id and r.client_id = d.client_id
  where d.client_id = p_client_id and d.source_type = 'report'
    and r.summary is not null and pg_catalog.char_length(r.summary) > 0;

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'metrics', pg_catalog.left(
    'Metrics for ' || r.period || ' ' || r.platform || ': ' || r.metrics::text, 4000)
  from public.assistant_documents d
  join public.report_snapshots r on r.id::text = d.source_id and r.client_id = d.client_id
  where d.client_id = p_client_id and d.source_type = 'report';

  -- active recommendations (agency-authored, client-visible): grounded
  insert into public.assistant_documents
    (client_id, source_type, source_id, source_version, title, related_route,
     answer_eligibility, content_checksum)
  select rec.client_id, 'recommendation', rec.id::text,
    pg_catalog.to_char(rec.updated_at, 'YYYYMMDDHH24MISS'),
    pg_catalog.left(rec.title, 300), 'strategy', 'grounded_answer',
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      rec.title || '|' || rec.body || '|' || rec.category, 'UTF8'), 'sha256'), 'hex')
  from public.recommendations rec
  where rec.client_id = p_client_id and rec.status = 'active';

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'body', pg_catalog.left(
    'Recommendation (' || rec.category || coalesce(', ' || rec.platform, '') || '): '
      || rec.title || '. ' || rec.body, 4000)
  from public.assistant_documents d
  join public.recommendations rec on rec.id::text = d.source_id and rec.client_id = d.client_id
  where d.client_id = p_client_id and d.source_type = 'recommendation';

  -- library links (agency-curated): grounded
  insert into public.assistant_documents
    (client_id, source_type, source_id, source_version, title, related_route,
     answer_eligibility, content_checksum)
  select l.client_id, 'link', l.id::text, pg_catalog.to_char(l.updated_at, 'YYYYMMDDHH24MISS'),
    pg_catalog.left(l.label, 300), 'library', 'grounded_answer',
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      l.label || '|' || l.category || '|' || l.url || '|' || coalesce(l.description,''),
      'UTF8'), 'sha256'), 'hex')
  from public.links l where l.client_id = p_client_id;

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'link', pg_catalog.left(
    'Library link (' || l.category || '): ' || l.label
      || coalesce('. ' || l.description, '') || '. URL: ' || l.url, 4000)
  from public.assistant_documents d
  join public.links l on l.id::text = d.source_id and l.client_id = d.client_id
  where d.client_id = p_client_id and d.source_type = 'link';

  -- invoices (client-safe billing view fields only; never the document object key)
  insert into public.assistant_documents
    (client_id, source_type, source_id, source_version, title, related_route,
     answer_eligibility, content_checksum)
  select i.client_id, 'invoice', i.id::text, pg_catalog.to_char(i.updated_at, 'YYYYMMDDHH24MISS'),
    pg_catalog.left('Invoice ' || i.number, 300), 'billing', 'grounded_answer',
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      i.number || '|' || i.amount::text || '|' || i.status || '|' || i.issued_at::text,
      'UTF8'), 'sha256'), 'hex')
  from public.invoices_client i where i.client_id = p_client_id;

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'invoice', pg_catalog.left(
    'Invoice ' || i.number || ': ' || i.amount::text || ' ' || i.currency
      || ', status ' || i.status
      || ', issued ' || pg_catalog.to_char(i.issued_at, 'FMMonth DD, YYYY')
      || coalesce(', period ' || pg_catalog.to_char(i.period_start, 'FMMonth DD')
        || ' to ' || pg_catalog.to_char(i.period_end, 'FMMonth DD, YYYY'), ''), 4000)
  from public.assistant_documents d
  join public.invoices_client i on i.id::text = d.source_id and i.client_id = d.client_id
  where d.client_id = p_client_id and d.source_type = 'invoice';

  -- ideas: navigation_only metadata (type/date/title/status). The free-form body is
  -- client-authored and is deliberately NOT indexed (PII / injection wall).
  insert into public.assistant_documents
    (client_id, source_type, source_id, source_version, title, related_route,
     answer_eligibility, content_checksum)
  select ci.client_id, 'idea', ci.id::text, pg_catalog.to_char(ci.updated_at, 'YYYYMMDDHH24MISS'),
    pg_catalog.left(ci.title, 300), 'ideas', 'navigation_only',
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      ci.title || '|' || ci.status, 'UTF8'), 'sha256'), 'hex')
  from public.content_ideas ci where ci.client_id = p_client_id;

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'meta', pg_catalog.left(
    'Idea: ' || ci.title || '. Status: ' || pg_catalog.replace(ci.status, '_', ' ')
      || '. From: ' || ci.author_type
      || '. Added: ' || pg_catalog.to_char(ci.created_at, 'FMMonth DD, YYYY') || '.', 4000)
  from public.assistant_documents d
  join public.content_ideas ci on ci.id::text = d.source_id and ci.client_id = d.client_id
  where d.client_id = p_client_id and d.source_type = 'idea';

  -- comments: navigation_only metadata; the body is never indexed
  insert into public.assistant_documents
    (client_id, source_type, source_id, source_version, title, related_route,
     answer_eligibility, content_checksum)
  select cm.client_id, 'comment', cm.id::text,
    pg_catalog.to_char(cm.created_at, 'YYYYMMDDHH24MISS')
      || case when cm.resolved then '-resolved' else '' end,
    pg_catalog.left('Comment on ' || cws.title, 300),
    'piece/' || cws.content_id, 'navigation_only',
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      cm.id::text || '|' || cm.author_type || '|' || cm.resolved::text, 'UTF8'), 'sha256'), 'hex')
  from public.comments cm
  join public.content_with_state cws on cws.id = cm.content_id and cws.client_id = cm.client_id
  where cm.client_id = p_client_id;

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'meta', pg_catalog.left(
    'Comment on the piece "' || cws.title || '" from ' || cm.author_type
      || ' on ' || pg_catalog.to_char(cm.created_at, 'FMMonth DD, YYYY')
      || case when cm.resolved then ' (resolved).' else ' (open).' end, 4000)
  from public.assistant_documents d
  join public.comments cm on cm.id::text = d.source_id and cm.client_id = d.client_id
  join public.content_with_state cws on cws.id = cm.content_id and cws.client_id = cm.client_id
  where d.client_id = p_client_id and d.source_type = 'comment';

  -- change requests: navigation_only metadata; the payload is never indexed
  insert into public.assistant_documents
    (client_id, source_type, source_id, source_version, title, related_route,
     answer_eligibility, content_checksum)
  select cr.client_id, 'request', cr.id::text,
    pg_catalog.to_char(cr.updated_at, 'YYYYMMDDHH24MISS'),
    pg_catalog.left('Request: ' || cr.request_type || ' (' || cr.status || ')', 300),
    'requests', 'navigation_only',
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      cr.id::text || '|' || cr.request_type || '|' || cr.status, 'UTF8'), 'sha256'), 'hex')
  from public.content_change_requests cr where cr.client_id = p_client_id;

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'meta', pg_catalog.left(
    'A ' || cr.request_type || ' request submitted '
      || pg_catalog.to_char(cr.created_at, 'FMMonth DD, YYYY')
      || ', current status: ' || pg_catalog.replace(cr.status, '_', ' ') || '.', 4000)
  from public.assistant_documents d
  join public.content_change_requests cr on cr.id::text = d.source_id and cr.client_id = d.client_id
  where d.client_id = p_client_id and d.source_type = 'request';

  select pg_catalog.count(*) into v_docs
    from public.assistant_documents d where d.client_id = p_client_id;
  select pg_catalog.count(*) into v_chunks
    from public.assistant_document_chunks c where c.client_id = p_client_id;
  return pg_catalog.jsonb_build_object('documents', v_docs, 'chunks', v_chunks);
end;
$$;

revoke all on function public.portal_assistant_reindex(uuid) from public,anon,authenticated;
grant execute on function public.portal_assistant_reindex(uuid) to service_role;

-- --- the client search boundary ----------------------------------------------
-- The ONLY way client-side code reaches the index. Tenant comes from the caller's own
-- membership (a foreign client_id fails before any read), the switch + capability gate runs
-- inside the call, results are capped, excerpts bounded, and a content document whose indexed
-- version no longer matches the live released projection is excluded (stale-index guard).
create or replace function public.portal_assistant_search(p_client_id uuid, p_query text)
returns table (
  chunk_id uuid,
  document_id uuid,
  source_type text,
  title text,
  related_route text,
  answer_eligibility text,
  excerpt text,
  rank real
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_query tsquery;
begin
  if p_client_id is null or p_client_id not in (select public.my_client_ids()) then
    raise exception 'portal_action_not_allowed' using errcode = '42501';
  end if;
  perform public.portal_assistant_gate(p_client_id);
  if p_query is null or pg_catalog.char_length(pg_catalog.btrim(p_query)) < 2 then
    return;
  end if;
  v_query := pg_catalog.websearch_to_tsquery('english'::regconfig, pg_catalog.left(p_query, 400));
  return query
  select c.id, d.id, d.source_type, d.title, d.related_route, d.answer_eligibility,
    pg_catalog.left(c.body, 700),
    pg_catalog.ts_rank(c.search_vector, v_query)
  from public.assistant_document_chunks c
  join public.assistant_documents d on d.id = c.document_id and d.client_id = c.client_id
  where c.client_id = p_client_id
    and c.search_vector @@ v_query
    and (
      d.source_type <> 'content_item'
      or exists (
        select 1 from public.content_with_state cws
        where cws.client_id = d.client_id and cws.content_id = d.source_id
          and cws.version::text = d.source_version
      )
    )
  order by pg_catalog.ts_rank(c.search_vector, v_query) desc, c.id
  limit 12;
end;
$$;

revoke all on function public.portal_assistant_search(uuid,text) from public,anon,service_role;
grant execute on function public.portal_assistant_search(uuid,text) to authenticated;

-- --- launch guardrails: atomic reserve-then-settle (fail closed) -------------
-- Spec numbers: 30 generations per user/day, 120 per tenant/day; combined OpenAI monthly
-- budget soft alert at 1500 cost-cents and hard stop at 2500 cost-cents (measured over a
-- rolling 30-day window, at least as strict as a calendar month; the cost sum is ACROSS
-- tenants because the budget protects one OpenAI account). A global advisory xact lock
-- serializes reservations, and the reservation row itself is inserted in the same
-- transaction at a conservative worst-case cost estimate, so two concurrent requests can
-- never both pass a nearly-exhausted limit. The route settles with actual usage afterwards;
-- a crash leaves the reservation as safety_outcome 'error' at the reserved cost.
create or replace function public.portal_assistant_reserve_run(
  p_client_id uuid, p_auth_user_id uuid, p_mode text, p_query_hmac text,
  p_model text, p_prompt_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c_reserve_cost constant numeric := 8; -- worst-case cents per generation (input+output+search)
  v_user_day bigint;
  v_tenant_day bigint;
  v_month_cost numeric;
  v_id uuid;
begin
  if p_client_id is null or not exists (select 1 from public.clients c where c.id = p_client_id) then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'unknown_client', 'soft_alert', false);
  end if;
  if p_auth_user_id is null then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'unknown_user', 'soft_alert', false);
  end if;
  if p_mode is null or p_mode not in ('portal_workspace','public_immigration_research') then
    raise exception 'assistant reserve: invalid mode';
  end if;
  if p_query_hmac is null or p_query_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'assistant reserve: invalid query hmac';
  end if;
  if p_model is null or pg_catalog.char_length(p_model) not between 1 and 100
     or p_prompt_version is null or pg_catalog.char_length(p_prompt_version) not between 1 and 40 then
    raise exception 'assistant reserve: invalid model/prompt version';
  end if;
  if not public.portal_feature_enabled(p_client_id, 'assistant') then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'assistant_disabled', 'soft_alert', false);
  end if;

  -- one budget at a time: serialize every reservation (tiny volume, absolute correctness)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('portal_assistant_budget', 0));

  select pg_catalog.count(*) into v_user_day from public.assistant_runs r
    where r.auth_user_id = p_auth_user_id and r.generation
      and r.created_at > pg_catalog.now() - interval '24 hours';
  select pg_catalog.count(*) into v_tenant_day from public.assistant_runs r
    where r.client_id = p_client_id and r.generation
      and r.created_at > pg_catalog.now() - interval '24 hours';
  select coalesce(pg_catalog.sum(r.cost_cents), 0) into v_month_cost from public.assistant_runs r
    where r.created_at > pg_catalog.now() - interval '30 days';
  if v_user_day >= 30 then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'user_daily_limit', 'soft_alert', false);
  end if;
  if v_tenant_day >= 120 then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'tenant_daily_limit', 'soft_alert', false);
  end if;
  if v_month_cost + c_reserve_cost > 2500 then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'monthly_budget_hard_stop', 'soft_alert', true);
  end if;

  insert into public.assistant_runs (
    client_id, auth_user_id, mode, query_hmac, safety_outcome, model, prompt_version,
    cost_cents, generation
  ) values (
    p_client_id, p_auth_user_id, p_mode, p_query_hmac, 'error', p_model, p_prompt_version,
    c_reserve_cost, true
  ) returning id into v_id;

  return pg_catalog.jsonb_build_object(
    'allowed', true, 'reason', 'ok', 'run_id', v_id,
    'soft_alert', v_month_cost + c_reserve_cost >= 1500);
end;
$$;

create or replace function public.portal_assistant_settle_run(
  p_run_id uuid, p_safety_outcome text,
  p_retrieved_chunk_ids uuid[], p_citation_chunk_ids uuid[], p_citation_urls text[],
  p_input_tokens int, p_output_tokens int, p_cost_cents numeric, p_latency_ms int
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
begin
  if p_safety_outcome is null or p_safety_outcome not in (
    'answered','no_grounding','case_specific_refusal','moderation_refusal',
    'source_validation_failed','error'
  ) then
    raise exception 'assistant settle: invalid safety outcome';
  end if;
  if p_input_tokens is null or p_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_cost_cents is null or p_cost_cents < 0
     or p_latency_ms is null or p_latency_ms < 0 then
    raise exception 'assistant settle: invalid token/cost/latency value';
  end if;
  if p_retrieved_chunk_ids is null or p_citation_chunk_ids is null or p_citation_urls is null
     or pg_catalog.cardinality(p_retrieved_chunk_ids) > 100
     or pg_catalog.cardinality(p_citation_chunk_ids) > 100
     or pg_catalog.cardinality(p_citation_urls) > 40 then
    raise exception 'assistant settle: invalid evidence arrays';
  end if;
  foreach v_url in array p_citation_urls loop
    if v_url is null or v_url !~ '^https://' or pg_catalog.char_length(v_url) > 500 then
      raise exception 'assistant settle: invalid citation url';
    end if;
  end loop;
  update public.assistant_runs r set
    safety_outcome = p_safety_outcome,
    retrieved_chunk_ids = p_retrieved_chunk_ids,
    citation_chunk_ids = p_citation_chunk_ids,
    citation_urls = p_citation_urls,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    cost_cents = p_cost_cents,
    latency_ms = p_latency_ms,
    settled_at = pg_catalog.now()
  where r.id = p_run_id and r.generation and r.settled_at is null;
  if not found then
    raise exception 'assistant settle: reservation missing or already settled';
  end if;
end;
$$;

-- --- writer for NON-generation outcomes --------------------------------------
-- Refusals, moderation stops, no-grounding results served without a model call, and errors
-- that happened before any reservation. These rows never count against the generation caps
-- (generation=false) and are final on insert (settled_at set).
create or replace function public.portal_assistant_log_run(
  p_client_id uuid, p_auth_user_id uuid, p_mode text, p_query_hmac text,
  p_retrieved_chunk_ids uuid[], p_citation_chunk_ids uuid[], p_citation_urls text[],
  p_safety_outcome text, p_model text, p_prompt_version text,
  p_input_tokens int, p_output_tokens int, p_cost_cents numeric, p_latency_ms int
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_url text;
begin
  if p_client_id is null or not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'assistant run: unknown client';
  end if;
  if p_auth_user_id is null then
    raise exception 'assistant run: unknown user';
  end if;
  if p_mode is null or p_mode not in (
    'portal_workspace','public_immigration_research','refused_case_specific'
  ) then
    raise exception 'assistant run: invalid mode';
  end if;
  if p_query_hmac is null or p_query_hmac !~ '^[0-9a-f]{64}$' then
    raise exception 'assistant run: invalid query hmac';
  end if;
  if p_safety_outcome is null or p_safety_outcome not in (
    'answered','no_grounding','case_specific_refusal','moderation_refusal',
    'source_validation_failed','error'
  ) then
    raise exception 'assistant run: invalid safety outcome';
  end if;
  if p_model is null or pg_catalog.char_length(p_model) not between 1 and 100 then
    raise exception 'assistant run: invalid model';
  end if;
  if p_prompt_version is null or pg_catalog.char_length(p_prompt_version) not between 1 and 40 then
    raise exception 'assistant run: invalid prompt version';
  end if;
  if p_input_tokens is null or p_input_tokens < 0
     or p_output_tokens is null or p_output_tokens < 0
     or p_cost_cents is null or p_cost_cents < 0
     or p_latency_ms is null or p_latency_ms < 0 then
    raise exception 'assistant run: invalid token/cost/latency value';
  end if;
  if p_retrieved_chunk_ids is null or p_citation_chunk_ids is null or p_citation_urls is null
     or pg_catalog.cardinality(p_retrieved_chunk_ids) > 100
     or pg_catalog.cardinality(p_citation_chunk_ids) > 100
     or pg_catalog.cardinality(p_citation_urls) > 40 then
    raise exception 'assistant run: invalid evidence arrays';
  end if;
  foreach v_url in array p_citation_urls loop
    if v_url is null or v_url !~ '^https://' or pg_catalog.char_length(v_url) > 500 then
      raise exception 'assistant run: invalid citation url';
    end if;
  end loop;
  insert into public.assistant_runs (
    client_id, auth_user_id, mode, query_hmac, retrieved_chunk_ids, citation_chunk_ids,
    citation_urls, safety_outcome, model, prompt_version, input_tokens, output_tokens,
    cost_cents, latency_ms, generation, settled_at
  ) values (
    p_client_id, p_auth_user_id, p_mode, p_query_hmac, p_retrieved_chunk_ids,
    p_citation_chunk_ids, p_citation_urls, p_safety_outcome, p_model, p_prompt_version,
    p_input_tokens, p_output_tokens, p_cost_cents, p_latency_ms, false, pg_catalog.now()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function
  public.portal_assistant_reserve_run(uuid,uuid,text,text,text,text),
  public.portal_assistant_settle_run(uuid,text,uuid[],uuid[],text[],int,int,numeric,int),
  public.portal_assistant_log_run(uuid,uuid,text,text,uuid[],uuid[],text[],text,text,text,int,int,numeric,int)
  from public,anon,authenticated;
grant execute on function
  public.portal_assistant_reserve_run(uuid,uuid,text,text,text,text),
  public.portal_assistant_settle_run(uuid,text,uuid[],uuid[],text[],int,int,numeric,int),
  public.portal_assistant_log_run(uuid,uuid,text,text,uuid[],uuid[],text[],text,text,text,int,int,numeric,int)
  to service_role;

-- --- "report this answer" (authenticated, ownership-bound) -------------------
create or replace function public.portal_assistant_report_answer(
  p_client_id uuid, p_run_id uuid, p_category text, p_comment text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_client_id is null or p_client_id not in (select public.my_client_ids()) then
    raise exception 'portal_action_not_allowed' using errcode = '42501';
  end if;
  perform public.portal_assistant_gate(p_client_id);
  if p_category is null or p_category not in ('inaccurate','unsafe','other') then
    raise exception 'assistant feedback: invalid category';
  end if;
  if p_comment is not null and pg_catalog.char_length(p_comment) > 2000 then
    raise exception 'assistant feedback: comment too long';
  end if;
  if p_run_id is null or not exists (
    select 1 from public.assistant_runs r
    where r.id = p_run_id and r.client_id = p_client_id
      and r.auth_user_id = (select auth.uid())
  ) then
    raise exception 'assistant feedback: run not found for this user';
  end if;
  insert into public.assistant_feedback (
    client_id, auth_user_id, run_id, category, comment, expires_at
  ) values (
    p_client_id, (select auth.uid()), p_run_id, p_category,
    nullif(pg_catalog.btrim(coalesce(p_comment,'')), ''),
    pg_catalog.now() + interval '30 days'
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.portal_assistant_report_answer(uuid,uuid,text,text)
  from public,anon,service_role;
grant execute on function public.portal_assistant_report_answer(uuid,uuid,text,text)
  to authenticated;

-- --- in-migration security assertion -----------------------------------------
create or replace function public.assert_portal_assistant_openai_security()
returns void language plpgsql security definer set search_path='' as $$
declare
  v_table text;
  v_count bigint;
begin
  foreach v_table in array array[
    'assistant_documents','assistant_document_chunks','assistant_runs','assistant_feedback'
  ] loop
    if not (select c.relrowsecurity from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table) then
      raise exception '% RLS disabled', v_table; end if;

    -- the RPCs are the ONLY client boundary: zero direct authenticated/anon access
    select pg_catalog.count(*) into v_count from information_schema.column_privileges cp
      where cp.table_schema = 'public' and cp.table_name = v_table
        and cp.grantee in ('authenticated','anon');
    if v_count > 0 then
      raise exception 'direct client access to % detected', v_table; end if;
    if pg_catalog.has_table_privilege('authenticated','public.'||v_table,'SELECT,INSERT,UPDATE,DELETE')
       or pg_catalog.has_table_privilege('anon','public.'||v_table,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'direct client table privilege on % detected', v_table; end if;
    if not pg_catalog.has_table_privilege('service_role','public.'||v_table,'SELECT')
       or pg_catalog.has_table_privilege('service_role','public.'||v_table,'INSERT,UPDATE,DELETE') then
      raise exception 'unsafe service_role privilege on %', v_table; end if;
  end loop;

  if not exists (select 1 from pg_catalog.pg_indexes i where i.schemaname = 'public'
    and i.indexname = 'assistant_document_chunks_search') then
    raise exception 'assistant chunk search index missing'; end if;
  if not exists (select 1 from pg_catalog.pg_indexes i where i.schemaname = 'public'
    and i.indexname = 'assistant_runs_user_time') then
    raise exception 'assistant runs per-user index missing'; end if;

  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('portal_assistant_search',
      'portal_assistant_reserve_run','portal_assistant_settle_run','portal_assistant_log_run',
      'portal_assistant_report_answer','portal_assistant_reindex')
      and (not p.prosecdef or not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']))) then
    raise exception 'assistant function is not hardened'; end if;

  -- search + feedback: tenant JWT only
  if not pg_catalog.has_function_privilege('authenticated','public.portal_assistant_search(uuid,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_search(uuid,text)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_assistant_search(uuid,text)','EXECUTE') then
    raise exception 'unsafe assistant search privilege'; end if;
  if not pg_catalog.has_function_privilege('authenticated','public.portal_assistant_report_answer(uuid,uuid,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_report_answer(uuid,uuid,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.portal_assistant_report_answer(uuid,uuid,text,text)','EXECUTE') then
    raise exception 'unsafe assistant feedback privilege'; end if;

  -- reserve/settle/logger/reindex: service_role only
  if pg_catalog.has_function_privilege('authenticated','public.portal_assistant_reserve_run(uuid,uuid,text,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_reserve_run(uuid,uuid,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_reserve_run(uuid,uuid,text,text,text,text)','EXECUTE') then
    raise exception 'unsafe assistant reserve privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.portal_assistant_settle_run(uuid,text,uuid[],uuid[],text[],integer,integer,numeric,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_settle_run(uuid,text,uuid[],uuid[],text[],integer,integer,numeric,integer)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_settle_run(uuid,text,uuid[],uuid[],text[],integer,integer,numeric,integer)','EXECUTE') then
    raise exception 'unsafe assistant settle privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.portal_assistant_log_run(uuid,uuid,text,text,uuid[],uuid[],text[],text,text,text,integer,integer,numeric,integer)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_log_run(uuid,uuid,text,text,uuid[],uuid[],text[],text,text,text,integer,integer,numeric,integer)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_log_run(uuid,uuid,text,text,uuid[],uuid[],text[],text,text,text,integer,integer,numeric,integer)','EXECUTE') then
    raise exception 'unsafe assistant logger privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.portal_assistant_reindex(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_reindex(uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_reindex(uuid)','EXECUTE') then
    raise exception 'unsafe assistant reindex privilege'; end if;

  -- reservations must be generation rows; non-generation rows must arrive settled
  if exists (select 1 from public.assistant_runs r where not r.generation and r.settled_at is null) then
    raise exception 'unsettled non-generation assistant run detected'; end if;
end;
$$;
revoke all on function public.assert_portal_assistant_openai_security() from public,anon,authenticated;
grant execute on function public.assert_portal_assistant_openai_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice12_security();
  perform public.assert_portal_assistant_openai_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
