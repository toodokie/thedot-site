# Portal production migration-history repair runbook

**Purpose:** production received `0001`–`0005` through the Supabase SQL editor, so the schema exists but `supabase_migrations.schema_migrations` has no corresponding history. Repair the history without re-running those migrations. `0006` must remain pending until its separate cutover approval.

## Locked facts

- Supabase CLI 2.109.1 accepts the existing four-digit versions.
- With `[db.migrations].enabled = true`, a local `supabase db reset` applies and records `0001` through `0006` in order.
- Do not rename the migration files.
- `migration repair` changes migration-history metadata only. It is still a production write and requires Anastasia's explicit approval at execution time.

## Preconditions

- [ ] Take a current Supabase backup and record its identifier/time.
- [ ] Confirm no portal migration or SQL-editor session is running.
- [ ] Confirm production has `0001`–`0005` objects and does **not** yet have `public.content_item_versions` or the `0006` release-pointer columns.
- [ ] Compare the production catalog with the expected post-`0005` catalog. Resolve drift before recording history; never use repair to claim an unapplied schema exists.
- [ ] Link the CLI to the exact production project and print/confirm the project ref before every linked command.
- [ ] Record checksums of the six local migration files in the change ticket/log.

## Repair—do not run without explicit production approval

Preview the mismatch:

```bash
npx supabase@2.109.1 migration list --linked
```

Expected before repair: local versions `0001`–`0006`; no matching remote history.

After the catalog and backup gates pass, register only the five manually applied versions:

```bash
npx supabase@2.109.1 migration repair 0001 0002 0003 0004 0005 --status applied --linked
```

Verify:

```bash
npx supabase@2.109.1 migration list --linked
npx supabase@2.109.1 db push --dry-run --linked
```

Required result: `0001`–`0005` match locally/remotely and the dry run proposes **only** `0006_versioned_content.sql`. If anything else appears, stop; do not push.

## `0006` application gate

Repairing history does not authorize applying `0006`. Its separate gate requires:

- a restored production snapshot rehearsal;
- the migration's in-transaction catalog/security assertion;
- the two-tenant Auth/PostgREST suite against staging/disposable Supabase;
- a fresh backup immediately before production application;
- a reviewed rollback-by-feature-flag/application plan;
- explicit Anastasia approval.

## Repair rollback

If history was marked incorrectly but no schema migration was pushed, revert only the mistaken history entries:

```bash
npx supabase@2.109.1 migration repair 0001 0002 0003 0004 0005 --status reverted --linked
```

Then re-run `migration list --linked`. Do not modify portal tables to "match" a mistaken repair, and do not reverse a production schema migration that already contains client data.
