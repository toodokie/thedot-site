// One-time production-gate backfill (gate-system spec section 6, Anastasia's go
// 2026-07-21). Every emission runs through the REAL `portal-write gate` command
// (receipts, actor validation, audit events), never direct SQL. Deterministic
// idempotency keys make the whole run re-runnable.
//
// Usage: tsx scripts/backfill-production-gates-2026-07.ts [--dry-run]
//
// Sources of truth:
// - 11 posted/historical pieces: all gates done, note "backfill: shipped
//   pre-gate-system", occurred_at = first_live date; source_in_hand done only on
//   studio-sourced pieces, na elsewhere (call 5: na, not done, keeps the gate strict).
// - decoder + ep2: verbatim from their publish packs' STATUS GATES blocks
//   (~/Kanset/content/publish-monday-2026-07-20.md, publish-tuesday-2026-07-21.md).
// - H&C: design/proof OPEN; approval_sent DONE (the corrected v2 was emailed to Maria
//   2026-07-20 with a change note, and the canonical v2 revision has landed).
// - ep3 + where-to-start: per reality (ep3 studio cut in hand since Jul 15).
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

type Emission = {
  contentId: string
  gateKey: 'source_in_hand' | 'design_built' | 'proofed' | 'approval_sent'
  state: 'open' | 'done' | 'na'
  owner?: 'anastasia' | 'studio' | 'agent'
  occurredAt?: string
  note?: string
  naReason?: string
}

const HISTORICAL_NOTE = 'backfill: shipped pre-gate-system'
const NA_NOT_STUDIO = 'not studio-sourced'

// contentId, first_live date, studio-sourced?
const HISTORICAL: Array<[string, string, boolean]> = [
  ['kanset-2026-07-oinp-carousel', '2026-07-07', false],
  ['kanset-2026-07-oinp-article', '2026-07-07', false],
  ['kanset-2026-07-oinp-reel', '2026-07-08', false],
  ['kanset-2026-07-intro-video', '2026-07-09', true],
  ['kanset-2026-07-monthly-roundup', '2026-07-10', false],
  ['kanset-2026-07-physicians-carousel', '2026-07-13', false],
  ['kanset-2026-07-askkanset-ep1', '2026-07-14', true],
  ['kanset-2026-07-employer-oinp-support', '2026-07-15', false],
  ['kanset-2026-07-podcast-ep1', '2026-07-16', true],
  ['kanset-2026-07-ep1-article', '2026-07-16', false],
  ['kanset-2026-07-wage-thresholds', '2026-07-17', false],
]

const emissions: Emission[] = []

for (const [contentId, liveDate, studio] of HISTORICAL) {
  const occurredAt = `${liveDate}T16:00:00Z`
  emissions.push(studio
    ? { contentId, gateKey: 'source_in_hand', state: 'done', owner: 'studio', occurredAt, note: HISTORICAL_NOTE }
    : { contentId, gateKey: 'source_in_hand', state: 'na', naReason: NA_NOT_STUDIO, note: HISTORICAL_NOTE })
  for (const gateKey of ['design_built', 'proofed', 'approval_sent'] as const) {
    emissions.push({ contentId, gateKey, state: 'done', occurredAt, note: HISTORICAL_NOTE })
  }
}

// Decoder: verbatim from publish-monday-2026-07-20.md (no source-in-hand line there:
// The-Dot-designed animated reel, so na per call 5).
emissions.push(
  { contentId: 'kanset-2026-07-lmia-decoder-reel', gateKey: 'source_in_hand', state: 'na',
    naReason: `${NA_NOT_STUDIO} (animated reel, The Dot design)` },
  { contentId: 'kanset-2026-07-lmia-decoder-reel', gateKey: 'design_built', state: 'done',
    occurredAt: '2026-07-16T16:00:00Z',
    note: "animated frames (MG's own Frame 2 + Frame 3 edits kept); page-4 contrast fixed" },
  { contentId: 'kanset-2026-07-lmia-decoder-reel', gateKey: 'proofed', state: 'done',
    occurredAt: '2026-07-16T16:00:00Z',
    note: 'design text: frames Maria-reviewed + page-4 contrast fixed; no spoken audio, so no caption pass' },
  { contentId: 'kanset-2026-07-lmia-decoder-reel', gateKey: 'approval_sent', state: 'done',
    occurredAt: '2026-07-18T16:00:00Z',
    note: 'email-mg-monday-posts.md (Spark thread "Two posts for Monday, need your okay", ID 34600)' },
)

// Ep2: verbatim from publish-tuesday-2026-07-21.md.
emissions.push(
  { contentId: 'kanset-2026-07-askkanset-ep2-layoff', gateKey: 'source_in_hand', state: 'done',
    owner: 'studio', occurredAt: '2026-07-20T16:00:00Z',
    note: 'final reel + cover source in hand (Drive links in the pack Assets)' },
  { contentId: 'kanset-2026-07-askkanset-ep2-layoff', gateKey: 'design_built', state: 'done',
    occurredAt: '2026-07-20T16:00:00Z', note: 'ASK KANSET cover built (Drive link in the pack Assets)' },
  { contentId: 'kanset-2026-07-askkanset-ep2-layoff', gateKey: 'proofed', state: 'done',
    occurredAt: '2026-07-20T16:00:00Z',
    note: 'captions proofed + fixes applied (labour, Record of Employment, cleaned the garbled line); cover text checked at build' },
  { contentId: 'kanset-2026-07-askkanset-ep2-layoff', gateKey: 'approval_sent', state: 'done',
    occurredAt: '2026-07-20T16:00:00Z', note: 'email-mg-tuesday-reel-2026-07-21.md SENT' },
)

// H&C: production gates open; approval_sent closed by the corrected-copy email (the
// canonical v2 revision has landed; her decision on v2 closes copy-approved, not this).
emissions.push(
  { contentId: 'kanset-2026-07-hc-success-story', gateKey: 'source_in_hand', state: 'na',
    naReason: `${NA_NOT_STUDIO} (MG's client-story brief)` },
  { contentId: 'kanset-2026-07-hc-success-story', gateKey: 'design_built', state: 'open',
    note: 'carousel build to do (design brief only)' },
  { contentId: 'kanset-2026-07-hc-success-story', gateKey: 'proofed', state: 'open' },
  { contentId: 'kanset-2026-07-hc-success-story', gateKey: 'approval_sent', state: 'done',
    occurredAt: '2026-07-20T22:00:00Z',
    note: 'corrected v2 copy emailed to Maria 2026-07-20 with a change note; canonical v2 landed; her decision on v2 closes copy-approved' },
)

// Ep3: studio cut in hand since Jul 15 (Set 1 Clip 3); rest open.
emissions.push(
  { contentId: 'kanset-2026-07-askkanset-ep3-move-provinces', gateKey: 'source_in_hand', state: 'done',
    owner: 'studio', occurredAt: '2026-07-15T16:00:00Z', note: 'Set 1 Clip 3 + brief (Drive)' },
  { contentId: 'kanset-2026-07-askkanset-ep3-move-provinces', gateKey: 'design_built', state: 'open',
    note: 'Canva cover from cover-brief-askkanset-ep3.md' },
  { contentId: 'kanset-2026-07-askkanset-ep3-move-provinces', gateKey: 'proofed', state: 'open',
    note: 'CapCut captions + cover text; jargon: GTA, BC, PNP, Quebec, Kanset, Maria Guerts' },
  { contentId: 'kanset-2026-07-askkanset-ep3-move-provinces', gateKey: 'approval_sent', state: 'open' },
)

// Where-to-start: The-Dot animated reel, storyboard stage.
emissions.push(
  { contentId: 'kanset-2026-07-where-to-start-reel', gateKey: 'source_in_hand', state: 'na',
    naReason: `${NA_NOT_STUDIO} (The Dot animated reel)` },
  { contentId: 'kanset-2026-07-where-to-start-reel', gateKey: 'design_built', state: 'open',
    note: 'storyboard brief only; reel build to do' },
  { contentId: 'kanset-2026-07-where-to-start-reel', gateKey: 'proofed', state: 'open' },
  { contentId: 'kanset-2026-07-where-to-start-reel', gateKey: 'approval_sent', state: 'open' },
)

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const dir = await mkdtemp(join(tmpdir(), 'gates-backfill-'))
  let failures = 0
  try {
    for (const emission of emissions) {
      const payload = {
        clientSlug: 'kanset',
        contentId: emission.contentId,
        gateKey: emission.gateKey,
        state: emission.state,
        owner: emission.owner ?? 'anastasia',
        note: emission.note ?? null,
        naReason: emission.naReason ?? null,
        occurredAt: emission.occurredAt ?? null,
        actorKey: 'thedot-admin',
        idempotencyKey: `gates-backfill-${emission.contentId}-${emission.gateKey}`,
      }
      const file = join(dir, `${emission.contentId}-${emission.gateKey}.json`)
      await writeFile(file, JSON.stringify(payload))
      const args = ['tsx', 'scripts/portal-write.ts', 'gate', file, ...(dryRun ? ['--dry-run'] : [])]
      const result = spawnSync('npx', args, { stdio: 'pipe', encoding: 'utf8' })
      const label = `${emission.contentId} ${emission.gateKey} -> ${emission.state}`
      if (result.status === 0) {
        console.log(`OK   ${label}`)
      } else {
        failures += 1
        console.error(`FAIL ${label}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`)
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  console.log(`\n${dryRun ? 'DRY RUN ' : ''}backfill: ${emissions.length - failures}/${emissions.length} emissions ok`)
  if (failures > 0) process.exit(1)
}

main().catch((error) => { console.error(error); process.exit(1) })
