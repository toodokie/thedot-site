import type { RetrievedChunk } from './assistant'

export type ReviewContentRow = {
  id: string
  content_id: string
  title: string
  planned_date: string | null
  platforms: string[] | null
  canva_url: string | null
  drive_url: string | null
  review_ready: boolean
}

export type ReviewPlanRow = {
  id: string
  title: string
  week_start: string
  week_end: string
  revision: number
  status: string
}

export type ReviewProposalRow = {
  id: string
  proposal_key: string
  title: string
  revision: number
  status: string
}

export type RecentContentRow = {
  id: string
  content_id: string
  title: string
  planned_date: string | null
  platforms: string[] | null
  format: string | null
  client_state: string
}

export type PlanContextRow = ReviewPlanRow & { direction_summary: string }
export type PlanItemContextRow = {
  id: string
  plan_cycle_id: string
  content_id: string
  position: number
  planned_date: string | null
  title: string
  format: string | null
  platforms: string[] | null
  direction_note: string | null
}

function sentence(fields: Array<string | null>): string {
  return fields.filter((field): field is string => Boolean(field)).join('. ').slice(0, 700) + '.'
}

export function buildReviewQueueChunks(options: {
  content: ReviewContentRow[]
  plans: ReviewPlanRow[]
  proposals: ReviewProposalRow[]
}): RetrievedChunk[] {
  const content = options.content
    .filter((row) => row.review_ready)
    .map((row, index): RetrievedChunk => ({
      chunk_id: row.id,
      document_id: row.id,
      source_type: 'review_content',
      title: row.title,
      related_route: `piece/${row.content_id}`,
      answer_eligibility: 'grounded_answer',
      excerpt: sentence([
        'Maria review queue item',
        'Type: final content package',
        `Title: ${row.title}`,
        'Status: waiting for Maria review',
        row.planned_date ? `Planned date: ${row.planned_date}` : null,
        row.platforms?.length ? `Platforms: ${row.platforms.join(', ')}` : null,
      ]),
      rank: 1200 - index,
    }))
  const plans = options.plans.map((row, index): RetrievedChunk => ({
    chunk_id: row.id,
    document_id: row.id,
    source_type: 'review_plan',
    title: row.title,
    related_route: 'plan',
    answer_eligibility: 'grounded_answer',
    excerpt: sentence([
      'Maria review queue item',
      'Type: content plan',
      `Title: ${row.title}`,
      `Status: ${row.status.replaceAll('_', ' ')}`,
      `Week: ${row.week_start} to ${row.week_end}`,
      `Revision: ${row.revision}`,
    ]),
    rank: 1100 - index,
  }))
  const proposals = options.proposals.map((row, index): RetrievedChunk => ({
    chunk_id: row.id,
    document_id: row.id,
    source_type: 'review_proposal',
    title: row.title,
    related_route: `requests/proposals/${row.proposal_key}`,
    answer_eligibility: 'grounded_answer',
    excerpt: sentence([
      'Maria review queue item',
      'Type: proposal',
      `Title: ${row.title}`,
      `Status: ${row.status.replaceAll('_', ' ')}`,
      `Revision: ${row.revision}`,
    ]),
    rank: 1000 - index,
  }))
  return [...content, ...plans, ...proposals].slice(0, 12)
}

export function buildRecentContentChunks(rows: RecentContentRow[]): RetrievedChunk[] {
  return rows.slice(0, 8).map((row, index) => ({
    chunk_id: row.id,
    document_id: row.id,
    source_type: 'recent_content',
    title: row.title,
    related_route: `piece/${row.content_id}`,
    answer_eligibility: 'grounded_answer',
    excerpt: sentence([
      'Recent portal content piece',
      `Title: ${row.title}`,
      `Workflow status: ${row.client_state.replaceAll('_', ' ')}`,
      row.planned_date ? `Planned date: ${row.planned_date}` : null,
      row.format ? `Format: ${row.format}` : null,
      row.platforms?.length ? `Platforms: ${row.platforms.join(', ')}` : null,
    ]),
    rank: 1000 - index,
  }))
}

export function buildPlanContextChunks(
  cycles: PlanContextRow[],
  items: PlanItemContextRow[],
): RetrievedChunk[] {
  const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]))
  return items.slice(0, 12).flatMap((item, index): RetrievedChunk[] => {
    const cycle = cycleById.get(item.plan_cycle_id)
    if (!cycle) return []
    return [{
      chunk_id: item.id,
      document_id: cycle.id,
      source_type: 'content_plan_item',
      title: item.title,
      related_route: `plan/${item.content_id}`,
      answer_eligibility: 'grounded_answer',
      excerpt: sentence([
        'Client-visible content plan item',
        `Plan: ${cycle.title}`,
        `Plan status: ${cycle.status.replaceAll('_', ' ')}`,
        `Week: ${cycle.week_start} to ${cycle.week_end}`,
        `Plan direction: ${cycle.direction_summary}`,
        `Piece: ${item.title}`,
        item.planned_date ? `Planned date: ${item.planned_date}` : null,
        item.format ? `Format: ${item.format}` : null,
        item.platforms?.length ? `Platforms: ${item.platforms.join(', ')}` : null,
        item.direction_note ? `Piece direction: ${item.direction_note}` : null,
      ]),
      rank: 1000 - index,
    }]
  })
}
