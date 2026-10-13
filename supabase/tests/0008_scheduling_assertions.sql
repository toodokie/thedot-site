select public.assert_portal_security();

do $$
declare
  v_summer timestamptz;
  v_fall_edt timestamptz;
  v_fall_est timestamptz;
begin
  v_summer := public.portal_resolve_schedule_time(
    timestamp '2027-07-20 10:00:00', 'America/Toronto', -240
  );
  if v_summer <> timestamptz '2027-07-20 14:00:00+00' then
    raise exception 'summer Toronto conversion is wrong: %', v_summer;
  end if;

  v_fall_edt := public.portal_resolve_schedule_time(
    timestamp '2027-11-07 01:30:00', 'America/Toronto', -240
  );
  v_fall_est := public.portal_resolve_schedule_time(
    timestamp '2027-11-07 01:30:00', 'America/Toronto', -300
  );
  if v_fall_edt <> timestamptz '2027-11-07 05:30:00+00'
     or v_fall_est <> timestamptz '2027-11-07 06:30:00+00'
     or v_fall_est - v_fall_edt <> interval '1 hour' then
    raise exception 'fall-back disambiguation is wrong: EDT %, EST %', v_fall_edt, v_fall_est;
  end if;

  begin
    perform public.portal_resolve_schedule_time(
      timestamp '2027-03-14 02:30:00', 'America/Toronto', -240
    );
    raise exception 'spring-forward gap unexpectedly passed';
  exception when others then
    if sqlerrm = 'spring-forward gap unexpectedly passed' then raise; end if;
  end;

  begin
    perform public.portal_resolve_schedule_time(
      timestamp '2027-07-20 10:00:00', 'America/Toronto', -300
    );
    raise exception 'incorrect summer offset unexpectedly passed';
  exception when others then
    if sqlerrm = 'incorrect summer offset unexpectedly passed' then raise; end if;
  end;

  begin
    perform public.portal_resolve_schedule_time(
      timestamp '2027-07-20 10:00:00', 'America/Vancouver', -240
    );
    raise exception 'unsupported timezone unexpectedly passed';
  exception when others then
    if sqlerrm = 'unsupported timezone unexpectedly passed' then raise; end if;
  end;
end;
$$;

do $$
begin
  if pg_catalog.has_table_privilege(
       'authenticated', 'public.content_schedule_targets', 'INSERT,UPDATE,DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', 'public.content_schedule_requests', 'INSERT,UPDATE,DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', 'public.content_schedule_request_attempts', 'INSERT,UPDATE,DELETE'
     ) then
    raise exception 'authenticated has a direct scheduling write privilege';
  end if;

  if pg_catalog.has_function_privilege(
       'anon', 'public.request_content_reschedule(uuid,integer,timestamp without time zone,text,integer,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', 'public.set_content_plan(uuid,integer,date,text)', 'EXECUTE'
     ) then
    raise exception 'anon can execute a scheduling writer';
  end if;
end;
$$;

-- Exercise the future confirmed-target path directly as the database owner. Slice 3 deliberately
-- has no confirmation writer, but a later Slice 4 confirmation must not discover that change
-- requests cannot safely preserve and cancel an existing provider commitment.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000801', 'schedule-probe@example.com');

insert into public.client_users (client_id, auth_user_id, email, name)
select id, '00000000-0000-0000-0000-000000000801',
  'schedule-probe@example.com', 'Schedule Probe'
from public.clients where slug = 'kanset';

-- When replayed against the later access-control slice, explicitly enable this synthetic actor.
-- Dynamic SQL keeps the historical 0008-only replay valid before those objects exist.
do $$ declare v_client uuid:=(select id from public.clients where slug='kanset'); begin
  if pg_catalog.to_regprocedure('public.set_portal_feature_switch(uuid,text,boolean,text,text,text)') is not null then
    execute 'update public.client_users set can_decide=true,can_manage_schedule=true where client_id=$1 and auth_user_id=$2'
      using v_client,'00000000-0000-0000-0000-000000000801'::uuid;
    execute 'select public.set_portal_feature_switch(null,$1,true,$2,$3,$4)'
      using 'client_portal_launch','Synthetic scheduling assertion','thedot-admin','test-0008-global-launch';
    execute 'select public.set_portal_feature_switch($1,$2,true,$3,$4,$5)'
      using v_client,'client_portal_launch','Synthetic scheduling assertion','thedot-admin','test-0008-tenant-launch';
    execute 'select public.set_portal_feature_switch(null,$1,true,$2,$3,$4)'
      using 'client_mutations','Synthetic scheduling assertion','thedot-admin','test-0008-global-mutations';
    execute 'select public.set_portal_feature_switch($1,$2,true,$3,$4,$5)'
      using v_client,'client_mutations','Synthetic scheduling assertion','thedot-admin','test-0008-tenant-mutations';
  end if;
end $$;

set role service_role;

select public.sync_content_item_versions(pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'client_id', (select id from public.clients where slug = 'kanset'),
    'content_id', 'slice3-cancel-probe',
    'version', 1,
    'title', 'Scheduled cancellation probe',
    'format', 'test',
    'pillar', 'test',
    'platforms', pg_catalog.jsonb_build_array('instagram'),
    'planned_date', '2027-07-20',
    'fact_check', 'confirmed',
    'fact_check_scope', 'not_applicable',
    'fact_check_exemption', 'Synthetic scheduling workflow probe without a factual claim.',
    'fact_check_ledger', '[]'::jsonb,
    'client_body', 'Synthetic client-safe scheduling probe.',
    'copy_blocks', '[{"key":"caption","label":"Caption","body":"Synthetic client-safe scheduling probe."}]'::jsonb,
    'source_path', 'fixture:slice3-cancel-probe.md'
  )
));

select public.mark_content_ready(
  (select id from public.content_items where content_id = 'slice3-cancel-probe'), 1
);

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000801';

select public.record_content_decision(
  (select id from public.content_items where content_id = 'slice3-cancel-probe'),
  1, 'approved', null
);

reset role;

update public.content_schedule_targets
set status = 'scheduled', scheduled_at = timestamptz '2027-07-20 14:00:00+00',
    verified_at = pg_catalog.now(), source_type = 'manual', updated_at = pg_catalog.now()
where content_id = (select id from public.content_items where content_id = 'slice3-cancel-probe');
update public.content_items set status = 'scheduled'
where content_id = 'slice3-cancel-probe';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000801';

select public.record_content_decision(
  (select id from public.content_items where content_id = 'slice3-cancel-probe'),
  1, 'change_requested', 'Please revise the synthetic caption.'
);
select public.record_content_decision(
  (select id from public.content_items where content_id = 'slice3-cancel-probe'),
  1, 'change_requested', 'Please revise the synthetic caption.'
);

reset role;

do $$
declare
  v_item_id uuid := (select id from public.content_items where content_id = 'slice3-cancel-probe');
begin
  if (select pg_catalog.count(*) from public.content_schedule_requests
      where content_id = v_item_id and request_kind = 'cancel' and status = 'pending') <> 1
     or (select pg_catalog.count(*) from public.content_schedule_request_attempts a
         join public.content_schedule_requests r on r.id = a.request_id and r.client_id = a.client_id
         where r.content_id = v_item_id and a.status = 'pending') <> 1 then
    raise exception 'scheduled change request did not create one cancellation request/attempt';
  end if;
  if not exists (
    select 1 from public.content_schedule_targets t
    where t.content_id = v_item_id and t.status = 'cancel_pending'
      and t.scheduled_at = timestamptz '2027-07-20 14:00:00+00'
      and t.verified_at is not null and t.source_type = 'manual'
  ) then raise exception 'cancellation did not preserve the verified provider commitment'; end if;
  if public.portal_content_schedule_state(v_item_id, 1) <> 'cancel_pending'
     or (select client_state from public.content_with_state where id = v_item_id) <> 'cancel_pending'
     or not (select revision_in_progress from public.content_items where id = v_item_id)
     or (select review_ready_at from public.content_items where id = v_item_id) is not null then
    raise exception 'scheduled change request derived the wrong workflow state';
  end if;
  if (select pg_catalog.count(*) from public.activity_log
      where content_id = v_item_id and event_type = 'unschedule_requested') <> 1
     or (select pg_catalog.count(*) from public.activity_log
         where content_id = v_item_id and event_type = 'change_requested') <> 1 then
    raise exception 'scheduled change retry duplicated activity';
  end if;
end;
$$;
