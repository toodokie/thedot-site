begin;

do $$
declare
  v_client uuid:=gen_random_uuid();
  v_primary uuid:=gen_random_uuid();
  v_viewer uuid:=gen_random_uuid();
  v_third uuid:=gen_random_uuid();
  v_credential uuid:=gen_random_uuid();
  v_integration uuid:=gen_random_uuid();
  v_count bigint;
  v_failed boolean;
  v_idea uuid;
begin
  insert into public.clients(id,name,slug) values(v_client,'Access Control Test','access-control-test');
  insert into auth.users(id,email) values
    (v_primary,'primary@example.com'),(v_viewer,'viewer@example.com'),(v_third,'third@example.com');

  set local role service_role;
  perform public.upsert_portal_membership(v_client,v_primary,'primary@example.com','Primary',
    true,true,true,true,false,'thedot-admin','access-member-primary');
  perform public.upsert_portal_membership(v_client,v_viewer,'viewer@example.com','Viewer',
    false,false,false,false,false,'thedot-admin','access-member-viewer');
  reset role;

  -- The partial index is the invariant, not an application pre-check.
  v_failed:=false;
  begin
    set local role service_role;
    perform public.upsert_portal_membership(v_client,v_third,'third@example.com','Third',
      true,false,false,false,false,'thedot-admin','access-member-second-decider');
  exception when unique_violation then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'a second primary decider was accepted'; end if;

  -- Membership and capability do not bypass the default-off launch/mutation controls.
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub',v_primary,'role','authenticated')::text,true);
  perform pg_catalog.set_config('request.jwt.claim.sub',v_primary::text,true);
  set local role authenticated;
  select pg_catalog.count(*) into v_count from public.portal_client_session('access-control-test');
  if v_count<>0 then raise exception 'disabled tenant launch returned a session'; end if;
  v_failed:=false;
  begin
    perform public.add_idea(v_client,'Blocked idea',null);
  exception when insufficient_privilege then v_failed:=true; end;
  if not v_failed then raise exception 'disabled client mutation was accepted'; end if;
  reset role;
  select pg_catalog.count(*) into v_count from public.content_ideas where client_id=v_client;
  if v_count<>0 then raise exception 'disabled mutation wrote before rejection'; end if;

  set local role service_role;
  perform public.set_portal_feature_switch(null,'client_portal_launch',true,'Test global launch',
    'thedot-admin','access-global-launch');
  perform public.set_portal_feature_switch(v_client,'client_portal_launch',true,'Test tenant launch',
    'thedot-admin','access-tenant-launch');
  perform public.set_portal_feature_switch(null,'client_mutations',true,'Test global mutations',
    'thedot-admin','access-global-mutations');
  perform public.set_portal_feature_switch(v_client,'client_mutations',true,'Test tenant mutations',
    'thedot-admin','access-tenant-mutations');
  reset role;

  set local role authenticated;
  select pg_catalog.count(*) into v_count from public.portal_client_session('access-control-test');
  if v_count<>1 then raise exception 'enabled primary session did not resolve'; end if;
  v_idea:=public.add_idea(v_client,'Allowed idea',null);
  reset role;
  if v_idea is null then raise exception 'capable member could not submit an idea'; end if;

  -- A same-tenant viewer retains reads but direct writer RPCs remain denied.
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub',v_viewer,'role','authenticated')::text,true);
  perform pg_catalog.set_config('request.jwt.claim.sub',v_viewer::text,true);
  set local role authenticated;
  select pg_catalog.count(*) into v_count from public.content_ideas where client_id=v_client;
  if v_count<>1 then raise exception 'least-privilege member lost tenant read access'; end if;
  v_failed:=false;
  begin
    perform public.edit_idea(v_idea,'Forbidden edit',null);
  exception when insufficient_privilege then v_failed:=true; end;
  if not v_failed then raise exception 'capability-less member edited an idea'; end if;
  reset role;

  -- Transfer is the only atomic move between two existing memberships.
  set local role service_role;
  perform public.transfer_portal_primary_decider(v_client,v_primary,v_viewer,
    'Primary contact changed','thedot-admin','access-transfer-primary');
  reset role;
  select pg_catalog.count(*) into v_count from public.client_users
    where client_id=v_client and can_decide;
  if v_count<>1 or not exists(select 1 from public.client_users where client_id=v_client
      and auth_user_id=v_viewer and can_decide) then
    raise exception 'primary-decider transfer did not preserve the invariant'; end if;

  -- Offboarding removes only this tenant membership; the Auth user remains for other tenants.
  set local role service_role;
  perform public.offboard_portal_membership(v_client,v_primary,'Access no longer required',
    'thedot-admin','access-offboard-primary');
  reset role;
  if exists(select 1 from public.client_users where client_id=v_client and auth_user_id=v_primary)
     or not exists(select 1 from auth.users where id=v_primary) then
    raise exception 'offboarding deleted the wrong identity boundary'; end if;

  -- Exact retries are one audited command; changed reuse fails.
  set local role service_role;
  perform public.set_portal_feature_switch(v_client,'client_mutations',false,'Emergency stop',
    'thedot-admin','access-stop-mutations');
  perform public.set_portal_feature_switch(v_client,'client_mutations',false,'Emergency stop',
    'thedot-admin','access-stop-mutations');
  v_failed:=false;
  begin
    perform public.set_portal_feature_switch(v_client,'client_mutations',true,'Different request',
      'thedot-admin','access-stop-mutations');
  exception when others then v_failed:=true; end;
  reset role;
  if not v_failed then raise exception 'switch idempotency mismatch was accepted'; end if;
  select pg_catalog.count(*) into v_count from public.portal_access_commands
    where client_id=v_client and idempotency_key='access-stop-mutations';
  if v_count<>1 then raise exception 'switch retry duplicated its audit command'; end if;

  -- Worker disable prevents claiming new work and preserves the queued record for recovery.
  insert into public.calendar_credentials(id,client_id,ciphertext,iv,auth_tag)
    values(v_credential,v_client,repeat('x',40),repeat('a',16),repeat('b',16));
  insert into public.calendar_integrations(id,client_id,credential_id,calendar_id,display_name,
    owner_email,access_role) values(v_integration,v_client,v_credential,
    'access-control@example.com','Access control calendar','owner@example.com','owner');
  insert into public.calendar_sync_jobs(integration_id,client_id,job_type,dedupe_key)
    values(v_integration,v_client,'acl_check','access-control-cron-job');
  set local role service_role;
  select pg_catalog.count(*) into v_count from public.claim_calendar_sync_jobs(10,300);
  if v_count<>0 or not exists(select 1 from public.calendar_sync_jobs
      where integration_id=v_integration and status='pending') then
    raise exception 'disabled cron drain claimed or altered queued work'; end if;
  perform public.set_portal_feature_switch(null,'cron_drain',true,'Test global cron drain',
    'thedot-admin','access-global-cron');
  perform public.set_portal_feature_switch(v_client,'cron_drain',true,'Test tenant cron drain',
    'thedot-admin','access-tenant-cron');
  select pg_catalog.count(*) into v_count from public.claim_calendar_sync_jobs(10,300);
  reset role;
  if v_count<>1 or not exists(select 1 from public.calendar_sync_jobs
      where integration_id=v_integration and status='processing') then
    raise exception 'enabled cron drain did not claim exactly one job'; end if;
end;
$$;

select public.assert_portal_security();
rollback;
