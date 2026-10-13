# Portal production migration and history-repair runbook

**Status:** draft for independent review. **Do not execute any linked command, SQL, deployment, or
production configuration change until Anastasia gives a separate cutover approval.**

**Target:** Supabase project `ltotkkpytvtcgelrgdkg`.

**Purpose:** production received `0001`–`0005` through the Supabase SQL editor. The objects exist,
but those versions were not recorded by the Supabase CLI. This runbook proves the live schema really
matches post-`0005`, records only that proven history, clears the known `0011` legacy-link blocker,
and then applies reviewed migrations `0006`–`0012` in order. It also defines backup, rollback,
configuration, and post-apply gates. It never treats migration-history repair as proof of schema.

## Non-negotiable rules

- Work from a reviewed, frozen portal commit. Record the exact release HEAD in the private change log
  only after Slice 7 UI/tooling and this runbook are integrated and independently approved.
- Link the CLI only to `ltotkkpytvtcgelrgdkg`. Print and visually confirm the project ref before every
  linked mutation.
- Keep database dumps, command transcripts, and the Git bundle outside the public repository in an
  access-controlled directory. Never commit them.
- Never run `supabase db reset --linked`, `test:rls`, fixture seeders, or destructive integration tests
  against production.
- Never use `migration repair` to paper over catalog drift. A non-empty unexplained catalog diff is a
  stop condition.
- The known Dropbox Library row is not a reason to widen the client-safe host allow-list. Remove it
  only if it is positively identified as the synthetic demo row; otherwise stop and review it.
- `db push` applies pending files in version order. The final dry run must list exactly `0006` through
  `0012`, no more and no less.
- Production application, application deployment, Google OAuth connection, content loading, and the
  client launch are separate approvals. Completing one does not authorize the next.

## Locked facts

- Supabase CLI `2.109.1` accepts this repository's four-digit migration versions.
- `[db.migrations].enabled = true` and local reset/replay has already proven `0001`–`0012` in order.
- Production `0001`–`0005` were hand-pasted and must be catalog-verified before their history is
  registered.
- `0006`–`0012` have passed fresh replay, representative upgrade replay, in-migration assertions,
  and the disposable two-tenant Auth/PostgREST suite. Production must not be used to repeat the
  mutating JWT suite.
- `0011` intentionally fails if any existing `links.url` is outside the reviewed client-link hosts.
- `0012` requires `0011`, and its cumulative `public.assert_portal_security()` covers the earlier
  portal security assertions plus billing.
- Supabase CLI `db diff` is not sufficient by itself because the CLI documents known limitations for
  publications and `security_invoker` views. Use schema dumps plus the explicit catalog checks below.

## Phase 0 — freeze the release input

- [ ] Confirm `feat/thedot-design-system` contains the reviewed backend migrations and final Slice 7
      UI/tooling commit.
- [ ] Record `git rev-parse HEAD` as the proposed release commit and obtain independent review of that
      exact frozen hash.
- [ ] Confirm there is no uncommitted portal file. Unrelated marketing work may remain unstaged, but
      it must not enter the portal release commit or bundle.
- [ ] Record the exact migration checksums:

```bash
git rev-parse HEAD
git status --short
shasum -a 256 supabase/migrations/000{1,2,3,4,5,6,7,8,9}_*.sql \
  supabase/migrations/001{0,1,2}_*.sql
```

- [ ] Create and verify an off-repo Git bundle containing the frozen branch:

```bash
umask 077
git bundle create <PRIVATE_BACKUP_DIR>/thedot-portal-<UTC_TIMESTAMP>.bundle \
  feat/thedot-design-system
git bundle verify <PRIVATE_BACKUP_DIR>/thedot-portal-<UTC_TIMESTAMP>.bundle
shasum -a 256 <PRIVATE_BACKUP_DIR>/thedot-portal-<UTC_TIMESTAMP>.bundle
```

Record the commit, bundle path, bundle checksum, operator, and UTC time in the private change log.

## Phase 1 — backup and restore-point gate

All items are required. A logical public-schema dump is an audit/repair artifact; it is not a
replacement for a Supabase platform backup because managed Auth/Storage objects are excluded by the
normal CLI dump.

- [ ] In Supabase Dashboard → Database → Backups, record the newest backup or PITR restore point and
      its UTC time. Confirm it predates the change and is within the retained recovery window.
- [ ] If the plan supports PITR, record the latest recovery point. Otherwise take/confirm the newest
      supported project backup and document the maximum possible data-loss window.
- [ ] Create private logical snapshots of the live public schema, public data, and current migration
      history. Use the linked project only after visually confirming `ltotkkpytvtcgelrgdkg`:

```bash
npx supabase@2.109.1 link --project-ref ltotkkpytvtcgelrgdkg
npx supabase@2.109.1 projects list
npx supabase@2.109.1 db dump --linked --schema public \
  --file <PRIVATE_BACKUP_DIR>/prod-public-schema-pre.sql
npx supabase@2.109.1 db dump --linked --schema public --data-only --use-copy \
  --file <PRIVATE_BACKUP_DIR>/prod-public-data-pre.sql
shasum -a 256 <PRIVATE_BACKUP_DIR>/prod-*-pre.sql
```

First confirm the linked project marker is exactly `ltotkkpytvtcgelrgdkg` (the CLI stores it under
`supabase/.temp/project-ref` in a linked checkout). If
`pg_catalog.to_regclass('supabase_migrations.schema_migrations')` exists, also dump it:

```bash
npx supabase@2.109.1 db dump --linked --schema supabase_migrations --data-only --use-copy \
  --file <PRIVATE_BACKUP_DIR>/prod-migration-history-pre.sql
shasum -a 256 <PRIVATE_BACKUP_DIR>/prod-migration-history-pre.sql
```

If the history relation does not exist yet, record that fact instead; do not make a backup command
failure look like a successful empty history snapshot.

- [ ] Record row counts for every portal table before any write. Store results privately. At minimum:
      `clients`, `client_users`, `content_items`, `approvals`, `activity_log`, `comments`,
      `recommendations`, `links`, `report_snapshots`, `content_ideas`, and `portal_seen`.
- [ ] Rehearse recovery on a disposable project/branch or equivalent isolated restore target. Do not
      discover that the backup is unusable during an incident. Record the rehearsal target and result.
- [ ] Confirm no SQL-editor session, sync script, calendar worker, deployment, or other portal migration
      is running during the maintenance window.

Official references: Supabase's backup documentation distinguishes platform backups from logical
`db dump` exports, and the CLI reference confirms that a normal schema dump excludes managed schemas.

## Phase 2 — prove production is exactly post-`0005`

### 2.1 Migration-history inspection

```bash
npx supabase@2.109.1 migration list --linked
```

Expected: local `0001`–`0012` exist, while remote history does not claim `0001`–`0005`. If the remote
already contains any of these versions, or contains an unexpected portal migration, stop and explain
the discrepancy before changing history.

Also inspect in SQL. Run the second query only if the first returns a relation rather than `null`:

```sql
select pg_catalog.to_regclass('supabase_migrations.schema_migrations');

select version, name, statements
from supabase_migrations.schema_migrations
order by version;
```

Do not assume the table is empty merely because the original migrations were hand-pasted.

### 2.2 Explicit pre-`0006` boundary check

Run read-only catalog checks and save the result:

```sql
select
  pg_catalog.to_regclass('public.clients') is not null as has_clients,
  pg_catalog.to_regclass('public.client_users') is not null as has_client_users,
  pg_catalog.to_regclass('public.content_items') is not null as has_content_items,
  pg_catalog.to_regclass('public.approvals') is not null as has_approvals,
  pg_catalog.to_regclass('public.activity_log') is not null as has_activity,
  pg_catalog.to_regclass('public.comments') is not null as has_comments,
  pg_catalog.to_regclass('public.recommendations') is not null as has_recommendations,
  pg_catalog.to_regclass('public.links') is not null as has_links,
  pg_catalog.to_regclass('public.report_snapshots') is not null as has_reports,
  pg_catalog.to_regclass('public.content_ideas') is not null as has_ideas,
  pg_catalog.to_regclass('public.portal_seen') is not null as has_seen,
  pg_catalog.to_regclass('public.content_item_versions') is null as no_0006_versions,
  pg_catalog.to_regclass('public.content_schedule_targets') is null as no_0008_schedules,
  pg_catalog.to_regclass('public.publication_evidence') is null as no_0009_evidence,
  pg_catalog.to_regclass('public.calendar_integrations') is null as no_0010_calendar,
  pg_catalog.to_regclass('public.agency_actors') is null as no_0011_agency,
  pg_catalog.to_regclass('public.invoices') is null as no_0012_invoices;
```

Every result must be `true`. Then inspect `information_schema.columns`, `pg_constraint`,
`pg_policies`, `information_schema.role_table_grants`, `information_schema.column_privileges`, and
`pg_proc` for the exact post-`0005` objects. In particular, verify the current
`content_with_state` view definition and `security_invoker` setting, RLS on every client-readable
table, and the execute grants on `my_client_ids`, `record_content_decision`, `add_comment`, and
`touch_seen`.

### 2.3 Independent schema comparison

Build an expected post-`0005` database from the frozen pre-`0006` commit
`6cfe63f029e8b638f028ce116efa27f33a2860af` in an isolated worktree:

```bash
git worktree add --detach <PRIVATE_TMP_DIR>/thedot-post0005 \
  6cfe63f029e8b638f028ce116efa27f33a2860af
cd <PRIVATE_TMP_DIR>/thedot-post0005
npx supabase@2.109.1 start
npx supabase@2.109.1 db reset --local --no-seed
npx supabase@2.109.1 db dump --local --schema public \
  --file <PRIVATE_BACKUP_DIR>/expected-post0005-public-schema.sql
```

Compare that expected dump with `prod-public-schema-pre.sql`. Review owner/extension/platform noise
separately, but require zero unexplained difference in all portal-owned tables, columns, constraints,
indexes, views, functions, RLS policies, grants, and revokes. Do not accept a textual diff that hides
semantically different grants or view security properties. The explicit catalog inspection above is
part of this gate.

After recording the result, stop the disposable stack and remove the temporary worktree. Never remove
the private backup artifacts during the cutover window.

**Stop condition:** any unexplained schema or privilege drift, any `0006+` object already present, or
any remote migration-history surprise.

## Phase 3 — inspect and resolve the `0011` legacy-link blocker

Run this read-only preflight before history repair/application. It mirrors the exact reviewed host
boundary in `0011` and must return zero rows before `0011` can apply:

```sql
with normalized as (
  select l.id, l.client_id, l.category, l.label, l.url,
    pg_catalog.lower(pg_catalog.rtrim(pg_catalog.regexp_replace(
      pg_catalog.substring(l.url, '^https://([^/?#]+)'), ':[0-9]+$', ''), '.')) as host
  from public.links l
)
select id, client_id, category, label, url, host
from normalized n
where host is null
   or not exists (
     select 1
     from (values
       ('kanset.com'), ('canva.com'), ('drive.google.com'), ('docs.google.com'),
       ('youtube.com'), ('youtu.be'), ('instagram.com'), ('facebook.com'),
       ('linkedin.com'), ('www.thedotcreative.co')
     ) allowed(hostname)
     where n.host = allowed.hostname or n.host like '%.' || allowed.hostname
   );
```

Known likely result: the old synthetic Dropbox Library row.

For every returned row:

1. Save its full pre-change record in the private change log/dump.
2. Positively classify it as synthetic demo, real client-safe, or unknown.
3. If synthetic demo, delete that exact row by reviewed UUID inside a transaction and assert exactly
   one row changed. If real and needed, replace it only with a reviewed client-safe URL on an already
   approved host and record the provenance. If unknown, stop.
4. Do not add `dropbox.com` or any other host merely to make the migration pass.
5. Re-run the preflight and require zero rows.

The delete/update is a production write and needs the same explicit cutover approval as the migration.
Do not perform it during runbook review.

## Phase 4 — repair only the proven `0001`–`0005` history

Reconfirm the project ref, backups, frozen commit, catalog comparison, and zero legacy-link blockers.
Then, and only with explicit cutover approval:

```bash
npx supabase@2.109.1 migration repair 0001 0002 0003 0004 0005 \
  --status applied --linked
npx supabase@2.109.1 migration list --linked
npx supabase@2.109.1 db push --dry-run --linked
```

Required dry-run result: exactly these seven files, in this order:

1. `0006_versioned_content.sql`
2. `0007_release_quality.sql`
3. `0008_scheduling.sql`
4. `0009_publication_evidence.sql`
5. `0010_google_calendar_sync.sql`
6. `0011_agency_writes.sql`
7. `0012_invoices.sql`

If `0001`–`0005` would run, any expected file is missing, any extra file appears, or order differs,
stop. Save the dry-run transcript in the private change log.

History repair changes metadata only; it does not authorize schema application.

## Phase 5 — final pre-apply gate

- [ ] Frozen commit and twelve migration checksums still match Phase 0.
- [ ] Platform restore point plus private logical snapshots are recorded and verified.
- [ ] Post-`0005` catalog comparison is approved by a second reviewer.
- [ ] Legacy-link preflight returns zero rows.
- [ ] Fresh local `0001`–`0012` replay remains green.
- [ ] Representative `0001`–`0005` upgrade replay plus SQL assertion files remains green.
- [ ] Disposable two-tenant Auth/PostgREST suite remains green.
- [ ] Application/cron deployment is still off; no production content sync/import is running.
- [ ] Maintenance owner, observer, rollback decision-maker, and communication channel are named.
- [ ] Explicit Anastasia approval to apply the schema is recorded after all evidence above.

## Phase 6 — apply `0006`–`0012`

Run one last dry run and compare it byte-for-byte with the approved list. Then apply with the pinned
CLI. `db push` executes pending migrations in version order and records each successful version:

```bash
npx supabase@2.109.1 db push --dry-run --linked
npx supabase@2.109.1 db push --linked
```

Capture the full transcript. Do not retry blindly after a failure. Record the last migration shown as
applied, inspect `supabase_migrations.schema_migrations`, and diagnose from the actual database state.
Each migration is transaction-wrapped and contains its own assertions, but a later-file failure can
leave earlier files validly applied and recorded.

Immediately verify:

```bash
npx supabase@2.109.1 migration list --linked
npx supabase@2.109.1 db push --dry-run --linked
```

Required: remote history matches local `0001`–`0012`, and the final dry run reports the linked project
is up to date.

Run read-only production assertions:

```sql
select public.assert_portal_security();

select version, name
from supabase_migrations.schema_migrations
where version between '0001' and '0012'
order by version;

select
  pg_catalog.to_regclass('public.content_item_versions') is not null as slice1,
  pg_catalog.to_regclass('public.portal_primary_source_hosts') is not null as slice2,
  pg_catalog.to_regclass('public.content_schedule_targets') is not null as slice3,
  pg_catalog.to_regclass('public.publication_evidence') is not null as slice4,
  pg_catalog.to_regclass('public.calendar_integrations') is not null as slice5,
  pg_catalog.to_regclass('public.agency_actors') is not null as slice6,
  pg_catalog.to_regclass('public.invoices') is not null as slice7;
```

Also compare portal table row counts to the pre-apply snapshot and explain every expected change.
Do not run fixture seeders or `test:rls` in production.

## Phase 7 — production environment and external configuration

Set secrets through Vercel's protected production environment, never in Git, shell transcripts, or
the database. The calendar application must fail closed until all required values exist.

Required for Slice 5/calendar:

- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`: exactly 32 random bytes, base64-encoded. Back up this key in
  the approved secret manager; losing it makes stored refresh tokens undecryptable.
- `CRON_SECRET`: independent high-entropy bearer secret used by Vercel Cron.
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `PORTAL_PUBLIC_ORIGIN`: exact production HTTPS origin, no path.
- `GOOGLE_CALENDAR_CLIENT_READER_EMAIL`: Maria's exact Google account email for ACL health.

Existing required production values must also be confirmed, not replaced casually:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `ADMIN_JWT_SECRET` (at least 32 characters) and `ADMIN_PASSWORD_HASH`
- `NEXT_PUBLIC_SITE_URL`
- notification email/SMTP settings if comment or portal notifications are enabled.

Configuration checks:

- [ ] Google OAuth web-client redirect URI is exactly
      `<PORTAL_PUBLIC_ORIGIN>/api/admin/portal/calendar/oauth/callback`.
- [ ] `vercel.json` contains the reviewed hourly `/api/cron/portal-calendar` schedule.
- [ ] `CRON_SECRET` matches the bearer value Vercel sends to cron invocations.
- [ ] Preview/staging and production secrets are separate where appropriate.
- [ ] The calendar encryption key is backed up before any OAuth credential is stored.
- [ ] No Meta/YouTube provider secret is required for v1; publication confirmation is manual.

Follow `docs/portal-google-calendar-runbook.md` for the later OAuth/connect/reconciliation step. Do not
connect Google Calendar merely because the schema migration succeeded.

## Known scope boundary — `0012` is not the full-v1 launch gate

`0012` closes the current seven-slice schema/UI sequence. It does **not** make the repository complete
against the signed full-v1 contract in `Kanset/portal-integration-task.md`. A source search at runbook
draft time found no implementation for the following signed v1 requirements:

- database-enforced global/per-tenant launch and mutation switches checked inside every authenticated
  RPC and at the `[slug]` route boundary;
- the Client Work Assistant: released tenant-safe knowledge index, tenant-derived search, isolated
  portal/public-web modes, validated citations, case-specific/privacy refusals, usage/cost controls,
  prompt-injection tests, admin kill switch, and signed eval;
- client edit/create/archive request records and the v1 secure local `portal-inbox apply-*` canonical
  reconciliation path (`canonical_change_jobs` or its reviewed equivalent);
- the full capability model required by the plan for deciding, commenting, requests, schedules, and
  assistant spend, including the single-primary-decider invariant;
- client alerts and any remaining Notion projection consumer/reconciliation work required by the
  signed launch checklist (the database outbox exists, but a durable Notion consumer was not found).

These are launch blockers unless Anastasia explicitly amends the signed v1/v2 decision record. Do not
describe Slice 7 as “the last portal slice” without the qualifier “the last slice in the current
seven-slice sequence,” and do not deploy Maria into production merely because migrations `0006`–`0012`
are current. In particular, Phase 8's launch-switch step cannot run until that switch exists and its
direct-RPC disable assertions pass.

## Phase 8 — deploy, populate, and launch are separate gates

After schema and environment verification, require separate approvals for:

1. deploying the reviewed application commit;
2. smoke-testing admin/client login and client-safe empty states;
3. connecting the existing Kanset Social calendar and resolving every unmapped/conflicting event;
4. syncing newly authored private canonical content from `toodokie/kanset-portal-content`;
5. importing the reviewed historical publication batch;
6. creating invoice `0137` through the reviewed invoice RPC/tool, not direct SQL;
7. enabling the client launch feature switch and inviting Maria.

Before launch, run the final read-only/client-safe smoke checklist: wrong-tenant routes fail, unreleased
working copy remains unreadable, safe views expose exact columns, RPC writes remain unavailable to
`anon`/`authenticated` except the explicitly client-owned actions, billing omits notes/object keys,
calendar omits IDs/tokens/errors, and no demo content/link survives.

## Failure and rollback decisions

### History repair was wrong, but no schema file was applied

Only after identifying the mistake, revert the incorrect metadata entries:

```bash
npx supabase@2.109.1 migration repair 0001 0002 0003 0004 0005 \
  --status reverted --linked
npx supabase@2.109.1 migration list --linked
```

Do not modify portal tables to make a mistaken repair look true.

### A migration failed

- Stop application/content/calendar writes.
- Record the exact error and remote migration history.
- Do not re-run SQL fragments manually and do not mark a failed version `applied`.
- Because each migration is transaction-wrapped, verify whether that file rolled back and whether
  earlier files committed successfully.
- Prefer a reviewed forward fix when data is intact. Use platform restore/PITR only through an incident
  decision that accepts downtime and the documented data-loss window.

### Migration succeeded but application verification failed

- Keep launch/deployment off or roll back the application deployment only.
- Preserve the forward-compatible schema and investigate against the frozen commit.
- Do not down-migrate tables containing approvals, evidence, calendar credentials, publication history,
  communications, or invoices by hand.

### Restore is required

- Use the recorded Supabase backup/PITR point and the private logical/Git artifacts.
- Account for downtime and writes since the restore point.
- Remember that normal logical `db dump` artifacts do not replace managed Auth/Storage restoration.
- After restore, re-check migration history, secrets, Auth settings, Realtime/publications, OAuth state,
  cron configuration, and portal row counts before reopening traffic.

## Sign-off record

The private change log must contain: frozen commit; migration checksums; bundle checksum; backup/PITR
identifier and UTC time; logical dump checksums; catalog-diff result; legacy-link disposition; dry-run
transcript; reviewers; explicit approval; apply transcript; post-apply assertions; row-count comparison;
environment confirmation; and the separate deploy/populate/launch approvals.
