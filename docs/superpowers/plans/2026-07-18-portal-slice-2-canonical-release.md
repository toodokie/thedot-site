# Client Portal — Slice 2: Canonical Content + Deterministic Release Gate

**Status:** implemented and verified locally on 2026-07-18; pending Claude final-diff review, portal-only commit, production migration gate, and creation/configuration of the real private canonical-content checkout  
**Single pen:** Codex owns code/migration edits for this slice; Claude reviews the plan and final diff without editing the same files in parallel.  
**Depends on:** Slice 1 (`0006_versioned_content.sql`) passing fresh reset, upgrade replay, catalog assertions, and Auth/PostgREST RLS tests.  
**Spec:** `/Users/anastasiavolkova/Kanset/portal-integration-task.md` sections 1.1, 3.1, 4.0–4.6, 8, 10, 12.1–12.3.

## Goal

Make the immutable version model safe for real Kanset content. A canonical Markdown file is parsed once, structurally and privacy validated, previewed without writes, synchronized into an immutable working snapshot, and released only after deterministic fact-check/content gates pass. Internal notes, absolute workstation paths, fixture content, and unverified factual claims must not reach Maria.

This slice does **not** import the real historical corpus, build knowledge-document retrieval, expand the full lifecycle/scheduling state machine, or create Meta/YouTube adapters. It establishes the release-quality boundary those later slices must reuse; those capabilities remain committed v1 scope.

## Implementation outcome

- Added `0007_release_quality.sql` with immutable evidence scope/exemption/ledger fields, split shape/release validators, a migration-owned primary-source allow-list, checksum-v2 backfill, deterministic release gates, a shared preview/apply evaluator, exact grants, and cumulative catalog assertions.
- Added narrow service-only client/membership admin RPCs after verification proved the old local seeder and `portal-admin link/status` incorrectly assumed direct `clients`/`client_users` writes/reads. Direct service/authenticated membership writes remain revoked.
- Added strict frontmatter/privacy/canonical-Git validation, loopback-only fixtures, repository-relative private provenance, expected-remote enforcement, and preview-zero-write sync output.
- Reconciled the workflow-source policies exactly: primary-source roots are `canada.ca`, `ontario.ca`, `gazette.gc.ca`, and `college-ic.ca` (with exact-or-dot-suffix matching); `gc.ca` broadly and other provincial hosts remain blocked. Public copy permits only Kanset's reviewed phone, `@kansetimmigration`, and RCIC `508325`; no public email is allowed. Copy/CTA links use the separate reviewed Kanset/Canva/Google Drive/YouTube/social/portal host list.
- Added client-visible released fact-check evidence to piece/plan detail pages; source URLs remain allow-listed and version/RLS scoped.
- Verification passed: fresh `0001`–`0007`, representative full-state `0005`→`0006`→`0007` upgrade, SQL assertions, real-JWT/PostgREST two-tenant suite, fixture preview/apply/exact retry, 51 unit tests, scoped ESLint, `git diff --check`, design-system build, and Next 15 production build.
- The strict repository-wide `tsc --noEmit` command still reports pre-existing non-portal marketing/admin typing debt. It reported no Slice 2 file errors; the configured Next production build succeeds.

## Locked decisions

1. `PORTAL_CONTENT_DIR` points to the dedicated private canonical-content checkout. The broad `~/Kanset/content/` directory and `thedot-site/content/portal/` fixtures are never production roots.
2. `portal_kind: content` is required now. `portal_kind: knowledge` is reserved for the later knowledge/assistant slice and fails with an explicit unsupported-kind error rather than entering the content table.
3. File `status` remains compatibility/generated-display input only. It never mutates Supabase workflow state and is excluded from the immutable client-content checksum.
4. The file owns `fact_check`, `fact_check_ledger`, copy, title, platform/format/pillar, design/source links, version, and client-safe planned date. Supabase owns readiness, approval, lifecycle, scheduling, publication, archive, and activity.
5. A review release requires overall `fact_check: confirmed`; every ledger entry must also be `confirmed`. `needs-confirm`, `flagged`, malformed, or future-dated entries block release.
6. An empty ledger is permitted only when the file explicitly declares `fact_check_scope: not_applicable` plus a short client-safe `fact_check_exemption`. `fact_check_scope: required` requires at least one confirmed primary-source entry. This avoids both fake placeholder citations and silent evidence-free release.
7. Ledger/exemption data is client-facing, part of the immutable checksum, and approval-scoped. Internal reasoning belongs after `<!-- internal -->` and is never synchronized.
8. Production sync writes only committed canonical files from the expected Git checkout. `--dry-run` may inspect uncommitted work but performs zero database writes.
9. Dry-run and apply share the same parser, checksum, and database validation path. There is no second approximate preview implementation.
10. Fixture sync is loopback-only. No flag can authorize fixture content against a hosted Supabase URL.

## Target fact-check frontmatter

```yaml
portal_kind: content
fact_check: confirmed
fact_check_scope: required
fact_check_ledger:
  - claim_key: pgwp-eligibility
    claim: Ontario's Employer Job Offer streams require an eligible Ontario job offer.
    status: confirmed
    source_url: https://www.ontario.ca/page/oinp-employer-job-offer-streams
    source_title: OINP Employer Job Offer streams
    checked_at: "2026-07-18"
    checked_by_role: agency_fact_checker
```

For genuinely non-factual creative work:

```yaml
fact_check: confirmed
fact_check_scope: not_applicable
fact_check_exemption: "Brand-only announcement with no immigration or regulatory claim."
fact_check_ledger: []
```

## Task 1 — Parser types and fact-check validation (TDD)

**Files**

- Modify: `src/lib/portal/frontmatter.ts`
- Modify: `src/lib/portal/frontmatter.test.ts`
- Create: `src/lib/portal/primary-source-policy.ts`

- [ ] Add exact types:

```ts
export type FactCheckStatus = 'confirmed' | 'needs-confirm' | 'flagged'
export type FactCheckScope = 'required' | 'not_applicable'
export type FactCheckLedgerEntry = {
  claim_key: string
  claim: string
  status: FactCheckStatus
  source_url: string | null
  source_title: string | null
  checked_at: string
    checked_by_role: 'agency_fact_checker' | 'agency_owner'
}
```

- [ ] Add `portal_kind`, `fact_check_scope`, `fact_check_exemption`, and `fact_check_ledger` to `ParsedContent`.
- [ ] Require `portal_kind === 'content'`; reject missing/unknown/`knowledge` values with source-path context.
- [ ] The parser receives a repository-relative display path, never the absolute filesystem path. Every thrown/logged source reference therefore remains relative and privacy-safe.
- [ ] Validate `claim_key` against `[a-z0-9][a-z0-9_-]{0,63}` and reject duplicates.
- [ ] Reject unknown ledger keys. This prevents an agent from hiding internal reasoning or PII in an unreviewed JSON field.
- [ ] Enforce bounded strings: claim 1–500, source title 1–300, exemption 10–300.
- [ ] Parse `checked_at` using the same strict quoted real-date logic as planned dates; reject future dates.
- [ ] Parse URLs with `new URL`, require `https:`, no username/password, no control characters, and a hostname accepted by the version-controlled primary-source policy. Suffix checks must use exact-host-or-`.suffix`, never `endsWith('canada.ca')` alone.
- [ ] For `status: confirmed`, require source URL/title. Unresolved/flagged entries may omit them because they cannot pass release.
- [ ] Enforce the scope matrix:
  - `required`: exemption absent, ledger non-empty;
  - `not_applicable`: exemption present, ledger empty;
  - any `fact_check !== confirmed`: structurally syncable but never review-releasable.
- [ ] Preserve ledger order deterministically and trim strings; never coerce objects, arrays, booleans, or numbers into strings.
- [ ] Add tests for valid required/N/A records, every missing field, wrong scalar/array types, duplicate/invalid keys, unknown keys, HTTP/credential/scheme-relative/lookalike hosts, invalid/future/unquoted dates, scope conflicts, confirmed entries without sources, CRLF, and internal-marker separation.

**Acceptance:** parser tests fail before implementation and pass afterward; no ledger/internal data can enter through coercion or extra keys.

## Task 2 — Client-boundary privacy validator (TDD)

**Files**

- Create: `src/lib/portal/content-safety.ts`
- Create: `src/lib/portal/content-safety.test.ts`
- Create: `src/lib/portal/public-contact-policy.ts`
- Modify: `src/lib/portal/frontmatter.ts`

- [ ] Scan only fields destined for Supabase/client views: title, client body, copy blocks, fact claims/titles/exemption, and client-visible links. Internal notes are split first and excluded.
- [ ] Reject unknown email addresses and phone numbers. Permit only exact, version-controlled Kanset public business contacts; substring/domain lookalikes do not pass.
- [ ] Reject obvious case/intake identifiers and private operational material: UCI/application/file numbers, invoice/account-number labels, raw email headers, and internal-only marker/control text in projected fields.
- [ ] Do not treat every dollar amount as PII: public immigration fees may legitimately appear, but an amount adjacent to invoice/quote/account/client identifiers fails. Tests lock this distinction.
- [ ] Return structured findings internally, but throw one redacted source/field/code error. Never log the matched private value.
- [ ] Run this validator during parsing before any database/network call.

**Acceptance:** adversarial tests prove private data blocks the entire batch while legitimate public Kanset contact/fee copy passes.

## Task 3 — `0007` database ledger and release invariants

**Files**

- Create: `supabase/migrations/0007_release_quality.sql`
- Create: `supabase/tests/0007_pre_upgrade_fixture.sql`
- Create: `supabase/tests/0007_release_quality_assertions.sql`
- Modify: `scripts/test-rls.ts`

- [ ] Begin one transaction and fail early unless `0006` objects/functions/grants match their asserted signatures.
- [ ] Add immutable snapshot columns:
  - `fact_check_scope text not null default 'required'`;
  - `fact_check_exemption text null`;
  - `source_commit_sha text null` as private provenance, excluded from authenticated grants and the client-content checksum.
- [ ] Create an internal version-controlled `portal_primary_source_hosts` allow-list relation. Give `anon`/`authenticated` no privileges and no client view; updates require a later reviewed migration, not arbitrary client/service payload data.
- [ ] Split database validation deliberately:
  - immutable `portal_fact_check_ledger_shape_valid(jsonb, text, text)` enforces exact keys/types/bounds/statuses/duplicate keys/HTTPS URL shape/date syntax/scope matrix and is safe for the table CHECK;
  - stable `portal_fact_check_ledger_release_valid(jsonb, text, text)` calls the shape validator and additionally enforces the version-controlled host allow-list plus `checked_at <= current_date`; sync and release RPCs call it under their transaction.
- [ ] Both validators use `search_path=''` and fully qualified calls. Revoke execution from `PUBLIC`, `anon`, and `authenticated`; grant only where another reviewed function requires it. Database validation is authoritative against a forged service payload.
- [ ] Any future allow-list migration must run a preflight against every stored ledger and fail on incompatibility before changing allowed hosts; it cannot retroactively invalidate released history silently.
- [ ] Add/validate the shape CHECK without rewriting or deleting existing history. Add new columns nullable first, backfill existing `0006` demo rows to explicit migration-safe N/A values, validate, then set required nullability/defaults. The pre-upgrade fixture proves the transformation. Real release remains blocked until scope/evidence is explicit.
- [ ] Extend `portal_content_checksum` to include scope, exemption, and ledger. Because this changes checksum semantics, compute and verify the migration treatment for existing snapshots explicitly; never silently make an existing version appear changed on the next exact retry.
- [ ] Extend the single sync evaluator/RPC input to require and store these fields.
- [ ] Harden `mark_content_ready` under the existing row lock:
  - overall fact check must equal `confirmed`;
  - ledger/scope validator must pass;
  - required scope has at least one entry and every entry is confirmed;
  - N/A scope has a non-empty exemption and zero entries;
  - working version/checksum/readiness rules from `0006` remain intact;
  - exact release retry remains a no-op with no duplicate activity.
- [ ] Preserve the exact safe authenticated view/column grants. Add only client-safe scope/exemption/ledger fields to `content_with_state`; never expose checksum, source path, working version, or internal notes.
- [ ] Update `assert_portal_slice1_security()` or replace it with a cumulative `assert_portal_security()` that asserts exact columns, view `security_invoker`, RLS policies, function ACLs, and no non-SELECT `authenticated`/`service_role` relation privilege.
- [ ] Add SQL assertions for malformed JSON, forged extra keys, release failures, exact retries, upgrade preservation, and the safe view/grant set.
- [ ] Add a policy-parity integration assertion: every TypeScript-approved host used by fixtures exists in the database allow-list, and lookalike/unlisted hosts fail through the RPC even if the TypeScript parser is bypassed.
- [ ] Extend real-JWT tests: released ledger is tenant-scoped; working ledger remains unreadable; cross-tenant/direct/anon reads fail; an authenticated client cannot mutate ledger/scope/exemption.

**Acceptance:** both fresh `0001`–`0007` replay and full `0001`–`0006` fixture upgrade pass transactionally.

## Task 4 — One database path for preview and apply

**Files**

- Modify: `supabase/migrations/0007_release_quality.sql`
- Modify: `scripts/sync-content-to-supabase.ts`

- [ ] Refactor the current internal one-item sync evaluator so preview and apply share validation/checksum/outcome computation.
- [ ] Expose service-only `preview_content_item_versions(p_items jsonb)` with no writes and the same result shape as apply (`content_id`, item ID when present, outcome, working/released versions, checksum/conflict code).
- [ ] Revoke `PUBLIC`/`anon`/`authenticated` execution and assert exact `service_role` execution.
- [ ] Preview may take short row locks for a consistent answer but must create no identity/version/activity row and advance no pointer.
- [ ] Keep `sync_content_item_versions(jsonb)` backward compatible for existing scripts/tests; do not create a second client-writable overload.
- [ ] Invalid/conflicting items make the complete preview/apply batch fail. Exact retries are reported as no-ops.
- [ ] Add SQL cardinality assertions proving preview leaves every involved table unchanged.

**Acceptance:** dry-run and apply report the same outcomes from the same database logic; dry-run has zero persistent side effects.

## Task 5 — Canonical Git/path and fixture protections

**Files**

- Create: `src/lib/portal/canonical-content-root.ts`
- Create: `src/lib/portal/canonical-content-root.test.ts`
- Modify: `scripts/sync-content-to-supabase.ts`
- Modify: `package.json`

- [ ] Parse explicit `--dry-run`; unknown arguments fail.
- [ ] Keep the flat regular-file/no-symlink rules and additionally reject:
  - root or file outside the resolved canonical checkout;
  - nested Git repository/worktree confusion;
  - uppercase/non-`.md` canonical filenames where the policy requires lowercase;
  - duplicate realpaths/inode aliases;
  - absolute `source_path` storage.
- [ ] Store a normalized repository-relative POSIX path plus current Git commit SHA as private provenance. Never store `/Users/...` paths.
- [ ] Apply mode requires a Git checkout, expected configured remote, clean tracked canonical file, and committed HEAD. Reject remote URLs containing embedded credentials and compare a normalized host/owner/repository identity. Dry-run reports dirty/untracked files but may parse them.
- [ ] Refuse `thedot-site/content/portal` whenever the Supabase URL is non-loopback. `sync-content:fixtures` becomes loopback-only and cannot be overridden by an environment typo.
- [ ] Parse and validate every file before client lookup, preview, or apply. Unknown client/parse/privacy error prevents every write.
- [ ] `--dry-run` calls the service preview RPC, prints stable machine-readable and human summaries, and exits non-zero on conflicts.
- [ ] Apply prints inserted/version/exact-retry results but never bodies, ledger claims, emails, absolute paths, keys, or internal notes.
- [ ] Add tests with dependency-injected filesystem/Git/environment/database adapters so production-refusal and no-network-before-validation are deterministic.

**Acceptance:** a hosted URL plus fixture path is an unconditional refusal; canonical apply is reproducible to a commit SHA; logs contain no client copy/private paths.

## Task 6 — Admin release command and fixtures

**Files**

- Modify: `scripts/portal-admin.ts`
- Create: `content/portal/fixture-synthetic-brand-card.md`
- Create: `content/portal/fixture-synthetic-source-card.md`
- Modify: `scripts/seed-rls-local.ts`
- Modify: relevant tests

- [ ] Keep public-repository fixtures unmistakably synthetic and test-only. They use dedicated `fixture-synthetic-*` identities, contain no real client campaign copy or operational notes, and cover both required and N/A fact-check scopes.
- [ ] Update local RLS baseline payload with the new fields.
- [ ] Before `ready`, show only safe release-gate metadata: slug/content ID/version, scope, ledger entry/status counts, and deterministic pass/fail codes. Do not print claims or private source paths by default.
- [ ] `ready` still invokes the database RPC; CLI prechecks are explanatory, never authorization.
- [ ] On rejection, surface the precise client-safe gate code (`fact_check_unconfirmed`, `ledger_entry_unconfirmed`, `ledger_invalid`, `stale_version`, etc.) and exit non-zero.
- [ ] Preserve begin-revision, comment reply, magic-link, and status behavior.

## Task 7 — Verification and handoff

- [ ] `npx supabase@2.109.1 db reset --local --no-seed` applies `0001`–`0007` with migration history recorded.
- [ ] Run post-`0006` upgrade fixture, apply `0007`, then run `0007` assertions.
- [ ] Run cumulative catalog/security assertion after removing any temporary local seed grants.
- [ ] Run the complete real Auth/PostgREST two-tenant suite.
- [ ] Run parser/privacy/root/sync unit tests plus the full `npm test` suite.
- [ ] Run portal-scoped ESLint and `git diff --check`.
- [ ] Run the production build/type gate and distinguish pre-existing marketing errors from new portal errors; no new Slice 2 error is acceptable.
- [ ] Run a secret/privacy scan across the staged diff and build output for service keys, internal notes, absolute user paths, fixture body secrets, and private evidence.
- [ ] Claude reviews the final diff against this plan. Codex remains the only editor until review closes.

## Operational prerequisite before real content sync

This is not executed merely by merging code:

- create the dedicated private canonical-content Git repository/remote;
- copy only validated portal content into its reviewed root;
- configure `PORTAL_CONTENT_DIR` and expected remote identity locally/CI;
- dry-run against disposable/staging Supabase;
- review every proposed snapshot and fact ledger;
- explicitly release only approved real versions;
- do not remove fixtures/demo rows until the real dataset passes tenant and visibility checks.

## Slice 2 completion criteria

1. Internal notes and absolute local paths cannot enter Supabase/client views/logs.
2. Hosted Supabase cannot receive fixture-directory content.
3. A forged service payload cannot bypass ledger/scope validation.
4. Unconfirmed/flagged/malformed/future-dated fact evidence cannot be released.
5. Legitimate N/A creative content has an explicit client-safe exemption rather than a fake citation.
6. Ledger/scope/exemption are immutable, checksummed, version-bound, released-version-only, and tenant-isolated.
7. Dry-run and apply use the same database evaluation and dry-run writes nothing.
8. Apply is tied to a committed canonical Git SHA and stores only relative private provenance.
9. Existing exact retries, version guards, approvals, comments, RLS, and safe grants remain correct.
10. Fresh CLI replay, upgrade replay, real-JWT tests, unit tests, lint, and diff checks pass.
