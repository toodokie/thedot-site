-- Comment target context + agency comment inbox links.
-- Client comments already had a durable row, activity event, and notification outbox entry. This
-- migration makes design feedback explicit and gives agency notifications a direct piece URL.

begin;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice29_security;
revoke all on function public.assert_portal_slice29_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice29_security() to service_role;

alter table public.comments
  add column if not exists target_kind text not null default 'copy',
  add column if not exists target_url text;

alter table public.comments
  add constraint comments_target_kind_valid check (target_kind in ('copy', 'design')),
  add constraint comments_target_url_shape check (
    (target_kind = 'copy' and target_url is null)
    or (target_kind = 'design' and target_url is not null
      and target_url ~ '^https://[^[:space:]]+$'
      and pg_catalog.char_length(target_url) <= 2048)
  );

grant select (target_kind, target_url) on public.comments to authenticated;

-- The inherited slice-2 assertion pins the exact authenticated comments grant set. Extend that
-- stored assertion in place so the new target metadata is intentional and remains regression-checked.
do $adjust_comments_grants$
declare
  v_definition text;
  v_adjusted text;
  v_old text := $assert$v_expected := array[
    'author_name','author_type','body','client_id','content_id','content_version',
    'copy_block_key','created_at','id','quoted_text','resolved'
  ];$assert$;
  v_new text := $assert$v_expected := array[
    'author_name','author_type','body','client_id','content_id','content_version',
    'copy_block_key','created_at','id','quoted_text','resolved','target_kind','target_url'
  ];$assert$;
begin
  select pg_catalog.pg_get_functiondef('public.assert_portal_slice2_security()'::pg_catalog.regprocedure)
    into v_definition;
  if v_definition is null or pg_catalog.strpos(v_definition, v_old) = 0 then
    raise exception 'could not update inherited comments grant assertion';
  end if;
  v_adjusted := pg_catalog.replace(v_definition, v_old, v_new);
  execute v_adjusted;
end;
$adjust_comments_grants$;

-- Design comments are still piece-scoped and use the same released-version membership and
-- capability boundary as copy comments. The URL must be the released Canva/Drive URL already
-- attached to that piece, so a client cannot turn the field into an arbitrary URL relay.
create or replace function public.add_design_comment(
  p_content_id uuid,
  p_body text,
  p_design_url text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client_id uuid;
  v_canva_url text;
  v_drive_url text;
  v_url text := nullif(pg_catalog.btrim(p_design_url), '');
  v_comment_id uuid;
begin
  if v_url is null or pg_catalog.char_length(v_url) > 2048 or v_url !~ '^https://[^[:space:]]+$' then
    raise exception 'design link is invalid';
  end if;
  select ci.client_id, coalesce(dl.canva_url, cv.canva_url),
    coalesce(dl.drive_url, cv.drive_url)
    into v_client_id, v_canva_url, v_drive_url
  from public.content_items ci
  join public.client_users cu
    on cu.client_id = ci.client_id and cu.auth_user_id = (select auth.uid())
  join public.content_item_versions cv
    on cv.content_item_id = ci.id
   and cv.client_id = ci.client_id
   and cv.version = ci.client_visible_version
  left join public.content_design_links dl
    on dl.content_item_id = ci.id and dl.client_id = ci.client_id
  where ci.id = p_content_id and ci.client_visible and ci.archived_at is null
  for update of ci;
  if not found then raise exception 'not authorized for this content'; end if;
  perform public.portal_require_client_action(v_client_id, 'can_comment');
  if v_url is distinct from v_canva_url and v_url is distinct from v_drive_url then
    raise exception 'design link is not attached to the released piece';
  end if;

  v_comment_id := public.portal_core_add_comment(p_content_id, p_body, null, null);
  update public.comments
  set target_kind = 'design', target_url = v_url
  where id = v_comment_id and client_id = v_client_id;
  return v_comment_id;
end;
$$;
revoke all on function public.add_design_comment(uuid, text, text) from public, anon;
grant execute on function public.add_design_comment(uuid, text, text) to authenticated, service_role;

-- Client comments go to the agency. Give that email a direct, same-site piece link. Agency replies
-- go to the client inbox only, never an /admin URL.
create or replace function public.portal_comment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recipient text;
  v_content_key text;
  v_related_url text;
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
    perform public.portal_enqueue_notification(
      new.client_id, v_recipient, 'email', 'comment', new.id,
      new.author_name || ' commented', pg_catalog.left(new.body, 280), v_related_url);
  end if;
  return new;
end;
$$;

create or replace function public.assert_portal_comment_target_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
  v_columns text[];
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
  from pg_catalog.pg_proc p
  where p.oid = 'public.add_design_comment(uuid,text,text)'::regprocedure;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%portal_core_add_comment%'
     or v_def not ilike '%portal_require_client_action%' then
    raise exception 'design comment RPC is not hardened';
  end if;
  select array_agg(c.column_name order by c.ordinal_position) into v_columns
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'comments'
    and c.column_name in ('target_kind', 'target_url');
  if v_columns is distinct from array['target_kind','target_url']::text[] then
    raise exception 'comment target columns missing';
  end if;
  if pg_catalog.has_function_privilege('anon','public.add_design_comment(uuid,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated','public.add_design_comment(uuid,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.add_design_comment(uuid,text,text)','EXECUTE') then
    raise exception 'unsafe design comment RPC privileges';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.comments','INSERT,UPDATE,DELETE') then
    raise exception 'authenticated can directly mutate comments';
  end if;
end;
$$;
revoke all on function public.assert_portal_comment_target_security() from public, anon, authenticated;
grant execute on function public.assert_portal_comment_target_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice29_security();
  perform public.assert_portal_comment_target_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
