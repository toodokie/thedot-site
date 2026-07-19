select public.assert_portal_security();

do $$
begin
  if not public.portal_provider_url_valid('instagram','https://www.instagram.com/p/abc','live')
     or public.portal_provider_url_valid('instagram','https://evilinstagram.com/p/abc','live')
     or public.portal_provider_url_valid('instagram','https://user:pass@instagram.com/p/abc','live')
     or public.portal_provider_url_valid('instagram','https://business.facebook.com/x','live')
     or not public.portal_provider_url_valid('instagram','https://business.facebook.com/x','schedule')
     or not public.portal_provider_url_valid('youtube','https://youtu.be/abc','live')
     or not public.portal_provider_url_valid('squarespace','https://kanset.com/news/abc','live') then
    raise exception 'provider URL boundary is wrong';
  end if;
  if not public.portal_fact_check_ledger_shape_valid('[{
    "claim_key":"owner-attested","claim":"Client approved this success story.",
    "status":"confirmed","source_type":"agency_attested","source_url":null,
    "source_title":"Agency owner verified the client-approved account",
    "checked_at":"2026-07-18","checked_by_role":"agency_owner"
  }]'::jsonb,'required',null) then raise exception 'valid agency attestation was rejected'; end if;
  if public.portal_fact_check_ledger_shape_valid('[{
    "claim_key":"bad","claim":"Regulatory claim.","status":"confirmed",
    "source_type":"agency_attested","source_url":"https://www.canada.ca/x",
    "source_title":"Improper attestation","checked_at":"2026-07-18",
    "checked_by_role":"agency_owner"
  }]'::jsonb,'required',null) then raise exception 'agency attestation accepted a government URL'; end if;
end;
$$;

insert into auth.users (id,email) values
  ('00000000-0000-0000-0000-000000000901','publication-probe@example.com');
insert into public.client_users (client_id,auth_user_id,email,name)
select id,'00000000-0000-0000-0000-000000000901',
  'publication-probe@example.com','Publication Probe'
from public.clients where slug='kanset';

set role service_role;
select public.sync_content_item_versions(pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'client_id',(select id from public.clients where slug='kanset'),
    'content_id','slice4-publication-probe','version',1,
    'title','Synthetic publication probe','format','test','pillar','test',
    'platforms',pg_catalog.jsonb_build_array('instagram'),
    'planned_date','2026-07-18','fact_check','confirmed',
    'fact_check_scope','not_applicable',
    'fact_check_exemption','Synthetic publication workflow probe without a factual claim.',
    'fact_check_ledger','[]'::jsonb,
    'client_body','Synthetic client-safe publication probe.',
    'copy_blocks','[{"key":"caption","label":"Caption","body":"Synthetic client-safe publication probe."}]'::jsonb,
    'source_path','fixture:slice4-publication-probe.md'
  )
));
select public.mark_content_ready(
  (select id from public.content_items where content_id='slice4-publication-probe'),1
);
reset role;

set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000901';
select public.record_content_decision(
  (select id from public.content_items where content_id='slice4-publication-probe'),
  1,'approved',null
);
reset role;

set role service_role;
select public.register_publication_evidence(
  (select id from public.clients where slug='kanset'),'thedot-admin','reviewed_link',null,
  'https://www.instagram.com/p/synthetic-proof',null,pg_catalog.now(),null,null,null,
  'slice4-evidence-0001'
);

select public.confirm_schedule_target(
  (select id from public.content_schedule_targets where content_id=(
    select id from public.content_items where content_id='slice4-publication-probe'
  ) and destination='instagram'),
  pg_catalog.now()+interval '1 hour','https://business.facebook.com/synthetic-schedule',
  'synthetic-schedule-id',
  (select id from public.publication_evidence where idempotency_key='slice4-evidence-0001'),
  'thedot-admin','slice4-schedule-0001'
);

select public.record_publication_observation(
  (select id from public.content_publication_targets where content_id=(
    select id from public.content_items where content_id='slice4-publication-probe'
  ) and destination='instagram'),
  'live','https://www.instagram.com/p/synthetic-live',pg_catalog.now()-interval '1 hour',
  'public',(select id from public.publication_evidence where idempotency_key='slice4-evidence-0001'),
  'thedot-admin','manual','verified','synthetic-provider-id','Synthetic title',
  'Synthetic final caption.','slice4-publication-0001',null,'Opened and visibly checked.'
);
select public.record_publication_observation(
  (select id from public.content_publication_targets where content_id=(
    select id from public.content_items where content_id='slice4-publication-probe'
  ) and destination='instagram'),
  'live','https://www.instagram.com/p/synthetic-live',
  (select published_at from public.content_publication_targets where content_id=(
    select id from public.content_items where content_id='slice4-publication-probe'
  ) and destination='instagram'),
  'public',(select id from public.publication_evidence where idempotency_key='slice4-evidence-0001'),
  'thedot-admin','manual','verified','synthetic-provider-id','Synthetic title',
  'Synthetic final caption.','slice4-publication-0001',null,'Opened and visibly checked.'
);

reset role;

do $$
declare
  v_item_id uuid := (select id from public.content_items where content_id='slice4-publication-probe');
  v_target_id uuid := (select id from public.content_publication_targets
    where content_id=v_item_id and destination='instagram');
  v_observation_id uuid := (select current_observation_id from public.content_publication_targets
    where id=v_target_id);
  v_observations bigint;
  v_activity bigint;
  v_outbox bigint;
begin
  if public.portal_publication_state(v_item_id,1) <> 'live'
     or (select status from public.content_items where id=v_item_id) <> 'posted'
     or (select publication_locked_version from public.content_items where id=v_item_id) <> 1
     or (select client_state from public.content_with_state where id=v_item_id) <> 'live' then
    raise exception 'manual publication did not derive the locked aggregate live state';
  end if;
  if (select pg_catalog.count(*) from public.content_publication_observations
      where publication_target_id=v_target_id) <> 1
     or (select pg_catalog.count(*) from public.activity_log
      where content_id=v_item_id and event_type='publication_target_live') <> 1
     or (select pg_catalog.count(*) from public.activity_log
      where content_id=v_item_id and event_type='fully_posted') <> 1 then
    raise exception 'exact publication retry duplicated immutable history or activity';
  end if;
  select pg_catalog.count(*) into v_observations from public.content_publication_observations;
  select pg_catalog.count(*) into v_activity from public.activity_log;
  select pg_catalog.count(*) into v_outbox from public.projection_outbox;
  perform public.preview_publication_observation(
    v_target_id,'live','https://www.instagram.com/p/synthetic-correction',
    pg_catalog.now()-interval '30 minutes','public',
    (select id from public.publication_evidence where idempotency_key='slice4-evidence-0001'),
    'thedot-admin','manual','verified','synthetic-provider-id','Corrected title',
    'Corrected synthetic caption.','slice4-preview-0001',v_observation_id,
    'Preview only; must roll back.'
  );
  if (select pg_catalog.count(*) from public.content_publication_observations) <> v_observations
     or (select pg_catalog.count(*) from public.activity_log) <> v_activity
     or (select pg_catalog.count(*) from public.projection_outbox) <> v_outbox
     or (select current_observation_id from public.content_publication_targets where id=v_target_id)
       is distinct from v_observation_id then
    raise exception 'publication preview wrote durable state';
  end if;
  begin
    update public.content_items set revision_in_progress=true where id=v_item_id;
    raise exception 'publication lock allowed an in-place revision';
  exception when others then
    if sqlerrm='publication lock allowed an in-place revision' then raise; end if;
  end;
end;
$$;

set role service_role;
select public.sync_content_item_versions(pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'client_id',(select id from public.clients where slug='kanset'),
    'content_id','slice4-import-probe','version',1,'title','Synthetic historical import probe',
    'format','test','pillar','test','platforms',pg_catalog.jsonb_build_array('facebook'),
    'planned_date','2026-07-01','fact_check','confirmed','fact_check_scope','not_applicable',
    'fact_check_exemption','Synthetic historical import probe without a factual claim.',
    'fact_check_ledger','[]'::jsonb,'client_body','Synthetic historical import copy.',
    'copy_blocks','[{"key":"caption","label":"Caption","body":"Synthetic historical import copy."}]'::jsonb,
    'source_path','fixture:slice4-import-probe.md'
  )
));
select public.mark_content_ready(
  (select id from public.content_items where content_id='slice4-import-probe'),1
);
reset role;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000901';
select public.record_content_decision(
  (select id from public.content_items where content_id='slice4-import-probe'),1,'approved',null
);
reset role;

do $$
declare
  v_client_id uuid := (select id from public.clients where slug='kanset');
  v_item_id uuid := (select id from public.content_items where content_id='slice4-import-probe');
  v_target_id uuid := (select id from public.content_publication_targets
    where content_id=v_item_id and destination='facebook');
  v_payload jsonb;
  v_preview jsonb;
  v_batch_id uuid;
  v_retry_id uuid;
  v_evidence bigint;
  v_observations bigint;
  v_batches bigint;
  v_entries bigint;
begin
  v_payload := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'client_id',v_client_id,'piece_label','Synthetic historical import probe',
    'destination','facebook','provenance','legacy_unverified',
    'publication_target_id',v_target_id,'published_at','2026-07-01T16:00:00-04:00',
    'live_url',null,'visibility','public','provider_object_id',null,
    'evidence_kind','agency_attestation','evidence_url',null,
    'attestation_note','Agency attests this synthetic piece was posted before the portal.',
    'captured_at','2026-07-01T16:00:00-04:00','reconciliation_status','unverified',
    'verification_note','Posted pre-portal; not independently verified.',
    'evidence_idempotency_key','history-evidence-synthetic-0001',
    'observation_key','history-observation-synthetic-0001'
  ));
  select pg_catalog.count(*) into v_evidence from public.publication_evidence;
  select pg_catalog.count(*) into v_observations from public.content_publication_observations;
  select pg_catalog.count(*) into v_batches from public.historical_publication_import_batches;
  select pg_catalog.count(*) into v_entries from public.historical_publication_import_entries;
  v_preview := public.preview_historical_publication_batch(
    v_client_id,'synthetic-history.md',v_payload
  );
  if not (v_preview->>'valid')::boolean or not (v_preview->>'zero_write')::boolean
     or (select pg_catalog.count(*) from public.publication_evidence) <> v_evidence
     or (select pg_catalog.count(*) from public.content_publication_observations) <> v_observations
     or (select pg_catalog.count(*) from public.historical_publication_import_batches) <> v_batches
     or (select pg_catalog.count(*) from public.historical_publication_import_entries) <> v_entries then
    raise exception 'historical batch preview wrote state';
  end if;
  v_batch_id := public.apply_historical_publication_batch(
    v_client_id,'synthetic-history.md',v_payload,v_preview->>'approved_checksum'
  );
  v_retry_id := public.apply_historical_publication_batch(
    v_client_id,'synthetic-history.md',v_payload,v_preview->>'approved_checksum'
  );
  if v_retry_id is distinct from v_batch_id
     or (select pg_catalog.count(*) from public.historical_publication_import_batches where id=v_batch_id) <> 1
     or (select pg_catalog.count(*) from public.historical_publication_import_entries where batch_id=v_batch_id) <> 1
     or (select pg_catalog.count(*) from public.content_publication_observations
       where publication_target_id=v_target_id) <> 1
     or (select status from public.content_publication_targets where id=v_target_id) <> 'live'
     or (select reconciliation_status from public.content_publication_targets where id=v_target_id) <> 'unverified'
     or public.portal_publication_state(v_item_id,1) <> 'partially_live'
     or (select status from public.content_items where id=v_item_id) = 'posted'
     or (select publication_locked_version from public.content_items where id=v_item_id) is not null then
    raise exception 'historical import was not atomic, idempotent, or honestly unverified';
  end if;
end;
$$;

do $$
begin
  if pg_catalog.has_table_privilege('authenticated','public.publication_evidence','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.content_publication_targets','INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.content_publication_observations','INSERT,UPDATE,DELETE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.record_publication_observation(uuid,text,text,timestamptz,text,uuid,text,text,text,text,text,text,text,uuid,text)',
       'EXECUTE') then raise exception 'client role crossed the publication write/evidence boundary'; end if;
end;
$$;
