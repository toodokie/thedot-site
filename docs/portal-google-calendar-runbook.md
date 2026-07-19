# Portal Google Calendar runbook

The shared **Kanset Social** calendar is an editable agency coordination surface. Supabase remains
authoritative for approvals, released copy, editorial state, destination scheduling, and publication.
A calendar event or elapsed event time is never provider proof.

## Required production configuration

- `PORTAL_PUBLIC_ORIGIN`: exact HTTPS origin used by Vercel, with no path.
- `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET`: dedicated OAuth web client.
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`: 32 random bytes encoded as base64. Keep old key material
  during a deliberate credential rotation until stored credentials have been re-encrypted.
- `GOOGLE_CALENDAR_CLIENT_READER_EMAIL`: Maria's exact Google account email. ACL health fails until
  this account has calendar-level `reader` access.
- `CRON_SECRET`: high-entropy Vercel cron bearer secret.
- Existing portal Supabase service-role and hardened admin-session variables.

Google OAuth redirect URI must be exactly
`<PORTAL_PUBLIC_ORIGIN>/api/admin/portal/calendar/oauth/callback`. The consent screen requires only
identity plus Calendar events, calendar-list read, and ACL read scopes. Authorize the durable The Dot
owner/writer of the existing calendar. Do not recreate the calendar under a service account.

## Connect and launch

1. Back up production and apply `0010_google_calendar_sync.sql` through the reviewed migration path.
2. In `/admin/portal`, enter the tenant and the exact existing Calendar ID, then complete OAuth.
3. Confirm the integration account is the intended durable owner/writer and the timezone is
   `America/Toronto`.
4. Share the calendar with Maria as `reader`; ensure no public/default ACL exists.
5. Run reconciliation. Review every unmapped existing event and link it to the exact portal piece, or
   deliberately ignore it. Never infer a match from title, description, organizer, or attendee.
6. Resolve every conflict/unmapped event, confirm a terminal incremental sync token and active watch,
   then test: portal date to Google, eligible Google date to portal, simultaneous edit conflict, and
   Google deletion to durable cancellation review.
7. Verify the hourly cron and webhook route in Vercel logs without logging headers, tokens, event copy,
   client email, or provider evidence.

## Health and recovery

- `reauth_required`: reconnect through the admin OAuth flow. The old encrypted credential is replaced;
  no client data becomes readable while disconnected.
- `acl_drift`: restore durable owner/writer access, Maria `reader`, and remove public/default sharing.
- `calendar_missing`: confirm ownership/transfer and the exact Calendar ID before reconnecting. Do not
  silently create a replacement calendar.
- expired/dropped watch: run reconciliation. Renewal deliberately overlaps channels for 30 minutes,
  then stops the old Google channel.
- Google `410 Gone`: the worker discards no portal state; it performs a safe full event scan and commits
  the new sync token only after all pages apply.
- stale ETag or simultaneous portal revision: resolve the visible conflict. “Keep portal” reprojects with
  an ETag guard. “Accept Google” is refused when verified provider commitments require an explicit
  destination reschedule.
- stuck job: after its lease expires it is reclaimable. Retries back off and abandon after eight tries;
  inspect the safe error, correct the cause, then enqueue/run reconciliation.
- ambiguous create timeout: the worker searches the opaque `portal_mapping_key` and adopts exactly one
  event. Multiple matches fail closed for agency review.

## Secret rotation / disable

Reauthorize to rotate the Google refresh token. Rotate the encryption key only with an explicit
decrypt/re-encrypt procedure and backup. To stop synchronization, set the integration `disabled`, stop
its Google watch channels, and leave mappings/history intact. Never delete mappings to conceal an
unresolved conflict or treat a disabled adapter as proof of destination state.
