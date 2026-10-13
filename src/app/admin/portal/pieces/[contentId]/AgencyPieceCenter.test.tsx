import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const calls = vi.hoisted(() => ({ v2: [] as Array<Record<string, unknown>>, v1: [] as Array<Record<string, unknown>> }))
vi.mock('@/app/client/[slug]/piece/[contentId]/v2/PiecePageV2', () => ({
  default: (props: Record<string, unknown>) => { calls.v2.push(props); return <div data-testid="v2">{props.bottomBar as React.ReactNode}</div> },
}))
vi.mock('@/app/client/[slug]/piece/[contentId]/PieceReviewScreen', () => ({
  default: (props: Record<string, unknown>) => { calls.v1.push(props); return <div data-testid="v1" /> },
}))

import AgencyPieceCenter from './AgencyPieceCenter'
import type { ClientPiecePreviewData } from './maria-preview/preview-data'

const preview = {
  clientId: 'c', slug: 'kanset', item: { id: 'item', version: 2 }, comments: [], schedule: { targets: [], requests: [] },
  publication: [], requests: [], requestMessages: [], reviewAssets: [], seatName: 'Maria Guerts', seatUserId: 'u1',
  seatRequestIds: ['r1'], capabilities: { canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true },
} as unknown as ClientPiecePreviewData

const common = {
  contentId: 'kanset-reel', previews: [], ticks: ['caption'],
  fallback: <p>Working copy</p>, sidePanel: <aside aria-label="Agency panel" />,
  bottomBar: <div role="region" aria-label="Maria's view" />,
}

describe('AgencyPieceCenter', () => {
  it('renders her new page in agency mode with her ticks, never her seat as the writer', () => {
    calls.v2.length = 0
    render(<AgencyPieceCenter {...common} preview={preview} layout="v2" />)
    expect(screen.getByTestId('v2')).toBeInTheDocument()
    expect(calls.v2[0]).toMatchObject({
      mode: 'agency', ticks: ['caption'], serverDrafts: null, showIntro: false,
      draftScope: 'agency-view:Maria Guerts', seatRequestIds: ['r1'],
      previewRefreshBase: '/api/admin/portal/review-previews',
    })
    expect(screen.getByRole('region', { name: "Maria's view" })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Agency panel' })).toBeInTheDocument()
  })

  it('renders the page she still has, read-only, when her seat is on the current layout', () => {
    calls.v1.length = 0
    render(<AgencyPieceCenter {...common} preview={preview} layout="v1" />)
    expect(screen.getByTestId('v1')).toBeInTheDocument()
    expect(document.querySelector('[data-maria-preview="read-only"]')).not.toBeNull()
    expect(calls.v1[0]).toMatchObject({ showReviewIntro: false, draftScope: 'agency-view:Maria Guerts' })
    expect(screen.getByRole('region', { name: "Maria's view" })).toBeInTheDocument()
  })

  it('shows the working copy when nothing is shared', () => {
    render(<AgencyPieceCenter {...common} preview={null} layout="v2" />)
    expect(screen.getByText('Working copy')).toBeInTheDocument()
    expect(screen.queryByTestId('v2')).not.toBeInTheDocument()
  })
})

describe('AgencyPieceCenter for another client', () => {
  it('points the back link at the piece under its own client', () => {
    calls.v2.length = 0
    render(<AgencyPieceCenter {...common} contentId="acme-reel" preview={{ ...preview, slug: 'acme' } as ClientPiecePreviewData} layout="v2" />)
    expect(calls.v2[0]).toMatchObject({ backHref: '/admin/portal/pieces/acme-reel?client=acme' })
  })
})
