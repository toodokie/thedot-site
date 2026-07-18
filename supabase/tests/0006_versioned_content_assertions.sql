select public.assert_portal_slice1_security();

do $$
declare
  v_item public.content_items%rowtype;
  v_snapshot public.content_item_versions%rowtype;
  v_comment_version int;
  v_count int;
begin
  if public.portal_copy_blocks_valid('[]'::jsonb)
     or public.portal_copy_blocks_valid('[{"key":"caption","label":"Caption","body":""}]'::jsonb) then
    raise exception 'empty copy-block structures passed validation';
  end if;

  select * into strict v_item from public.content_items where content_id = 'upgrade-fixture';
  if not v_item.client_visible
     or v_item.working_version <> 3
     or v_item.client_visible_version <> 3
     or v_item.review_ready_at is null
     or v_item.planned_date <> date '2026-07-18' then
    raise exception 'content_items backfill is incorrect: %', row_to_json(v_item);
  end if;

  select * into strict v_snapshot
  from public.content_item_versions
  where content_item_id = v_item.id and version = 3;
  if v_snapshot.title <> 'Released fixture'
     or v_snapshot.copy_blocks->0->>'key' <> 'caption'
     or v_snapshot.source_path <> '/private/fixture.md'
     or length(v_snapshot.content_checksum) <> 64 then
    raise exception 'version snapshot backfill is incorrect: %', row_to_json(v_snapshot);
  end if;

  select content_version into strict v_comment_version
  from public.comments where content_id = v_item.id;
  if v_comment_version <> 3 then
    raise exception 'comment version backfill is incorrect: %', v_comment_version;
  end if;

  if has_column_privilege('authenticated', 'public.content_items', 'client_body', 'select')
     or has_column_privilege('authenticated', 'public.content_items', 'title', 'select')
     or has_column_privilege('authenticated', 'public.content_item_versions', 'source_path', 'select')
     or has_column_privilege('authenticated', 'public.content_item_versions', 'content_checksum', 'select') then
    raise exception 'authenticated retains an internal/authored legacy column grant';
  end if;

  if has_table_privilege('authenticated', 'public.content_item_versions', 'insert')
     or has_table_privilege('service_role', 'public.content_item_versions', 'update')
     or has_table_privilege('service_role', 'public.content_item_versions', 'delete') then
    raise exception 'immutable snapshot write grants are too broad';
  end if;

  select count(*) into v_count from public.recommendations where title = 'Existing recommendation';
  if v_count <> 1 then raise exception '0004 recommendation was not preserved'; end if;
  select count(*) into v_count from public.links where label = 'Posting folder' and category = 'posting';
  if v_count <> 1 then raise exception '0004/0005 link was not preserved'; end if;
  select count(*) into v_count from public.report_snapshots where period = '2026-07-H1';
  if v_count <> 1 then raise exception '0004 report was not preserved'; end if;
  select count(*) into v_count from public.content_ideas where title = 'Existing idea';
  if v_count <> 1 then raise exception '0004 idea was not preserved'; end if;
  select count(*) into v_count from public.portal_seen
  where auth_user_id = '00000000-0000-0000-0000-000000000101';
  if v_count <> 1 then raise exception '0005 portal_seen row was not preserved'; end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000101';

do $$
declare
  v_count int;
  v_title text;
begin
  select count(*), min(title) into v_count, v_title from public.content_with_state;
  if v_count <> 1 or v_title <> 'Released fixture' then
    raise exception 'released view/RLS result is wrong: count %, title %', v_count, v_title;
  end if;

  select count(*) into v_count from public.content_item_versions;
  if v_count <> 1 then
    raise exception 'released snapshot RLS result is wrong: %', v_count;
  end if;
end;
$$;

reset role;

-- Service-role writer boundary + immutable sync/release workflow.
set role service_role;

select public.sync_content_item_versions(pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'client_id', (select id from public.clients where slug = 'kanset'),
    'content_id', 'workflow-fixture',
    'version', 1,
    'title', 'Workflow v1',
    'format', 'reel',
    'pillar', 'test',
    'platforms', pg_catalog.jsonb_build_array('instagram'),
    'planned_date', '2026-07-20',
    'fact_check', 'confirmed',
    'fact_check_ledger', '[]'::jsonb,
    'client_body', 'Released body v1',
    'copy_blocks', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'key', 'caption', 'label', 'Caption', 'body', 'Released body v1'
    )),
    'source_path', 'fixture:workflow-v1.md'
  )
));

do $$
begin
  begin
    update public.content_items set status = 'posted' where content_id = 'workflow-fixture';
    raise exception 'direct service-role content_items update unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select public.mark_content_ready(
  (select id from public.content_items where content_id = 'workflow-fixture'), 1
);

do $$
declare
  v_payload jsonb := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'client_id', (select id from public.clients where slug = 'kanset'),
    'content_id', 'workflow-fixture',
    'version', 2,
    'title', 'Hidden workflow v2',
    'format', 'reel',
    'pillar', 'test',
    'platforms', pg_catalog.jsonb_build_array('instagram'),
    'planned_date', '2026-07-20',
    'fact_check', 'confirmed',
    'fact_check_ledger', '[]'::jsonb,
    'client_body', 'Secret working body v2',
    'copy_blocks', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'key', 'caption', 'label', 'Caption', 'body', 'Secret working body v2'
    )),
    'source_path', 'fixture:workflow-v2.md'
  ));
begin
  begin
    perform public.sync_content_item_versions(v_payload);
    raise exception 'active review was silently revised by sync';
  exception when others then
    if sqlerrm not like 'begin a guarded revision before syncing%' then raise; end if;
  end;
end;
$$;

select public.begin_content_revision(
  (select id from public.content_items where content_id = 'workflow-fixture'), 1
);

select public.sync_content_item_versions(pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'client_id', (select id from public.clients where slug = 'kanset'),
    'content_id', 'workflow-fixture',
    'version', 2,
    'title', 'Hidden workflow v2',
    'format', 'reel',
    'pillar', 'test',
    'platforms', pg_catalog.jsonb_build_array('instagram'),
    'planned_date', '2026-07-20',
    'fact_check', 'confirmed',
    'fact_check_ledger', '[]'::jsonb,
    'client_body', 'Secret working body v2',
    'copy_blocks', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'key', 'caption', 'label', 'Caption', 'body', 'Secret working body v2'
    )),
    'source_path', 'fixture:workflow-v2.md'
  )
));

-- Exact retry remains a no-op even after the new working snapshot has advanced.
select public.begin_content_revision(
  (select id from public.content_items where content_id = 'workflow-fixture'), 1
);

do $$
declare
  v_payload jsonb := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'client_id', (select id from public.clients where slug = 'kanset'),
    'content_id', 'workflow-fixture',
    'version', 4,
    'title', 'Skipped v4',
    'platforms', pg_catalog.jsonb_build_array('instagram'),
    'fact_check', 'confirmed',
    'fact_check_ledger', '[]'::jsonb,
    'client_body', 'Skipped body',
    'copy_blocks', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'key', 'caption', 'label', 'Caption', 'body', 'Skipped body'
    )),
    'source_path', 'fixture:workflow-v4.md'
  ));
begin
  begin
    perform public.sync_content_item_versions(v_payload);
    raise exception 'skipped content version unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'stale or skipped snapshot conflict%' then raise; end if;
  end;
end;
$$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000101';

do $$
declare
  v_row record;
begin
  select title, version, client_state into strict v_row
  from public.content_with_state where content_id = 'workflow-fixture';
  if v_row.title <> 'Workflow v1'
     or v_row.version <> 1
     or v_row.client_state <> 'with_dot' then
    raise exception 'unreleased v2 escaped through the view: %', row_to_json(v_row);
  end if;
end;
$$;

reset role;
set role service_role;
select public.mark_content_ready(
  (select id from public.content_items where content_id = 'workflow-fixture'), 2
);
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000101';

do $$
declare
  v_item_id uuid;
  v_before bigint;
  v_after bigint;
begin
  select id into strict v_item_id
  from public.content_with_state
  where content_id = 'workflow-fixture' and title = 'Hidden workflow v2' and version = 2;

  select count(*) into v_before
  from public.activity_log
  where content_id = v_item_id and event_type = 'approved';

  perform public.record_content_decision(v_item_id, 2, 'approved', null);
  perform public.record_content_decision(v_item_id, 2, 'approved', null);

  select count(*) into v_after
  from public.activity_log
  where content_id = v_item_id and event_type = 'approved';
  if v_after - v_before <> 1 then
    raise exception 'exact decision retry emitted % approval events', v_after - v_before;
  end if;
end;
$$;

reset role;
