-- Apply after 0006 and before 0007 in the isolated upgrade replay.
set role service_role;

select public.sync_content_item_versions(pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object(
    'client_id', (select id from public.clients where slug = 'kanset'),
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
    'fact_check_ledger', '[]'::jsonb,
    'client_body', 'Pre-0007 body',
    'copy_blocks', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'key', 'caption', 'label', 'Caption', 'body', 'Pre-0007 body'
    )),
    'source_path', 'fixture:pre-0007.md'
  )
));

reset role;

create table public.portal_0007_upgrade_probe (
  content_item_id uuid primary key,
  old_checksum text not null
);

insert into public.portal_0007_upgrade_probe (content_item_id, old_checksum)
select content_item_id, content_checksum
from public.content_item_versions
where source_path = 'fixture:pre-0007.md';

