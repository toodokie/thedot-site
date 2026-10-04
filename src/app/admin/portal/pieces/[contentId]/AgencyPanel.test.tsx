import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import AgencyPanel, { type AgencyPanelModel } from './AgencyPanel'
import AgencyStateBar from './AgencyStateBar'

const model = (overrides: Partial<AgencyPanelModel> = {}): AgencyPanelModel => ({
  contentId: 'kanset-reel', released: true, stageLabel: 'Awaiting Maria', gatesSummary: '5 of 9 gates',
  gates: [
    { key: 'fact-check', label: 'Fact-check', state: 'done', date: '2026-09-25' },
    { key: 'source-in-hand', label: 'Studio cut', state: 'done', date: '2026-09-25' },
    { key: 'design-built', label: 'Design', state: 'done', date: '2026-09-25' },
    { key: 'proofed', label: 'Proof', state: 'done', date: '2026-09-25' },
    { key: 'approval-sent', label: 'Final copy + design sent', state: 'done', date: '2026-09-30' },
    { key: 'copy-approved', label: 'Final copy + design approved', state: 'open', date: null },
    { key: 'scheduled', label: 'Scheduled', state: 'open', date: null },
    { key: 'posted', label: 'Posted', state: 'open', date: null },
    { key: 'link-confirmed', label: 'Link confirmed', state: 'absent', date: null },
  ],
  versions: [{ version: 2, label: 'v2 shared with Maria', date: '2026-09-30' }, { version: 1, label: 'v1 superseded', date: '2026-09-25' }],
  requestViews: [
    { id: 'r1', heading: 'Frame 3', kind: 'visual', quote: 'Can the headline use the caption wording?', date: '2026-09-30',
      state: 'Open', thumbs: [{ label: 'Frame 3', url: 'https://signed/f3.jpg' }] },
    { id: 'r2', heading: 'YouTube description', kind: 'text', quote: 'New description', date: '2026-09-30',
      state: 'Applied', thumbs: [] },
  ],
  reviewAssets: [{ id: 'a1', label: 'Reel cover', channel: 'social', asset_kind: 'cover', url: 'https://drive.google.com/x',
    caption_status: 'not_applicable', review_note: null }],
  workingAssets: null,
  previews: [{ id: 'p', contentItemId: 'i', contentVersion: 2, previewKey: 'reel-video', mediaKind: 'video', width: 1080,
    height: 1920, durationSeconds: 39, videoUrl: 'https://signed/v.mp4', posterUrl: null,
    frames: Array.from({ length: 8 }, (_, i) => ({ label: `Frame ${i + 1}`, url: `https://signed/f${i}.jpg` })),
    expiresAt: 'x' }],
  previewError: null,
  mediaOverride: null,
  design: { canva: 'https://www.canva.com/design/X/view', drive: null },
  drafts: [{ seatName: 'Maria Guerts', unsentCount: 2, failedCount: 0, carriedCount: 0,
    oldestSavedAt: '2026-10-02T14:00:00.000Z', lastError: null }],
  feedback: { seatName: 'Maria Guerts', rating: 4, comment: 'Much easier on my phone.', createdAt: 'x', promptKey: 'p' },
  plannedDate: '2026-10-04', todayIso: '2026-10-03', nowIso: '2026-10-03T16:00:00.000Z',
  ...overrides,
})

describe('AgencyPanel', () => {
  it('leads with View as Maria and the stage', () => {
    render(<AgencyPanel model={model()} />)
    const panel = screen.getByRole('complementary', { name: 'Agency panel' })
    expect(within(panel).getByRole('link', { name: 'View as Maria' }))
      .toHaveAttribute('href', '/admin/portal/pieces/kanset-reel/maria-preview')
    expect(panel).toHaveTextContent('Stage: Awaiting Maria · 5 of 9 gates')
  })

  it('raises the unsent-drafts alert in the mockup wording', () => {
    render(<AgencyPanel model={model()} />)
    expect(screen.getByText('Maria has 2 unsent edits on this piece, saved 26 hours ago. It posts in 1 day.')).toBeInTheDocument()
  })

  it('raises a failed send as a danger alert', () => {
    render(<AgencyPanel model={model({ drafts: [{ seatName: 'Maria Guerts', unsentCount: 2, failedCount: 2, carriedCount: 0,
      oldestSavedAt: '2026-10-03T15:00:00.000Z', lastError: 'draft_too_long' }] })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Maria tried to send 2 edits and it failed (draft too long). Her text is saved and she sees Retry.')
  })

  it('shows nine gate dots with dates', () => {
    render(<AgencyPanel model={model()} />)
    const gates = screen.getByRole('list', { name: 'Production gates' })
    expect(within(gates).getAllByRole('listitem')).toHaveLength(9)
    expect(within(gates).getAllByRole('listitem')[0]).toHaveTextContent('Fact-checkSep 25')
    expect(within(gates).getAllByRole('listitem')[8]).toHaveTextContent('Link confirmednot tracked')
  })

  it('shows the frame a visual request was left on, and a text tile otherwise', () => {
    render(<AgencyPanel model={model()} />)
    expect(screen.getByRole('img', { name: 'Frame 3' })).toHaveAttribute('src', 'https://signed/f3.jpg')
    const requests = screen.getByRole('list', { name: "Maria's requests" })
    expect(requests).toHaveTextContent('Frame 3, visual')
    expect(requests).toHaveTextContent('“Can the headline use the caption wording?” Sep 30 · Open')
    expect(requests).toHaveTextContent('YouTube description')
    expect(requests).toHaveTextContent('Sep 30 · Applied')
  })

  it('lists the portal preview, review assets, design links and feedback', () => {
    render(<AgencyPanel model={model()} />)
    expect(screen.getByText('Video preview, portal storage')).toBeInTheDocument()
    expect(screen.getByText('Frame strip, 8 images')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Reel cover' })).toHaveAttribute('href', 'https://drive.google.com/x')
    expect(screen.getByRole('link', { name: 'Open design source' })).toBeInTheDocument()
    expect(screen.getByText('Review page: 4 of 5. “Much easier on my phone.”')).toBeInTheDocument()
  })

  it('says plainly when nothing is shared yet', () => {
    render(<AgencyPanel model={model({ released: false, previews: [], drafts: [], requestViews: [], feedback: null })} />)
    expect(screen.queryByRole('link', { name: 'View as Maria' })).not.toBeInTheDocument()
    expect(screen.getByText('Not shared with Maria yet')).toBeInTheDocument()
    expect(screen.getByText('No portal preview. Maria sees the Drive button.')).toBeInTheDocument()
    expect(screen.getByText('Maria has not sent a request on this piece.')).toBeInTheDocument()
    expect(screen.getByText('No answer yet.')).toBeInTheDocument()
  })
})

describe('AgencyStateBar', () => {
  it('states Maria\'s view and links to it', () => {
    render(<AgencyStateBar contentId="kanset-reel" line="2 unsent edits · Approve waiting" released />)
    expect(screen.getByRole('region', { name: "Maria's view" })).toHaveTextContent("Maria's view2 unsent edits · Approve waiting")
    expect(screen.getByRole('link', { name: 'View as Maria' })).toBeInTheDocument()
  })
})

describe('AgencyStateBar ticks (0094 server ticks)', () => {
  it('carries her review progress and offers no action on her behalf', () => {
    render(<AgencyStateBar contentId="kanset-reel" line="2 of 3 reviewed · Waiting for her review" released />)
    const bar = screen.getByRole('region', { name: "Maria's view" })
    expect(bar).toHaveTextContent('2 of 3 reviewed · Waiting for her review')
    expect(within(bar).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('AgencyPanel release media (amended 2026-10-03)', () => {
  it('shows Anastasia\'s no-media override for the version Maria sees', () => {
    render(<AgencyPanel model={model({ previews: [], reviewAssets: [], design: { canva: null, drive: null },
      mediaOverride: 'Approved by Anastasia: article, no visual' })} />)
    expect(screen.getByText('Released without media. Approved by Anastasia: article, no visual')).toBeInTheDocument()
    expect(screen.queryByText(/nothing to look at/)).not.toBeInTheDocument()
  })

  it('says plainly when Maria has nothing to look at', () => {
    render(<AgencyPanel model={model({ previews: [], reviewAssets: [], design: { canva: null, drive: null } })} />)
    expect(screen.getByText('Maria has nothing to look at on this version. Attach a review asset, preview or design link.'))
      .toBeInTheDocument()
  })

  it('says nothing about media when something is attached', () => {
    render(<AgencyPanel model={model()} />)
    expect(screen.queryByText(/nothing to look at/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Released without media/)).not.toBeInTheDocument()
  })

  it('offers no control that creates an override', () => {
    render(<AgencyPanel model={model({ previews: [], reviewAssets: [], design: { canva: null, drive: null } })} />)
    expect(screen.getByRole('complementary', { name: 'Agency panel' }).querySelector('button, form, input')).toBeNull()
  })
})

describe('AgencyPanel asset detail (review fixes 2026-10-04)', () => {
  const video = { id: 'v1', label: 'Reel video', channel: 'social', asset_kind: 'video', url: 'https://drive.google.com/v',
    caption_status: 'burned_in_proofed', review_note: 'Captions proofed against the jargon list.' }

  it('shows each asset\'s caption proof state and review note', () => {
    render(<AgencyPanel model={model({ reviewAssets: [video] })} />)
    expect(screen.getByText('Reel video')).toBeInTheDocument()
    expect(screen.getByText('Captions: burned in proofed')).toBeInTheDocument()
    expect(screen.getByText('Captions proofed against the jargon list.')).toBeInTheDocument()
  })

  it('lists the working version\'s assets when it is ahead of what Maria sees', () => {
    render(<AgencyPanel model={model({ workingAssets: { version: 3, assets: [{ ...video, id: 'v3', label: 'Reel video v3',
      caption_status: 'needs_proof', review_note: null }] } })} />)
    const section = screen.getByRole('region', { name: 'Working copy, v3, not shared yet' })
    expect(within(section).getByText('Reel video v3')).toBeInTheDocument()
    expect(within(section).getByText('Captions: needs proof')).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'Open Reel video v3' })).toHaveAttribute('href', 'https://drive.google.com/v')
  })

  it('says so when the working version has no assets yet', () => {
    render(<AgencyPanel model={model({ workingAssets: { version: 3, assets: [] } })} />)
    expect(within(screen.getByRole('region', { name: 'Working copy, v3, not shared yet' }))
      .getByText('No review assets attached to this version yet.')).toBeInTheDocument()
  })

  it('shows no working section when the working version is the one Maria sees', () => {
    render(<AgencyPanel model={model()} />)
    expect(screen.queryByRole('region', { name: /Working copy/ })).not.toBeInTheDocument()
  })
})
