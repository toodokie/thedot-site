-- Representative 0001..0005 row shapes, including old unkeyed copy_blocks.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000101', 'fixture@example.com');

insert into public.client_users (client_id, auth_user_id, email, name)
select id, '00000000-0000-0000-0000-000000000101', 'fixture@example.com', 'Fixture Client'
from public.clients where slug = 'kanset';

insert into public.content_items (
  content_id, client_id, title, format, platforms, scheduled_date, status, version,
  fact_check, client_body, source_path, copy_blocks
)
select
  'upgrade-fixture', id, 'Released fixture', 'carousel', array['instagram'], '2026-07-18',
  'draft', 3, 'confirmed', '## Caption\nReleased fixture body', '/private/fixture.md',
  '[{"label":"Caption","body":"Released fixture body"}]'::jsonb
from public.clients where slug = 'kanset';

insert into public.comments (content_id, client_id, author_type, author_name, body)
select ci.id, ci.client_id, 'client', 'Fixture Client', 'Existing comment'
from public.content_items ci where ci.content_id = 'upgrade-fixture';

-- Representative 0004/0005 state carried by production. Migration 0006 must preserve these
-- surfaces while adding the tenant-safe source_idea relationship and version model.
insert into public.recommendations (client_id, title, body, category, platform)
select id, 'Existing recommendation', 'Keep this recommendation', 'content', 'instagram'
from public.clients where slug = 'kanset';

insert into public.links (client_id, category, label, url, description, sort)
select id, 'posting', 'Posting folder', 'https://drive.google.com/open?id=upgrade-fixture', 'Existing link', 1
from public.clients where slug = 'kanset';

insert into public.report_snapshots (client_id, period, platform, metrics, summary)
select id, '2026-07-H1', 'instagram', '{"reach":123}'::jsonb, 'Existing report'
from public.clients where slug = 'kanset';

insert into public.content_ideas (client_id, author_type, author_name, title, body, status)
select id, 'client', 'Fixture Client', 'Existing idea', 'Keep this idea', 'considering'
from public.clients where slug = 'kanset';

insert into public.portal_seen (auth_user_id, client_id, last_seen_at)
select '00000000-0000-0000-0000-000000000101', id, '2026-07-17 12:00:00+00'
from public.clients where slug = 'kanset';
