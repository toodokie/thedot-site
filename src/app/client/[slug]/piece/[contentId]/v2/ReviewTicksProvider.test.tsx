import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { tickReviewTabs } = vi.hoisted(() => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs }))

import ReviewTicksProvider, { useReviewTicks } from './ReviewTicksProvider'

let api: ReturnType<typeof useReviewTicks>
function Probe() {
  api = useReviewTicks()
  return <output data-testid="ticked">{[...api.ticked].sort().join(',')}</output>
}

function mount(props: Partial<React.ComponentProps<typeof ReviewTicksProvider>> = {}) {
  return render(<ReviewTicksProvider slug="kanset" contentId="piece" version={2} scope="maria"
    initial={[]} persist {...props}><Probe /></ReviewTicksProvider>)
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  tickReviewTabs.mockReset()
  tickReviewTabs.mockResolvedValue({ ok: true })
})
afterEach(() => vi.useRealTimers())

describe('ReviewTicksProvider', () => {
  it('starts from the server ticks', () => {
    mount({ initial: ['caption'] })
    expect(screen.getByTestId('ticked')).toHaveTextContent('caption')
  })

  it('ticks at once and writes to the server shortly after, in one call', async () => {
    mount()
    act(() => { api.tick('onscreen'); api.tick('caption'); api.tick('caption') })
    expect(screen.getByTestId('ticked')).toHaveTextContent('caption,onscreen')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(tickReviewTabs).toHaveBeenCalledTimes(1)
    expect(tickReviewTabs).toHaveBeenCalledWith({ slug: 'kanset', contentId: 'piece', contentVersion: 2, tabKeys: ['onscreen', 'caption'] })
  })

  it('keeps a tick whose write failed and retries it with the next one', async () => {
    tickReviewTabs.mockResolvedValueOnce({ ok: false })
    mount()
    act(() => api.tick('caption'))
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(screen.getByTestId('ticked')).toHaveTextContent('caption')
    act(() => api.tick('youtube'))
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(tickReviewTabs).toHaveBeenLastCalledWith(expect.objectContaining({ tabKeys: ['caption', 'youtube'] }))
  })

  it('restores ticks saved only in this browser and sends them', async () => {
    window.localStorage.setItem('piece-ticks:maria:kanset:piece:v2', JSON.stringify(['youtube']))
    mount({ initial: ['caption'] })
    expect(screen.getByTestId('ticked')).toHaveTextContent('caption,youtube')
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(tickReviewTabs).toHaveBeenCalledWith(expect.objectContaining({ tabKeys: ['youtube'] }))
  })

  it('keeps a tick whose write threw and resends it, never treating it as recorded', async () => {
    tickReviewTabs.mockRejectedValueOnce(new Error('network'))
    mount()
    act(() => api.tick('caption'))
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(screen.getByTestId('ticked')).toHaveTextContent('caption')
    act(() => api.tick('onscreen'))
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(tickReviewTabs).toHaveBeenLastCalledWith(expect.objectContaining({ tabKeys: ['caption', 'onscreen'] }))
  })

  it('does not resend browser ticks the server already holds', async () => {
    window.localStorage.setItem('piece-ticks:maria:kanset:piece:v2', JSON.stringify(['caption']))
    mount({ initial: ['caption'] })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(tickReviewTabs).not.toHaveBeenCalled()
  })

  it('never writes in the read-only preview', async () => {
    mount({ persist: false })
    act(() => api.tick('caption'))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(tickReviewTabs).not.toHaveBeenCalled()
  })

  it('keeps versions apart', () => {
    window.localStorage.setItem('piece-ticks:maria:kanset:piece:v1', JSON.stringify(['caption']))
    mount()
    expect(screen.getByTestId('ticked').textContent).toBe('')
  })
})
