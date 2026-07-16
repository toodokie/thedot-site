# Client Portal — Plan 1 v2: Foundation + First Vertical Slice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Supersedes** `2026-07-15-portal-foundation.md` (v1). This v2 folds in the external (Codex) review. Do not execute v1.

**Goal:** Prove the whole portal spine end to end, correctly: a content file syncs into Supabase, Maria logs in with a magic link at `/client/kanset`, sees the pieces that need her, opens one, and approves or requests a change through a single transactional RPC, which records the decision and drops an event into a basic activity feed. A change-requested piece leaves her queue and reads as "back with The Dot."

**Architecture:** Repo/Supabase-first (`CLIENT-PORTAL-PLAN.md` section 15). Markdown files (frontmatter + body) are the source of truth; a sync upserts them into `content_items`. **`content_items.status` stays projected from the file. `approvals` owns the decision, keyed to the content version.** The client never mutates `content_items`. Writes go only through a `security definer` RPC; direct table writes are revoked. The portal is a `/client/[slug]` route tree coexisting with the site's admin auth (a `jose` cookie named `session`) by using a separate tree, Supabase's own cookies, a `[slug]`-layout guard, and Supabase session refresh in the existing middleware.

**Tech Stack:** Next.js 15 App Router + React 19 + TypeScript, plain CSS (brand tokens in `src/app/styles/globals.css`), `@supabase/supabase-js` + `@supabase/ssr`, `gray-matter`, OpenAI later (not in this slice), Vitest + @testing-library/react + Playwright. Alias `@/*`→`src/*`.

## What changed from v1 (the review fixes)
- Approval model: no `content_items.status` update by the client; `approvals` owns state + `content_version`; change_requested = "back with The Dot" (leaves the queue). Derived, never mutated.
- One transactional RPC `record_content_decision`; direct INSERT on `approvals` + `activity_log` revoked; composite `(id, client_id)` tenant FKs.
- `my_client_ids()` hardened (`security definer`, `search_path=''`, grants).
- Magic link uses **token_hash + verifyOtp** (robust for request-on-desktop / open-on-phone), `shouldCreateUser: false`.
- Guard in `src/app/client/[slug]/layout.tsx`; Supabase session refresh added to `src/middleware.ts` for `/client/*`; logout added.
- Readers fail loud (throw on error, not `[]`); `error.tsx` + `loading.tsx`; pass `clientId`.
- `client_body` separated from `internal_notes`; date normalization + CHECK constraints; sync loads env, validates, fails loud, reads the canonical Kanset content dir.
- CSP tightened (browser calls only); service-role key only where the sync runs.
- Committed-secret remediation: DONE and committed (`67405d2`); rotation is Anastasia's follow-up.

## Review-2 fixes (applied to this doc)
- **`internal_notes` never stored in Supabase** (dropped from `content_items`, not synced); view lists explicit columns; `source_path` column-revoked. Closes the Data-API exposure.
- **RPC activity is now idempotent**: the approval upsert is conditional (`where is distinct from`), and activity is inserted only when the decision actually changed. Exact retries / double-submits log nothing new.
- **`deriveClientState` reordered** so lifecycle status (posted/scheduled/approved/idea) wins before a stale decision.
- **Magic link uses a fixed `type=email`** (template + callback), not caller-controlled, not `{{ .Type }}`.
- **`getClientSession()` fails loud** on auth/db errors (returns null only for a genuine missing session).
- **Sync requires `PORTAL_CONTENT_DIR`** (no silent fixture fallback); seeds get a separate command.
- **Parser validates the date format** and treats client content as explicit (fail-closed).
- **`activity_log`** uses a single-column `content_id` FK `on delete set null` (keeps the audit trail) + a content_id/content_version pairing CHECK.
- **Middleware** preserves the canonical `Link` header; auth-cookie responses get `Cache-Control: no-store`. (The `setAll(list, headers)` signature is to be verified against the installed `@supabase/ssr`.)

---

## Prerequisites (manual, once — not code)

- [ ] **P1.** Create the Supabase project `thedot-portal` in the existing account (region near Toronto). Save the DB password.
- [ ] **P2.** Copy Project URL (`https://<ref>.supabase.co`), `anon` key, `service_role` key. Note `<ref>`.
- [ ] **P3.** Auth → URL Configuration: Site URL = your prod site; add to Redirect URLs: `http://localhost:3000/client/auth/callback`, `https://www.thedotcreative.co/client/auth/callback`, and (if used) the Vercel preview pattern.
- [ ] **P4.** Email template. **On the free plan, custom template editing is locked behind custom SMTP**, so Supabase sends its DEFAULT magic-link email (which uses `{{ .ConfirmationURL }}`, a same-device PKCE link). Two paths:
  - **Now (no SMTP): keep the default template.** The Task 7 callback handles the default `?code=` link via `exchangeCodeForSession`. Works when the link is requested and opened on the SAME device. Fine for testing.
  - **For cross-device (before go-live): set up custom SMTP** (Authentication → SMTP, e.g. a rotated Gmail app password or Resend), then set the Magic Link body to `<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Sign in</a>`. The same callback also handles this token_hash form, so no code change is needed to switch.
- [ ] **P5.** After the schema runs (Task 3), add Maria as a user (Auth → Users → Add user, Auto-Confirm) and insert her `client_users` row (SQL in Task 3, Step 4).

---

## File structure

```
thedot-site/
├── next.config.ts                          (EDIT: CSP connect-src for Supabase host)
├── src/middleware.ts                       (EDIT: Supabase session refresh for /client/*)
├── package.json                            (EDIT: deps + scripts)
├── vitest.config.ts, vitest.setup.ts       (CREATE)
├── playwright.config.ts                    (CREATE)
├── supabase/migrations/0001_portal.sql     (CREATE: schema + RLS + RPC + view + seed)
├── content/portal/                         (CREATE: seed fixtures — real content lives in the Kanset workspace; see Task 5)
│   ├── kanset-2026-07-oinp-employer.md
│   └── kanset-2026-07-lmia-reel.md
├── scripts/sync-content-to-supabase.ts     (CREATE)
└── src/
    ├── lib/
    │   ├── supabase/{server.ts,client.ts,middleware.ts}   (CREATE)
    │   ├── portal/{auth.ts,frontmatter.ts,frontmatter.test.ts,state.ts,state.test.ts,data.ts}  (CREATE)
    └── app/client/
        ├── login/page.tsx                  (CREATE)
        ├── auth/callback/route.ts          (CREATE)
        ├── logout/route.ts                 (CREATE)
        └── [slug]/
            ├── layout.tsx                  (CREATE: guard)
            ├── error.tsx, loading.tsx      (CREATE)
            ├── page.tsx                    (CREATE: overview + feed)
            ├── actions.ts                  (CREATE: decision server action → RPC)
            └── piece/[contentId]/page.tsx  (CREATE: detail + decide form)
```

---

### Task 1: Dependencies + test harness

- [ ] **Step 1: Install**
```bash
cd /Users/anastasiavolkova/thedot-site
npm install @supabase/supabase-js @supabase/ssr gray-matter
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react @playwright/test
```

> **Build note (applied 2026-07-15):** the workspace `packages/design-system` hoists **vite 5.4.21** (Storybook 8 + vitest 2) to the repo root. The versions above (`vitest@4` + `@vitejs/plugin-react@6`) need vite 8 and broke on a `vite/internal` import. Resolved by pinning **`vitest@^2.1.9` + `@vitejs/plugin-react@^4.7.0`** (compatible with the hoisted vite 5) instead of touching the design-system's Storybook toolchain. All installs used `--legacy-peer-deps`. Verified: portal smoke test, the design-system's own `tokens.test.ts`, and `next build` all pass.

- [ ] **Step 2: `package.json` scripts** — add:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test",
"sync-content": "tsx scripts/sync-content-to-supabase.ts",
"sync-content:fixtures": "PORTAL_CONTENT_DIR=content/portal tsx scripts/sync-content-to-supabase.ts"
```
- [ ] **Step 3: `vitest.config.ts`**
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'], globals: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```
- [ ] **Step 4: `vitest.setup.ts`** → `import '@testing-library/jest-dom/vitest'`
- [ ] **Step 5: `playwright.config.ts`**
```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true },
})
```
- [ ] **Step 6:** smoke test `src/lib/portal/smoke.test.ts` (`expect(1+1).toBe(2)`); run `npm test`; expect PASS; delete it.
- [ ] **Step 7: Commit** `chore(portal): supabase deps + vitest/playwright harness`

---

### Task 2: Env + CSP

- [ ] **Step 1:** Add to `.env.local` (values from P2): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Confirm `NEXT_PUBLIC_SITE_URL` is set (it already exists in the site; add it to the checklist).
- [ ] **Step 2:** Add `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` to **all** Vercel environments. Add `SUPABASE_SERVICE_ROLE_KEY` and `PORTAL_CONTENT_DIR` **only** to the environment(s) where `sync-content` runs (local + CI); runtime code never uses them, so they do not belong in the app's Vercel runtime env. Document under a new heading in `VERCEL_ENV_VARS.md` (names only).
- [ ] **Step 3:** In `next.config.ts` `async headers()` CSP, append to `connect-src` only: `https://<ref>.supabase.co wss://<ref>.supabase.co` (browser auth + future Realtime; server reads are not CSP-governed).
- [ ] **Step 4:** `npm run build` completes; `npx tsc --noEmit` shows no new errors.
- [ ] **Step 5: Commit** `feat(portal): supabase env + CSP host`

---

### Task 3: Schema + RLS + RPC + view + seed (SQL)

**File:** `supabase/migrations/0001_portal.sql`

> **Review-3 fixes (applied 2026-07-15, from the Codex pass on the written migration; the file is canonical, the SQL block below is the pre-review version kept for context):**
> 1. **Dropped the `activity_log.content_id` FK.** Its `on delete set null` nulled only `content_id` and left `content_version`, tripping the pairing CHECK and aborting any content delete (e.g. sync removing a stale item). The log is now append-only and keeps the historical content UUID; client deletion still cascades via `client_id`.
> 2. **Made all Data API grants explicit** (new Supabase projects no longer auto-grant table privileges since 2026-05-30). Explicit `revoke all` from `anon` + `authenticated`, then column-level `grant select` to `authenticated` on clients / client_users / content_items / approvals (the view's subquery columns) / activity_log / the view; minimum service-role grants (select on clients, CRUD on content_items). Without this the `security_invoker` view and the sync would silently break. A comment marks where to add `grant insert on activity_log to service_role` if a later task has the sync emit lifecycle events.
> 3. **Locked the content row** in `record_content_decision` (`select ... for update of ci`) so the membership + version guard is linearizable against a concurrent sync version bump.

- [ ] **Step 1: Write the migration**
```sql
-- === tables ===
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'client' check (role in ('client')),
  created_at timestamptz not null default now(),
  unique (client_id, auth_user_id)
);

create table content_items (
  id uuid primary key default gen_random_uuid(),
  content_id text unique not null,
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  format text,
  pillar text,
  platforms text[] not null default '{}',
  scheduled_date date,
  status text not null default 'draft' check (status in ('idea','draft','approved','scheduled','posted')),
  canva_url text,
  drive_url text,
  version int not null default 1 check (version > 0),
  fact_check text check (fact_check is null or fact_check in ('confirmed','needs-confirm','flagged')),
  client_body text,               -- the ONLY client-facing content; internal notes are NOT stored in Supabase
  source_path text,
  updated_at timestamptz not null default now(),
  unique (id, client_id)          -- enables composite tenant FKs
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  client_id uuid not null references clients(id) on delete cascade,
  content_version int not null check (content_version > 0),
  state text not null check (state in ('approved','change_requested')),
  note text,
  decided_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (content_id, client_id) references content_items(id, client_id) on delete cascade
);
-- idempotency: one decision per user per content per version
create unique index approvals_one_per_version on approvals (content_id, content_version, decided_by);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  content_id uuid,
  content_version int,
  event_type text not null check (event_type in
    ('needs_review','approved','change_requested','scheduled','posted',
     'recommendation_added','monthly_report_added','meeting_email_note_added','idea_captured')),
  title text not null,
  summary text,
  actor_type text not null check (actor_type in ('client','anastasia','agent')),
  actor_name text not null,
  related_url text,
  created_at timestamptz not null default now(),
  -- Audit log: keep the row if content is removed (null the link). Tenant integrity is
  -- guaranteed procedurally by the RPC (the only writer), so a single-column FK suffices here.
  foreign key (content_id) references content_items(id) on delete set null,
  check ((content_id is null and content_version is null)
      or (content_id is not null and content_version is not null))
);

-- === tenant helper (hardened) ===
create or replace function public.my_client_ids() returns setof uuid
  language sql stable security definer set search_path = '' as $$
  select cu.client_id from public.client_users cu where cu.auth_user_id = (select auth.uid())
$$;
revoke execute on function public.my_client_ids() from public, anon;
grant execute on function public.my_client_ids() to authenticated;

-- === derived read view (respects caller RLS) ===
create view public.content_with_state with (security_invoker = true) as
select ci.id, ci.content_id, ci.client_id, ci.title, ci.format, ci.pillar, ci.platforms,
  ci.status, ci.scheduled_date, ci.canva_url, ci.drive_url, ci.version, ci.fact_check,
  ci.client_body, ci.updated_at,
  (select a.state from public.approvals a
     where a.content_id = ci.id and a.content_version = ci.version
     order by a.created_at desc limit 1) as current_decision
from public.content_items ci;
-- Explicit columns only: no internal_notes (dropped) and no source_path reach the client.

-- === decision RPC (the ONLY writer for approvals + activity) ===
create or replace function public.record_content_decision(
  p_content_id uuid, p_content_version int, p_decision text, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_client_id uuid;
  v_title text;
  v_actor text;
  v_approval uuid;
begin
  if p_decision not in ('approved','change_requested') then
    raise exception 'invalid decision: %', p_decision;
  end if;
  -- content must belong to a client the caller is a member of
  select ci.client_id, ci.title into v_client_id, v_title
  from public.content_items ci
  join public.client_users cu on cu.client_id = ci.client_id and cu.auth_user_id = v_uid
  where ci.id = p_content_id limit 1;
  if v_client_id is null then raise exception 'not authorized for this content'; end if;
  -- version guard: only decide on the current version
  if not exists (select 1 from public.content_items where id = p_content_id and version = p_content_version) then
    raise exception 'stale content version';
  end if;

  select coalesce(cu.name, cu.email) into v_actor
  from public.client_users cu where cu.auth_user_id = v_uid and cu.client_id = v_client_id limit 1;

  v_approval := null;
  insert into public.approvals (content_id, client_id, content_version, state, note, decided_by)
  values (p_content_id, v_client_id, p_content_version, p_decision, p_note, v_uid)
  on conflict (content_id, content_version, decided_by)
  do update set state = excluded.state, note = excluded.note, created_at = pg_catalog.now()
    where (public.approvals.state, public.approvals.note)
          is distinct from (excluded.state, excluded.note)
  returning id into v_approval;

  if v_approval is null then
    -- exact retry / no change: return the existing decision, log NO new activity
    select a.id into v_approval from public.approvals a
    where a.content_id = p_content_id and a.content_version = p_content_version and a.decided_by = v_uid;
    return v_approval;
  end if;

  insert into public.activity_log (client_id, content_id, content_version, event_type, title, summary, actor_type, actor_name)
  values (v_client_id, p_content_id, p_content_version, p_decision,
    case when p_decision = 'approved' then 'Approved: ' else 'Change requested: ' end || v_title,
    p_note, 'client', coalesce(v_actor, 'Client'));

  return v_approval;
end;
$$;
revoke all on function public.record_content_decision(uuid,int,text,text) from public, anon;
grant execute on function public.record_content_decision(uuid,int,text,text) to authenticated;

-- === RLS: reads only; all writes go through the RPC / service role ===
alter table clients enable row level security;
alter table client_users enable row level security;
alter table content_items enable row level security;
alter table approvals enable row level security;
alter table activity_log enable row level security;

create policy client_read on clients for select using (id in (select public.my_client_ids()));
create policy cu_read on client_users for select using (auth_user_id = (select auth.uid()));
create policy ci_read on content_items for select using (client_id in (select public.my_client_ids()));
create policy appr_read on approvals for select using (client_id in (select public.my_client_ids()));
create policy act_read on activity_log for select using (client_id in (select public.my_client_ids()));

-- Revoke direct writes; the security-definer RPC (and service-role sync) are the only writers.
revoke insert, update, delete on approvals from authenticated, anon;
revoke insert, update, delete on activity_log from authenticated, anon;
revoke insert, update, delete on content_items from authenticated, anon;

-- Column-level: keep source_path off the Data API (internal_notes no longer exists at all).
revoke select on content_items from authenticated, anon;
grant select (id, content_id, client_id, title, format, pillar, platforms, status,
  scheduled_date, canva_url, drive_url, version, fact_check, client_body, updated_at)
  on content_items to authenticated;
revoke all on content_with_state from anon;
grant select on content_with_state to authenticated;

-- === seed ===
insert into clients (name, slug) values ('Kanset Services Inc.', 'kanset');
```

- [ ] **Step 2:** Run it in Supabase → SQL Editor. Expect success; verify tables + `content_with_state` view exist.
- [ ] **Step 3:** Two-tenant RLS smoke test (SQL Editor, run as a check). Create a throwaway second client + membership, confirm `select * from content_with_state` as one user never returns the other's rows. (Delete the throwaway after.)
- [ ] **Step 4:** Add Maria (Auth → Users → Add user, Auto-Confirm), then:
```sql
insert into client_users (client_id, auth_user_id, email, name, role)
select c.id, u.id, u.email, 'Maria Guerts', 'client'
from clients c, auth.users u where c.slug = 'kanset' and u.email = '<maria-email>';
```
- [ ] **Step 5: Commit** `feat(portal): schema, RLS, decision RPC, derived view, seed`

---

### Task 4: Supabase clients + middleware refresh + portal guard

> **Review-4 fixes (applied 2026-07-15, from the Codex pass on Task 4):**
> 1. **`getClientSession(clientSlug)` is now slug-specific** (`clients!inner(slug)` + `.eq('clients.slug', slug)`, `.limit(1)` removed). The schema allows a user to belong to multiple clients (e.g. Anastasia's own account), so the old arbitrary `.limit(1)` could resolve the wrong client. **Downstream: Task 7's `[slug]` layout guard and every action must call `getClientSession(slug)`.**
> 2. **Logged-out is handled, not thrown.** `getUser()` returns `AuthSessionMissingError` when there is no session; auth.ts returns null for that case (via `isAuthSessionMissingError` from `@supabase/auth-js`) and throws `PortalAuthError` only on real auth/network failures.
> 3. **`createSupabaseServer({ writable })`.** Read-only by default (safe in Server Components); **Task 7's auth callback + logout handlers must pass `{ writable: true }`** so a real cookie-write failure surfaces instead of being swallowed.
> 4. **Middleware:** `/client` boundary tightened to `pathname === '/client' || startsWith('/client/')` (was `startsWith('/client')`, which also matched `/clientele`, `/clients`); the prod HTTPS 301 now preserves the query string (pre-existing drop, matched to the www redirect).

- [ ] **Step 1: `src/lib/supabase/server.ts`**
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(list) { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    } }
  )
}
```
- [ ] **Step 2: `src/lib/supabase/client.ts`**
```ts
import { createBrowserClient } from '@supabase/ssr'
export function createSupabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}
```
- [ ] **Step 3: `src/lib/supabase/middleware.ts`** (refresh helper the middleware calls for `/client/*`)
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
export async function refreshPortalSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    } }
  )
  await supabase.auth.getUser()   // triggers refresh + cookie writes
  return response
}
```
- [ ] **Step 4: EDIT `src/middleware.ts`.** Read it first. Preserve the existing bot-block (403), the empty-UA block, and the www/HTTPS canonical redirects exactly and in that order. Then, AFTER those checks (do NOT early-return, which would drop the existing canonical `Link` header), compute the response and re-apply the canonical header:
```ts
const { pathname } = request.nextUrl
const response = pathname.startsWith('/client')
  ? await refreshPortalSession(request)   // from '@/lib/supabase/middleware'
  : NextResponse.next()
response.headers.set('Link', `<https://www.thedotcreative.co${pathname}>; rel="canonical"`) // match the existing header
return response
```
  Keep the matcher's `/api` exclusion; stays `middleware.ts` (Next 15). VERIFY before coding: does the installed `@supabase/ssr` pass a second `headers` arg to `setAll`? If yes, copy those headers onto the response; if not, rely on the `Cache-Control: no-store` set on the Task 7 auth Route Handlers.
- [ ] **Step 5: `src/lib/portal/auth.ts`**
```ts
import { createSupabaseServer } from '@/lib/supabase/server'
export class PortalAuthError extends Error {}
export type ClientSession = { userId: string; email: string; name: string | null; clientId: string; clientSlug: string }
export async function getClientSession(): Promise<ClientSession | null> {
  const supabase = await createSupabaseServer()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw new PortalAuthError(authError.message)   // an outage is NOT "logged out"
  if (!user) return null
  const { data, error } = await supabase
    .from('client_users').select('name, email, client_id, clients ( slug )')
    .eq('auth_user_id', user.id).limit(1).maybeSingle()
  if (error) throw new PortalAuthError(error.message)
  if (!data) return null
  const clients = data.clients as unknown as { slug: string } | null
  if (!clients) return null
  return { userId: user.id, email: data.email, name: data.name, clientId: data.client_id, clientSlug: clients.slug }
}
```
- [ ] **Step 6: Commit** `feat(portal): supabase clients, middleware refresh, client session guard`

---

### Task 5: Frontmatter parser (TDD) + sync + seed

> **Review-5 fixes (applied 2026-07-16, from the Codex pass on Task 5):**
> 1. **Internal-notes leak closed (must-fix).** `parseContentFile` now requires EXACTLY ONE `<!-- internal -->` marker per file. A missing or misspelled marker used to dump the whole body (internal text included) into `client_body`, which the sync uploads. Note-less files must still end with an empty marker. Also rejects >1 marker (which previously silently discarded trailing text).
> 2. **Silent date rollover closed (must-fix).** `scheduled_date` must be a quoted `"YYYY-MM-DD"` string; unquoted YAML dates parse to a JS `Date` and roll invalid components over (2026-02-31 to Mar 3) without error. `ymd()` rejects non-strings and validates a real calendar date. **Fixtures now quote the date.**
> 3. **Duplicate `content_id` guard (must-fix).** The sync pre-parses ALL files and throws on a duplicate `content_id` before any DB write (prevents last-writer-wins and cross-tenant reassignment).
> 4. **Strict frontmatter typing.** No truthiness coercion: `content_id: []` no longer becomes `""`, `platforms: instagram` no longer becomes `[]`, `version: 0` no longer defaults to 1, `status: false` no longer defaults to draft. Bad values throw.
> 5. **Atomic sync.** One array `upsert` (single statement) instead of a per-file loop, so a mid-run failure cannot leave a partially updated read-model.
> 6. **Documented deferrals:** deletion reconciliation (upsert-only; removing a source file does not delete its row) and the flat/lowercase/trusted-directory assumption are noted in the sync script.
> Tests hardened accordingly (7 tests: added missing-marker, double-marker, unquoted-date, and impossible-date cases).

- [ ] **Step 1: Failing test `src/lib/portal/frontmatter.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { parseContentFile } from './frontmatter'
const sample = `---
content_id: kanset-2026-07-oinp-employer
client: kanset
title: "OINP employer job offer carousel"
format: carousel
pillar: employer
platforms: [instagram, facebook]
scheduled_date: 2026-07-16
status: draft
version: 3
fact_check: confirmed
---
Client caption here.

<!-- internal -->
Internal note: verify revenue tiers before posting.`
describe('parseContentFile', () => {
  it('parses fields, normalizes the date to YYYY-MM-DD, splits client vs internal body', () => {
    const r = parseContentFile(sample, 'content/portal/x.md')
    expect(r.content_id).toBe('kanset-2026-07-oinp-employer')
    expect(r.platforms).toEqual(['instagram', 'facebook'])
    expect(r.scheduled_date).toBe('2026-07-16')      // string, not a Date object
    expect(r.version).toBe(3)
    expect(r.client_body.trim()).toBe('Client caption here.')
    expect(r.internal_notes?.includes('verify revenue tiers')).toBe(true)
  })
  it('rejects a bad status enum', () => {
    expect(() => parseContentFile('---\ncontent_id: a\nclient: kanset\ntitle: x\nstatus: bogus\n---\nb', 'p.md')).toThrow(/status/)
  })
  it('throws on missing content_id', () => {
    expect(() => parseContentFile('---\ntitle: x\n---\nb', 'p.md')).toThrow(/content_id/)
  })
})
```
- [ ] **Step 2:** run `npx vitest run src/lib/portal/frontmatter.test.ts` → FAIL.
- [ ] **Step 3: `src/lib/portal/frontmatter.ts`**
```ts
import matter from 'gray-matter'
const STATUS = ['idea','draft','approved','scheduled','posted']
const FACT = ['confirmed','needs-confirm','flagged']
export type ParsedContent = {
  content_id: string; client: string; title: string
  format: string | null; pillar: string | null; platforms: string[]
  scheduled_date: string | null; status: string
  canva_url: string | null; drive_url: string | null
  version: number; fact_check: string | null
  client_body: string; internal_notes: string | null; source_path: string
}
function ymd(v: unknown, sourcePath: string): string | null {
  if (!v) return null
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Bad scheduled_date "${s}" in ${sourcePath}`)
  return s
}
export function parseContentFile(raw: string, sourcePath: string): ParsedContent {
  const { data, content } = matter(raw)
  for (const k of ['content_id','client','title'] as const)
    if (!data[k]) throw new Error(`Missing ${k} in ${sourcePath}`)
  const status = data.status ? String(data.status) : 'draft'
  if (!STATUS.includes(status)) throw new Error(`Bad status "${status}" in ${sourcePath}`)
  if (data.fact_check && !FACT.includes(String(data.fact_check)))
    throw new Error(`Bad fact_check in ${sourcePath}`)
  const version = data.version ? Number(data.version) : 1
  if (!Number.isInteger(version) || version < 1) throw new Error(`Bad version in ${sourcePath}`)
  // Split client-facing body from an internal notes section.
  const marker = /<!--\s*internal\s*-->/i
  const [clientBody, internal] = marker.test(content) ? content.split(marker) : [content, '']
  return {
    content_id: String(data.content_id), client: String(data.client), title: String(data.title),
    format: data.format ? String(data.format) : null,
    pillar: data.pillar ? String(data.pillar) : null,
    platforms: Array.isArray(data.platforms) ? data.platforms.map(String) : [],
    scheduled_date: ymd(data.scheduled_date, sourcePath), status,
    canva_url: data.canva_url ? String(data.canva_url) : null,
    drive_url: data.drive_url ? String(data.drive_url) : null,
    version, fact_check: data.fact_check ? String(data.fact_check) : null,
    client_body: clientBody, internal_notes: internal.trim() ? internal.trim() : null, source_path: sourcePath,
  }
}
```
- [ ] **Step 4:** run the test → PASS.
- [ ] **Step 5: Seed fixtures.** `content/portal/kanset-2026-07-oinp-employer.md` and `content/portal/kanset-2026-07-lmia-reel.md`, each with the frontmatter above (distinct `content_id`/`title`; one carousel, one reel; include an `<!-- internal -->` note in at least one). These are seeds; **the canonical content directory in production is the Kanset workspace** (see Step 6 env).
- [ ] **Step 6: `scripts/sync-content-to-supabase.ts`**
```ts
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseContentFile } from '../src/lib/portal/frontmatter'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const dir = process.env.PORTAL_CONTENT_DIR   // REQUIRED (Kanset workspace in prod; content/portal for fixtures)
if (!url || !key) { throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY') }
if (!dir) { throw new Error('Missing PORTAL_CONTENT_DIR (no silent fallback; use npm run sync-content:fixtures for seeds)') }

async function main() {
  const supabase = createClient(url!, key!, { auth: { persistSession: false } })
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  if (files.length === 0) throw new Error(`No .md files in ${dir}`)
  for (const file of files) {
    const p = parseContentFile(readFileSync(join(dir, file), 'utf8'), join(dir, file))
    const { data: client, error: cErr } = await supabase.from('clients').select('id').eq('slug', p.client).single()
    if (cErr || !client) throw new Error(`No client "${p.client}" for ${file}: ${cErr?.message ?? 'not found'}`)
    const { error } = await supabase.from('content_items').upsert({
      content_id: p.content_id, client_id: client.id, title: p.title, format: p.format, pillar: p.pillar,
      platforms: p.platforms, scheduled_date: p.scheduled_date, status: p.status, canva_url: p.canva_url,
      drive_url: p.drive_url, version: p.version, fact_check: p.fact_check,
      client_body: p.client_body, source_path: p.source_path,   // internal_notes deliberately NOT stored
      updated_at: new Date().toISOString(),
    }, { onConflict: 'content_id' })
    if (error) throw new Error(`Upsert failed for ${p.content_id}: ${error.message}`)
    console.log(`Synced ${p.content_id}`)
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
```
- [ ] **Step 7:** run `npm run sync-content:fixtures`; expect both `Synced ...` lines; verify two `content_items` rows (`client_body` set; there is no `internal_notes` column). A missing env, missing `PORTAL_CONTENT_DIR`, or missing client now throws (no silent skip).
- [ ] **Step 8: Commit** `feat(portal): frontmatter parser (TDD) + fail-loud sync + seeds`

---

### Task 6: State derivation (TDD) + readers (fail-loud)

> **Review-6 fixes (applied 2026-07-16, from the Codex pass on Task 6):**
> 1. **Open change requests no longer hidden (must-fix).** `deriveClientState` returns `with_dot` FIRST whenever `currentDecision === 'change_requested'`, before any lifecycle check. `content_with_state` only surfaces the current-version decision, so a live change request is never stale, and it previously got masked by `approved`/`scheduled`/`posted`/`idea` (e.g. `approved` + `change_requested` wrongly showed "approved").
> 2. **Fail loud on unknown status.** Narrowed the param types (`ContentStatus`, `CurrentDecision`); `deriveClientState` now throws on an unrecognized status instead of silently returning `needs_review`. Tests grew to 7 (added a change_requested case covering all 4 lifecycle statuses + the unknown-status throw).
> 3. **Deterministic ordering** in `data.ts`: `getContent` adds explicit `nullsFirst: false` + a `content_id` tiebreaker; `getActivity` adds an `id` tiebreaker on equal `created_at`.
> **Declined:** Codex also suggested locking the decision RPC to `status = 'draft'`. Kept open so a client can request a change late (e.g. before a scheduled post goes out); fix #1 surfaces that correctly as "with_dot" rather than hiding it.

- [ ] **Step 1: Failing test `src/lib/portal/state.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { deriveClientState } from './state'
describe('deriveClientState', () => {
  it('needs_review: draft with no decision on current version', () => {
    expect(deriveClientState('draft', null)).toBe('needs_review')
  })
  it('with_dot: change requested leaves her queue', () => {
    expect(deriveClientState('draft', 'change_requested')).toBe('with_dot')
  })
  it('approved when the current version is approved', () => {
    expect(deriveClientState('draft', 'approved')).toBe('approved')
  })
  it('scheduled / live follow file status when no pending decision', () => {
    expect(deriveClientState('scheduled', null)).toBe('scheduled')
    expect(deriveClientState('posted', null)).toBe('live')
  })
  it('lifecycle status wins over a stale approval', () => {
    expect(deriveClientState('scheduled', 'approved')).toBe('scheduled')
    expect(deriveClientState('posted', 'approved')).toBe('live')
  })
})
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: `src/lib/portal/state.ts`**
```ts
export type ClientState = 'needs_review' | 'with_dot' | 'approved' | 'scheduled' | 'live' | 'idea'
export function deriveClientState(status: string, currentDecision: string | null): ClientState {
  // Lifecycle/publication status wins over a stale decision on an old version.
  if (status === 'posted') return 'live'
  if (status === 'scheduled') return 'scheduled'
  if (status === 'approved') return 'approved'
  if (status === 'idea') return 'idea'
  // Otherwise (draft): the decision on the current version decides.
  if (currentDecision === 'approved') return 'approved'
  if (currentDecision === 'change_requested') return 'with_dot'
  return 'needs_review'
}
```
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: `src/lib/portal/data.ts`** (readers throw on error; pass clientId explicitly)
```ts
import { createSupabaseServer } from '@/lib/supabase/server'
import { deriveClientState, type ClientState } from './state'

export class PortalDataError extends Error {}

export type ContentRow = {
  id: string; content_id: string; title: string; format: string | null; pillar: string | null
  platforms: string[]; status: string; scheduled_date: string | null; canva_url: string | null
  client_body: string | null; fact_check: string | null; version: number; current_decision: string | null
  state: ClientState
}
export type ActivityRow = {
  id: string; event_type: string; title: string; summary: string | null
  actor_type: string; actor_name: string; created_at: string
}

const SELECT = 'id, content_id, title, format, pillar, platforms, status, scheduled_date, canva_url, client_body, fact_check, version, current_decision'

export async function getContent(clientId: string): Promise<ContentRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_with_state').select(SELECT)
    .eq('client_id', clientId).order('scheduled_date', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []).map((r: any) => ({ ...r, state: deriveClientState(r.status, r.current_decision) }))
}
export async function getContentItem(clientId: string, contentId: string): Promise<ContentRow | null> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_with_state').select(SELECT)
    .eq('client_id', clientId).eq('content_id', contentId).maybeSingle()
  if (error) throw new PortalDataError(error.message)
  if (!data) return null
  return { ...(data as any), state: deriveClientState((data as any).status, (data as any).current_decision) }
}
export async function getActivity(clientId: string): Promise<ActivityRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('activity_log').select('id, event_type, title, summary, actor_type, actor_name, created_at')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(30)
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as ActivityRow[]
}
```
- [ ] **Step 6: Commit** `feat(portal): state derivation (TDD) + fail-loud readers`

---

### Task 7: Auth pages (token_hash), logout, guard layout, error/loading

> **Review-7 fixes (applied 2026-07-16, from the Codex pass on Task 7):**
> 1. **Open redirect closed (must-fix).** The callback built its redirect as `${origin}${next}`; `next=@evil.com` (or `%40evil.com`) yields `https://host@evil.com`, real origin evil.com. Added `safeNext()` in `src/lib/portal/redirect.ts` (accepts only a decoded, single-slash, same-origin `/client` path, else falls back), with unit tests `redirect.test.ts` (@evil.com, //evil.com, /\evil.com, absolute URLs, non-portal path, valid paths).
> 2. **Logout redirect status (must-fix).** POST logout returned Next's default 307, so the browser re-POSTed to the GET-only login route (405). Now returns 303 (See Other -> GET), `signOut({ scope: 'local' })`, and 502 JSON on a signOut error.
> 3. **Enumeration hardening.** The login page now shows the same "check your email" state after every Auth response (was success-vs-error observable). Callback URL built with `new URL('/client/auth/callback', base)` to avoid a double slash. (Network-level enumeration still needs rate limits / CAPTCHA, out of scope.)
> **Deferred (pre-multi-client, documented in code):** (a) the guard conflates logged-out and authenticated-but-forbidden (both redirect to login), fine while Kanset is the only client; before client #2, distinguish via a discriminated `getClientSession` result (logged out -> login, forbidden -> notFound). (b) the hardcoded `/client/kanset` landing fallback. (c) surfacing `?error=auth` on the login page.

- [ ] **Step 1: `src/app/client/auth/callback/route.ts`** (verify the token hash → session cookie)
```ts
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')            // default template (PKCE, same-device)
  const tokenHash = searchParams.get('token_hash') // custom token_hash template (cross-device, needs SMTP)
  const next = searchParams.get('next') ?? '/client/kanset'
  const noStore = { headers: { 'Cache-Control': 'private, no-store' } }
  const supabase = await createSupabaseServer()
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`, noStore)
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' }) // fixed type
    if (!error) return NextResponse.redirect(`${origin}${next}`, noStore)
  }
  return NextResponse.redirect(`${origin}/client/login?error=auth`, noStore)
}
```
- [ ] **Step 2: `src/app/client/login/page.tsx`** (`'use client'`; invite-only; brand tokens)
```tsx
'use client'
import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase/client'
export default function ClientLogin() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState('')
  async function send(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const supabase = createSupabaseBrowser()
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: `${base}/client/auth/callback` },
    })
    if (error) setErr('Could not send a link to that address.'); else setSent(true)
  }
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--background)',
      color: 'var(--foreground)', fontFamily: "'futura-pt', Arial, sans-serif", padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ fontWeight: 300, fontSize: 34, marginBottom: 8 }}>Your workspace</h1>
        {sent ? <p style={{ color: 'var(--dim-grey)' }}>Check your email for a one-tap sign-in link.</p> : (
          <form onSubmit={send}>
            <p style={{ color: 'var(--dim-grey)', marginBottom: 20 }}>Enter your email and we will send a sign-in link.</p>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
              style={{ width: '100%', padding: '14px 16px', fontSize: 16, borderRadius: 6, border: '1px solid #ccc', background: '#fff', marginBottom: 14 }} />
            {err && <p style={{ color: '#742a2a', marginBottom: 12 }}>{err}</p>}
            <button type="submit" style={{ width: '100%', padding: '14px 16px', fontSize: 15, borderRadius: 999,
              border: 'none', background: 'var(--foreground)', color: 'var(--background)', cursor: 'pointer' }}>Send me a link</button>
          </form>
        )}
      </div>
    </main>
  )
}
```
- [ ] **Step 3: `src/app/client/logout/route.ts`**
```ts
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
export async function POST(request: Request) {
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut()
  return NextResponse.redirect(`${new URL(request.url).origin}/client/login`, { headers: { 'Cache-Control': 'private, no-store' } })
}
```
- [ ] **Step 4: `src/app/client/[slug]/layout.tsx`** (the guard; `params.slug` is supported here)
```tsx
import { redirect, notFound } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
export default async function ClientWorkspaceLayout(
  { children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const session = await getClientSession()
  if (!session) redirect('/client/login')
  if (session.clientSlug !== slug) notFound()
  return <>{children}</>
}
```
> Login + callback live at `/client/login` and `/client/auth/*`, outside `[slug]`, so they are not gated. Do not add a `/client/layout.tsx` guard (that reintroduces the redirect loop). `ConditionalHeader` already renders `/client/*` header-less, so no `margin-top` hack is needed.
- [ ] **Step 5: `src/app/client/[slug]/error.tsx`** (`'use client'`)
```tsx
'use client'
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', fontFamily: "'futura-pt', Arial, sans-serif", color: 'var(--foreground)' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18 }}>Something went wrong loading your workspace.</p>
        <button onClick={reset} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 999, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>Try again</button>
      </div>
    </main>
  )
}
```
- [ ] **Step 6: `src/app/client/[slug]/loading.tsx`**
```tsx
export default function PortalLoading() {
  return <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'var(--dim-grey)', fontFamily: "'futura-pt', Arial, sans-serif" }}>Loading…</main>
}
```
- [ ] **Step 7: Manual auth verification** (do this AFTER Task 8's page exists — see Task 8 Step 3): request a link as Maria on desktop, open on phone; lands on `/client/kanset`; logged-out visit to `/client/kanset` redirects to login; an unknown email does not create a user.
- [ ] **Step 8: Commit** `feat(portal): token-hash magic link, logout, slug-guard layout, error/loading`

---

### Task 8: Overview + activity feed

> **Review-8 fixes (applied 2026-07-16, from the Codex pass on Task 8; no security/XSS/tenant issues found):**
> 1. **Parent error/loading boundaries** (`src/app/client/error.tsx` + `loading.tsx`): a segment's own `error.tsx` does NOT catch errors thrown by that segment's layout, so a Supabase outage in the `[slug]` layout guard bypassed the `[slug]` boundary. Added parent-level boundaries above `[slug]`.
> 2. **Responsive layout** via `overview.module.css` (inline styles cannot do media queries): the `1.5fr 1fr` grid now collapses to one column and the wrap padding shrinks under 720px.
> 3. **Contrast + hit area**: replaced `--dim-grey` (#888, ~3.5:1, fails AA for the 11-14px text) with a portal `MUTED` (#68665f, >5:1); enlarged the sign-out button hit area.
> 4. **Request-deduped session**: `getClientSession` wrapped in React `cache()`, so the layout guard and the page share one `getUser()` + membership lookup per request.
> 5. Nice-to-haves: `encodeURIComponent` on the piece href; activity rendered as a `<ul>` with `<time dateTime>`; empty-metadata `<div>` no longer rendered. (Logout 303 was already fixed in Task 7; the hardcoded Kanset eyebrow is the tracked single-client debt.)

- [ ] **Step 1: `src/app/client/[slug]/page.tsx`**
```tsx
import Link from 'next/link'
import { getClientSession } from '@/lib/portal/auth'
import { redirect } from 'next/navigation'
import { getContent, getActivity } from '@/lib/portal/data'

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession()
  if (!session || session.clientSlug !== slug) redirect('/client/login')

  const [items, activity] = await Promise.all([getContent(session.clientId), getActivity(session.clientId)])
  const needs = items.filter((i) => i.state === 'needs_review')
  const withDot = items.filter((i) => i.state === 'with_dot')
  const scheduled = items.filter((i) => i.state === 'scheduled')

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: '40px 32px', fontFamily: "'futura-pt', Arial, sans-serif", color: 'var(--foreground)' }
  return (
    <main style={{ background: 'var(--background)', minHeight: '100vh' }}>
      <div style={wrap}>
        <p style={{ letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 11, color: 'var(--dim-grey)' }}>Kanset · workspace</p>
        <h1 style={{ fontWeight: 300, fontSize: 'clamp(2.2rem,5vw,3.2rem)', margin: '8px 0 4px' }}>
          Good day{session.name ? `, ${session.name.split(' ')[0]}` : ''}.
        </h1>
        <p style={{ color: 'var(--dim-grey)', fontSize: 18, marginBottom: 36 }}>
          <b style={{ color: 'var(--foreground)', fontWeight: 500 }}>{needs.length}</b> waiting for you.
        </p>
        <section style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 28, alignItems: 'start' }}>
          <div>
            <h2 style={{ fontWeight: 300, fontSize: 24, marginBottom: 16 }}>Needs your approval</h2>
            {needs.length === 0 && <p style={{ color: 'var(--dim-grey)' }}>Nothing right now.</p>}
            {needs.map((it) => (
              <Link key={it.id} href={`/client/${slug}/piece/${it.content_id}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit', border: '1px solid #e8e5db', borderRadius: 10, padding: 18, marginBottom: 14, background: '#fff' }}>
                <div style={{ fontWeight: 400, fontSize: 18 }}>{it.title}</div>
                <div style={{ color: 'var(--dim-grey)', fontSize: 13, marginTop: 6 }}>
                  {(it.platforms || []).join(' · ')}{it.fact_check ? ` · ${it.fact_check}` : ''}
                </div>
              </Link>
            ))}
            {withDot.length > 0 && (
              <>
                <h3 style={{ fontWeight: 300, fontSize: 18, margin: '24px 0 12px', color: 'var(--dim-grey)' }}>Back with The Dot</h3>
                {withDot.map((it) => (
                  <div key={it.id} style={{ border: '1px dashed #dcd8cc', borderRadius: 10, padding: 14, marginBottom: 10, color: 'var(--dim-grey)' }}>
                    {it.title} <span style={{ fontSize: 13 }}>— we are revising this</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <aside style={{ border: '1px solid #e8e5db', borderRadius: 10, padding: 20, background: '#fff' }}>
            <h2 style={{ fontWeight: 300, fontSize: 20, marginBottom: 12 }}>Activity</h2>
            {activity.length === 0 && <p style={{ color: 'var(--dim-grey)', fontSize: 14 }}>No activity yet.</p>}
            {activity.map((a) => (
              <div key={a.id} style={{ padding: '10px 0', borderTop: '1px solid #eee', fontSize: 14 }}>
                <div><b style={{ fontWeight: 500 }}>{a.actor_name}</b> · {a.title}</div>
                {a.summary && <div style={{ color: 'var(--dim-grey)' }}>{a.summary}</div>}
              </div>
            ))}
          </aside>
        </section>
        <form action="/client/logout" method="post" style={{ marginTop: 32 }}>
          <button type="submit" style={{ background: 'none', border: 'none', color: 'var(--dim-grey)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Sign out</button>
        </form>
      </div>
    </main>
  )
}
```
> Remove the stray inner `<form>` placeholder; the working sign-out form is the bottom one posting to `/client/logout`.
- [ ] **Step 2:** Manual: logged in, `/client/kanset` shows the two seeded pieces under "Needs your approval" (both are `draft`, no decision), empty Activity, a Sign-out link.
- [ ] **Step 3:** Do Task 7 Step 7 auth verification now that this page exists.
- [ ] **Step 4: Commit** `feat(portal): overview + activity feed + sign out`

---

### Task 9: Decision via the RPC (transactional, guarded form)

- [ ] **Step 1: `src/app/client/[slug]/actions.ts`**
```ts
'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getContentItem } from '@/lib/portal/data'

export async function decide(formData: FormData): Promise<{ error?: string }> {
  const slug = String(formData.get('slug'))
  const contentId = String(formData.get('contentId'))
  const decision = String(formData.get('decision'))
  const note = String(formData.get('note') || '').trim()

  const session = await getClientSession()
  if (!session || session.clientSlug !== slug) redirect('/client/login')
  if (decision !== 'approved' && decision !== 'change_requested') return { error: 'Invalid action.' }
  if (decision === 'change_requested' && !note) return { error: 'Please add a note describing the change.' }

  const item = await getContentItem(session.clientId, contentId)
  if (!item) return { error: 'That piece is no longer available.' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('record_content_decision', {
    p_content_id: item.id, p_content_version: item.version, p_decision: decision, p_note: note || null,
  })
  if (error) return { error: 'Could not save your decision. Please try again.' }

  revalidatePath(`/client/${slug}`)
  redirect(`/client/${slug}`)
}
```
- [ ] **Step 2: `src/app/client/[slug]/piece/[contentId]/page.tsx`** (detail + guarded form with pending state)
```tsx
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import DecideForm from './DecideForm'

export default async function Piece({ params }: { params: Promise<{ slug: string; contentId: string }> }) {
  const { slug, contentId } = await params
  const session = await getClientSession()
  if (!session || session.clientSlug !== slug) redirect('/client/login')
  const item = await getContentItem(session.clientId, contentId)
  if (!item) redirect(`/client/${slug}`)

  const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '40px 32px', fontFamily: "'futura-pt', Arial, sans-serif", color: 'var(--foreground)' }
  return (
    <main style={{ background: 'var(--background)', minHeight: '100vh' }}>
      <div style={wrap}>
        <a href={`/client/${slug}`} style={{ color: 'var(--dim-grey)', fontSize: 14 }}>← Back</a>
        <h1 style={{ fontWeight: 400, fontSize: 28, margin: '12px 0 6px' }}>{item.title}</h1>
        <div style={{ color: 'var(--dim-grey)', fontSize: 13, marginBottom: 20 }}>
          {(item.platforms || []).join(' · ')} · v{item.version}{item.fact_check ? ` · ${item.fact_check}` : ''}
        </div>
        {item.canva_url && <a href={item.canva_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginBottom: 20 }}>Open the design in Canva →</a>}
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, marginBottom: 28 }}>{item.client_body}</p>
        {item.state === 'needs_review'
          ? <DecideForm slug={slug} contentId={item.content_id} />
          : <p style={{ color: 'var(--dim-grey)' }}>This piece is {item.state === 'with_dot' ? 'back with The Dot' : item.state}.</p>}
      </div>
    </main>
  )
}
```
- [ ] **Step 3: `src/app/client/[slug]/piece/[contentId]/DecideForm.tsx`** (`'use client'`, pending + error via `useActionState`/`useFormStatus`)
```tsx
'use client'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { decide } from '../../actions'

function Buttons() {
  const { pending } = useFormStatus()
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button type="submit" name="decision" value="change_requested" disabled={pending}
        style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #ccc', background: '#fff', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>Request a change</button>
      <button type="submit" name="decision" value="approved" disabled={pending}
        style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--foreground)', color: 'var(--background)', cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Approve'}</button>
    </div>
  )
}
export default function DecideForm({ slug, contentId }: { slug: string; contentId: string }) {
  const [state, action] = useActionState(async (_prev: { error?: string }, fd: FormData) => decide(fd), {})
  return (
    <form action={action} style={{ borderTop: '1px solid #e8e5db', paddingTop: 20 }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="contentId" value={contentId} />
      <textarea name="note" rows={2} placeholder="Add a note (required to request a change)…"
        style={{ width: '100%', padding: '11px 13px', fontSize: 14, borderRadius: 8, border: '1px solid #ccc', marginBottom: 12, fontFamily: 'inherit' }} />
      {state?.error && <p style={{ color: '#742a2a', marginBottom: 10 }}>{state.error}</p>}
      <Buttons />
    </form>
  )
}
```
- [ ] **Step 4: Manual end-to-end (the point of the slice).** Sign in as Maria, open a piece, Approve → back on overview, the piece leaves "Needs your approval" and Activity shows "Approved: …"; open the second piece, Request a change with a note → it moves to "Back with The Dot" and logs "Change requested: …". Double-clicking Approve does not create a second decision (idempotent RPC). Confirm in Supabase: `approvals` + `activity_log` rows; `content_items.status` is unchanged (still `draft`).
- [ ] **Step 5: Commit** `feat(portal): transactional decision via RPC + guarded form`

---

### Task 10: Test set

- [ ] **Step 1:** SQL/RLS test with REAL role impersonation (a plain SQL Editor query runs as the owner and bypasses RLS). In a transaction: `set local role authenticated;` then `set local request.jwt.claims = '{"sub":"<user-uuid>"}';` before querying. Two tenants; assert user A cannot select user B's `content_with_state` / `activity_log` rows; `record_content_decision` on A's content by B raises "not authorized"; and a second identical Approve inserts NO new `activity_log` row (idempotent).
- [ ] **Step 2:** parser tests already cover enums/date/body split (Task 5); add a URL + version-bound case.
- [ ] **Step 3: E2E `e2e/portal.spec.ts`** (Playwright): magic-link login (use a Supabase test inbox or a seeded session), approve, request-change, double-submit, and an expired-session redirect. Run `npm run test:e2e`.
- [ ] **Step 4:** `npm test` (unit) green; `npx tsc --noEmit` no new errors.
- [ ] **Step 5: Commit** `test(portal): RLS two-tenant, RPC idempotency, parser, e2e`

---

## Self-review
- **Model:** status is file-projected; `approvals` owns the decision + version; `deriveClientState` maps to needs_review / with_dot / approved / scheduled / live; the client never writes `content_items`. Matches the confirmed UX (change_requested leaves the queue).
- **Integrity/security:** single `security definer` RPC is the only approval/activity writer; direct table writes revoked; composite `(id, client_id)` FKs; `my_client_ids()` hardened; RLS read-only; service-role key only where the sync runs; CSP scoped to browser calls.
- **Auth:** token_hash + verifyOtp (cross-device), `shouldCreateUser:false`, `[slug]`-layout guard (no redirect loop), middleware session refresh for `/client/*` preserving existing bot/canonical logic.
- **Robustness:** readers throw (never mask auth/RLS failures as empty), `error.tsx`/`loading.tsx`, form pending + required-note + error surfacing, sync fails loud + loads env + canonical dir.
- **Placeholders:** none; the one inline `<form>` placeholder in Task 8 is explicitly flagged for removal.
- **Deferred (correctly):** comments, reports, recommendations, the Client Work Assistant, the rater, notifications, real Kanset-content migration (Task 5 seeds; production dir is the Kanset workspace via `PORTAL_CONTENT_DIR`).
- **Prior security remediation:** committed as `67405d2`; rotation is Anastasia's follow-up.
