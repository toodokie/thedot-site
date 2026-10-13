-- Agency editing-session email names what Maria actually sent (handoff 2026-10-06, approved by
-- Anastasia).
--
-- On 2026-10-06 Maria sent three edits from the piece page: a video edit ("please make it
-- faster"), a copy edit on the reel script, and a video edit ("FASTER"). All three agency emails
-- said "1 copy edit received. Areas: Copy" and quoted nothing, so Anastasia could not tell what had
-- arrived.
--
-- Root cause. Since 0081 every piece-page send goes through request_content_edit_bundle, which
-- writes ONE activity row per send with event_key 'content-edit-bundle:<bundle id>'. The 0078
-- trigger body (kept verbatim by 0092) looked the change request up by
-- 'content-request:<request id>' = event_key, the key only the legacy single-edit RPC writes. The
-- lookup therefore found no request, block_key stayed null, the copy_blocks label lookup matched
-- nothing (the labels ARE stored: reel-script is labelled "Reel, on screen"), initcap(null) is
-- null, and the area fell through to the literal 'Copy'. Every bundle also counted as one edit
-- whatever it held, and the body hardcoded "copy edit".
--
-- Changed here:
--   * portal_activity_notify(): 0092 body verbatim except the edit_requested branch, which now
--     resolves every request behind the activity row (a bundle's request_ids in order, or the
--     legacy single request) and enqueues one digest item per request with its kind, its area
--     (payload target_label, then the block or asset label, then the key) and an excerpt of what
--     the client wrote. The agency_internal early return and the client email branch are
--     untouched; client email stays behind client_alerts.
--   * portal_enqueue_agency_piece_digest: a new 8-argument form carries the excerpt. The 7-argument
--     form keeps its signature and grants (portal_comment_notify calls it, unchanged) and now
--     forwards to the 8-argument form with the comment body as the excerpt.
--   * portal_agency_piece_digest_body: replaced by a (actor, title, items) form. The body names
--     each kind with its count, lists each item's area with the client's words quoted, and closes
--     with "Open the piece to review." The subject is unchanged.
--   * notification_outbox.bundle_items: the per-item record (kind, area, quote). The
--     agency_piece_digest shape check is unchanged and still holds: bundle_event_count is still
--     bundle_edit_count + bundle_comment_count.
--   * assert_portal_agency_piece_digest_security(): 0078 checks plus pins for the bundle
--     resolution, the target_label preference and the new function's hardening and grants. It is
--     already in the assert_portal_security() chain (0078 fold), so the chain needs no change.
--
-- Nothing here emails the client or changes a client-visible surface.

begin;
set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.content_review_previews') is null
     or not exists (
       select 1 from pg_catalog.pg_constraint c
       where c.conrelid = 'public.content_review_previews'::pg_catalog.regclass
         and c.conname = 'content_review_previews_duration_seconds_check'
         and pg_catalog.pg_get_constraintdef(c.oid) ilike '%duration_seconds <= (1200)::numeric%'
     )
     or pg_catalog.to_regprocedure('public.assert_portal_agency_piece_digest_security()') is null
     or pg_catalog.to_regprocedure('public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_agency_piece_digest_body(text,integer,integer,text[])') is null
     or pg_catalog.to_regclass('public.content_edit_review_bundles') is null
     or pg_catalog.to_regclass('public.content_review_assets') is null
     or pg_catalog.pg_get_functiondef('public.portal_activity_notify()'::pg_catalog.regprocedure)
          not ilike '%t.agency_internal%'
     or pg_catalog.to_regprocedure('public.assert_portal_security()') is null then
    raise exception '0097 requires 0096 (review preview cut duration) and the 0078 agency digest';
  end if;
end;
$$;

select public.assert_portal_security();

alter table public.notification_outbox
  add column bundle_items jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(bundle_items) = 'array');

-- An excerpt of the client's own words for the email. Verbatim apart from whitespace: '**'
-- markup is dropped (it is bold in the portal, noise in a plain-text email), line breaks become
-- ' / ', and the text is cut near p_limit characters with '...'. For a copy edit the caller passes
-- the block's current body, and only lines the client changed or added are quoted, so a rewrite
-- of frames 1 to 5 quotes those frames instead of the unchanged title line.
create function public.portal_agency_digest_excerpt(
  p_text text,
  p_original text,
  p_limit int
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := pg_catalog.replace(coalesce(p_text, ''), '**', '');
  v_changed text;
  v_cut int;
begin
  if p_original is not null then
    select pg_catalog.string_agg(pg_catalog.btrim(t.line), ' / ' order by t.n) into v_changed
    from pg_catalog.regexp_split_to_table(v_text, E'\n') with ordinality as t(line, n)
    where pg_catalog.btrim(t.line) <> ''
      and pg_catalog.btrim(t.line) not in (
        select pg_catalog.btrim(o.line)
        from pg_catalog.regexp_split_to_table(
          pg_catalog.replace(p_original, '**', ''), E'\n') as o(line)
      );
    if v_changed is not null then v_text := v_changed; end if;
  end if;
  v_text := pg_catalog.regexp_replace(pg_catalog.btrim(v_text), '[[:space:]]*\n[[:space:]]*', ' / ', 'g');
  v_text := pg_catalog.regexp_replace(v_text, '[[:space:]]+', ' ', 'g');
  if v_text = '' then return null; end if;
  if pg_catalog.char_length(v_text) > p_limit then
    v_text := pg_catalog.left(v_text, p_limit);
    v_cut := pg_catalog.char_length(v_text)
      - pg_catalog.strpos(pg_catalog.reverse(v_text), ' ') + 1;
    if pg_catalog.strpos(v_text, ' ') > 0 and v_cut > (p_limit * 0.6)::int then
      v_text := pg_catalog.left(v_text, v_cut - 1);
    end if;
    v_text := pg_catalog.rtrim(v_text, ' /,;:·') || '...';
  end if;
  return v_text;
end;
$$;

drop function public.portal_agency_piece_digest_body(text,integer,integer,text[]);

create function public.portal_agency_piece_digest_body(
  p_actor text,
  p_title text,
  p_items jsonb
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kinds text[] := array['video_edit','cover_edit','document_edit','design_edit','copy_edit','edit','comment'];
  v_names text[] := array['video edit','cover edit','document edit','design link edit','copy edit','edit','comment'];
  v_parts text[] := '{}'::text[];
  v_count int;
  v_summary text;
  v_lines text := '';
  v_item jsonb;
  v_area text;
  v_quote text;
  v_line text;
  v_shown int := 0;
  v_total int := coalesce(pg_catalog.jsonb_array_length(p_items), 0);
  i int;
begin
  for i in 1 .. pg_catalog.array_length(v_kinds, 1) loop
    select pg_catalog.count(*)::int into v_count
    from pg_catalog.jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e(value)
    where e.value->>'kind' = v_kinds[i];
    if v_count > 0 then
      v_parts := pg_catalog.array_append(v_parts,
        v_count::text || ' ' || v_names[i] || case when v_count = 1 then '' else 's' end);
    end if;
  end loop;

  if coalesce(pg_catalog.array_length(v_parts, 1), 0) = 0 then
    v_summary := 'an update';
  elsif pg_catalog.array_length(v_parts, 1) = 1 then
    v_summary := v_parts[1];
  else
    v_summary := pg_catalog.array_to_string(v_parts[1:pg_catalog.array_length(v_parts, 1) - 1], ', ')
      || ' and ' || v_parts[pg_catalog.array_length(v_parts, 1)];
  end if;

  for v_item in select e.value from pg_catalog.jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e(value)
  loop
    exit when v_shown >= 10;
    v_area := nullif(pg_catalog.btrim(v_item->>'area'), '');
    v_quote := nullif(pg_catalog.btrim(v_item->>'quote'), '');
    if v_item->>'kind' = 'comment' then
      v_area := case when v_area is null or v_area = 'General feedback' then 'General feedback'
        else 'Comment on ' || v_area end;
    end if;
    v_line := case
      when v_area is not null and v_quote is not null then v_area || ': "' || v_quote || '"'
      when v_quote is not null then '"' || v_quote || '"'
      else v_area
    end;
    if v_line is not null then
      v_lines := v_lines || E'\n\n' || v_line;
      v_shown := v_shown + 1;
    end if;
  end loop;
  if v_total > v_shown and v_shown >= 10 then
    v_lines := v_lines || E'\n\n' || 'And ' || (v_total - v_shown)::text || ' more on the piece page.';
  end if;

  return coalesce(nullif(pg_catalog.btrim(p_actor), ''), 'Client') || ' sent ' || v_summary
    || ' on "' || p_title || '".'
    || v_lines
    || E'\n\nOpen the piece to review.';
end;
$$;

-- 0078's enqueue, plus the item kind, the excerpt and bundle_items. Counting is unchanged in
-- meaning: every kind except 'comment' is an edit.
create function public.portal_enqueue_agency_piece_digest(
  p_client_id uuid,
  p_content_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_actor_name text,
  p_item_kind text,
  p_target_label text,
  p_excerpt text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content_key text;
  v_title text;
  v_bundle_key text;
  v_related_url text;
  v_digest_id uuid;
  v_event_count int;
  v_edit_count int;
  v_comment_count int;
  v_targets text[];
  v_items jsonb;
  v_target text := nullif(pg_catalog.btrim(p_target_label), '');
  v_excerpt text := nullif(pg_catalog.btrim(p_excerpt), '');
  v_actor text := coalesce(nullif(pg_catalog.btrim(p_actor_name), ''), 'Client');
begin
  if p_client_id is null or p_content_id is null or p_source_id is null
     or p_source_kind not in ('activity','comment')
     or p_item_kind not in ('edit','copy_edit','video_edit','cover_edit','document_edit','design_edit','comment') then
    raise exception 'invalid agency piece digest item';
  end if;

  select ci.content_id, ci.title into v_content_key, v_title
  from public.content_items ci
  where ci.id = p_content_id and ci.client_id = p_client_id;
  if not found then raise exception 'piece not found for agency digest'; end if;

  v_bundle_key := 'piece-edit:' || p_content_id::text;
  v_related_url := 'https://www.thedotcreative.co/admin/portal/pieces/' || v_content_key;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_client_id::text || ':' || v_bundle_key, 0
  ));

  select n.id, n.bundle_event_count, n.bundle_edit_count, n.bundle_comment_count,
    n.bundle_targets, n.bundle_items
  into v_digest_id, v_event_count, v_edit_count, v_comment_count, v_targets, v_items
  from public.notification_outbox n
  where n.client_id = p_client_id
    and n.bundle_key = v_bundle_key
    and n.template_key = 'agency_piece_digest'
    and n.status = 'pending'
    and n.attempts = 0
    and n.bundle_last_event_at >= pg_catalog.now() - interval '5 minutes'
  order by n.bundle_last_event_at desc
  limit 1
  for update;

  v_event_count := coalesce(v_event_count, 0) + 1;
  v_edit_count := coalesce(v_edit_count, 0) + case when p_item_kind <> 'comment' then 1 else 0 end;
  v_comment_count := coalesce(v_comment_count, 0) + case when p_item_kind = 'comment' then 1 else 0 end;
  v_targets := coalesce(v_targets, '{}'::text[]);
  if v_target is not null and not (v_target = any(v_targets)) then
    v_targets := pg_catalog.array_append(v_targets, v_target);
  end if;
  v_items := coalesce(v_items, '[]'::jsonb);
  if pg_catalog.jsonb_array_length(v_items) < 200 then
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'kind', p_item_kind, 'area', v_target, 'quote', v_excerpt));
  end if;

  if v_digest_id is null then
    insert into public.notification_outbox(
      client_id, recipient_kind, recipient_email, channel, event_key, source_kind,
      source_activity_id, subject, body, related_url, template_key, status, next_attempt_at,
      bundle_key, bundle_event_count, bundle_edit_count, bundle_comment_count, bundle_targets,
      bundle_items, bundle_last_event_at
    ) values (
      p_client_id, 'agency', null, 'email',
      'piece-session:' || p_content_id::text || ':' || p_source_id::text,
      p_source_kind, case when p_source_kind = 'activity' then p_source_id else null end,
      v_actor || ' updated: ' || v_title,
      public.portal_agency_piece_digest_body(v_actor, v_title, v_items),
      v_related_url, 'agency_piece_digest', 'pending', pg_catalog.now() + interval '5 minutes',
      v_bundle_key, v_event_count, v_edit_count, v_comment_count, v_targets, v_items, pg_catalog.now()
    ) returning id into v_digest_id;
  else
    update public.notification_outbox
    set subject = v_actor || ' updated: ' || v_title,
        body = public.portal_agency_piece_digest_body(v_actor, v_title, v_items),
        related_url = v_related_url,
        next_attempt_at = pg_catalog.now() + interval '5 minutes',
        bundle_event_count = v_event_count,
        bundle_edit_count = v_edit_count,
        bundle_comment_count = v_comment_count,
        bundle_targets = v_targets,
        bundle_items = v_items,
        bundle_last_event_at = pg_catalog.now()
    where id = v_digest_id;
  end if;

  return v_digest_id;
end;
$$;

-- The 7-argument form keeps its signature and grants for portal_comment_notify (0082, unchanged).
-- A comment's excerpt is its own body, read here by id.
create or replace function public.portal_enqueue_agency_piece_digest(
  p_client_id uuid,
  p_content_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_actor_name text,
  p_item_kind text,
  p_target_label text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_excerpt text;
begin
  if p_source_kind = 'comment' and p_source_id is not null then
    select public.portal_agency_digest_excerpt(c.body, null, 200) into v_excerpt
    from public.comments c
    where c.id = p_source_id and c.client_id = p_client_id;
  end if;
  return public.portal_enqueue_agency_piece_digest(
    p_client_id, p_content_id, p_source_kind, p_source_id, p_actor_name, p_item_kind,
    p_target_label, v_excerpt);
end;
$$;

-- 0092's body, verbatim, except the edit_requested branch (see the header).
create or replace function public.portal_activity_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text;
  v_block_key text;
  v_target_label text;
  v_request record;
  v_kind text;
  v_original text;
  v_asset_kind text;
  v_asset_label text;
  v_ref_id uuid;
  v_found boolean := false;
begin
  if new.event_type in ('comment_added','agency_comment_added','idea_comment_added','agency_idea_comment_added') then
    return new;
  end if;
  -- Agency housekeeping: the activity row is the record; no in-app row and no email for anyone.
  if exists (select 1 from public.activity_event_types t
             where t.event_type = new.event_type and t.agency_internal) then
    return new;
  end if;
  v_recipient := public.portal_notification_recipient(new.actor_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'activity', new.id,
    new.title, coalesce(new.summary,''), new.related_url);

  if v_recipient = 'agency' and new.event_type = 'edit_requested' and new.content_id is not null then
    -- One digest item per request behind this row: a piece-page send (0081) is one row for the
    -- whole bundle ('content-edit-bundle:<bundle id>'); the legacy single edit is
    -- 'content-request:<request id>'.
    if new.event_key ~ '^content-(edit-bundle|request):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_ref_id := pg_catalog.split_part(new.event_key, ':', 2)::uuid;
    end if;
    for v_request in
      select r.payload, o.ord
      from public.content_edit_review_bundles b
      cross join lateral pg_catalog.unnest(b.request_ids) with ordinality as o(request_id, ord)
      join public.content_change_requests r
        on r.id = o.request_id and r.client_id = b.client_id
      where new.event_key like 'content-edit-bundle:%'
        and b.id = v_ref_id and b.client_id = new.client_id
      union all
      select r.payload, 1::bigint
      from public.content_change_requests r
      where new.event_key like 'content-request:%'
        and r.id = v_ref_id and r.client_id = new.client_id
      order by 2
    loop
      v_found := true;
      v_kind := coalesce(v_request.payload->>'target_kind', 'copy_block');
      v_block_key := coalesce(v_request.payload->>'block_key', v_request.payload->>'target_key');
      v_target_label := null;
      v_original := null;
      v_asset_kind := null;
      v_asset_label := null;
      if v_kind = 'copy_block' then
        select e.value->>'label', e.value->>'body' into v_target_label, v_original
        from public.content_item_versions cv
        cross join lateral pg_catalog.jsonb_array_elements(cv.copy_blocks) e(value)
        where cv.content_item_id = new.content_id
          and cv.client_id = new.client_id
          and cv.version = new.content_version
          and e.value->>'key' = v_block_key
        limit 1;
      elsif v_kind = 'asset' then
        select a.asset_kind, a.label into v_asset_kind, v_asset_label
        from public.content_review_assets a
        where a.client_id = new.client_id
          and a.content_item_id = new.content_id
          and a.content_version = new.content_version
          and a.asset_key = coalesce(v_request.payload->>'asset_key', v_block_key);
        v_target_label := v_asset_label;
      end if;
      perform public.portal_enqueue_agency_piece_digest(
        new.client_id, new.content_id, 'activity', new.id, new.actor_name,
        case v_kind
          when 'copy_block' then 'copy_edit'
          when 'design_link' then 'design_edit'
          when 'asset' then case v_asset_kind
            when 'cover' then 'cover_edit'
            when 'document' then 'document_edit'
            else 'video_edit' end
          else 'edit' end,
        coalesce(nullif(pg_catalog.btrim(v_request.payload->>'target_label'), ''),
          v_target_label,
          pg_catalog.initcap(pg_catalog.replace(v_block_key, '-', ' ')),
          'Copy'),
        public.portal_agency_digest_excerpt(v_request.payload->>'proposed_text', v_original, 200)
      );
    end loop;
    if not v_found then
      perform public.portal_enqueue_agency_piece_digest(
        new.client_id, new.content_id, 'activity', new.id, new.actor_name, 'edit', null, null
      );
    end if;
  elsif v_recipient = 'agency' then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  elsif public.portal_feature_enabled(new.client_id, 'client_alerts')
     and public.portal_client_activity_email_required(new.event_type) then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'activity', new.id,
      new.title, coalesce(new.summary,''), new.related_url);
  end if;
  return new;
end;
$$;

revoke all on function public.portal_activity_notify() from public, anon, authenticated, service_role;
revoke all on function public.portal_agency_digest_excerpt(text,text,int),
  public.portal_agency_piece_digest_body(text,text,jsonb),
  public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text,text),
  public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.portal_agency_digest_excerpt(text,text,int),
  public.portal_agency_piece_digest_body(text,text,jsonb),
  public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text,text),
  public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text)
  to service_role;

-- 0078's assertion plus pins for this migration.
create or replace function public.assert_portal_agency_piece_digest_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity_def text;
  v_comment_def text;
  v_columns text[];
  v_fn text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.portal_activity_notify()'::pg_catalog.regprocedure
  ) into v_activity_def;
  select pg_catalog.pg_get_functiondef(
    'public.portal_comment_notify()'::pg_catalog.regprocedure
  ) into v_comment_def;
  if v_activity_def is null
     or v_activity_def not ilike '%portal_enqueue_agency_piece_digest%'
     or v_activity_def not ilike '%edit_requested%'
     or v_comment_def is null
     or v_comment_def not ilike '%portal_enqueue_agency_piece_digest%' then
    raise exception 'agency piece digest routing drifted';
  end if;
  -- 0097: the edit branch resolves piece-page bundles and prefers the client-facing label.
  if v_activity_def not ilike '%content_edit_review_bundles%'
     or v_activity_def not ilike '%content-edit-bundle:%'
     or v_activity_def not ilike '%->>''target_label''%'
     or v_activity_def not ilike '%portal_agency_digest_excerpt%'
     or v_activity_def not ilike '%t.agency_internal%' then
    raise exception 'agency piece digest edit detail drifted';
  end if;

  foreach v_fn in array array[
    'public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text)',
    'public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text,text)'
  ] loop
    if pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception 'agency piece digest grants are unsafe';
    end if;
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid = v_fn::pg_catalog.regprocedure
        and p.prosecdef
        and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
    ) then
      raise exception 'agency piece digest functions are not hardened';
    end if;
  end loop;
  if pg_catalog.has_function_privilege(
       'authenticated','public.read_notification_audit(uuid,timestamptz,int)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.read_notification_audit(uuid,timestamptz,int)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.portal_agency_piece_digest_body(text,text,jsonb)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.portal_agency_digest_excerpt(text,text,integer)','EXECUTE'
     ) then
    raise exception 'agency piece digest grants are unsafe';
  end if;

  select pg_catalog.array_agg(cp.column_name order by cp.column_name) into v_columns
  from information_schema.column_privileges cp
  where cp.table_schema = 'public' and cp.table_name = 'notification_outbox'
    and cp.grantee = 'authenticated' and cp.privilege_type = 'SELECT';
  if v_columns is distinct from array[
    'body','channel','client_id','created_at','id','recipient_kind','related_url','seen_at','subject'
  ]::text[] then
    raise exception 'agency digest exposed private outbox columns: %', v_columns;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.read_notification_audit(uuid,timestamptz,int)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'agency piece digest functions are not hardened';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.notification_outbox'::pg_catalog.regclass
      and c.conname = 'notification_outbox_agency_piece_digest_shape' and c.convalidated
  ) then
    raise exception 'agency piece digest shape check is missing';
  end if;
end;
$$;
revoke all on function public.assert_portal_agency_piece_digest_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_agency_piece_digest_security() to service_role;

-- Smoke: the three 2026-10-06 shapes render as the handoff asks.
do $$
declare
  v_body text;
begin
  v_body := public.portal_agency_piece_digest_body('Maria Guerts', 'Ep. 3',
    '[{"kind":"video_edit","area":"YouTube video, 4:32","quote":"FASTER"}]'::jsonb);
  if v_body <> E'Maria Guerts sent 1 video edit on "Ep. 3".\n\nYouTube video, 4:32: "FASTER"\n\nOpen the piece to review.' then
    raise exception 'agency digest body smoke failed: %', v_body;
  end if;
  if public.portal_agency_digest_excerpt(E'Title\n\n**1.** NEW LINE', E'Title\n\n**1.** OLD LINE', 200)
       <> '1. NEW LINE' then
    raise exception 'agency digest excerpt smoke failed';
  end if;
end;
$$;

select public.assert_portal_security();

commit;
