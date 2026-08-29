import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentRow } from '@/lib/portal/data'
import type { ContentRequestRow } from '@/lib/portal/requests'
import RequestHistory from './RequestHistory'

const writeText = vi.fn(async () => undefined)

describe('RequestHistory', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    writeText.mockClear()
  })

  it('compares and copies an applied suggestion with the released base-version copy', async () => {
    const request = {
      id: 'request-1',
      client_id: 'client-1',
      content_id: 'piece-1',
      request_type: 'edit',
      base_version: 1,
      payload: { block_key: 'ig-facebook-caption', proposed_text: 'Maria revised copy.' },
      status: 'applied',
      requester_name: 'Maria Guerts',
      created_at: '2026-08-06T15:41:14.835719+00:00',
      updated_at: '2026-08-06T20:52:45.36515+00:00',
      reconciled_at: '2026-08-06T20:52:45.36515+00:00',
      reconciled_by: 'The Dot',
      canonical_version: 2,
      resolution_note: 'Requested version released to the portal.',
      canonical_content_key: 'kanset-2026-08-ee-or-pnp',
      base_copy_text: 'Original released copy.',
    } satisfies ContentRequestRow
    const item = {
      id: 'piece-1',
      content_id: 'kanset-2026-08-ee-or-pnp',
      title: 'Express Entry or a provincial nomination?',
      version: 2,
      copy_blocks: [{ key: 'ig-facebook-caption', label: 'Instagram + Facebook caption', body: 'Maria revised copy.' }],
    } as ContentRow

    render(<RequestHistory slug="kanset" requests={[request]} messages={[]}
      content={[item]} canReply={false} />)

    expect(screen.getByText('Released copy')).toBeInTheDocument()
    expect(screen.getByText('Version 1')).toBeInTheDocument()
    expect(screen.getByText('Original released copy.')).toBeInTheDocument()
    expect(screen.getByText('Edited area')).toBeInTheDocument()
    expect(screen.getByText('Post caption (Instagram + Facebook)')).toBeInTheDocument()
    expect(screen.getByText('Copy change requested by Maria Guerts')).toBeInTheDocument()
    expect(screen.getByText("Maria's request")).toBeInTheDocument()
    expect(screen.getByText('Requested copy')).toBeInTheDocument()
    expect(screen.getByText('Applied as v2')).toBeInTheDocument()
    expect(screen.getByText('Maria revised copy.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy requested copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Maria revised copy.'))
    expect(screen.getByRole('button', { name: 'Copied requested copy' })).toBeVisible()
  })

  it('keeps a pending suggestion visible and copyable', async () => {
    const request = {
      id: 'request-pending',
      client_id: 'client-1',
      content_id: 'piece-1',
      request_type: 'edit',
      base_version: 2,
      payload: { block_key: 'reel-script', proposed_text: 'Keep this wording for the next segment.' },
      status: 'pending',
      requester_name: 'Maria Guerts',
      created_at: '2026-08-29T14:00:00.000000+00:00',
      updated_at: '2026-08-29T14:00:00.000000+00:00',
      reconciled_at: null,
      reconciled_by: null,
      canonical_version: null,
      resolution_note: null,
      canonical_content_key: null,
      base_copy_text: 'Current segment wording.',
    } satisfies ContentRequestRow
    const item = {
      id: 'piece-1',
      content_id: 'kanset-2026-08-pending',
      title: 'Pending reel review',
      version: 2,
      copy_blocks: [{ key: 'reel-script', label: 'Reel script', body: 'Current segment wording.' }],
    } as ContentRow

    render(<RequestHistory slug="kanset" requests={[request]} messages={[]}
      content={[item]} canReply={false} />)

    expect(screen.getByText('Received')).toBeVisible()
    expect(screen.getByText('Keep this wording for the next segment.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Copy requested copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Keep this wording for the next segment.'))
  })
})
