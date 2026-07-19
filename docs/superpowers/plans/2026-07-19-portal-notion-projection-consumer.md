# Notion Projection Consumer Implementation Plan (rev 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) tracking.
> **Author:** Claude (build pen). **Reviewer:** Codex (frozen-hash review).
> **rev 2** resolves Codex's round-1 review (8 must-fix items). See the resolution table below.

**Goal:** Build the durable one-way consumer that drains `public.projection_outbox` into Notion (upsert / archive / reconcile), so Supabase-authored workflow state projects to Notion as a read-only coordination surface, never the reverse.

**Architecture:** The outbox (`0008`) is produced by `0008/0009/0011/0014` mutation RPCs but has **no consumer**. Rows are thin pointers (`object_type`, `object_key`, `object_revision`, small `payload.reason`); the consumer claims a fenced batch atomically (newest revision per key only), loads each object's current client-safe state, projects an explicit safe-field set one-way into the matching Notion database, then marks the row succeeded / failed-with-backoff / abandoned. Idempotency is revision-monotonic per `(client_id, object_type, object_key)`. Notion is a projection target only.

**Tech Stack:** Postgres (security-definer RPCs, `set search_path=''`, `FOR UPDATE SKIP LOCKED`, fencing tokens), `@notionhq/client`, `tsx` script, `@next/env`, `vitest`, `scripts/test-rls.ts`.

---

## Review round 1 (Codex) — resolutions

| # | Codex must-fix | Resolution (section) |
|---|----------------|----------------------|
| 1 | Service-only way to get `last_succeeded_revision` | `claim_projection_batch` returns it per row via a lateral max; no separate query (RPCs) |
| 2 | Fencing tokens (claimed_by+expiry lets a stale worker complete a reclaimed job) | `claim_token bigint` from a sequence, required by `mark_*`; reclaim bumps it (Data model, RPCs) |
| 3 | Serialize per object/revision so v1 can't overwrite v2 | Claim hands out only the newest revision per key (`DISTINCT ON`), partial unique index bars two `processing` rows/key, lower revisions resolve `skip_stale`→succeeded (RPCs, Pure logic) |
| 4 | Enforce global + tenant `notion_projection` switches | Claim filters on `portal_feature_enabled(client_id,'notion_projection')`; fail-closed, off→not claimed; consumer re-checks (Switches) |
| 5 | Handle all live producer types | Real projectors for content, recommendation, link, report, communication; no throw-stubs (Projectors) |
| 6 | Tenant-scoped `projection_outbox` uniqueness omission | Confirmed 0011 types use tenant-scoped text keys; add `client_id` to the outbox unique constraint (additive ALTER) + key all dedup/Notion external-ids per `(client_id, object_type, object_key)` (Data model, Uniqueness) |
| 7 | Dry-run / list support | `--dry-run` (claims nothing) + `--list` (backlog by status) (Consumer script) |
| 8 | Explicit safe-field projection contracts | Each projector exports a `safeFields` allow-list; builder reads only those; test asserts nothing else is sent (Projectors, Safe-field wall) |

## Sequencing (updated)

- **Alerts is now also my pen** (Codex declined). Build order: **0015 alerts + notification-outbox**, then **0016 projection consumer**. No cross-agent migration-number handoff. Both self-verified; both hashes to Codex.
- 0014 is **cleared** (Codex: fresh replay + assertions + full JWT/PostgREST incl. R1b, R7-R10, all passed; `0cab4f9` frozen). Codex freed the stack (`portal-access-0013` stopped, volume backed up), so the local stack is available.
- `.env.local` points at PROD; every `test-rls.ts` run uses a provably-local env override. `supabase db reset` is local-by-construction.

## Data model delta (migration 0016)

```sql
create sequence if not exists public.projection_claim_token_seq;

alter table public.projection_outbox
  add column if not exists claim_token bigint,          -- fencing token, set per claim
  add column if not exists claimed_by text,             -- worker tag (audit only)
  add column if not exists claim_expires_at timestamptz;

-- resolve Codex #6 + review-2 #1/#2: BOTH existing uniques omit client_id and the 0011 types use
-- tenant-scoped keys, so scope both by tenant. Real catalog names verified against the live DB
-- (a guessed truncated name would make DROP IF EXISTS silently no-op, leaving the old unique).
alter table public.projection_outbox
  drop constraint projection_outbox_destination_event_key_key,
  drop constraint projection_outbox_destination_object_type_object_key_object_key;
alter table public.projection_outbox
  add constraint projection_outbox_tenant_event_key_uniq
    unique (client_id, destination, event_key),
  add constraint projection_outbox_tenant_object_rev_uniq
    unique (client_id, destination, object_type, object_key, object_revision);
-- assert the two old uniques are gone (not left behind by a bad drop) BEFORE relying on the new ones
do $$ begin
  if exists (select 1 from pg_catalog.pg_constraint
    where conrelid='public.projection_outbox'::pg_catalog.regclass
      and conname in ('projection_outbox_destination_event_key_key',
                      'projection_outbox_destination_object_type_object_key_object_key')) then
    raise exception 'old non-tenant-scoped projection_outbox unique still present';
  end if;
end $$;

-- resolve Codex #3: at most one in-flight projection per key
create unique index if not exists projection_outbox_one_processing_per_key
  on public.projection_outbox (client_id, destination, object_type, object_key)
  where status = 'processing';

-- reclaim expired 'processing' rows cheaply
create index if not exists projection_outbox_reclaim
  on public.projection_outbox (status, claim_expires_at) where status = 'processing';
```

(The exact dropped constraint name is confirmed against the live catalog at execution; the `drop ... if exists` + re-add is idempotent.)

## Consumer RPCs (all `security definer`, `set search_path=''`, granted to `service_role` ONLY; revoked from anon/authenticated; `test-rls.ts` proves a client JWT is denied every one)

- [ ] **`claim_projection_batch(p_worker text, p_limit int, p_claim_seconds int)`** returns rows of `(id, client_id, object_type, object_key, object_revision, operation, payload, claim_token, last_succeeded_revision)`.
  - Eligible = `destination='notion'` AND `portal_feature_enabled(client_id,'notion_projection')` (Codex #4, fail-closed) AND (`status='pending'` and due) OR (`status='processing'` and `claim_expires_at < now()` reclaim) AND **no other _live_ (non-expired) `processing` row** exists for the same `(client_id,object_type,object_key)`. The blocking predicate must exclude expired leases (review-2 edge): otherwise an expired-older-processing row could block a newer-pending row for the same key while `DISTINCT ON` picked the newer, claiming neither. An expired lease is reclaimable, not a live block.
  - `DISTINCT ON (client_id, object_type, object_key) ... ORDER BY ... object_revision DESC` so only the newest revision per key is handed out (Codex #3).
  - `FOR UPDATE SKIP LOCKED`. Per claimed row: `claim_token=nextval('public.projection_claim_token_seq')` (Codex #2), `status='processing'`, `claimed_by=p_worker`, `claim_expires_at=now()+p_claim_seconds`, `attempts=attempts+1`.
  - Returns `last_succeeded_revision` via lateral `max(object_revision)` over succeeded rows for that key (Codex #1).
- [ ] **`mark_projection_succeeded(p_id uuid, p_claim_token bigint)`** — guarded `claim_token=p_claim_token AND status='processing'`; sets `succeeded`, `completed_at=now()`, clears claim. No-op if the token was superseded by a reclaim (Codex #2).
- [ ] **`mark_projection_failed(p_id uuid, p_claim_token bigint, p_error text, p_max_attempts int)`** — same token guard; `attempts>=p_max_attempts`→`abandoned` else `pending` with `next_attempt_at=now()+backoff(attempts)`; store `last_error`.
- [ ] **`mark_projection_superseded(p_id uuid, p_claim_token bigint)`** — for a claimed row whose revision `<= last_succeeded_revision`: mark `succeeded` without a Notion write (stale, already covered).
- [ ] **`enqueue_projection_reconcile(p_client_id uuid, p_object_type text, p_object_key text)`** — inserts a `reconcile` row at the object's current revision (unique-safe) to force a full re-project.

`backoff(attempts)` is a SQL helper (exp, capped ~1h) mirroring the TS `nextBackoffSeconds`; the two are asserted equal in tests.

## Pure logic (`src/lib/portal/notion-projection.ts`, DB-free, vitest — Codex #1/#3)

- `nextBackoffSeconds(attempts)` — matches the SQL helper.
- `decideProjection({operation, objectRevision, lastSucceededRevision})` → `'apply' | 'archive' | 'skip_stale'`. `skip_stale` when `lastSucceededRevision >= objectRevision`; `archive` when `operation='archive'`; else `apply`.
- `routeObjectType(objectType)` → projector key or `throw` (unknown type fails loud, never silent-drops).

## Projectors (`src/lib/portal/notion-projectors.ts` — Codex #5/#8)

Registry keyed by object_type; **all five live types implemented**, each `{ safeFields: string[], load(clientId,objectKey), toNotion(state), archive(clientId,objectKey) }`. Notion external-id is always `${clientId}:${objectType}:${objectKey}` (Codex #6 — tenant-scoped, never bare object_key).

| object_type | producer | Notion target | load source (client-safe view) |
|-------------|----------|---------------|--------------------------------|
| content | 0008/0009/0014 | Content Calendar DB `27464dca-49b9-4404-bec5-fe4f67390154` | schedule/status client view |
| report | 0011 | SM Metrics DB `7acb4709e3da4b0a9069dcc28b31f5c2` | report_snapshots client view (numbers only) |
| recommendation | 0011 | SM Recommendations surface (DB TBD, confirm at execution) | recommendations client view |
| link | 0011 | Library/links surface (DB TBD) | links client view |
| communication | 0011 | Communication-log surface (DB TBD) | communications client view |

Where a Notion target DB is not yet provisioned, the projector is an **explicit, logged no-op that marks succeeded** (never a throw, never a silent drop) with a `TODO(target)` note, so rows don't pile into `abandoned`. Targets get wired as their Notion DBs are created. Each projector reads ONLY its `safeFields`.

## Fail-closed switch (Codex #4)

Gating is in SQL at claim time (`portal_feature_enabled(client_id,'notion_projection')`) so an off switch means rows are never claimed (they wait, not fail). The consumer also re-checks before each apply, in case the switch flips mid-batch. The `notion_projection` feature defaults **off**; launch flips it per tenant.

## Safe-field wall (Codex #8)

Each projector's `safeFields` is the ONLY set the Notion builder may read from the loaded state; the builder is constructed from the allow-list, not the raw row. A vitest asserts that for a synthetic state carrying an internal/PII field, the built Notion payload contains none of it. This is the projection-surface half of the same PII wall the content sync already enforces.

## Consumer script (`scripts/portal-projection-consumer.ts` — Codex #7)

Loop: `claim_projection_batch` → per row `decideProjection` → `apply` via projector / `archive` / `skip_stale`(`mark_projection_superseded`) → `mark_projection_succeeded|failed(claim_token,...)`. Flags: `--once` (single batch, cron-friendly), `--dry-run` (claims nothing, prints the plan), `--list` (prints backlog counts by status + oldest pending age). One-way only.

## Verification (freed local stack, provably-local env)

- [ ] `supabase db reset` — fresh `0001..0016` replay + all in-migration assertions (incl. this slice's fold on top of the alerts cumulative) pass.
- [ ] `test:rls` (local override) — client JWT denied all consumer RPCs; service role succeeds; token-fencing (a reclaimed row rejects the stale token); one-processing-per-key holds; switch-off tenant yields zero claims; stale-revision supersede.
- [ ] `vitest` — backoff monotonic + equals SQL helper; decide matrix; unknown-type throws; safe-field wall drops the injected internal field.
- [ ] `next build` clean.
- [ ] Freeze commit; hand hash to Codex.

## Out of scope

Google Calendar projection (`0010`), alerts/notification outbox (separate slice 0015), any Notion-as-input path (forbidden by the one-way rule).
