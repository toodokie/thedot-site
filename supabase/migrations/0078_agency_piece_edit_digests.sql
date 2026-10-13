-- Bundle a client's same-piece copy edits and comments into one agency email after a short
-- quiet window. In-app notifications remain event-level and immediate.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.portal_enqueue_notification(uuid,text,text,text,uuid,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.portal_activity_notify()') is null
     or pg_catalog.to_regprocedure('public.portal_comment_notify()') is null
     or pg_catalog.to_regclass('public.notification_outbox') is null
     or pg_catalog.to_regclass('public.content_change_requests') is null then
    raise exception '0078 requires the existing portal notification and content request system';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice77_security;
revoke all on function public.assert_portal_slice77_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice77_security() to service_role;

alter table public.notification_outbox
  drop constraint if exists notification_outbox_template_key_check;
alter table public.notification_outbox
  add constraint notification_outbox_template_key_check
  check (template_key in ('generic','report','agency_piece_digest'));

alter table public.notification_outbox
  add column bundle_key text,
  add column bundle_event_count int not null default 0 check (bundle_event_count >= 0),
  add column bundle_edit_count int not null default 0 check (bundle_edit_count >= 0),
  add column bundle_comment_count int not null default 0 check (bundle_comment_count >= 0),
  add column bundle_targets text[] not null default '{}'::text[],
  add column bundle_last_event_at timestamptz;

alter table public.notification_outbox
  add constraint notification_outbox_agency_piece_digest_shape check (
    template_key <> 'agency_piece_digest'
    or (
      recipient_kind = 'agency'
      and channel = 'email'
      and bundle_key is not null
      and bundle_event_count > 0
      and bundle_event_count = bundle_edit_count + bundle_comment_count
      and bundle_last_event_at is not null
      and related_url ~ '^https://www[.]thedotcreative[.]co/admin/portal/pieces/[a-z0-9][a-z0-9._-]{1,119}$'
    )
  );

create index notification_outbox_piece_digest_open
  on public.notification_outbox(client_id, bundle_key, bundle_last_event_at desc)
  where template_key = 'agency_piece_digest' and status = 'pending' and attempts = 0;

create function public.portal_agency_piece_digest_body(
  p_title text,
  p_edit_count int,
  p_comment_count int,
  p_targets text[]
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_summary text := '';
  v_targets text := '';
begin
  if p_edit_count > 0 then
    v_summary := p_edit_count::text || ' copy edit' || case when p_edit_count = 1 then '' else 's' end;
  end if;
  if p_comment_count > 0 then
    v_summary := v_summary
      || case when v_summary = '' then '' else ' and ' end
      || p_comment_count::text || ' comment' || case when p_comment_count = 1 then '' else 's' end;
  end if;
  if coalesce(pg_catalog.array_length(p_targets, 1), 0) > 0 then
    v_targets := E'\n\nAreas: ' || pg_catalog.array_to_string(p_targets, ', ');
  end if;
  return 'A client editing session is ready for review on “' || p_title || '”.'
    || E'\n\n' || v_summary || ' received.' || v_targets
    || E'\n\nOpen the piece to review the latest copy and feedback.';
end;
$$;

create function public.portal_enqueue_agency_piece_digest(
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
  v_content_key text;
  v_title text;
  v_bundle_key text;
  v_related_url text;
  v_digest_id uuid;
  v_event_count int;
  v_edit_count int;
  v_comment_count int;
  v_targets text[];
  v_target text := nullif(pg_catalog.btrim(p_target_label), '');
  v_actor text := coalesce(nullif(pg_catalog.btrim(p_actor_name), ''), 'Client');
begin
  if p_client_id is null or p_content_id is null or p_source_id is null
     or p_source_kind not in ('activity','comment')
     or p_item_kind not in ('edit','comment') then
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
    n.bundle_targets
  into v_digest_id, v_event_count, v_edit_count, v_comment_count, v_targets
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
  v_edit_count := coalesce(v_edit_count, 0) + case when p_item_kind = 'edit' then 1 else 0 end;
  v_comment_count := coalesce(v_comment_count, 0) + case when p_item_kind = 'comment' then 1 else 0 end;
  v_targets := coalesce(v_targets, '{}'::text[]);
  if v_target is not null and not (v_target = any(v_targets)) then
    v_targets := pg_catalog.array_append(v_targets, v_target);
  end if;

  if v_digest_id is null then
    insert into public.notification_outbox(
      client_id, recipient_kind, recipient_email, channel, event_key, source_kind,
      source_activity_id, subject, body, related_url, template_key, status, next_attempt_at,
      bundle_key, bundle_event_count, bundle_edit_count, bundle_comment_count, bundle_targets,
      bundle_last_event_at
    ) values (
      p_client_id, 'agency', null, 'email',
      'piece-session:' || p_content_id::text || ':' || p_source_id::text,
      p_source_kind, case when p_source_kind = 'activity' then p_source_id else null end,
      v_actor || ' updated: ' || v_title,
      public.portal_agency_piece_digest_body(v_title, v_edit_count, v_comment_count, v_targets),
      v_related_url, 'agency_piece_digest', 'pending', pg_catalog.now() + interval '5 minutes',
      v_bundle_key, v_event_count, v_edit_count, v_comment_count, v_targets, pg_catalog.now()
    ) returning id into v_digest_id;
  else
    update public.notification_outbox
    set subject = v_actor || ' updated: ' || v_title,
        body = public.portal_agency_piece_digest_body(
          v_title, v_edit_count, v_comment_count, v_targets
        ),
        related_url = v_related_url,
        next_attempt_at = pg_catalog.now() + interval '5 minutes',
        bundle_event_count = v_event_count,
        bundle_edit_count = v_edit_count,
        bundle_comment_count = v_comment_count,
        bundle_targets = v_targets,
        bundle_last_event_at = pg_catalog.now()
    where id = v_digest_id;
  end if;

  return v_digest_id;
end;
$$;

create or replace function public.portal_activity_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text;
  v_block_key text;
  v_target_label text;
begin
  if new.event_type in ('comment_added','agency_comment_added','idea_comment_added','agency_idea_comment_added') then
    return new;
  end if;
  v_recipient := public.portal_notification_recipient(new.actor_type);
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'activity', new.id,
    new.title, coalesce(new.summary,''), new.related_url);

  if v_recipient = 'agency' and new.event_type = 'edit_requested' and new.content_id is not null then
    select r.payload->>'block_key' into v_block_key
    from public.content_change_requests r
    where r.client_id = new.client_id
      and 'content-request:' || r.id::text = new.event_key;
    select e.value->>'label' into v_target_label
    from public.content_item_versions cv
    cross join lateral pg_catalog.jsonb_array_elements(cv.copy_blocks) e(value)
    where cv.content_item_id = new.content_id
      and cv.client_id = new.client_id
      and cv.version = new.content_version
      and e.value->>'key' = v_block_key;
    perform public.portal_enqueue_agency_piece_digest(
      new.client_id, new.content_id, 'activity', new.id, new.actor_name, 'edit',
      coalesce(v_target_label, pg_catalog.initcap(pg_catalog.replace(v_block_key, '-', ' ')), 'Copy')
    );
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

create or replace function public.portal_comment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text;
  v_content_key text;
  v_related_url text;
  v_target_label text;
begin
  v_recipient := public.portal_notification_recipient(new.author_type);
  select ci.content_id into v_content_key
  from public.content_items ci
  where ci.id = new.content_id and ci.client_id = new.client_id;
  if v_recipient = 'agency' and v_content_key is not null then
    v_related_url := 'https://www.thedotcreative.co/admin/portal/pieces/' || v_content_key;
  end if;
  perform public.portal_enqueue_notification(
    new.client_id, v_recipient, 'in_app', 'comment', new.id,
    new.author_name || ' commented', pg_catalog.left(new.body, 280), v_related_url);

  if v_recipient = 'agency' then
    if new.copy_block_key is not null then
      select e.value->>'label' into v_target_label
      from public.content_item_versions cv
      cross join lateral pg_catalog.jsonb_array_elements(cv.copy_blocks) e(value)
      where cv.content_item_id = new.content_id
        and cv.client_id = new.client_id
        and cv.version = new.content_version
        and e.value->>'key' = new.copy_block_key;
    end if;
    perform public.portal_enqueue_agency_piece_digest(
      new.client_id, new.content_id, 'comment', new.id, new.author_name, 'comment',
      coalesce(v_target_label, 'General feedback')
    );
  elsif public.portal_feature_enabled(new.client_id, 'client_alerts') then
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'comment', new.id,
      new.author_name || ' commented', pg_catalog.left(new.body, 280), null);
  end if;
  return new;
end;
$$;

create function public.read_notification_audit(
  p_client_id uuid,
  p_since timestamptz,
  p_limit int default 1000
) returns table(
  notification_id uuid,
  recipient_kind text,
  channel text,
  event_key text,
  source_kind text,
  source_activity_id uuid,
  activity_event_type text,
  subject text,
  related_url text,
  template_key text,
  status text,
  attempts int,
  next_attempt_at timestamptz,
  last_error text,
  bundle_event_count int,
  bundle_edit_count int,
  bundle_comment_count int,
  bundle_last_event_at timestamptz,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_client_id is null or p_since is null
     or p_since < pg_catalog.now() - interval '90 days'
     or p_since > pg_catalog.now() + interval '5 minutes'
     or p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'invalid notification audit range';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'client not found';
  end if;

  return query
  select n.id, n.recipient_kind, n.channel, n.event_key, n.source_kind,
    n.source_activity_id, a.event_type, n.subject, n.related_url, n.template_key,
    n.status, n.attempts, n.next_attempt_at, n.last_error, n.bundle_event_count,
    n.bundle_edit_count, n.bundle_comment_count, n.bundle_last_event_at,
    n.created_at, n.completed_at
  from public.notification_outbox n
  left join public.activity_log a
    on a.id = n.source_activity_id and a.client_id = n.client_id
  where n.client_id = p_client_id and n.created_at >= p_since
  order by n.created_at desc, n.id desc
  limit p_limit;
end;
$$;

revoke all on function public.portal_agency_piece_digest_body(text,int,int,text[]),
  public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text),
  public.read_notification_audit(uuid,timestamptz,int),
  public.portal_activity_notify(), public.portal_comment_notify()
  from public, anon, authenticated, service_role;
grant execute on function public.portal_agency_piece_digest_body(text,int,int,text[]),
  public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text),
  public.read_notification_audit(uuid,timestamptz,int)
  to service_role;

create function public.assert_portal_agency_piece_digest_security()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity_def text;
  v_comment_def text;
  v_columns text[];
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

  if pg_catalog.has_function_privilege(
       'anon','public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text)','EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated','public.read_notification_audit(uuid,timestamptz,int)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.read_notification_audit(uuid,timestamptz,int)','EXECUTE'
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
    where p.oid = 'public.portal_enqueue_agency_piece_digest(uuid,uuid,text,uuid,text,text,text)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) or not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.read_notification_audit(uuid,timestamptz,int)'::pg_catalog.regprocedure
      and p.prosecdef
      and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
  ) then
    raise exception 'agency piece digest functions are not hardened';
  end if;
end;
$$;

revoke all on function public.assert_portal_agency_piece_digest_security()
  from public, anon, authenticated;
grant execute on function public.assert_portal_agency_piece_digest_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice77_security();
  perform public.assert_portal_agency_piece_digest_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
