-- 0002_content_id_per_tenant.sql: make content_id unique PER CLIENT, not globally.
-- content_id is unique PER CLIENT, not globally, so a reused id cannot reassign a row across tenants.
-- Constraint name assumption: content_items_content_id_key is Postgres's default for the column-level
-- `unique` on content_id in 0001. If it differs (e.g. a hand-created install), confirm the real name
-- via \d content_items or the Supabase table view before running, and adjust the DROP line.
alter table public.content_items drop constraint content_items_content_id_key;
alter table public.content_items add constraint content_items_client_content_id_key unique (client_id, content_id);
