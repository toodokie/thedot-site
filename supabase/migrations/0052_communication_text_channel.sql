-- 0052_communication_text_channel.sql
-- Add 'text' (SMS) as a valid client-communication channel.
-- Texting a client is a real-life channel (Anastasia's call 2026-08-02); the
-- communication log must be able to reflect reality, not force a text to be
-- mislabelled as 'email'. This only WIDENS the client_communications.channel
-- CHECK; there is no data migration, no grant change, and no RPC change
-- (log_portal_communication passes p_channel straight to the table CHECK, so the
-- widened constraint is the single gate). scripts/portal-write.ts's communication
-- command enum is widened to match in the same change.

begin;

-- Drop the existing channel CHECK by its definition (robust to the auto-generated
-- constraint name) so the widened constraint is the only one governing channel.
do $$
declare v_name text;
begin
  select conname into v_name
  from pg_catalog.pg_constraint
  where conrelid = 'public.client_communications'::regclass
    and contype = 'c'
    and pg_catalog.pg_get_constraintdef(oid) ilike '%channel%';
  if v_name is not null then
    execute format('alter table public.client_communications drop constraint %I', v_name);
  end if;
end $$;

alter table public.client_communications
  add constraint client_communications_channel_check
  check (channel in ('email','call','meeting','text'));

commit;
