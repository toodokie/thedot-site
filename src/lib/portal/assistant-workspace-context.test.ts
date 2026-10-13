import { describe, expect, it } from 'vitest'
import {
  buildPlanContextChunks,
  buildRecentContentChunks,
  buildReviewQueueChunks,
} from './assistant-workspace-context'

describe('assistant workspace context', () => {
  it('matches the Overview review queue and excludes copy-only packages', () => {
    const chunks = buildReviewQueueChunks({
      content: [
        { id: '1', content_id: 'ready', title: 'Ready piece', planned_date: '2026-08-05', platforms: ['Instagram'], canva_url: null, drive_url: null, review_ready: true },
        { id: '2', content_id: 'copy-only', title: 'Copy only', planned_date: '2026-08-06', platforms: [], canva_url: null, drive_url: null, review_ready: false },
      ],
      plans: [{ id: '3', title: 'August week one', week_start: '2026-08-03', week_end: '2026-08-09', revision: 2, status: 'submitted' }],
      proposals: [{ id: '4', proposal_key: 'measurement', title: 'Measurement plan', revision: 1, status: 'awaiting_decision' }],
    })
    expect(chunks.map((chunk) => chunk.title)).toEqual(['Ready piece', 'August week one', 'Measurement plan'])
    expect(chunks.map((chunk) => chunk.related_route)).toEqual(['piece/ready', 'plan', 'requests/proposals/measurement'])
  })

  it('builds recent content from current portal workflow records', () => {
    const [chunk] = buildRecentContentChunks([{ id: '1', content_id: 'recent', title: 'Recent piece', planned_date: '2026-08-04', platforms: ['Facebook'], format: 'reel', client_state: 'scheduled' }])
    expect(chunk.excerpt).toContain('Workflow status: scheduled')
    expect(chunk.related_route).toBe('piece/recent')
  })

  it('joins client-visible plan items to their plan context', () => {
    const [chunk] = buildPlanContextChunks(
      [{ id: 'cycle', title: 'August week one', week_start: '2026-08-03', week_end: '2026-08-09', revision: 1, status: 'approved', direction_summary: 'Employer content' }],
      [{ id: 'item', plan_cycle_id: 'cycle', content_id: 'worker', position: 1, planned_date: '2026-08-05', title: 'Keep your workers', format: 'carousel', platforms: ['Instagram'], direction_note: 'Retention angle' }],
    )
    expect(chunk.excerpt).toContain('Plan: August week one')
    expect(chunk.excerpt).toContain('Piece: Keep your workers')
  })
})
