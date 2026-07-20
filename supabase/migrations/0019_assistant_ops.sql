-- Assistant operations round (Codex review blockers + Anastasia's launch orders).
--
-- 1. INDEX FRESHNESS (Codex blocker 1): the safe knowledge index now refreshes IN THE SAME
--    TRANSACTION as every write to an indexed source. Deferred constraint triggers on all
--    twelve source tables fire at commit, deduplicate per tenant through a transaction-local
--    flag, and rebuild that tenant's index atomically (the corpus is deliberately tiny).
--    A service-only reconcile-all RPC remains as the scheduled/recovery net.
-- 2. ERROR SETTLEMENT (Codex blocker 4): settling a reservation as 'error' can no longer
--    lower the recorded cost below the conservative reservation.
-- 3. RETENTION OPS (Codex should-fixes): a service-only feedback purge past expires_at and
--    a reaper that finalizes abandoned reservations while preserving reserved cost.
-- 4. DEMO PURGE (Anastasia's launch order): the pre-portal demo/fixture rows are deleted
--    for the Kanset tenant by their exact seed characteristics (recovered from the retired
--    seed-surfaces script and the 0011 source_ref backfill), with FK-ordered dependents.
--    The migration asserts no matching row remains; a fresh local replay (where the demo
--    rows never existed) deletes zero rows and passes the same assertions.
-- 5. AGENCY IDEA WRITE PATH (Anastasia's order): agency_add_idea, an audited service-only
--    idea insert consistent with the 0011 write patterns (agency actor, client-safety
--    shape gate, fingerprinted idempotency receipts, activity event).
-- This migration flips no switch and grants no capability.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_assistant_reindex(uuid)') is null
     or pg_catalog.to_regprocedure('public.portal_assistant_settle_run(uuid,text,uuid[],uuid[],text[],int,int,numeric,int)') is null
     or pg_catalog.to_regclass('public.assistant_runs') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null
     or pg_catalog.to_regclass('public.agency_actors') is null then
    raise exception '0018/base portal objects must exist before applying 0019';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice13_security;
revoke all on function public.assert_portal_slice13_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice13_security() to service_role;

-- --- 1. in-transaction index refresh triggers --------------------------------
-- One qualified trigger function for every indexed source table. Deferred constraint
-- triggers run at COMMIT (after every statement in the transaction), so the first firing
-- rebuilds against the final state and later firings in the same transaction skip via a
-- transaction-local flag. A vanished tenant (cascade delete in flight) is skipped: the
-- index rows cascade away with the client.
create or replace function public.portal_assistant_index_touch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid;
  v_flag text;
begin
  v_client := case when tg_op = 'DELETE' then old.client_id else new.client_id end;
  if v_client is null then return null; end if;
  if not exists (select 1 from public.clients c where c.id = v_client) then return null; end if;
  v_flag := 'portal.ai_reindexed_' || pg_catalog.replace(v_client::text, '-', '');
  if pg_catalog.current_setting(v_flag, true) = 't' then return null; end if;
  perform pg_catalog.set_config(v_flag, 't', true);
  perform public.portal_assistant_reindex(v_client);
  return null;
end;
$$;
revoke all on function public.portal_assistant_index_touch() from public,anon,authenticated,service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'content_items','content_item_versions','approvals','comments',
    'content_schedule_targets','content_publication_targets','content_change_requests',
    'report_snapshots','recommendations','links','content_ideas','invoices'
  ] loop
    execute pg_catalog.format(
      'create constraint trigger assistant_index_touch after insert or update or delete on public.%I '
      || 'deferrable initially deferred for each row execute function public.portal_assistant_index_touch()',
      v_table);
  end loop;
end;
$$;

-- --- scheduled/recovery reconciliation (service only) ------------------------
create or replace function public.portal_assistant_reconcile_index()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_client record;
  v_clients int := 0;
  v_documents bigint := 0;
  v_result jsonb;
begin
  for v_client in select c.id from public.clients c order by c.created_at loop
    v_result := public.portal_assistant_reindex(v_client.id);
    v_clients := v_clients + 1;
    v_documents := v_documents + coalesce((v_result->>'documents')::bigint, 0);
  end loop;
  return pg_catalog.jsonb_build_object('clients', v_clients, 'documents', v_documents);
end;
$$;
revoke all on function public.portal_assistant_reconcile_index() from public,anon,authenticated;
grant execute on function public.portal_assistant_reconcile_index() to service_role;

-- --- 2. error settlement preserves the conservative reservation --------------
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
  -- 'error' means the request failed without trustworthy usage figures: the recorded cost
  -- must never drop below the conservative reservation (fail-closed budget accounting).
  update public.assistant_runs r set
    safety_outcome = p_safety_outcome,
    retrieved_chunk_ids = p_retrieved_chunk_ids,
    citation_chunk_ids = p_citation_chunk_ids,
    citation_urls = p_citation_urls,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    cost_cents = case when p_safety_outcome = 'error'
      then greatest(r.cost_cents, p_cost_cents) else p_cost_cents end,
    latency_ms = p_latency_ms,
    settled_at = pg_catalog.now()
  where r.id = p_run_id and r.generation and r.settled_at is null;
  if not found then
    raise exception 'assistant settle: reservation missing or already settled';
  end if;
end;
$$;
-- grants unchanged from 0018 (create or replace preserves them); re-assert defensively
revoke all on function
  public.portal_assistant_settle_run(uuid,text,uuid[],uuid[],text[],int,int,numeric,int)
  from public,anon,authenticated;
grant execute on function
  public.portal_assistant_settle_run(uuid,text,uuid[],uuid[],text[],int,int,numeric,int)
  to service_role;

-- --- 3. retention ops --------------------------------------------------------
-- Reaper: finalize reservations whose request died without settling. The outcome is
-- already 'error' by construction; the reserved conservative cost is preserved untouched.
create or replace function public.portal_assistant_reap_reservations(
  p_older_than_minutes int default 30
) returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  if p_older_than_minutes is null or p_older_than_minutes < 5 then
    raise exception 'assistant reaper: minimum age is 5 minutes';
  end if;
  update public.assistant_runs r
    set settled_at = pg_catalog.now()
    where r.generation and r.settled_at is null
      and r.created_at < pg_catalog.now() - pg_catalog.make_interval(mins => p_older_than_minutes);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Feedback purge past expires_at (spec: bounded retention for the report-this-answer path).
create or replace function public.portal_assistant_purge_feedback()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  delete from public.assistant_feedback f where f.expires_at < pg_catalog.now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function
  public.portal_assistant_reap_reservations(int),
  public.portal_assistant_purge_feedback()
  from public,anon,authenticated;
grant execute on function
  public.portal_assistant_reap_reservations(int),
  public.portal_assistant_purge_feedback()
  to service_role;

-- --- 5. audited agency idea write path ---------------------------------------
-- Consistent with the 0011 agency write patterns: active agency actor, client-safety
-- shape gate on every client-visible text, fingerprinted idempotency receipt, and the
-- same 'idea_captured' activity event the client path emits. author_type records whose
-- idea it IS (Maria's ideas relayed from email stay hers); the receipt + activity trail
-- records that the AGENCY entered it.
create or replace function public.agency_add_idea(
  p_client_id uuid, p_title text, p_body text, p_status text, p_author_type text,
  p_author_name text, p_actor_key text, p_idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_title text := pg_catalog.btrim(p_title);
  v_body text := nullif(pg_catalog.btrim(coalesce(p_body,'')), '');
  v_author text := pg_catalog.btrim(p_author_name);
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_id uuid;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found'; end if;
  if v_title is null or v_title = '' or pg_catalog.char_length(v_title) > 300 then
    raise exception 'idea title is required (max 300 chars)'; end if;
  if v_body is not null and pg_catalog.char_length(v_body) > 4000 then
    raise exception 'idea body is too long'; end if;
  if p_status is null or p_status not in ('new','considering','planned','archived') then
    raise exception 'invalid idea status'; end if;
  if p_author_type is null or p_author_type not in ('client','anastasia','agent') then
    raise exception 'invalid idea author type'; end if;
  if v_author is null or v_author = '' or pg_catalog.char_length(v_author) > 200 then
    raise exception 'idea author name is required (max 200 chars)'; end if;
  if not public.portal_client_summary_shape_valid(v_title)
     or not (v_body is null or public.portal_client_summary_shape_valid(v_body))
     or not public.portal_client_summary_shape_valid(v_author) then
    raise exception 'idea failed client-safety gate';
  end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required'; end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('title',v_title,'body',v_body,'status',p_status,
      'author_type',p_author_type,'author_name',v_author)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id = p_client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'agency_add_idea' or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request'; end if;
    return (v_receipt.response->>'id')::uuid;
  end if;

  insert into public.content_ideas (client_id, author_type, author_name, title, body, status)
  values (p_client_id, p_author_type, v_author, v_title, v_body, p_status)
  returning id into v_id;

  insert into public.activity_log (client_id, event_type, event_key, title, summary, actor_type, actor_name)
  values (p_client_id, 'idea_captured', 'agency:idea:' || p_idempotency_key,
    'Idea: ' || v_title, v_body, 'anastasia', v_actor.display_name);

  insert into public.portal_command_receipts (client_id, command_type, idempotency_key, request_fingerprint, response)
  values (p_client_id, 'agency_add_idea', p_idempotency_key, v_fingerprint,
    pg_catalog.jsonb_build_object('id', v_id));
  return v_id;
end;
$$;
revoke all on function public.agency_add_idea(uuid,text,text,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.agency_add_idea(uuid,text,text,text,text,text,text,text)
  to service_role;

-- --- 4. demo purge for the Kanset tenant -------------------------------------
-- Exact seed characteristics (recovered from the retired scripts/seed-surfaces.ts at
-- commit 6cfe63f and the 0011 source_ref backfill):
--   report_snapshots: schema_version 0 with source_ref 'migration:0011' (4 rows in prod)
--   content_ideas: author_name 'Maria (demo)' / 'The Dot (demo)' (3 rows; the table has
--     no source_ref column, so the seed's demo author names are the discriminator)
--   links: labels 'Brand guide (PDF)' and 'Canva brand kit' ONLY with their placeholder
--     root URLs (a future real link with the same label but a real URL must survive)
--   content items: kanset-2026-07-lmia-reel and kanset-2026-07-oinp-employer with all
--     dependents in FK order (no-cascade first: comments, approvals, change requests
--     with their jobs, activity, inbox/projection rows; versions/schedule/publication/
--     calendar cascade with the item row).
-- A fresh replay has none of these rows: every delete is a no-op and the trailing
-- zero-remaining assertions still hold.
do $$
declare
  v_kanset uuid;
  v_item_ids uuid[];
  v_count int;
begin
  select c.id into v_kanset from public.clients c where c.slug = 'kanset';
  if v_kanset is null then
    raise notice 'demo purge: no kanset tenant in this database, skipping';
    return;
  end if;

  select coalesce(pg_catalog.array_agg(ci.id), '{}') into v_item_ids
    from public.content_items ci
    where ci.client_id = v_kanset
      and ci.content_id in ('kanset-2026-07-lmia-reel','kanset-2026-07-oinp-employer');

  if pg_catalog.cardinality(v_item_ids) > 0 then
    delete from public.comments cm
      where cm.client_id = v_kanset and cm.content_id = any(v_item_ids);
    get diagnostics v_count = row_count;
    raise notice 'demo purge: % fixture comments', v_count;

    delete from public.approvals a
      where a.client_id = v_kanset and a.content_id = any(v_item_ids);
    get diagnostics v_count = row_count;
    raise notice 'demo purge: % fixture approvals', v_count;

    delete from public.canonical_change_jobs j
      where j.client_id = v_kanset and j.request_id in (
        select r.id from public.content_change_requests r
        where r.client_id = v_kanset
          and (r.content_id = any(v_item_ids) or r.canonical_content_id = any(v_item_ids)));
    delete from public.content_change_requests r
      where r.client_id = v_kanset
        and (r.content_id = any(v_item_ids) or r.canonical_content_id = any(v_item_ids));
    get diagnostics v_count = row_count;
    raise notice 'demo purge: % fixture change requests', v_count;

    delete from public.activity_log a
      where a.client_id = v_kanset and a.content_id = any(v_item_ids);
    get diagnostics v_count = row_count;
    raise notice 'demo purge: % fixture activity rows', v_count;

    delete from public.portal_inbox_events e
      where e.client_id = v_kanset and e.object_type = 'content' and e.object_id = any(v_item_ids);
    delete from public.projection_outbox o
      where o.client_id = v_kanset and o.object_type = 'content'
        and o.object_key in (select i::text from pg_catalog.unnest(v_item_ids) i);

    delete from public.content_items ci
      where ci.client_id = v_kanset and ci.id = any(v_item_ids);
    get diagnostics v_count = row_count;
    raise notice 'demo purge: % fixture content items (versions/schedule/publication cascade)', v_count;
  else
    raise notice 'demo purge: no fixture content items present';
  end if;

  delete from public.report_snapshots r
    where r.client_id = v_kanset and r.schema_version = 0 and r.source_ref = 'migration:0011';
  get diagnostics v_count = row_count;
  raise notice 'demo purge: % demo report snapshots', v_count;

  delete from public.content_ideas ci
    where ci.client_id = v_kanset and ci.author_name in ('Maria (demo)','The Dot (demo)');
  get diagnostics v_count = row_count;
  raise notice 'demo purge: % demo ideas', v_count;

  delete from public.links l
    where l.client_id = v_kanset
      and ((l.label = 'Brand guide (PDF)' and l.url = 'https://drive.google.com/')
        or (l.label = 'Canva brand kit' and l.url = 'https://www.canva.com/'));
  get diagnostics v_count = row_count;
  raise notice 'demo purge: % placeholder links', v_count;
end;
$$;

-- --- in-migration security assertion -----------------------------------------
create or replace function public.assert_portal_assistant_ops_security()
returns void language plpgsql security definer set search_path='' as $$
declare
  v_table text;
  v_kanset uuid;
  v_count bigint;
begin
  -- index-freshness triggers: deferred constraint trigger present on every source table
  foreach v_table in array array[
    'content_items','content_item_versions','approvals','comments',
    'content_schedule_targets','content_publication_targets','content_change_requests',
    'report_snapshots','recommendations','links','content_ideas','invoices'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table
        and t.tgname = 'assistant_index_touch'
        and t.tgconstraint <> 0 and t.tgdeferrable and t.tginitdeferred
    ) then
      raise exception 'assistant index trigger missing/not deferred on %', v_table;
    end if;
  end loop;

  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('portal_assistant_index_touch',
      'portal_assistant_reconcile_index','portal_assistant_reap_reservations',
      'portal_assistant_purge_feedback','agency_add_idea')
      and (not p.prosecdef or not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']))) then
    raise exception 'assistant ops function is not hardened'; end if;

  -- ops + agency-idea RPCs: service_role only
  if pg_catalog.has_function_privilege('authenticated','public.portal_assistant_reconcile_index()','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_reconcile_index()','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_reconcile_index()','EXECUTE') then
    raise exception 'unsafe assistant reconcile privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.portal_assistant_reap_reservations(integer)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_reap_reservations(integer)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_reap_reservations(integer)','EXECUTE') then
    raise exception 'unsafe assistant reaper privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.portal_assistant_purge_feedback()','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_purge_feedback()','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_purge_feedback()','EXECUTE') then
    raise exception 'unsafe assistant feedback purge privilege'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.agency_add_idea(uuid,text,text,text,text,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.agency_add_idea(uuid,text,text,text,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.agency_add_idea(uuid,text,text,text,text,text,text,text)','EXECUTE') then
    raise exception 'unsafe agency idea privilege'; end if;

  -- demo purge invariant: no matching demo/fixture row may exist (holds on a fresh
  -- replay, where none ever existed, and on prod after the purge)
  select c.id into v_kanset from public.clients c where c.slug = 'kanset';
  if v_kanset is not null then
    select pg_catalog.count(*) into v_count from public.report_snapshots r
      where r.client_id = v_kanset and r.schema_version = 0 and r.source_ref = 'migration:0011';
    if v_count > 0 then raise exception 'demo report snapshots remain'; end if;
    select pg_catalog.count(*) into v_count from public.content_ideas ci
      where ci.client_id = v_kanset and ci.author_name in ('Maria (demo)','The Dot (demo)');
    if v_count > 0 then raise exception 'demo ideas remain'; end if;
    select pg_catalog.count(*) into v_count from public.links l
      where l.client_id = v_kanset
        and ((l.label = 'Brand guide (PDF)' and l.url = 'https://drive.google.com/')
          or (l.label = 'Canva brand kit' and l.url = 'https://www.canva.com/'));
    if v_count > 0 then raise exception 'placeholder demo links remain'; end if;
    select pg_catalog.count(*) into v_count from public.content_items ci
      where ci.client_id = v_kanset
        and ci.content_id in ('kanset-2026-07-lmia-reel','kanset-2026-07-oinp-employer');
    if v_count > 0 then raise exception 'fixture content items remain'; end if;
  end if;
end;
$$;
revoke all on function public.assert_portal_assistant_ops_security() from public,anon,authenticated;
grant execute on function public.assert_portal_assistant_ops_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice13_security();
  perform public.assert_portal_assistant_ops_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
