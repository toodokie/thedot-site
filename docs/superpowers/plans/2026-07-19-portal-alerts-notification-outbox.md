# Alerts + Notification Outbox Implementation Plan (0015)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox (`- [ ]`) tracking.
> **Author:** Claude (build pen). **Reviewer:** Codex (frozen-hash review).

**Goal:** Give client and agency durable, transactional alerts. Every notable portal mutation already funnels through `activity_log` (its RPC is the only writer), so a trigger enqueues a durable `notification_outbox` row in the same transaction, and a fenced consumer delivers email while the portal reads in-app unread state directly. This makes today's best-effort `notify.ts` durable and adds client-facing alerts, without rewriting a single existing RPC.

**Architecture:** `activity_log` (`0001`) is the single mutation funnel. Trigger `after insert on activity_log` (+ one on the comment table, which does not funnel through activity_log) routes each event to its counterparty and inserts `notification_outbox` rows transactionally. Email rows are drained by a fenced consumer (same claim/fencing/backoff machinery as the projection consumer, so Codex's round-1 must-fixes are baked in here from the start). In-app rows need no consumer: the portal queries unread rows for the signed-in party under RLS and marks them seen.

**Tech Stack:** Postgres (trigger + security-definer fenced RPCs, `set search_path=''`), `@notionhq/client` N/A, `nodemailer` via `notify.ts`, `tsx` consumer, `vitest`, `test-rls.ts`.

---

## Why trigger-capture, not per-RPC wiring

"Transactional notification outbox wired into all mutation RPCs" is achieved by **capturing the funnel**, not editing every function: `activity_log` already receives a row from each mutation RPC (needs_review / approved / change_requested / scheduled / posted / recommendation_added / monthly_report_added / meeting_email_note_added / idea_captured). A trigger fires in the mutation's own transaction, so a rolled-back mutation enqueues nothing and a committed one always enqueues. DRY, and a new RPC that logs activity gets alerts for free. Comments do not go through `activity_log`, so they get their own trigger on the comment table.

## Data model (migration 0015)

```sql
create sequence if not exists public.notification_claim_token_seq;

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('client','agency')),
  channel text not null check (channel in ('email','in_app')),
  event_key text not null,                        -- idempotency: unique per (recipient, source)
  source_activity_id uuid,                        -- FK-free (activity_log is append-only)
  source_kind text not null check (source_kind in ('activity','comment')),
  subject text not null,
  body text not null,
  related_url text,
  -- delivery (email channel): the fenced-consumer contract, identical to projection_outbox
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','abandoned','skipped')),
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  claim_token bigint,
  claimed_by text,
  claim_expires_at timestamptz,
  -- in_app channel: unread state read under RLS by the recipient
  seen_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  unique (channel, event_key)
);
create index notification_outbox_pending
  on public.notification_outbox (status, next_attempt_at, created_at) where channel = 'email';
create index notification_outbox_unread
  on public.notification_outbox (client_id, recipient_kind, seen_at) where channel = 'in_app';
```

RLS: a client JWT sees only `client_id in my_client_ids()` AND `recipient_kind='client'` AND `channel='in_app'` (never agency rows, never email rows, never other tenants). Agency in-app alerts are read via the admin surface (service role / admin session), not client JWT.

## Routing (trigger `enqueue_activity_notifications`)

| activity actor_type | example event_types | recipient_kind | channels |
|---------------------|---------------------|----------------|----------|
| `client` | approved, change_requested, idea_captured | `agency` | email (durable, replaces `notifyDecision`), in_app (agency badge) |
| `anastasia` / `agent` | needs_review, scheduled, posted, recommendation_added, monthly_report_added, meeting_email_note_added | `client` | in_app (client badge); email only for high-signal types (needs_review, posted) to avoid client inbox spam |
| comment trigger | client comment / agency reply | the OTHER party | email + in_app (replaces `notifyComment`) |

`event_key = source_kind || ':' || source_id || ':' || recipient_kind || ':' || channel` so re-fires and both-channel rows stay idempotent under the `unique (channel, event_key)`.

## Fenced email-consumer RPCs (service_role only; client JWT denied; same pattern as projection consumer)

- [ ] `claim_notification_batch(p_worker, p_limit, p_claim_seconds)` — `channel='email'` and `status='pending'` and due (or expired `processing` reclaim); `FOR UPDATE SKIP LOCKED`; sets fresh `claim_token=nextval(...)`, `processing`, `claimed_by`, `claim_expires_at`, `attempts+1`.
- [ ] `mark_notification_succeeded(p_id, p_claim_token)` — token+status guarded; `succeeded`, `completed_at`.
- [ ] `mark_notification_failed(p_id, p_claim_token, p_error, p_max_attempts)` — `abandoned` at cap else `pending` + backoff.

In-app rows are never claimed; `mark_notification_seen(p_id)` (client RPC, RLS-scoped to the recipient) clears the badge.

## Consumer script (`scripts/portal-notification-consumer.ts`)

`claim_notification_batch` → send via `notify.ts` (now the durable path) → `mark_notification_succeeded|failed(claim_token,...)`. Flags `--once`, `--dry-run`, `--list`. `notify.ts` gains a generic `sendNotification({to, subject, html})` that the existing `notifyDecision/notifyComment` become thin callers of (or are retired in favor of the outbox).

## Surfaces

- **Client badge:** unread count = `notification_outbox` where `recipient_kind='client'`, `channel='in_app'`, `seen_at is null`, under RLS. Wire into `PortalNav`. Mark-seen on view.
- **Agency badge:** same for `recipient_kind='agency'` via the admin surface.

## Verification (local stack, provably-local env)

- [ ] `supabase db reset` — fresh `0001..0015` replay + in-migration assertions (new `assert_portal_slice9_security` folded on 0014's cumulative) pass.
- [ ] `test:rls` — trigger enqueues on a client decision (agency email + agency in_app) and on an agency action (client in_app); client JWT sees only its own `recipient_kind='client'` in_app rows, never agency/email/other-tenant rows; client denied all consumer RPCs; email fencing (reclaim rejects stale token).
- [ ] `vitest` — routing pure logic (actor_type+event_type -> recipient_kind+channels), backoff.
- [ ] `next build` clean.
- [ ] Freeze; hash to Codex.

## Out of scope

SMS/push channels, digest batching (v2), the projection consumer (0016), the assistant.
