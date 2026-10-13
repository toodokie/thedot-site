-- Portal-only repair, 2026-08-09.
--
-- Tuesday's corrected v2 was re-shared in the portal, but no client email was authorized. Abandon
-- only its still-pending email row. The in-app needs-review activity remains intact.

begin;

update public.notification_outbox
set status = 'abandoned',
    completed_at = pg_catalog.now(),
    last_error = 'Portal updated without an authorized client email.',
    next_attempt_at = null,
    claim_token = null,
    claimed_by = null,
    claim_expires_at = null
where id = '22b50b0a-cfc3-4364-b68a-23e2b3763a39'::uuid
  and source_activity_id = '4feecdc7-02dc-4406-92ae-385a3662e414'::uuid
  and subject = 'Needs review: Ask Kanset: does immigration check if a marriage is genuine?'
  and channel = 'email'
  and recipient_kind = 'client'
  and status = 'pending'
  and attempts = 0;

commit;
