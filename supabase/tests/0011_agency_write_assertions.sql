begin;

do $$
declare
  v_client uuid; v_other uuid:=gen_random_uuid(); v_contact uuid:=gen_random_uuid();
  v_rec uuid; v_rec_retry uuid; v_report uuid; v_comm uuid; v_item uuid; v_approval uuid;
  v_count bigint; v_failed boolean; v_rows jsonb; v_checksum text;
begin
  select id into v_client from public.clients where slug='kanset';
  insert into public.clients(id,name,slug) values(v_other,'Slice 6 Other','slice6-other');
  insert into auth.users(id,email) values(v_contact,'slice6-contact@example.com');
  insert into public.client_users(client_id,auth_user_id,email,name)
    values(v_client,v_contact,'slice6-contact@example.com','Maria Test');

  if pg_catalog.to_regprocedure('public.set_portal_feature_switch(uuid,text,boolean,text,text,text)') is not null then
    execute 'update public.client_users set can_decide=true where client_id=$1 and auth_user_id=$2'
      using v_client,v_contact;
    execute 'select public.set_portal_feature_switch(null,$1,true,$2,$3,$4)'
      using 'client_portal_launch','Synthetic agency assertion','thedot-admin','test-0011-global-launch';
    execute 'select public.set_portal_feature_switch($1,$2,true,$3,$4,$5)'
      using v_client,'client_portal_launch','Synthetic agency assertion','thedot-admin','test-0011-tenant-launch';
    execute 'select public.set_portal_feature_switch(null,$1,true,$2,$3,$4)'
      using 'client_mutations','Synthetic agency assertion','thedot-admin','test-0011-global-mutations';
    execute 'select public.set_portal_feature_switch($1,$2,true,$3,$4,$5)'
      using v_client,'client_mutations','Synthetic agency assertion','thedot-admin','test-0011-tenant-mutations';
  end if;

  set local role service_role;
  v_rec:=public.upsert_portal_recommendation(v_client,'test:rec','Safe title','Safe body',
    'content','instagram','strategy_review','private:test',
    '{"reviewed":true}'::jsonb,'active','thedot-admin','slice6-rec-1');
  v_rec_retry:=public.upsert_portal_recommendation(v_client,'test:rec','Safe title','Safe body',
    'content','instagram','strategy_review','private:test',
    '{"reviewed":true}'::jsonb,'active','thedot-admin','slice6-rec-1');
  reset role;
  if v_rec<>v_rec_retry then raise exception 'recommendation retry changed identity'; end if;
  select count(*) into v_count from public.activity_log where event_key='agency:recommendation:slice6-rec-1';
  if v_count<>1 then raise exception 'recommendation retry duplicated activity'; end if;
  select count(*) into v_count from public.portal_inbox_events where event_key='agency:recommendation:slice6-rec-1';
  if v_count<>1 then raise exception 'recommendation retry duplicated inbox'; end if;
  select count(*) into v_count from public.projection_outbox where event_key='agency:recommendation:slice6-rec-1';
  if v_count<>1 then raise exception 'recommendation retry duplicated projection'; end if;

  v_failed:=false;
  begin
    set local role service_role;
    perform public.upsert_portal_recommendation(v_client,'test:rec','Changed','Safe body',
      'content','instagram','strategy_review','private:test','{}','active','thedot-admin','slice6-rec-1');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'idempotency-key request mismatch was accepted'; end if;

  v_checksum:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to('{"reach":12}'::jsonb::text,'UTF8'),'sha256'),'hex');
  set local role service_role;
  v_report:=public.upsert_portal_report_snapshot(v_client,'2026-07-01','2026-07-15','instagram',1,
    '{"reach":12,"engagement":{"value":3,"prev":2}}','Safe report','2026-07-16 12:00+00',
    'platform_ui','private:report',v_checksum,'thedot-admin','slice6-report-1');
  v_comm:=public.log_portal_communication(v_client,'meeting:2026-07-18','meeting','2026-07-18 15:00+00',
    'Weekly check-in','Maria approved the next content direction.','Maria','private:meeting-note',
    'thedot-admin','slice6-comm-1');
  reset role;
  if v_report is null or v_comm is null then raise exception 'agency surface RPC returned null'; end if;

  v_failed:=false;
  begin
    set local role service_role;
    perform public.log_portal_communication(v_client,'email:unsafe','email',pg_catalog.now(),
      'Subject: private thread','From: maria@example.com','Maria','private:mail',
      'thedot-admin','slice6-unsafe');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'raw email/PII communication was accepted'; end if;
  v_failed:=false;
  begin
    set local role service_role;
    perform public.upsert_portal_link(v_client,'unsafe:link','brand','Unsafe','https://evil.example/file',
      null,0,'agency_curated','private:test','thedot-admin','slice6-unsafe-link');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'unreviewed client-visible link host was accepted'; end if;

  -- Effective decision actor is the known membership. The external source never impersonates a
  -- portal click and an exact retry creates no second activity/inbox/projection row.
  set local role service_role;
  select (r->>'item_id')::uuid into v_item from pg_catalog.jsonb_array_elements(
    public.sync_content_item_versions(pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'client_id',v_client,'content_id','slice6-decision','version',1,'title','Decision fixture',
      'format','test','pillar','test','platforms',pg_catalog.jsonb_build_array('instagram'),
      'planned_date',null,'canva_url',null,'drive_url',null,'fact_check','confirmed',
      'fact_check_scope','not_applicable','fact_check_exemption','No factual claim in this test fixture.',
      'fact_check_ledger','[]'::jsonb,'client_body','Safe decision fixture',
      'copy_blocks',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'key','caption','label','Caption','body','Safe decision fixture')),
      'source_path','local:slice6-decision.md'
    )))) r;
  perform public.mark_content_ready(v_item,1);
  v_approval:=public.record_external_decision(v_client,v_item,1,v_contact,'approved',null,'email',
    '2026-07-18 16:00+00','thedot-admin','slice6-external-1');
  perform public.record_external_decision(v_client,v_item,1,v_contact,'approved',null,'email',
    '2026-07-18 16:00+00','thedot-admin','slice6-external-1');
  reset role;
  select count(*) into v_count from public.approvals where id=v_approval and decided_by is null
      and decision_source='email' and decision_actor_key='auth:'||v_contact::text
      and recorded_by is not null;
  if v_count<>1 then raise exception 'external decision provenance is wrong'; end if;
  select count(*) into v_count from public.activity_log where client_id=v_client and content_id=v_item
    and content_version=1 and event_type='approved';
  if v_count<>1 then raise exception 'external decision retry duplicated activity'; end if;
  v_failed:=false;
  begin
    set local role service_role;
    perform public.record_external_decision(v_other,v_item,1,v_contact,'approved',null,'email',
      '2026-07-18 16:00+00','thedot-admin','slice6-cross-tenant');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'cross-tenant external decision was accepted'; end if;

  -- Per-tenant consumer cursor: acknowledging one tenant cannot skip another tenant's lower/global seq.
  insert into public.portal_inbox_events(client_id,event_key,event_type,object_type,actor_type,actor_name)
    values(v_other,'slice6-other-event','meeting_email_note_added','link','system','System');
  set local role service_role;
  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)) into v_rows
    from public.read_portal_inbox('slice6-test',v_other,100) x;
  reset role;
  if v_rows is null or v_rows::text not like '%slice6-other-event%' then
    raise exception 'tenant inbox cursor lost other tenant event';
  end if;
end;
$$;

select public.assert_portal_security();
rollback;
