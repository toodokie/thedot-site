select public.assert_portal_security();

do $$
declare
  v_required jsonb := '[{
    "claim_key":"oinp-rule",
    "claim":"Ontario publishes program eligibility requirements.",
    "status":"confirmed",
    "source_url":"https://www.ontario.ca/page/example",
    "source_title":"Ontario program page",
    "checked_at":"2026-07-18",
    "checked_by_role":"agency_fact_checker"
  }]'::jsonb;
  v_extra jsonb;
begin
  if not public.portal_fact_check_ledger_shape_valid(v_required, 'required', null)
     or not public.portal_fact_check_ledger_release_valid(v_required, 'required', null) then
    raise exception 'valid required ledger failed';
  end if;
  if not public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(v_required, '{0,source_url}', '"https://subdomain.canada.ca/example"'),
    'required', null
  ) then raise exception 'allowed subdomain failed'; end if;
  if not public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(v_required, '{0,source_url}', '"https://ircc.canada.ca/example"'),
    'required', null
  ) then raise exception 'IRCC subdomain through canada.ca failed'; end if;
  if public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(v_required, '{0,source_url}', '"https://gc.ca/example"'),
    'required', null
  ) then raise exception 'over-broad gc.ca source host passed'; end if;
  if public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(v_required, '{0,source_url}', '"https://evilcanada.ca/example"'),
    'required', null
  ) then raise exception 'lookalike source host passed'; end if;
  if public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(v_required, '{0,source_url}', '"https://example.com/source"'),
    'required', null
  ) then raise exception 'unlisted source host passed'; end if;
  if public.portal_fact_check_ledger_release_valid(
    pg_catalog.jsonb_set(v_required, '{0,checked_at}', pg_catalog.to_jsonb((current_date + 1)::text)),
    'required', null
  ) then raise exception 'future fact-check date passed'; end if;

  v_extra := v_required || '[{"internal_reasoning":"private"}]'::jsonb;
  if public.portal_fact_check_ledger_shape_valid(v_extra, 'required', null) then
    raise exception 'malformed extra ledger object passed';
  end if;
  if public.portal_fact_check_ledger_shape_valid(
    pg_catalog.jsonb_set(v_required, '{0,internal_reasoning}', '"private"'),
    'required', null
  ) then raise exception 'unknown ledger key passed'; end if;
  if public.portal_fact_check_ledger_shape_valid(
    pg_catalog.jsonb_set(v_required, '{0,source_title}', 'null'::jsonb),
    'required', null
  ) then raise exception 'unpaired source URL/title passed'; end if;
  if public.portal_fact_check_ledger_shape_valid('[]'::jsonb, 'required', null)
     or not public.portal_fact_check_ledger_shape_valid(
       '[]'::jsonb, 'not_applicable', 'Brand-only creative without a factual claim.'
     ) then raise exception 'fact-check scope matrix failed'; end if;

  if pg_catalog.to_regclass('public.portal_0007_upgrade_probe') is not null then
    if not exists (
      select 1
      from public.portal_0007_upgrade_probe p
      join public.content_item_versions cv on cv.content_item_id = p.content_item_id
      where cv.fact_check_scope = 'not_applicable'
        and cv.fact_check_exemption is not null
        and cv.content_checksum <> p.old_checksum
      ) then raise exception '0007 checksum/scope upgrade probe failed'; end if;
  end if;

  if exists (select 1 from public.content_items where content_id = 'upgrade-fixture') then
    if not exists (
      select 1
      from public.content_items ci
      join public.content_item_versions cv
        on cv.content_item_id = ci.id and cv.client_id = ci.client_id and cv.version = 3
      where ci.content_id = 'upgrade-fixture'
        and ci.client_visible_version = 3
        and cv.fact_check_scope = 'not_applicable'
        and cv.fact_check_exemption is not null
    ) then raise exception 'full-state legacy snapshot was not preserved/classified'; end if;
    if (select pg_catalog.count(*) from public.recommendations where title = 'Existing recommendation') <> 1
       or (select pg_catalog.count(*) from public.links where label = 'Posting folder') <> 1
       or (select pg_catalog.count(*) from public.report_snapshots where period = '2026-07-H1') <> 1
       or (select pg_catalog.count(*) from public.content_ideas where title = 'Existing idea') <> 1
       or (select pg_catalog.count(*) from public.portal_seen
           where auth_user_id = '00000000-0000-0000-0000-000000000101') <> 1 then
      raise exception '0004/0005 full-state upgrade data was not preserved';
    end if;
  end if;
end;
$$;

do $$
declare
  v_client_id uuid := (select id from public.clients where slug = 'kanset');
  v_before_items bigint;
  v_before_versions bigint;
  v_before_activity bigint;
  v_result jsonb;
begin
  select pg_catalog.count(*) into v_before_items from public.content_items;
  select pg_catalog.count(*) into v_before_versions from public.content_item_versions;
  select pg_catalog.count(*) into v_before_activity from public.activity_log;

  v_result := public.preview_content_item_versions(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'client_id', v_client_id,
      'content_id', 'preview-zero-write-fixture',
      'version', 1,
      'title', 'Preview fixture',
      'platforms', pg_catalog.jsonb_build_array('instagram'),
      'fact_check', 'confirmed',
      'fact_check_scope', 'not_applicable',
      'fact_check_exemption', 'Brand-only preview with no factual claim.',
      'fact_check_ledger', '[]'::jsonb,
      'client_body', 'Preview body',
      'copy_blocks', '[{"key":"caption","label":"Caption","body":"Preview body"}]'::jsonb,
      'source_path', 'content/preview.md'
    )
  ));
  if v_result->0->>'outcome' <> 'inserted' or v_result->0->'item_id' <> 'null'::jsonb then
    raise exception 'new-item preview result is wrong: %', v_result;
  end if;
  if (select pg_catalog.count(*) from public.content_items) <> v_before_items
     or (select pg_catalog.count(*) from public.content_item_versions) <> v_before_versions
     or (select pg_catalog.count(*) from public.activity_log) <> v_before_activity then
    raise exception 'preview wrote persistent portal rows';
  end if;
end;
$$;

set role service_role;

do $$
declare
  v_client_id uuid := (select id from public.clients where slug = 'kanset');
  v_payload jsonb;
  v_result jsonb;
  v_item_id uuid;
begin
  if pg_catalog.to_regclass('public.portal_0007_upgrade_probe') is not null then
    v_result := public.sync_content_item_versions(pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'client_id', v_client_id,
        'content_id', 'release-quality-upgrade-probe',
        'version', 1,
        'title', 'Pre-0007 exact retry probe',
        'format', 'carousel',
        'pillar', 'test',
        'platforms', pg_catalog.jsonb_build_array('instagram'),
        'planned_date', null,
        'canva_url', null,
        'drive_url', null,
        'fact_check', 'confirmed',
        'fact_check_scope', 'not_applicable',
        'fact_check_exemption',
          'Migrated pre-ledger portal fixture; replace before real client release.',
        'fact_check_ledger', '[]'::jsonb,
        'client_body', 'Pre-0007 body',
        'copy_blocks', '[{"key":"caption","label":"Caption","body":"Pre-0007 body"}]'::jsonb,
        'source_path', 'fixture:pre-0007.md'
      )
    ));
    if v_result->0->>'outcome' <> 'exact_retry' then
      raise exception 'post-upgrade unchanged payload was not an exact retry: %', v_result;
    end if;
  end if;

  v_payload := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'client_id', v_client_id,
    'content_id', 'release-quality-fixture',
    'version', 1,
    'title', 'Release-quality fixture',
    'format', 'carousel',
    'pillar', 'test',
    'platforms', pg_catalog.jsonb_build_array('instagram'),
    'planned_date', '2026-07-20',
    'canva_url', null,
    'drive_url', null,
    'fact_check', 'confirmed',
    'fact_check_scope', 'required',
    'fact_check_exemption', null,
    'fact_check_ledger', '[{
      "claim_key":"canada-source",
      "claim":"Canada publishes immigration information.",
      "status":"confirmed",
      "source_url":"https://www.canada.ca/immigration",
      "source_title":"Canada immigration",
      "checked_at":"2026-07-18",
      "checked_by_role":"agency_owner"
    }]'::jsonb,
    'client_body', 'Released client-safe body',
    'copy_blocks', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'key', 'caption', 'label', 'Caption', 'body', 'Released client-safe body'
    )),
    'source_path', 'content/release-quality-fixture.md',
    'source_commit_sha', '0123456789abcdef0123456789abcdef01234567'
  ));

  v_result := public.sync_content_item_versions(v_payload);
  v_item_id := (v_result->0->>'item_id')::uuid;
  if v_result->0->>'outcome' <> 'inserted' then raise exception 'first sync was not inserted'; end if;
  if public.sync_content_item_versions(v_payload)->0->>'outcome' <> 'exact_retry' then
    raise exception 'unchanged payload was not an exact retry';
  end if;

  perform public.mark_content_ready(v_item_id, 1);
  perform public.mark_content_ready(v_item_id, 1);

  begin
    perform public.sync_content_item_versions(pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_set(v_payload->0, '{fact_check_ledger,0,private_reasoning}', '"secret"')
    ));
    raise exception 'forged extra ledger key unexpectedly synced';
  exception when others then
    if sqlerrm not like 'ledger_invalid%' then raise; end if;
  end;
end;
$$;

do $$
declare
  v_client_id uuid := (select id from public.clients where slug = 'kanset');
  v_result jsonb;
  v_item_id uuid;
begin
  v_result := public.sync_content_item_versions(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'client_id', v_client_id,
      'content_id', 'unconfirmed-release-fixture',
      'version', 1,
      'title', 'Unconfirmed fixture',
      'platforms', pg_catalog.jsonb_build_array('instagram'),
      'fact_check', 'needs-confirm',
      'fact_check_scope', 'required',
      'fact_check_ledger', '[{
        "claim_key":"pending",
        "claim":"Pending claim.",
        "status":"needs-confirm",
        "source_url":null,
        "source_title":null,
        "checked_at":"2026-07-18",
        "checked_by_role":"agency_fact_checker"
      }]'::jsonb,
      'client_body', 'Unconfirmed body',
      'copy_blocks', '[{"key":"caption","label":"Caption","body":"Unconfirmed body"}]'::jsonb,
      'source_path', 'content/unconfirmed.md'
    )
  ));
  v_item_id := (v_result->0->>'item_id')::uuid;
  begin
    perform public.mark_content_ready(v_item_id, 1);
    raise exception 'unconfirmed content unexpectedly released';
  exception when others then
    if sqlerrm <> 'fact_check_unconfirmed' then raise; end if;
  end;
end;
$$;

reset role;

do $$
declare
  v_count bigint;
begin
  select pg_catalog.count(*) into v_count
  from public.activity_log al
  join public.content_items ci on ci.id = al.content_id
  where ci.content_id = 'release-quality-fixture' and al.event_type = 'needs_review';
  if v_count <> 1 then
    raise exception 'exact release retry left % needs_review activity rows', v_count;
  end if;

  if pg_catalog.has_column_privilege(
       'authenticated', 'public.content_item_versions', 'source_commit_sha', 'SELECT'
     )
     or pg_catalog.has_column_privilege(
       'authenticated', 'public.content_item_versions', 'source_path', 'SELECT'
     )
     or pg_catalog.has_column_privilege(
       'authenticated', 'public.content_item_versions', 'content_checksum', 'SELECT'
     ) then
    raise exception 'authenticated can read private snapshot provenance';
  end if;
end;
$$;

drop table if exists public.portal_0007_upgrade_probe;
