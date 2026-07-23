-- Audited admin reply path for the piece-centered portal.
-- The browser may operate a reply, but it never receives direct comments writes.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.add_agency_comment(uuid,text,text)') is null
     or pg_catalog.to_regclass('public.portal_command_receipts') is null then
    raise exception '0025/base portal objects must exist before applying 0026';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice20_security;
revoke all on function public.assert_portal_slice20_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice20_security() to service_role;

create or replace function public.add_agency_comment_reply(
  p_content_id uuid,
  p_body text,
  p_author_name text,
  p_copy_block_key text,
  p_quoted_text text,
  p_actor_key text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.agency_actors%rowtype;
  v_client_id uuid;
  v_version int;
  v_title text;
  v_blocks jsonb;
  v_block_body text;
  v_body text := pg_catalog.btrim(p_body);
  v_author text := pg_catalog.btrim(p_author_name);
  v_quote text := nullif(pg_catalog.btrim(p_quoted_text), '');
  v_key text := nullif(pg_catalog.btrim(p_copy_block_key), '');
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_comment_id uuid;
  v_response jsonb;
begin
  select * into v_actor from public.agency_actors where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if v_body is null or v_body = '' then raise exception 'comment body is required'; end if;
  if pg_catalog.char_length(v_body) > 4000 then raise exception 'comment is too long'; end if;
  if v_author is null or v_author = '' or pg_catalog.char_length(v_author) > 200 then
    raise exception 'author name is invalid';
  end if;
  if v_body ~ '[[:cntrl:]]' or v_author ~ '[[:cntrl:]]' then
    raise exception 'comment contains control characters';
  end if;
  if v_quote is not null and v_quote ~ '[[:cntrl:]]' then
    raise exception 'quoted text contains control characters';
  end if;
  if v_author is distinct from v_actor.display_name then
    raise exception 'author name must match the active agency actor';
  end if;
  if v_key is not null and v_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception 'copy block key is invalid';
  end if;
  if v_quote is not null and pg_catalog.char_length(v_quote) > 1000 then
    raise exception 'quoted text is too long';
  end if;
  if v_quote is not null and v_key is null then
    raise exception 'quoted text requires a copy block key';
  end if;
  if p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'idempotency key is required';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('content_id', p_content_id, 'body', v_body,
      'author_name', v_author, 'copy_block_key', v_key, 'quoted_text', v_quote)::text,
    'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id = (select ci.client_id from public.content_items ci where ci.id = p_content_id)
      and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'add_agency_comment_reply'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  select ci.client_id, ci.client_visible_version, cv.title, cv.copy_blocks
    into v_client_id, v_version, v_title, v_blocks
  from public.content_items ci
  join public.content_item_versions cv
    on cv.content_item_id = ci.id and cv.client_id = ci.client_id
   and cv.version = ci.client_visible_version
  where ci.id = p_content_id and ci.client_visible and ci.archived_at is null
  for update of ci;
  if not found then raise exception 'released content item not found'; end if;

  if v_key is not null then
    select value->>'body' into v_block_body
    from pg_catalog.jsonb_array_elements(v_blocks) value
    where value->>'key' = v_key;
    if v_block_body is null then raise exception 'copy block key not found in released version'; end if;
    if v_quote is not null and pg_catalog.position(v_quote in v_block_body) = 0 then
      raise exception 'quoted text is not present in the released copy block';
    end if;
  end if;

  insert into public.comments (
    content_id, client_id, content_version, copy_block_key,
    author_type, author_name, body, quoted_text
  ) values (
    p_content_id, v_client_id, v_version, v_key,
    'anastasia', v_author, v_body, v_quote
  ) returning id into v_comment_id;

  insert into public.activity_log (
    client_id, content_id, content_version, event_type, event_key, title, summary,
    actor_type, actor_name
  ) values (
    v_client_id, p_content_id, v_version, 'comment_added',
    'agency-comment:' || p_idempotency_key, 'Comment: ' || v_title, v_body,
    'anastasia', v_author
  );

  v_response := pg_catalog.jsonb_build_object('comment_id', v_comment_id,
    'content_id', p_content_id, 'content_version', v_version, 'outcome', 'inserted');
  insert into public.portal_command_receipts
    (client_id, command_type, idempotency_key, request_fingerprint, response)
  values (v_client_id, 'add_agency_comment_reply', p_idempotency_key, v_fingerprint, v_response);
  return v_response;
end;
$$;

revoke all on function public.add_agency_comment_reply(uuid,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.add_agency_comment_reply(uuid,text,text,text,text,text,text)
  to service_role;

create or replace function public.assert_portal_admin_piece_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
  from pg_catalog.pg_proc p
  where p.oid = 'public.add_agency_comment_reply(uuid,text,text,text,text,text,text)'::regprocedure;
  if v_def is null or v_def not ilike '%security definer%'
     or v_def not ilike '%position(v_quote in v_block_body)%'
     or v_def not ilike '%portal_command_receipts%' then
    raise exception 'admin comment reply is not hardened';
  end if;
  if pg_catalog.has_function_privilege('anon','public.add_agency_comment_reply(uuid,text,text,text,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.add_agency_comment_reply(uuid,text,text,text,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.add_agency_comment_reply(uuid,text,text,text,text,text,text)','EXECUTE') then
    raise exception 'admin comment reply privileges are unsafe';
  end if;
end;
$$;
revoke all on function public.assert_portal_admin_piece_security() from public, anon, authenticated;
grant execute on function public.assert_portal_admin_piece_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice20_security();
  perform public.assert_portal_admin_piece_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();

commit;
