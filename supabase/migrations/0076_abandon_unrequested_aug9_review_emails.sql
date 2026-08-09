-- Portal-only repair, 2026-08-09.
--
-- The agency updated Tuesday's review asset and prepared Wednesday's package in the portal. No
-- client email was authorized for this run. Abandon only the two still-pending email rows created
-- by the Wednesday package release and weekly plan revision. In-app activity remains intact.

begin;

update public.notification_outbox
set status = 'abandoned',
    completed_at = pg_catalog.now(),
    last_error = 'Portal updated without an authorized client email.',
    next_attempt_at = null,
    claim_token = null,
    claimed_by = null,
    claim_expires_at = null
where channel = 'email'
  and recipient_kind = 'client'
  and status = 'pending'
  and attempts = 0
  and (
    (
      id = 'aa9378e7-085a-47db-ae2f-303c347f9cfa'::uuid
      and source_activity_id = '2ce49b3d-1790-4a38-b27a-a523e91f5dcd'::uuid
      and subject = 'Needs review: Canada''s passport ties for 7th worldwide'
    )
    or
    (
      id = '90c5f575-a5bc-4aca-b910-e90225007d8c'::uuid
      and source_activity_id = 'd3122d89-1cf4-4430-81aa-487fb32f3eb9'::uuid
      and subject = 'Plan submitted: Content plan, week of Aug 10'
    )
  );

commit;
