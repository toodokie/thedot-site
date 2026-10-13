-- 0035_idea_promotion_inbox.sql: make Idea inbox promotion an agent-visible workflow event.
--
-- A raw content_ideas row is not a piece until an agency writer links it to an existing
-- tenant-scoped content_id. Keep the existing audited set_idea_status boundary, but emit one
-- durable agency inbox event when the terminal became_piece transition occurs.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.assert_portal_security()') is null
     or pg_catalog.to_regprocedure('public.set_idea_status(uuid,text,text,text,text)') is null
     or pg_catalog.to_regclass('public.portal_inbox_events') is null
     or pg_catalog.to_regclass('public.content_ideas') is null then
    raise exception '0035 requires the existing idea flow and agency inbox objects';
  end if;
end;
$$;

select public.assert_portal_security();
alter function public.assert_portal_security() rename to assert_portal_slice28_security;
revoke all on function public.assert_portal_slice28_security() from public, anon, authenticated;
grant execute on function public.assert_portal_slice28_security() to service_role;

create or replace function public.set_idea_status(
  p_idea_id uuid, p_status text, p_became_content_id text,
  p_actor_key text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.agency_actors%rowtype;
  v_idea public.content_ideas%rowtype;
  v_link text := nullif(pg_catalog.btrim(p_became_content_id), '');
  v_fingerprint text;
  v_receipt public.portal_command_receipts%rowtype;
  v_response jsonb;
  v_promoted boolean := false;
begin
  select * into v_actor from public.agency_actors
    where actor_key = p_actor_key and active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if p_idea_id is null or p_status not in ('proposed', 'picked', 'dropped', 'became_piece')
     or p_idempotency_key is null or pg_catalog.char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'invalid idea status request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'set-idea-status:' || p_idea_id::text || ':' || p_idempotency_key, 0));
  select * into v_idea from public.content_ideas i where i.id = p_idea_id for update;
  if not found then raise exception 'idea not found'; end if;
  if p_status = 'became_piece' and v_link is null then
    raise exception 'became_piece requires became_content_id';
  end if;
  if p_status <> 'became_piece' and v_link is not null then
    raise exception 'became_content_id is only valid for became_piece';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('idea_id', p_idea_id, 'status', p_status,
      'became_content_id', v_link)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_receipt from public.portal_command_receipts
    where client_id = v_idea.client_id and idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.command_type <> 'set_idea_status'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception 'idempotency key reused with different request';
    end if;
    return v_receipt.response;
  end if;

  if v_idea.status = 'dropped' and p_status <> 'dropped' then
    raise exception 'dropped ideas are terminal';
  end if;
  if v_idea.status = 'became_piece'
     and (p_status <> 'became_piece' or v_idea.became_content_id is distinct from v_link) then
    raise exception 'became_piece ideas are terminal';
  end if;
  if v_idea.status = 'picked' and p_status = 'proposed' then
    raise exception 'idea status cannot move backwards';
  end if;

  if v_link is not null then
    perform 1 from public.content_items ci
      where ci.client_id = v_idea.client_id and ci.content_id = v_link
      for share;
    if not found then raise exception 'became content does not belong to this client'; end if;
  end if;

  v_promoted := p_status = 'became_piece' and v_idea.status is distinct from 'became_piece';
  update public.content_ideas i
  set status = p_status, became_content_id = v_link, updated_at = pg_catalog.now()
  where i.id = v_idea.id;

  v_response := pg_catalog.jsonb_build_object(
    'id', v_idea.id, 'status', p_status, 'became_content_id', v_link);
  if v_idea.status is distinct from p_status
     or v_idea.became_content_id is distinct from v_link then
    insert into public.activity_log
      (client_id, event_type, event_key, title, summary, actor_type, actor_name)
    values (v_idea.client_id, 'idea_status_changed', 'agency:idea-status:' || p_idempotency_key,
      'Idea status updated: ' || v_idea.title,
      'Status: ' || pg_catalog.replace(p_status, '_', ' '), 'anastasia', v_actor.display_name);
  end if;

  if v_promoted then
    insert into public.portal_inbox_events (
      client_id, event_key, event_type, object_type, object_id,
      actor_type, actor_name, payload, requires_reconciliation
    ) values (
      v_idea.client_id,
      'agency:idea-promoted:' || v_idea.id::text || ':' || v_link,
      'idea_promoted', 'content_idea', v_idea.id,
      'anastasia', v_actor.display_name,
      pg_catalog.jsonb_build_object(
        'idea_id', v_idea.id,
        'content_id', v_link,
        'title', v_idea.title,
        'status', 'became_piece'
      ), false
    ) on conflict (client_id, event_key) do nothing;
  end if;

  insert into public.portal_command_receipts
    (client_id, command_type, idempotency_key, request_fingerprint, response)
  values (v_idea.client_id, 'set_idea_status', p_idempotency_key, v_fingerprint, v_response);
  return v_response;
end;
$$;

revoke all on function public.set_idea_status(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_idea_status(uuid, text, text, text, text)
  to service_role;

create or replace function public.assert_portal_idea_promotion_security()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef('public.set_idea_status(uuid,text,text,text,text)'::pg_catalog.regprocedure)
    into v_def;
  if v_def is null or v_def not like '%portal_inbox_events%'
     or v_def not like '%idea_promoted%' then
    raise exception 'idea promotion does not emit the durable inbox event';
  end if;
  if not (select p.prosecdef and coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where p.oid = 'public.set_idea_status(uuid,text,text,text,text)'::pg_catalog.regprocedure) then
    raise exception 'idea promotion writer is not hardened';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.set_idea_status(uuid,text,text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'public.set_idea_status(uuid,text,text,text,text)', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.set_idea_status(uuid,text,text,text,text)', 'EXECUTE') then
    raise exception 'unsafe idea promotion writer privileges';
  end if;
end;
$$;

revoke all on function public.assert_portal_idea_promotion_security() from public, anon, authenticated;
grant execute on function public.assert_portal_idea_promotion_security() to service_role;

create or replace function public.assert_portal_security()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_portal_slice28_security();
  perform public.assert_portal_idea_promotion_security();
end;
$$;
revoke all on function public.assert_portal_security() from public, anon, authenticated;
grant execute on function public.assert_portal_security() to service_role;

select public.assert_portal_security();
commit;
