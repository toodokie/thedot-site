-- An agency may correct a proposal that is still awaiting review, but must do so through
-- an explicit, audited revision. This prevents a silent mutation of what the client saw.

begin;

insert into public.activity_event_types(event_type) values ('proposal_revised') on conflict do nothing;

create function public.revise_client_proposal_draft(
  p_client_id uuid,p_proposal_key text,p_actor_key text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.agency_actors%rowtype; v_row public.client_proposals%rowtype;
  v_receipt public.portal_command_receipts%rowtype; v_fingerprint text; v_activity_id uuid;
begin
  if p_client_id is null or p_proposal_key !~ '^[a-z0-9][a-z0-9._-]{0,199}$'
     or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,200}$' then raise exception 'invalid proposal revision'; end if;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(p_client_id,'agency_mutations') then raise exception 'agency_mutations_disabled' using errcode='42501'; end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('client_id',p_client_id,'proposal_key',p_proposal_key,'actor',p_actor_key)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('proposal-revision:'||p_client_id::text||':'||p_proposal_key,0));
  select * into v_receipt from public.portal_command_receipts r where r.client_id=p_client_id and r.idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.command_type<>'revise_client_proposal_draft' or v_receipt.request_fingerprint<>v_fingerprint then raise exception 'idempotency key reused with different request'; end if;
    return v_receipt.response;
  end if;
  select * into v_row from public.client_proposals p where p.client_id=p_client_id and p.proposal_key=p_proposal_key for update;
  if not found then raise exception 'proposal not found'; end if;
  if v_row.status<>'awaiting_decision' or v_row.decided_at is not null or v_row.decided_by is not null then
    raise exception 'proposal is no longer eligible for revision';
  end if;
  update public.client_proposals set status='draft',revision=v_row.revision+1,submitted_at=null,updated_at=pg_catalog.now()
    where id=v_row.id;
  insert into public.activity_log(client_id,event_type,event_key,title,summary,actor_type,actor_name)
    values(v_row.client_id,'proposal_revised','proposal-revised:'||v_row.id::text||':'||(v_row.revision+1)::text,
      'Updated review: '||v_row.title,'A revised version replaced the earlier review before a decision was recorded.','anastasia',v_actor.display_name)
    returning id into v_activity_id;
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,request_fingerprint,response)
    values(v_row.client_id,'revise_client_proposal_draft',p_idempotency_key,v_fingerprint,
      pg_catalog.jsonb_build_object('id',v_row.id,'revision',v_row.revision+1,'activity_id',v_activity_id,'outcome','draft_opened'));
  return pg_catalog.jsonb_build_object('id',v_row.id,'revision',v_row.revision+1,'activity_id',v_activity_id,'outcome','draft_opened');
end;
$$;
revoke all on function public.revise_client_proposal_draft(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.revise_client_proposal_draft(uuid,text,text,text) to service_role;

-- A revision is allocated when the agency reopens a submitted proposal. Further edits to
-- that unsubmitted draft must stay on the allocated revision, otherwise an ordinary save
-- would make the supplied revision impossible to submit. A client-requested revision still
-- receives the next revision when its amended draft is written.
create or replace function public.upsert_client_proposal_draft(
  p_client_id uuid,p_proposal_key text,p_title text,p_summary text,p_blocks jsonb,p_actor_key text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.agency_actors%rowtype; v_row public.client_proposals%rowtype; v_receipt public.portal_command_receipts%rowtype; v_fp text; v_link jsonb;
begin
  if p_client_id is null or p_proposal_key !~ '^[a-z0-9][a-z0-9._-]{0,199}$' or p_idempotency_key !~ '^[A-Za-z0-9:_-]{8,200}$'
     or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 300
     or not public.portal_client_summary_shape_valid(p_title)
     or not (p_summary is null or (pg_catalog.char_length(pg_catalog.btrim(p_summary)) between 1 and 2000 and public.portal_client_summary_shape_valid(p_summary)))
     or not public.portal_proposal_blocks_shape_valid(p_blocks) then raise exception 'invalid proposal draft'; end if;
  for v_link in select value from pg_catalog.jsonb_array_elements(p_blocks) where value->>'kind'='link' loop
    if not public.portal_client_link_url_valid(v_link->>'url') then raise exception 'proposal link is not an approved client-visible URL'; end if;
  end loop;
  select * into v_actor from public.agency_actors a where a.actor_key=p_actor_key and a.active;
  if not found then raise exception 'unknown or inactive agency actor'; end if;
  if not public.portal_feature_enabled(p_client_id,'agency_mutations') then raise exception 'agency_mutations_disabled' using errcode='42501'; end if;
  v_fp:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object('key',p_proposal_key,'title',p_title,'summary',p_summary,'blocks',p_blocks,'actor',p_actor_key)::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('proposal:'||p_client_id::text||':'||p_proposal_key,0));
  select * into v_receipt from public.portal_command_receipts r where r.client_id=p_client_id and r.idempotency_key=p_idempotency_key;
  if found then if v_receipt.command_type<>'upsert_client_proposal_draft' or v_receipt.request_fingerprint<>v_fp then raise exception 'idempotency key reused with different request'; end if; return v_receipt.response; end if;
  select * into v_row from public.client_proposals where client_id=p_client_id and proposal_key=p_proposal_key for update;
  if found then
    if v_row.status not in ('draft','change_requested') then raise exception 'proposal must be changed through a client-requested revision'; end if;
    update public.client_proposals set title=pg_catalog.btrim(p_title),summary=nullif(pg_catalog.btrim(p_summary),''),blocks=p_blocks,
      revision=case when v_row.status='change_requested' then v_row.revision+1 else v_row.revision end,
      status='draft',submitted_at=null,decided_at=null,decision_note=null,decided_by=null,decided_by_name=null,updated_at=pg_catalog.now()
      where id=v_row.id returning * into v_row;
  else
    insert into public.client_proposals(client_id,proposal_key,title,summary,blocks) values(p_client_id,p_proposal_key,pg_catalog.btrim(p_title),nullif(pg_catalog.btrim(p_summary),''),p_blocks) returning * into v_row;
  end if;
  insert into public.portal_command_receipts(client_id,command_type,idempotency_key,request_fingerprint,response) values(p_client_id,'upsert_client_proposal_draft',p_idempotency_key,v_fp,pg_catalog.jsonb_build_object('id',v_row.id,'revision',v_row.revision,'status',v_row.status));
  return pg_catalog.jsonb_build_object('id',v_row.id,'revision',v_row.revision,'status',v_row.status);
end;
$$;

do $$
begin
  if pg_catalog.has_function_privilege('anon','public.revise_client_proposal_draft(uuid,text,text,text)','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.revise_client_proposal_draft(uuid,text,text,text)','EXECUTE')
     or not pg_catalog.has_function_privilege('service_role','public.revise_client_proposal_draft(uuid,text,text,text)','EXECUTE') then
    raise exception 'proposal revision writer grants unsafe';
  end if;
end;
$$;

select public.assert_portal_security();

commit;
