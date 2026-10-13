# Client Portal — Plan 1: Foundation + First Vertical Slice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the whole portal spine end to end: a content file syncs into Supabase, Maria logs in with a magic link at `/client/kanset`, sees her pieces, opens one, and approves or requests a change, which writes to Supabase and drops an event into a basic activity feed.

**Architecture:** Repo/Supabase-first (per `CLIENT-PORTAL-PLAN.md` section 15). Content files (frontmatter + body) are the source of truth; a sync step upserts them into a Supabase `content_items` table; the portal reads Supabase at runtime. App state (auth, approvals, activity) lives in Supabase. The portal is a new `/client/[slug]` route tree inside the existing `thedot-site` Next.js app, coexisting with the admin auth by using a separate route tree, separate cookies, and a separate guard.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript, plain CSS (brand tokens in `src/app/styles/globals.css`, no Tailwind), `@supabase/supabase-js` + `@supabase/ssr`, Vitest + @testing-library/react (new). Deploy: Vercel + managed Supabase. Alias `@/*` → `src/*`.

**Ground truth from the codebase map (do not re-derive):**
- Admin auth = `jose` HS256 cookie named `session` (`src/lib/auth.ts`); NOT protected by middleware; API routes self-guard with `verifySession()`. Portal must not touch this.
- `middleware.ts` matcher `'/((?!api|_next/static|_next/image|favicon.ico).*)'` already matches `/client/*` but does only bot-blocking + www/HTTPS canonicalization. Leave it alone for Plan 1 (portal gates server-side in a layout).
- `next.config.ts` sets a strict CSP. **Supabase host MUST be added to `connect-src`** (`https://<ref>.supabase.co` + `wss://<ref>.supabase.co`) or all portal data calls fail silently. This is the #1 gotcha.
- Data pattern: `src/lib/*.ts` factory reading `process.env`; `async` reader fns; server components `await` them; `params` is a `Promise` in Next 15 (`await params`); reads are fail-soft (return `[]`/`null`, never throw).
- No test framework exists. Task 1 stands up Vitest.
- `tsx` is available (used by `scripts/sync-portfolio-from-notion.ts`) — precedent for the content sync script.

---

## Prerequisites (manual, Anastasia does these once — not code)

- [ ] **P1. Create the Supabase project.** In the existing Supabase account → New project (name: `thedot-portal`, region closest to Toronto, e.g. `us-east-1`). Save the DB password.
- [ ] **P2. Copy the project keys.** Project Settings → API → copy: Project URL (`https://<ref>.supabase.co`), `anon` public key, `service_role` secret key. Note the `<ref>` (subdomain) for the CSP edit in Task 2.
- [ ] **P3. Disable email confirmations for magic link dev** is NOT needed (magic link is OTP). But under Authentication → URL Configuration, set Site URL to your dev/prod site and add `http://localhost:3000/client/auth/callback` and `https://www.thedotcreative.co/client/auth/callback` to **Redirect URLs** (magic link will only redirect to allow-listed URLs).

---

## File structure (created by this plan)

```
thedot-site/
├── next.config.ts                        (EDIT: add Supabase host to CSP connect-src)
├── package.json                          (EDIT: add deps + test script)
├── vitest.config.ts                      (CREATE)
├── vitest.setup.ts                       (CREATE)
├── .env.local                            (EDIT: add Supabase var names locally)
├── supabase/
│   └── migrations/
│       └── 0001_portal_foundation.sql    (CREATE: schema + RLS + seed)
├── content/portal/
│   └── kanset-2026-07-oinp-employer.md   (CREATE: seed content file with frontmatter)
├── scripts/
│   └── sync-content-to-supabase.ts       (CREATE: files → content_items)
└── src/
    ├── lib/
    │   ├── supabase/server.ts            (CREATE: server client factory)
    │   ├── supabase/client.ts            (CREATE: browser client factory)
    │   ├── portal/frontmatter.ts         (CREATE: pure parser — TDD)
    │   ├── portal/frontmatter.test.ts    (CREATE)
    │   ├── portal/auth.ts                (CREATE: getClientSession)
    │   ├── portal/data.ts                (CREATE: readers — TDD on mapping)
    │   └── portal/data.test.ts           (CREATE)
    └── app/client/
        ├── layout.tsx                    (CREATE: server gate)
        ├── login/page.tsx                (CREATE: 'use client' magic-link form)
        ├── auth/callback/route.ts        (CREATE: code → session)
        └── [slug]/
            ├── page.tsx                  (CREATE: overview + feed)
            └── piece/[contentId]/page.tsx(CREATE: detail + approve action)
        └── [slug]/actions.ts             (CREATE: server actions: approve / request change)
```

---

### Task 1: Dependencies + Vitest harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `vitest.setup.ts`

- [ ] **Step 1: Install runtime + test deps**

Run:
```bash
cd /Users/anastasiavolkova/thedot-site
npm install @supabase/supabase-js @supabase/ssr gray-matter
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 2: Add the test script to `package.json`**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest",
"sync-content": "tsx scripts/sync-content-to-supabase.ts"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Step 4: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 5: Add a smoke test and run it**

Create `src/lib/portal/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('vitest harness', () => {
  it('runs', () => { expect(1 + 1).toBe(2) })
})
```
Run: `npm test`
Expected: PASS (1 test). Then delete `src/lib/portal/smoke.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts
git commit -m "chore(portal): add supabase deps + vitest harness"
```

---

### Task 2: Env vars + CSP (the silent-failure gotcha)

**Files:**
- Modify: `.env.local`, `next.config.ts`, `VERCEL_ENV_VARS.md`

- [ ] **Step 1: Add Supabase env vars to `.env.local`** (real values from Prereq P2)

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

- [ ] **Step 2: Add the same three to Vercel** (Project → Settings → Environment Variables, all environments). Document them in `VERCEL_ENV_VARS.md` under a new "Client Portal (Supabase)" heading (names + one-line purpose; never the values).

- [ ] **Step 3: Add Supabase to the CSP `connect-src` in `next.config.ts`**

Find the `Content-Security-Policy` string in the `async headers()` block. In the `connect-src` directive, append the Supabase host. Replace the current `connect-src 'self' ...` segment so it also contains:
```
https://<ref>.supabase.co wss://<ref>.supabase.co
```
So `connect-src` reads (existing hosts) + ` https://<ref>.supabase.co wss://<ref>.supabase.co`.

- [ ] **Step 4: Verify the CSP change did not break the build**

Run: `npm run build`
Expected: build completes (note `ignoreBuildErrors` is on, so also run `npx tsc --noEmit` and expect no NEW errors from this task — there are none, this task only edits config/env).

- [ ] **Step 5: Commit**

```bash
git add next.config.ts VERCEL_ENV_VARS.md
git commit -m "feat(portal): allow Supabase host in CSP, document env vars"
```
(`.env.local` is gitignored — not committed.)

---

### Task 3: Supabase schema + RLS + seed (SQL migration)

**Files:**
- Create: `supabase/migrations/0001_portal_foundation.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_portal_foundation.sql

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
  role text not null default 'client',
  created_at timestamptz not null default now(),
  unique (client_id, auth_user_id)
);

create table content_items (
  id uuid primary key default gen_random_uuid(),
  content_id text unique not null,          -- stable slug from frontmatter
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  format text,
  pillar text,
  platforms text[] default '{}',
  scheduled_date date,
  status text not null default 'draft',     -- idea|draft|approved|scheduled|posted
  canva_url text,
  drive_url text,
  version int not null default 1,
  fact_check text,                          -- confirmed|needs-confirm|flagged
  body text,
  source_path text,
  updated_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  state text not null,                      -- approved|change_requested
  note text,
  revision_round int not null default 1,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  content_id uuid references content_items(id) on delete set null,
  event_type text not null,                 -- needs_review|approved|change_requested|scheduled|posted|...
  title text not null,
  summary text,
  actor_type text not null,                 -- client|anastasia|agent
  actor_name text not null,
  related_url text,
  created_at timestamptz not null default now()
);

-- Helper: the client_ids the current auth user belongs to.
create or replace function my_client_ids() returns setof uuid
  language sql security definer stable as $$
  select client_id from client_users where auth_user_id = auth.uid()
$$;

alter table clients enable row level security;
alter table client_users enable row level security;
alter table content_items enable row level security;
alter table approvals enable row level security;
alter table activity_log enable row level security;

-- Clients: a user can read only clients they belong to.
create policy client_read on clients for select
  using (id in (select my_client_ids()));

-- Client_users: a user can read their own membership rows.
create policy cu_read on client_users for select
  using (auth_user_id = auth.uid());

-- Content: read only your client's content.
create policy ci_read on content_items for select
  using (client_id in (select my_client_ids()));

-- Approvals: read + insert for your client only.
create policy appr_read on approvals for select
  using (client_id in (select my_client_ids()));
create policy appr_insert on approvals for insert
  with check (client_id in (select my_client_ids()) and approved_by = auth.uid());

-- Activity: read for your client; inserts come from the service role (agent) or server actions.
create policy act_read on activity_log for select
  using (client_id in (select my_client_ids()));
create policy act_insert on activity_log for insert
  with check (client_id in (select my_client_ids()));

-- Seed: Kanset client.
insert into clients (name, slug) values ('Kanset Services Inc.', 'kanset');
```

- [ ] **Step 2: Run it** in Supabase → SQL Editor (paste, Run). Expected: "Success. No rows returned." Verify tables exist under Table Editor.

- [ ] **Step 3: Create Maria's user + membership** (manual, once). Supabase → Authentication → Users → Add user → email = Maria's email, "Auto Confirm". Then in SQL Editor:
```sql
insert into client_users (client_id, auth_user_id, email, name, role)
select c.id, u.id, u.email, 'Maria Guerts', 'client'
from clients c, auth.users u
where c.slug = 'kanset' and u.email = '<maria-email>';
```

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/0001_portal_foundation.sql
git commit -m "feat(portal): supabase schema + RLS + kanset seed"
```

---

### Task 4: Supabase client factories + portal auth guard

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/portal/auth.ts`

- [ ] **Step 1: `src/lib/supabase/server.ts`** (cookie-based server client, mirrors the env-driven factory convention)

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component where cookies are read-only; safe to ignore.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 2: `src/lib/supabase/client.ts`** (browser client for `'use client'` components)

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: `src/lib/portal/auth.ts`** (the portal analog of admin `verifySession()`)

```ts
import { createSupabaseServer } from '@/lib/supabase/server'

export type ClientSession = {
  userId: string
  email: string
  clientSlug: string
  clientId: string
  name: string | null
}

// Returns the signed-in client user + their (single, for now) client, or null.
export async function getClientSession(): Promise<ClientSession | null> {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('client_users')
    .select('name, email, client_id, clients ( slug )')
    .eq('auth_user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  const clients = data.clients as unknown as { slug: string } | null
  if (!clients) return null

  return {
    userId: user.id,
    email: data.email,
    name: data.name,
    clientId: data.client_id,
    clientSlug: clients.slug,
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/server.ts src/lib/supabase/client.ts src/lib/portal/auth.ts
git commit -m "feat(portal): supabase client factories + client session guard"
```

---

### Task 5: Frontmatter parser (TDD) + sync script + seed file

**Files:**
- Create: `src/lib/portal/frontmatter.ts`, `src/lib/portal/frontmatter.test.ts`, `content/portal/kanset-2026-07-oinp-employer.md`, `scripts/sync-content-to-supabase.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/portal/frontmatter.test.ts`

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
Approval-ready caption goes here.`

describe('parseContentFile', () => {
  it('extracts frontmatter fields and body', () => {
    const r = parseContentFile(sample, 'content/portal/x.md')
    expect(r.content_id).toBe('kanset-2026-07-oinp-employer')
    expect(r.client).toBe('kanset')
    expect(r.title).toBe('OINP employer job offer carousel')
    expect(r.format).toBe('carousel')
    expect(r.platforms).toEqual(['instagram', 'facebook'])
    expect(r.status).toBe('draft')
    expect(r.version).toBe(3)
    expect(r.body.trim()).toBe('Approval-ready caption goes here.')
    expect(r.source_path).toBe('content/portal/x.md')
  })

  it('throws on a file missing content_id', () => {
    expect(() => parseContentFile('---\ntitle: x\n---\nbody', 'p.md')).toThrow(/content_id/)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/portal/frontmatter.test.ts`
Expected: FAIL ("Cannot find module './frontmatter'").

- [ ] **Step 3: Implement `src/lib/portal/frontmatter.ts`**

```ts
import matter from 'gray-matter'

export type ParsedContent = {
  content_id: string
  client: string
  title: string
  format: string | null
  pillar: string | null
  platforms: string[]
  scheduled_date: string | null
  status: string
  canva_url: string | null
  drive_url: string | null
  version: number
  fact_check: string | null
  body: string
  source_path: string
}

export function parseContentFile(raw: string, sourcePath: string): ParsedContent {
  const { data, content } = matter(raw)
  if (!data.content_id) throw new Error(`Missing content_id in ${sourcePath}`)
  if (!data.client) throw new Error(`Missing client in ${sourcePath}`)
  if (!data.title) throw new Error(`Missing title in ${sourcePath}`)
  return {
    content_id: String(data.content_id),
    client: String(data.client),
    title: String(data.title),
    format: data.format ? String(data.format) : null,
    pillar: data.pillar ? String(data.pillar) : null,
    platforms: Array.isArray(data.platforms) ? data.platforms.map(String) : [],
    scheduled_date: data.scheduled_date ? String(data.scheduled_date) : null,
    status: data.status ? String(data.status) : 'draft',
    canva_url: data.canva_url ? String(data.canva_url) : null,
    drive_url: data.drive_url ? String(data.drive_url) : null,
    version: data.version ? Number(data.version) : 1,
    fact_check: data.fact_check ? String(data.fact_check) : null,
    body: content,
    source_path: sourcePath,
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/portal/frontmatter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the seed content file** — `content/portal/kanset-2026-07-oinp-employer.md`

```markdown
---
content_id: kanset-2026-07-oinp-employer
client: kanset
title: "OINP employer job offer carousel"
format: carousel
pillar: employer
platforms: [instagram, facebook]
scheduled_date: 2026-07-16
status: draft
canva_url: https://www.canva.com/design/DAHPRr41pq8
version: 3
fact_check: confirmed
---
Waiting on a hire and losing track of your filings? Here is what the OINP employer job offer stream actually asks of your business, in plain terms. Book a consult before the portal opens.
```

- [ ] **Step 6: Write the sync script** — `scripts/sync-content-to-supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseContentFile } from '../src/lib/portal/frontmatter'

const CONTENT_DIR = process.env.PORTAL_CONTENT_DIR || 'content/portal'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,       // service role: bypasses RLS for the sync
    { auth: { persistSession: false } }
  )

  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'))
  for (const file of files) {
    const path = join(CONTENT_DIR, file)
    const parsed = parseContentFile(readFileSync(path, 'utf8'), path)

    const { data: client } = await supabase
      .from('clients').select('id').eq('slug', parsed.client).single()
    if (!client) { console.error(`No client for slug "${parsed.client}" (${file})`); continue }

    const { error } = await supabase.from('content_items').upsert({
      content_id: parsed.content_id,
      client_id: client.id,
      title: parsed.title,
      format: parsed.format,
      pillar: parsed.pillar,
      platforms: parsed.platforms,
      scheduled_date: parsed.scheduled_date,
      status: parsed.status,
      canva_url: parsed.canva_url,
      drive_url: parsed.drive_url,
      version: parsed.version,
      fact_check: parsed.fact_check,
      body: parsed.body,
      source_path: parsed.source_path,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'content_id' })

    if (error) console.error(`Upsert failed for ${parsed.content_id}:`, error.message)
    else console.log(`Synced ${parsed.content_id}`)
  }
}

main().then(() => process.exit(0))
```

- [ ] **Step 7: Run the sync and verify the row lands**

Run: `npm run sync-content`
Expected: `Synced kanset-2026-07-oinp-employer`. Confirm in Supabase Table Editor → `content_items` has one row with `status = draft`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/portal/frontmatter.ts src/lib/portal/frontmatter.test.ts content/portal scripts/sync-content-to-supabase.ts
git commit -m "feat(portal): frontmatter parser + file->supabase sync + seed"
```

---

### Task 6: Portal readers (TDD on the mapping)

**Files:**
- Create: `src/lib/portal/data.ts`, `src/lib/portal/data.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/portal/data.test.ts` (tests the pure grouping helper, not the network)

```ts
import { describe, it, expect } from 'vitest'
import { groupByStatus } from './data'

describe('groupByStatus', () => {
  it('buckets content items into awaiting / scheduled / live', () => {
    const items = [
      { id: '1', status: 'draft' }, { id: '2', status: 'scheduled' },
      { id: '3', status: 'posted' }, { id: '4', status: 'draft' },
    ] as any
    const g = groupByStatus(items)
    expect(g.awaiting.map((i: any) => i.id)).toEqual(['1', '4'])
    expect(g.scheduled.map((i: any) => i.id)).toEqual(['2'])
    expect(g.live.map((i: any) => i.id)).toEqual(['3'])
  })
})
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/lib/portal/data.test.ts` → FAIL (no module).

- [ ] **Step 3: Implement `src/lib/portal/data.ts`** (readers are fail-soft, per codebase convention)

```ts
import { createSupabaseServer } from '@/lib/supabase/server'

export type ContentItem = {
  id: string
  content_id: string
  title: string
  format: string | null
  pillar: string | null
  platforms: string[]
  status: string
  scheduled_date: string | null
  canva_url: string | null
  body: string | null
  fact_check: string | null
  version: number
}

export type ActivityRow = {
  id: string
  event_type: string
  title: string
  summary: string | null
  actor_type: string
  actor_name: string
  created_at: string
}

export function groupByStatus(items: ContentItem[]) {
  return {
    awaiting: items.filter((i) => i.status === 'draft'),
    scheduled: items.filter((i) => i.status === 'scheduled'),
    live: items.filter((i) => i.status === 'posted'),
    approved: items.filter((i) => i.status === 'approved'),
  }
}

export async function getContentItems(): Promise<ContentItem[]> {
  try {
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase
      .from('content_items')
      .select('id, content_id, title, format, pillar, platforms, status, scheduled_date, canva_url, body, fact_check, version')
      .order('scheduled_date', { ascending: true })
    if (error) { console.error('getContentItems:', error.message); return [] }
    return (data ?? []) as ContentItem[]
  } catch (e) {
    console.error('getContentItems threw:', e); return []
  }
}

export async function getContentItem(contentId: string): Promise<ContentItem | null> {
  try {
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase
      .from('content_items')
      .select('id, content_id, title, format, pillar, platforms, status, scheduled_date, canva_url, body, fact_check, version')
      .eq('content_id', contentId)
      .maybeSingle()
    if (error) { console.error('getContentItem:', error.message); return null }
    return (data as ContentItem) ?? null
  } catch (e) {
    console.error('getContentItem threw:', e); return null
  }
}

export async function getActivity(): Promise<ActivityRow[]> {
  try {
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase
      .from('activity_log')
      .select('id, event_type, title, summary, actor_type, actor_name, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) { console.error('getActivity:', error.message); return [] }
    return (data ?? []) as ActivityRow[]
  } catch (e) {
    console.error('getActivity threw:', e); return []
  }
}
```

- [ ] **Step 4: Run it, verify it passes** — `npx vitest run src/lib/portal/data.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal/data.ts src/lib/portal/data.test.ts
git commit -m "feat(portal): supabase readers + status grouping"
```

---

### Task 7: Magic-link auth (login page, callback, server gate)

**Files:**
- Create: `src/app/client/login/page.tsx`, `src/app/client/auth/callback/route.ts`, `src/app/client/layout.tsx`

- [ ] **Step 1: `src/app/client/auth/callback/route.ts`** (exchanges the magic-link code for a session cookie)

```ts
import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/client/kanset'
  if (code) {
    const supabase = await createSupabaseServer()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/client/login?error=auth`)
}
```

- [ ] **Step 2: `src/app/client/login/page.tsx`** (`'use client'`, models the admin login UX + brand tokens)

```tsx
'use client'
import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase/client'

export default function ClientLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const supabase = createSupabaseBrowser()
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${base}/client/auth/callback` },
    })
    if (error) setError('Could not send the link. Check the address and try again.')
    else setSent(true)
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: 'var(--background)', color: 'var(--foreground)',
      fontFamily: "'futura-pt', Arial, sans-serif", padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ fontWeight: 300, fontSize: 34, marginBottom: 8 }}>Your workspace</h1>
        {sent ? (
          <p style={{ color: 'var(--dim-grey)' }}>
            Check your email for a sign-in link. It expires shortly.
          </p>
        ) : (
          <form onSubmit={send}>
            <p style={{ color: 'var(--dim-grey)', marginBottom: 20 }}>
              Enter your email and we will send you a one-tap sign-in link.
            </p>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={{ width: '100%', padding: '14px 16px', fontSize: 16, borderRadius: 6,
                border: '1px solid #ccc', background: '#fff', marginBottom: 14 }} />
            {error && <p style={{ color: '#742a2a', marginBottom: 12 }}>{error}</p>}
            <button type="submit"
              style={{ width: '100%', padding: '14px 16px', fontSize: 15, borderRadius: 999,
                border: 'none', background: 'var(--foreground)', color: 'var(--background)',
                cursor: 'pointer' }}>
              Send me a link
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: `src/app/client/layout.tsx`** (server gate; also neutralizes the marketing `body{padding-top:100px}`)

```tsx
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { headers } from 'next/headers'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  // Allow the login + callback routes through without a session.
  const h = await headers()
  const pathname = h.get('x-invoke-path') || h.get('x-pathname') || ''
  const isPublic = pathname.includes('/client/login') || pathname.includes('/client/auth')

  if (!isPublic) {
    const session = await getClientSession()
    if (!session) redirect('/client/login')
  }
  return (
    <div style={{ marginTop: -100 }}>
      {children}
    </div>
  )
}
```
> Note: Next 15 does not expose the pathname to layouts via a stable header in all setups. If `x-invoke-path`/`x-pathname` is empty in your deploy, split instead: put the gate only around `src/app/client/[slug]/` by adding the `getClientSession()` check at the top of each protected `page.tsx` (and keep this layout for the `margin-top` reset only). The subagent's map notes admin uses per-page checks; matching that is acceptable. Decide during execution based on a quick `console.log(pathname)`.

- [ ] **Step 4: Manual verification of the auth loop**

Run: `npm run dev`. Visit `http://localhost:3000/client/login`. Enter Maria's seeded email. Expected: "Check your email." Click the link in the email → lands on `/client/kanset` (Task 8 page). Visiting `/client/kanset` logged-out redirects to `/client/login`.

- [ ] **Step 5: Commit**

```bash
git add src/app/client/login/page.tsx src/app/client/auth/callback/route.ts src/app/client/layout.tsx
git commit -m "feat(portal): magic-link login, callback, server gate"
```

---

### Task 8: Overview page + basic activity feed

**Files:**
- Create: `src/app/client/[slug]/page.tsx`

- [ ] **Step 1: Implement the overview** (server component; `params` is a Promise in Next 15)

```tsx
import Link from 'next/link'
import { getClientSession } from '@/lib/portal/auth'
import { redirect } from 'next/navigation'
import { getContentItems, getActivity, groupByStatus } from '@/lib/portal/data'

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession()
  if (!session || session.clientSlug !== slug) redirect('/client/login')

  const [items, activity] = await Promise.all([getContentItems(), getActivity()])
  const g = groupByStatus(items)

  const wrap: React.CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: '40px 32px',
    fontFamily: "'futura-pt', Arial, sans-serif", color: 'var(--foreground)' }

  return (
    <main style={{ background: 'var(--background)', minHeight: '100vh' }}>
      <div style={wrap}>
        <p style={{ letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 11, color: 'var(--dim-grey)' }}>
          Kanset · workspace
        </p>
        <h1 style={{ fontWeight: 300, fontSize: 'clamp(2.2rem,5vw,3.2rem)', margin: '8px 0 4px' }}>
          Good day{session.name ? `, ${session.name.split(' ')[0]}` : ''}.
        </h1>
        <p style={{ color: 'var(--dim-grey)', fontSize: 18, marginBottom: 36 }}>
          <b style={{ color: 'var(--foreground)', fontWeight: 500 }}>{g.awaiting.length}</b> waiting for you.
        </p>

        <section style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 28, alignItems: 'start' }}>
          <div>
            <h2 style={{ fontWeight: 300, fontSize: 24, marginBottom: 16 }}>Needs your approval</h2>
            {g.awaiting.length === 0 && <p style={{ color: 'var(--dim-grey)' }}>Nothing right now.</p>}
            {g.awaiting.map((it) => (
              <Link key={it.id} href={`/client/${slug}/piece/${it.content_id}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit',
                  border: '1px solid #e8e5db', borderRadius: 10, padding: 18, marginBottom: 14, background: '#fff' }}>
                <div style={{ fontWeight: 400, fontSize: 18 }}>{it.title}</div>
                <div style={{ color: 'var(--dim-grey)', fontSize: 13, marginTop: 6 }}>
                  {(it.platforms || []).join(' · ')}{it.fact_check ? ` · ${it.fact_check}` : ''}
                </div>
              </Link>
            ))}
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
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Manual verification** — logged in as Maria, `/client/kanset` shows the seeded OINP piece under "Needs your approval" and an empty Activity panel.

- [ ] **Step 3: Commit**

```bash
git add src/app/client/[slug]/page.tsx
git commit -m "feat(portal): client overview + activity feed"
```

---

### Task 9: Content detail + approve / request-change (writes approval + activity event)

**Files:**
- Create: `src/app/client/[slug]/actions.ts`, `src/app/client/[slug]/piece/[contentId]/page.tsx`

- [ ] **Step 1: Server actions** — `src/app/client/[slug]/actions.ts`

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getContentItem } from '@/lib/portal/data'

export async function decideOnPiece(formData: FormData) {
  const contentId = String(formData.get('contentId'))
  const slug = String(formData.get('slug'))
  const decision = String(formData.get('decision')) // 'approved' | 'change_requested'
  const note = String(formData.get('note') || '')

  const session = await getClientSession()
  if (!session || session.clientSlug !== slug) redirect('/client/login')

  const item = await getContentItem(contentId)
  if (!item) redirect(`/client/${slug}`)

  const supabase = await createSupabaseServer()

  await supabase.from('approvals').insert({
    content_id: item.id,
    client_id: session.clientId,
    state: decision,
    note: note || null,
    approved_by: session.userId,
  })

  if (decision === 'approved') {
    await supabase.from('content_items').update({ status: 'approved' }).eq('id', item.id)
  }

  await supabase.from('activity_log').insert({
    client_id: session.clientId,
    content_id: item.id,
    event_type: decision === 'approved' ? 'approved' : 'change_requested',
    title: decision === 'approved'
      ? `Approved: ${item.title}`
      : `Change requested: ${item.title}`,
    summary: note || null,
    actor_type: 'client',
    actor_name: session.name || 'Client',
  })

  revalidatePath(`/client/${slug}`)
  redirect(`/client/${slug}`)
}
```

- [ ] **Step 2: Detail page with the actions** — `src/app/client/[slug]/piece/[contentId]/page.tsx`

```tsx
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { decideOnPiece } from '../../actions'

export default async function Piece({ params }: { params: Promise<{ slug: string; contentId: string }> }) {
  const { slug, contentId } = await params
  const session = await getClientSession()
  if (!session || session.clientSlug !== slug) redirect('/client/login')

  const item = await getContentItem(contentId)
  if (!item) redirect(`/client/${slug}`)

  const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '40px 32px',
    fontFamily: "'futura-pt', Arial, sans-serif", color: 'var(--foreground)' }

  return (
    <main style={{ background: 'var(--background)', minHeight: '100vh' }}>
      <div style={wrap}>
        <a href={`/client/${slug}`} style={{ color: 'var(--dim-grey)', fontSize: 14 }}>← Back</a>
        <h1 style={{ fontWeight: 400, fontSize: 28, margin: '12px 0 6px' }}>{item.title}</h1>
        <div style={{ color: 'var(--dim-grey)', fontSize: 13, marginBottom: 20 }}>
          {(item.platforms || []).join(' · ')} · v{item.version}{item.fact_check ? ` · ${item.fact_check}` : ''}
        </div>
        {item.canva_url && (
          <a href={item.canva_url} target="_blank" rel="noreferrer"
            style={{ display: 'inline-block', marginBottom: 20, color: 'var(--foreground)' }}>
            Open the design in Canva →
          </a>
        )}
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, marginBottom: 28 }}>{item.body}</p>

        <form action={decideOnPiece} style={{ borderTop: '1px solid #e8e5db', paddingTop: 20 }}>
          <input type="hidden" name="contentId" value={item.content_id} />
          <input type="hidden" name="slug" value={slug} />
          <textarea name="note" rows={2} placeholder="Add a note if you want a change (optional)…"
            style={{ width: '100%', padding: '11px 13px', fontSize: 14, borderRadius: 8,
              border: '1px solid #ccc', marginBottom: 12, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="submit" name="decision" value="change_requested"
              style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #ccc',
                background: '#fff', cursor: 'pointer' }}>Request a change</button>
            <button type="submit" name="decision" value="approved"
              style={{ padding: '10px 18px', borderRadius: 999, border: 'none',
                background: 'var(--foreground)', color: 'var(--background)', cursor: 'pointer' }}>Approve</button>
          </div>
        </form>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Manual end-to-end verification (the whole point of Plan 1)**

Run `npm run dev`, sign in as Maria, open the OINP piece, add a note, click Approve. Expected: redirect to `/client/kanset`; the piece leaves "Needs your approval" (status now `approved`); the Activity panel shows "Approved: OINP employer job offer carousel". Confirm in Supabase that `approvals` has a row and `activity_log` has the event. Repeat with "Request a change" on another seeded piece (add a second seed file + re-run `npm run sync-content` if needed) and confirm it logs `change_requested` and leaves status `draft`.

- [ ] **Step 4: Run the full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: tests PASS; no NEW type errors from portal files.

- [ ] **Step 5: Commit**

```bash
git add src/app/client/[slug]/actions.ts "src/app/client/[slug]/piece/[contentId]/page.tsx"
git commit -m "feat(portal): content detail + approve/request-change writing approval + activity event"
```

---

## Self-review (done at authoring)

- **Spec coverage (Plan 1 slice):** deps+harness (T1), env+CSP gotcha (T2), schema+RLS+seed (T3), clients+guard (T4), file→Supabase sync + parser (T5), readers (T6), magic-link auth loop (T7), overview+feed (T8), detail+approve+event (T9). The full vertical slice from `CLIENT-PORTAL-PLAN.md` section 15 is covered at foundation depth. Deferred to later plans (correctly, not gaps): comments/revision-round UI, polished feed/calendar, recommendations, reports, the Client Work Assistant, the rater, notifications, real Kanset-content migration.
- **Placeholders:** none — every code step has complete code; manual/infra steps (Supabase console, CSP host, magic-link redirect) are spelled out with exact values-to-fill.
- **Type consistency:** `ContentItem` / `ActivityRow` / `ClientSession` / `ParsedContent` names used consistently across `data.ts`, `auth.ts`, `frontmatter.ts`, and the pages. `getClientSession()`, `getContentItems()`, `getContentItem()`, `getActivity()`, `groupByStatus()`, `parseContentFile()`, `decideOnPiece()` referenced with matching signatures throughout.
- **Known risk flagged in-plan:** the layout-level pathname gate (T7 S3) may need to fall back to per-page guards depending on the deploy — the plan says how to decide at execution.

## Two pre-existing hygiene fixes to make while in here (surfaced by the codebase study; not portal-blocking)
- `src/lib/auth.ts` `authenticateAdmin()` `console.log`s the bcrypt password hash to logs — remove those log lines (they leak a secret to Vercel logs).
- `next.config.ts` has `typescript.ignoreBuildErrors: true` — the portal's only safety net is `npm test` + `npx tsc --noEmit`; run both before every deploy.
