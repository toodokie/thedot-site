# Assistant OpenAI Rebuild — Addendum (SUPERSEDES the provider/data-model parts of the 2026-07-20 HANDOFF)

The original handoff and design doc were written from compacted conversation memory and WRONGLY specified
Claude/Anthropic. **The signed spec is `~/Kanset/portal-integration-task.md`**: section 5.6 (OpenAI gateway),
scenario row 26, the `assistant_documents` section (~line 729), and the retention rules (~line 748). Anastasia
decided OpenAI. Read those spec sections IN FULL before writing code; where this addendum and the spec
disagree, the spec wins. The prior handoff remains valid for: repo conventions, the verification bar, the
single-pen/commit discipline, and the hard constraints (no switch flips, no prod DB, no em dashes, no push).

## What survives from the Claude-based build (commits 83bb699..84b4a84)

- `assistant-guardrails.ts` core: inbound classifier, no-guarantees output validator, REDIRECT_MESSAGE, and
  the system-prompt compliance spine (retarget its wording where the spec's scope is broader, see below).
- The 0017 gate plane concept (`portal_assistant_gate`, switch + capability fail-closed) and the chat UI shell
  + PortalNav entry.
- The eval harness structure and the test-rls patterns.

## What must change to match the spec

1. **Provider**: npm `openai`, **Responses API** (NOT Chat Completions), `store: false` on EVERY request,
   strict structured outputs via Responses `text.format`. WebFetch the official guides linked in section 5.6
   for exact current API shapes; do not code from memory.
2. **Model**: `gpt-5.6-terra` (client navigator). Verify availability against `GET /v1/models` with the key
   (`OPENAI_API_KEY` in `.env.local`, fine for dev; launch uses a separate restricted `OPENAI_PORTAL_API_KEY`,
   which is a human step, not yours). Pin the evaluated model + config; a model/prompt change re-requires the
   golden eval.
3. **Scope is BROADER than account-only**: per scenario 26 the assistant answers (a) portal/account questions
   from tenant-safe retrieval AND (b) public immigration news/regulation questions via the Responses
   `web_search` tool, isolated, restricted to official sources (domain filters; align the allowlist with
   `~/Kanset/portal-allowlists.md`), with complete source metadata and URL citations rendered visibly and
   clickable in the UI. It still hard-refuses personalized case assessment/advice (guardrails core stays).
4. **Data model**: build the `assistant_documents` safe knowledge index exactly as specced: a smaller,
   assistant-readable projection built ONLY from already client-readable safe views, with `grounded_answer`
   vs `navigation_only` trust classes; raw comment/request/activity bodies are navigation_only metadata and
   are NEVER sent to OpenAI. Do not ship the raw safe-view loader from the Claude build as the context source.
5. **Retention**: NEVER persist raw questions or answers. Page-memory transcript only, resent as untrusted
   input, cleared on logout/refresh. Store only `assistant_runs`-style telemetry per the spec's retention
   section. Rework 0017's `assistant_usage` accordingly in a NEW migration (0018+); keep whatever of 0017 the
   telemetry legitimately needs, and keep the migration-convention discipline (cumulative assertion fold).
6. **Limits (server-side only, from the spec, replacing the Claude build's numbers)**: 30 generations per
   user/day, 120 per tenant/day, 800 output tokens per answer, bounded transcript/retrieval context, combined
   soft alert $15/month and hard stop $25/month. Fail closed.
7. **Eval**: rewrite `scripts/assistant-eval.ts` for the OpenAI gateway. It CAN run in this environment
   (OPENAI_API_KEY is present). Run it. Required: 100% on refuse-personal-advice, injection resistance, and
   no-cross-tenant; also exercise the web-search path with citation checks. Save the transcript under
   `.work/` for Anastasia's records.

## Verification bar

Same as the original handoff (local stack only via `npx supabase@2.109.1` with the local-status env override,
NEVER `.env.local` for DB work; fresh replay + cumulative assertions; test-rls; vitest; `npx next build`
directly, since `npm run build` triggers the marketing portfolio sync). Plus: the live eval run above.

## Reporting

Frozen commit hashes per increment, what was reused vs replaced from 83bb699..84b4a84, eval transcript path
and scores, and any spec ambiguity you had to interpret (list them explicitly for Codex + Anastasia).
