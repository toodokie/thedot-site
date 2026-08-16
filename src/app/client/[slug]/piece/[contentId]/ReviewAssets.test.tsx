import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ReviewAssets from './ReviewAssets'
import ReviewDraftProvider from './ReviewDraftProvider'

const asset = {
  id: 'asset-1', content_version: 2, asset_key: 'social-cover',
  label: 'Final Instagram and Facebook reel cover', channel: 'social' as const,
  asset_kind: 'cover' as const, url: 'https://drive.google.com/open?id=cover',
  width_px: 1080, height_px: 1920, caption_status: 'not_applicable' as const, review_note: null,
}

function subject(canRequest = true) {
  return <ReviewDraftProvider draftScope="maria" slug="kanset" contentId="episode-two" version={2}>
    <ReviewAssets assets={[asset]} canRequest={canRequest} />
  </ReviewDraftProvider>
}

describe('ReviewAssets visual edits', () => {
  it('collects a binding visual draft beside the exact asset', () => {
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Request a change' }))
    fireEvent.change(screen.getByLabelText('What should change in Final Instagram and Facebook reel cover?'), {
      target: { value: 'Please use a different facial expression.' },
    })
    expect(screen.getByText(/has not been sent yet/)).toBeVisible()
  })

  it('hides edit controls from a read-only seat', () => {
    render(subject(false))
    expect(screen.queryByRole('button', { name: 'Request a change' })).not.toBeInTheDocument()
  })
})
