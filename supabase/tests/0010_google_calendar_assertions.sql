select public.assert_portal_security();

do $$
begin
  if pg_catalog.has_table_privilege('authenticated','public.calendar_integrations','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.calendar_sync_jobs','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.calendar_sync_conflicts','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_function_privilege('authenticated',
       'public.accept_calendar_webhook(text,text,text,bigint,text)','EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.accept_calendar_webhook(text,text,text,bigint,text)','EXECUTE') then
    raise exception 'calendar service boundary is exposed';
  end if;
end;
$$;

set role service_role;
insert into public.calendar_credentials(id,client_id,ciphertext,iv,auth_tag)
select '10000000-0000-4000-8000-000000000010',id,repeat('x',40),repeat('a',16),repeat('b',16)
from public.clients where slug='kanset';
insert into public.calendar_integrations(id,client_id,credential_id,calendar_id,display_name,owner_email,access_role)
select '10000000-0000-4000-8000-000000000011',id,
  '10000000-0000-4000-8000-000000000010','kanset-social@example.com','Kanset Social',
  'durable-owner@example.com','owner' from public.clients where slug='kanset';
insert into public.calendar_sync_state(integration_id,client_id)
select '10000000-0000-4000-8000-000000000011',id from public.clients where slug='kanset';
insert into public.calendar_watch_channels(integration_id,client_id,channel_id,resource_id,token_hash,expires_at)
select '10000000-0000-4000-8000-000000000011',id,'portal-assertion-channel-0001','resource-assertion-0001',
  pg_catalog.encode(extensions.digest(pg_catalog.convert_to('assertion-secret','UTF8'),'sha256'),'hex'),
  pg_catalog.now()+interval '1 day' from public.clients where slug='kanset';

select public.confirm_calendar_projection(
  '10000000-0000-4000-8000-000000000011',
  (select id from public.content_items where content_id='slice4-publication-probe'),1,null,
  'editorial_plan',
  'portal:10000000-0000-4000-8000-000000000011:'||
    (select id::text from public.content_items where content_id='slice4-publication-probe')||':editorial',
  'google-event-assertion-1','"etag-1"',pg_catalog.now(),
  'https://www.google.com/calendar/event?eid=synthetic','2026-07-20',null,null,
  (select projection_revision from public.content_items where content_id='slice4-publication-probe')
);

do $$
declare v_jobs bigint; v_receipts bigint; v_claimed bigint;
begin
  if public.accept_calendar_webhook('portal-assertion-channel-0001','resource-assertion-0001',
      'wrong-secret',1,'exists') then raise exception 'wrong webhook token was accepted'; end if;
  if not public.accept_calendar_webhook('portal-assertion-channel-0001','resource-assertion-0001',
      'assertion-secret',1,'exists')
     or not public.accept_calendar_webhook('portal-assertion-channel-0001','resource-assertion-0001',
      'assertion-secret',1,'exists') then raise exception 'valid webhook was rejected'; end if;
  select pg_catalog.count(*) into v_jobs from public.calendar_sync_jobs
    where dedupe_key='webhook:portal-assertion-channel-0001:1';
  select pg_catalog.count(*) into v_receipts from public.calendar_webhook_receipts
    where channel_id='portal-assertion-channel-0001' and message_number=1;
  if v_jobs<>1 or v_receipts<>1 then raise exception 'webhook retry was not idempotent'; end if;
  insert into public.calendar_sync_jobs(integration_id,client_id,job_type,dedupe_key)
  select id,client_id,'acl_check','assertion-second-job' from public.calendar_integrations
    where id='10000000-0000-4000-8000-000000000011';
  select pg_catalog.count(*) into v_claimed from public.claim_calendar_sync_jobs(10,300);
  if v_claimed<>1 or (select pg_catalog.count(*) from public.calendar_sync_jobs
      where integration_id='10000000-0000-4000-8000-000000000011' and status='processing')<>1 then
    raise exception 'more than one job was claimed for one integration'; end if;
end;
$$;

select public.record_calendar_unmapped_event(
  '10000000-0000-4000-8000-000000000011','reviewed-existing-event','"unmapped-etag"',
  pg_catalog.now(),'Reviewed synthetic existing event','2026-07-22',null,null,'missing_private_key'
);
select public.link_calendar_unmapped_event(
  (select id from public.calendar_unmapped_events where event_id='reviewed-existing-event'),
  (select id from public.content_items where content_id='slice4-import-probe'),1,
  'Agency reviewed the exact existing event and content pair.','reviewed-link-assertion-0001'
);
do $$ begin
  if (select status from public.calendar_unmapped_events where event_id='reviewed-existing-event')<>'resolved'
     or (select sync_status from public.calendar_event_mappings where event_id='reviewed-existing-event')<>'pending'
     or (select pg_catalog.count(*) from public.calendar_sync_jobs where dedupe_key='link:reviewed-link-assertion-0001')<>1
    then raise exception 'reviewed existing-event adoption was not durable'; end if;
end $$;

-- A concurrent portal revision must make the inbound date a conflict, not overwrite portal truth.
reset role;
update public.content_items set projection_revision=projection_revision+1
  where content_id='slice4-publication-probe';
set role service_role;
do $$
declare v_before date; v_result text;
begin
  select planned_date into v_before from public.content_items where content_id='slice4-publication-probe';
  v_result:=public.apply_calendar_editorial_event('10000000-0000-4000-8000-000000000011',
    'google-event-assertion-1','"etag-2"',pg_catalog.now(),'2026-08-01',false);
  if v_result<>'conflicted'
     or (select planned_date from public.content_items where content_id='slice4-publication-probe') is distinct from v_before
     or (select sync_status from public.calendar_event_mappings where event_id='google-event-assertion-1')<>'conflicted'
     or (select pg_catalog.count(*) from public.calendar_sync_conflicts where status='open')<>1 then
    raise exception 'simultaneous edit did not fail closed';
  end if;
end;
$$;
reset role;

-- Tenant A can read only the safe view/mapping columns; a foreign authenticated user sees no row.
insert into public.clients(id,name,slug) values('20000000-0000-4000-8000-000000000001','Other tenant','calendar-other');
insert into auth.users(id,email) values('20000000-0000-4000-8000-000000000002','other-calendar@example.com');
insert into public.client_users(client_id,auth_user_id,email,name)
values('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  'other-calendar@example.com','Other Calendar User');
set role authenticated;
set request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.calendar_events_client)
     or exists(select 1 from public.calendar_event_mappings) then
    raise exception 'cross-tenant calendar mapping leak';
  end if;
end $$;
reset role;
