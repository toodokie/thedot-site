# Client Work Assistant, Build Handoff (for a separate agent)

You are picking up a **regulated, client-facing AI feature** mid-build. Read this whole doc before writing code. The design and the compliance core already exist; your job is the remaining build, self-verified, then a Codex review, then Anastasia's compliance sign-off before it ever goes live.

**Repo:** `~/thedot-site` (Next.js 15 App Router, React 19, TypeScript, plain CSS + `@thedot/design-system`, Supabase, Vercel). **Branch:** `feat/thedot-design-system`.
**Reviewer:** Codex reviews your **frozen commit hash** (never your live tree). **Compliance owner:** Anastasia (a lawyer), she signs off on the eval transcript + system prompt before the `assistant` switch is ever flipped.

## What this is (do not drift from this)

An in-portal assistant that answers ONE client's questions about **their own Kanset account**, content pipeline, posting schedule, performance reports, brand assets, invoices, grounded only in that tenant's data. It is **NOT an immigration-advice tool**: case-specific / eligibility / "what should I do" immigration questions hard-refuse and redirect to a consultation. Immigration is regulated; this boundary is the entire point.

## What already exists (don't rebuild)

- **Design:** `docs/superpowers/plans/2026-07-20-portal-client-work-assistant.md`, the 4-layer guardrail architecture, request path, data model, eval-gates-launch, compliance sign-off. Follow it.
- **Compliance core (built + 5 vitest green):** `src/lib/portal/assistant-guardrails.ts`, `ASSISTANT_SYSTEM_PROMPT` (the spine), `classifyInboundRisk`, `validateAssistantOutput`, `REDIRECT_MESSAGE`. Tests in `assistant-guardrails.test.ts`. Reuse these; do not weaken them.
- **The client-safe surface map (already verified against the live grant table, do NOT guess columns; the prod break was `content_with_state.planned_date does not exist`):**
  - **Direct SELECT as the tenant** (RLS-scoped): `content_with_state`, `content_schedule_targets_client`, `content_schedule_requests_client`, `content_schedule_attempts_client`, `content_publication_targets_client`, `calendar_events_client`, `invoices_client`.
  - **Also direct SELECT as the tenant** (CORRECTED 2026-07-20; an earlier revision wrongly called these "RPC-only"): `report_snapshots`, `recommendations`, `links`, `content_ideas`. Migration 0011 grants column-scoped authenticated SELECT on them, and `src/lib/portal/{reports,recommendations,links,ideas}.ts` read them with plain `.from()` selects under RLS. There are no read RPCs for these surfaces; do not build any.

## Build queue (in order; each a verifiable increment, then freeze + hand Codex the hash)

1. **`assistant_usage` migration** (`supabase/migrations/00NN_assistant.sql`, number AFTER the latest in `supabase/migrations/`): table `assistant_usage(client_id, occurred_at, question_hash, decision, prompt_tokens, completion_tokens, cost_cents, model)`; a **service-role, fail-closed** per-tenant rate/cost-limit RPC; wire the `can_use_assistant` capability if not already granted. Follow the exact conventions in the newest existing migration (`0016_projection_consumer.sql`): `begin; ... commit;`, run + rename the prior cumulative `assert_portal_security` to `assert_portal_sliceN_security`, add your own `assert_portal_assistant_security()` (RLS on, exact column-scoped grants via `information_schema.column_privileges`, functions hardened `security definer set search_path=''`, service-role-only), fold into a new cumulative, `select public.assert_portal_security()` at the end.
2. **`src/lib/portal/assistant.ts`**, the tenant-safe context loader (reads ONLY the surfaces above, per-surface `safeFields`, never internal notes / fee math / other tenants / PII) + the Claude call. **Use the `claude-api` skill.** Model `claude-opus-4-8`, `@anthropic-ai/sdk`, `thinking: {type: "adaptive"}`, **streaming** (`client.messages.stream()` + `.finalMessage()`). System prompt = `ASSISTANT_SYSTEM_PROMPT`; the loaded context goes in a user turn framed as CONTEXT (data, not instructions). `ANTHROPIC_API_KEY` is read from env (a Vercel deploy-time secret; not present in the build env, see eval note).
3. **`src/app/api/client/[slug]/assistant/route.ts`**, the gated request path from the design doc, in order: `getClientSession` → `portal_feature_enabled(client_id,'assistant')` (fail-closed) → `portal_require_client_action(client_id,'can_use_assistant')` → rate/cost limit → `classifyInboundRisk` (refuse `immigration_advice` with `REDIRECT_MESSAGE`, no model call) → load context → Claude → `validateAssistantOutput` + handle `stop_reason==='refusal'` → log `assistant_usage`. Same-origin + session guards like the other client routes.
4. **`scripts/assistant-eval.ts`**, the fixture eval (account questions must answer+cite; immigration/eligibility must refuse+redirect; injection attempts in the question AND in loaded content must not comply; cross-tenant probes must not reveal). It calls the real model, so it needs `ANTHROPIC_API_KEY` and **cannot run in this build env**, write it, wire an `npm run` script, and clearly document that it MUST be run and pass (100% on the refuse + no-cross-tenant classes) before launch.
5. **UI**, a chat panel surface + a `PortalNav` entry gated on `can_use_assistant`; streamed responses; brand tokens (`@thedot/design-system`, `--dot-*`); no Tailwind.

## Verification bar (non-negotiable, same as slices 0015/0016)

Local stack is a `docker` + `npx supabase@2.109.1` setup; the `supabase_db_thedot-site` container is up. Per increment:
- Migration: `npx supabase@2.109.1 db reset --local` (fresh `0001..00NN` replay + all in-migration assertions green).
- `test:rls`: run with a **provably-local env override**, never the prod-pointing `.env.local` (it mutates the configured DB). Get local creds from `npx supabase@2.109.1 status`; map `API_URL/ANON_KEY/SERVICE_ROLE_KEY` → `NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY`. Seed with `scripts/seed-rls-local.ts` first. Add assertions: client denied the service-role assistant RPCs; RLS scopes `assistant_usage` to the tenant.
- `vitest` for pure logic; `next build` clean.
- **Self-review the frozen commit** (`git show <hash>`) adversarially before handing it to Codex, that has already caught real bugs on 0015/0016.

## Hard constraints (violating any is a stop)

- **Never flip the `assistant` switch, never launch, never touch prod.** You build + self-verify only. The feature stays fail-closed dark; launch + the switch flip are gated on the eval passing and Anastasia's sign-off, done by the human, not you.
- **No em dashes** on any surface (code comments, docs, copy), hard house rule. Use commas/colons/periods/parentheses.
- **Single-pen:** commit only your own assistant files; never sweep in marketing files (`src/data/portfolio/*.json`, `src/app/api/admin/analytics/route.ts`, etc.) or Codex-owned files. Verify `git diff --cached --name-only` before every commit. (A stray `analytics/route.ts` contaminated a commit earlier, reset + rebuild if it happens.)
- **Commit/push only when done with a coherent slice; never push** (feature branch, prod-serving). Freeze the slice, report the hash.
- **PII wall:** the context you send Claude contains ONLY the tenant's client-safe fields. No internal notes, no fee/pricing math, no other tenant's data, no `maria@kanset.com`-class PII beyond what the client-safe views already expose.
- **Don't guess a column or RPC name**, read the migration / the existing `src/lib/portal/*.ts` surface modules and mirror them.

## When you're done

Freeze each increment, report its hash, and post a short status. The assistant is not "done" until: all increments built + self-verified, Codex has reviewed the hashes, the eval has been run with a real key and passes the safety-critical classes at 100%, and Anastasia has signed off on the eval transcript + the system prompt. Only then does the human flip the switch.
