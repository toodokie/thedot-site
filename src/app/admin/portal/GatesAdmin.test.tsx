import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MyTasksAdmin } from './GatesAdmin'
import type { CompletedOpsTask, OpsTaskRow, ProductionGateRow, StagePiece } from '@/lib/portal/gates'

const gate = (gate_key: ProductionGateRow['gate_key'], state: ProductionGateRow['state']): ProductionGateRow => ({
  gate_key, state, owner_label: 'anastasia', occurred_at: state === 'done' ? '2026-08-20T12:00:00Z' : null,
  note: null, na_reason: state === 'na' ? 'not applicable' : null,
})

const piece = (id: string, overrides: Partial<StagePiece> = {}): StagePiece => ({
  clientId: 'client-kanset', clientName: 'Kanset', contentId: id, title: id,
  plannedDate: '2026-08-24', workingVersion: 1, visibleVersion: 1, released: true,
  status: 'draft', factCheck: 'confirmed', factCheckExempt: false, factCheckValid: true,
  currentDecision: null, ideaDecision: 'approved', ideaDecisionSource: 'batch',
  ideaDecisionNote: null, ideaApprovalSentAt: '2026-08-20T12:00:00Z', approvalSentAt: null,
  platforms: [], archived: false, gates: [], dests: [], ...overrides,
})

const ops = (id: string, due_date: string): OpsTaskRow => ({
  id, clientId: 'client-kanset', clientName: 'Kanset', title: 'Review client notification volume',
  category: 'portal', due_date, trigger_note: `Alert ${id}`, status: 'open',
})

describe('MyTasksAdmin', () => {
  it('leads with client changes, groups monitor alerts, and collapses waiting history', () => {
    const pieces: StagePiece[] = [
      piece('Employer guide', {
        currentDecision: null, openClientEdits: 2, ideaDecision: null,
        gates: [gate('design_built', 'done'), gate('proofed', 'done'), gate('approval_sent', 'done')],
      }),
      ...Array.from({ length: 6 }, (_, index) => piece(`Waiting piece ${index + 1}`, {
        plannedDate: `2026-08-${18 + index}`,
        ideaDecision: null,
      })),
    ]
    const completedOps: CompletedOpsTask[] = [
      { id: 'fixture', clientName: 'Agency', title: 'Renew the domain', category: 'admin',
        status: 'done', triggerNote: null, completionNote: 'test fixture cleanup', completedAt: '2026-08-23' },
      { id: 'real', clientName: 'Kanset', title: 'Send the report', category: 'report',
        status: 'done', triggerNote: null, completionNote: 'Sent', completedAt: '2026-08-22' },
    ]

    render(<MyTasksAdmin pieces={pieces} opsTasks={[ops('old', '2026-08-03'), ops('new', '2026-08-22')]}
      completedOps={completedOps} openComments={[]} openProposals={[]} todayIso="2026-08-24" />)

    expect(screen.getByRole('heading', { level: 1, name: 'My tasks' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Needs your attention' })).toBeInTheDocument()
    expect(screen.getByText("Review Maria's 2 changes")).toBeInTheDocument()
    expect(screen.queryByText('Resolve plan direction')).not.toBeInTheDocument()
    expect(screen.getAllByText('Review client notification volume')).toHaveLength(1)
    expect(screen.getByText('2 alerts grouped')).toBeInTheDocument()
    expect(screen.getByText('Show 1 more')).toBeInTheDocument()
    expect(screen.queryByText('test fixture cleanup')).not.toBeInTheDocument()
    expect(screen.queryByText('Renew the domain')).not.toBeInTheDocument()
    expect(screen.getByText('Send the report')).toBeInTheDocument()
  })
})
