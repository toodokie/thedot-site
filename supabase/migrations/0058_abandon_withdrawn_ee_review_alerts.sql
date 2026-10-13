-- Incident repair, 2026-08-03.
--
-- Express Entry v7 was briefly released while its item-level design link still
-- pointed to the superseded v6 reel. The release was withdrawn immediately and
-- the stale design link was cleared. Suppress only the six client email alerts
-- created by that withdrawn review cycle. In-app rows remain as the durable
-- audit trail, and unrelated notifications are untouched.

begin;

update public.notification_outbox
set status = 'abandoned',
    last_error = 'Withdrawn before delivery: Express Entry v7 design was not ready for final review.',
    next_attempt_at = null,
    claim_token = null,
    claimed_by = null,
    claim_expires_at = null
where id = any (array[
  'ee0bcb63-24af-43d9-a9e6-59c031d4f9a3'::uuid,
  'f1988ecb-1697-45c8-9e72-b85360a46d2f'::uuid,
  '9c493653-c14e-4056-99dc-b5d225b878d1'::uuid,
  'a5872085-f7fb-468c-a086-2f4e978ca870'::uuid,
  '19be926c-8198-40b3-8733-4c27b16252a7'::uuid,
  '3e2625c3-2ab1-46bc-8934-c893f05b640f'::uuid
])
  and channel = 'email'
  and recipient_kind = 'client'
  and status = 'pending'
  and attempts = 0;

commit;
