-- Design links join the assistant index as the 13TH INDEXED SOURCE (Codex round-4
-- should-fix B, preferred option). Without this, an agency-set design link only became
-- searchable at the next full reconciliation and no chunk carried the URL at all.
-- content_design_links gets the same commit-time deferred touch trigger as the other 12
-- sources (client_id immutability came with the table in 0020), and the reindex projects
-- a navigation_only document per linked, client-visible piece whose chunk carries the
-- URLs as fields, so "where is the design for X" is answerable with the link itself.
-- navigation_only is deliberate: a design link is presentation metadata, never verified
-- content truth.
--
-- This migration flips no switch and grants no capability.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regclass('public.content_design_links') is null
     or pg_catalog.to_regprocedure('public.set_content_design_links(uuid,text,text,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_assistant_reindex(uuid)') is null
     or pg_catalog.to_regprocedure('public.portal_assistant_index_touch()') is null then
    raise exception '0020/assistant objects must exist before applying 0021';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice15_security;
revoke all on function public.assert_portal_slice15_security() from public,anon,authenticated;
grant execute on function public.assert_portal_slice15_security() to service_role;

-- --- vocabulary + trigger -----------------------------------------------------
alter table public.assistant_documents drop constraint assistant_documents_source_type_check;
alter table public.assistant_documents add constraint assistant_documents_source_type_check
  check (source_type in (
    'content_item','report','recommendation','link','idea','invoice','comment','request',
    'design_link'
  ));

create constraint trigger assistant_index_touch
  after insert or update or delete on public.content_design_links
  deferrable initially deferred
  for each row execute function public.portal_assistant_index_touch();

-- --- reindex: the 0018 body plus the design-link source ------------------------
create or replace function public.portal_assistant_reindex(p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_docs bigint;
  v_chunks bigint;
begin
  if p_client_id is null or not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'assistant reindex: unknown client';
  end if;

  -- Serialize per-tenant rebuilds: without this, a commit-time trigger refresh and the
  -- scheduled reconciliation can interleave delete+insert phases into duplicate-key
  -- failures, or let the older rebuild win and leave the index stale.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portal_assistant_reindex:' || p_client_id::text, 0));

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

  -- design links (item-level presentation metadata, 0020): navigation_only documents so
  -- "where is the design for X" is answerable with the link itself as a chunk field.
  -- Only client-visible pieces (the join to the released projection) and only rows
  -- carrying at least one URL.
  insert into public.assistant_documents
    (client_id, source_type, source_id, source_version, title, related_route,
     answer_eligibility, content_checksum)
  select dl.client_id, 'design_link', cws.content_id,
    pg_catalog.to_char(dl.updated_at, 'YYYYMMDDHH24MISS'),
    pg_catalog.left('Design files: ' || cws.title, 300),
    'piece/' || cws.content_id, 'navigation_only',
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      coalesce(dl.canva_url,'') || '|' || coalesce(dl.drive_url,''), 'UTF8'), 'sha256'), 'hex')
  from public.content_design_links dl
  join public.content_with_state cws
    on cws.id = dl.content_item_id and cws.client_id = dl.client_id
  where dl.client_id = p_client_id
    and (dl.canva_url is not null or dl.drive_url is not null);

  insert into public.assistant_document_chunks (client_id, document_id, chunk_key, body)
  select d.client_id, d.id, 'links', pg_catalog.left(
    'Design files for the piece "' || cws.title || '".'
      || coalesce(' Canva design: ' || dl.canva_url || '.', '')
      || coalesce(' Drive file: ' || dl.drive_url || '.', ''), 4000)
  from public.assistant_documents d
  join public.content_with_state cws
    on cws.content_id = d.source_id and cws.client_id = d.client_id
  join public.content_design_links dl
    on dl.content_item_id = cws.id and dl.client_id = cws.client_id
  where d.client_id = p_client_id and d.source_type = 'design_link';

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

-- --- in-migration security assertion ------------------------------------------
create or replace function public.assert_portal_design_link_index_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  -- the 13th source carries the same commit-time touch trigger as the other 12
  if not exists (select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.content_design_links'::pg_catalog.regclass
      and t.tgname = 'assistant_index_touch' and not t.tgisinternal) then
    raise exception 'content_design_links touch trigger missing'; end if;
  -- the document vocabulary admits design_link
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.assistant_documents'::pg_catalog.regclass
      and c.conname = 'assistant_documents_source_type_check'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%design_link%') then
    raise exception 'assistant_documents source_type check missing design_link'; end if;
  -- the reindex stays a hardened definer with service-only execution
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'portal_assistant_reindex'
      and (not p.prosecdef or not (coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']))) then
    raise exception 'portal_assistant_reindex is not hardened'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.portal_assistant_reindex(uuid)','EXECUTE')
     or pg_catalog.has_function_privilege('anon','public.portal_assistant_reindex(uuid)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.portal_assistant_reindex(uuid)','EXECUTE') then
    raise exception 'unsafe portal_assistant_reindex privilege'; end if;
end;
$$;
revoke all on function public.assert_portal_design_link_index_security() from public,anon,authenticated;
grant execute on function public.assert_portal_design_link_index_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_portal_slice15_security();
  perform public.assert_portal_design_link_index_security();
end;
$$;
revoke all on function public.assert_portal_security() from public,anon,authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
