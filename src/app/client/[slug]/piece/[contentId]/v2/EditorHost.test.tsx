import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import { useReviewDrafts, type ReviewTarget } from '../ReviewDraftProvider'
import { useEditorHost, type EditorRequest } from './EditorHost'
import { renderInPage, stubDialogs } from './test-utils'

const SCRIPT = '**1.** Frame one\n\n**2.** Frame two\n\n**3.** Frame three'
const copyTarget: ReviewTarget = { kind: 'copy_block', key: 'reel-script', label: 'Reel, on screen', currentText: SCRIPT }
const noteTarget: ReviewTarget = {
  kind: 'asset', key: 'reel-video', label: 'Reel video', urlSnapshot: 'https://drive.google.com/x',
  anchor: 'frame:3', anchorLabel: 'Frame 3',
}

function Opener({ request, name = 'open' }: { request: EditorRequest; name?: string }) {
  const { open } = useEditorHost()
  return <button type="button" onClick={() => open(request)}>{name}</button>
}

const FOUR = '**1.** Frame one\n\n**2.** Frame two\n\n**3.** Frame three\n\n**4.** Frame four'
const fourTarget: ReviewTarget = { kind: 'copy_block', key: 'reel-script', label: 'Reel, on screen', currentText: FOUR }
const RELEASED_SEGMENTS = ['**1.** Frame one', '**2.** Frame two', '**3.** Frame three', '**4.** Frame four']

// A caller that knows only the released text: it passes the released frame and a compose built
// on the released body, exactly what a read view has in hand.
function frameRequest(index: number): EditorRequest {
  const released = RELEASED_SEGMENTS[index]
  return {
    kind: 'copy', slotId: `reel-script:frame:${index}`, target: fourTarget, title: `Frame ${index + 1} of 4`,
    initialText: released, baseText: released, segment: { mode: 'frames', index },
    compose: (text) => FOUR.replace(released, text),
  }
}

async function editFrame(name: string, value: string) {
  fireEvent.click(screen.getByRole('button', { name }))
  fireEvent.change(screen.getByLabelText('Text'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
}

function DraftProbe({ target }: { target: ReviewTarget }) {
  const { readDraft } = useReviewDrafts()
  return <output data-testid="draft">{readDraft(target)?.proposedText ?? ''}</output>
}

beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
})

describe('EditorHost', () => {
  it('edits one frame and stores the whole block as the draft', async () => {
    renderInPage(<>
      <Opener request={{
        kind: 'copy', slotId: 'reel-script:frame:1', target: copyTarget, title: 'Frame 2 of 3 · On-screen text',
        initialText: '**2.** Frame two', baseText: '**2.** Frame two',
        compose: (text) => SCRIPT.replace('**2.** Frame two', text), segment: { mode: 'frames', index: 1 },
      }} />
      <DraftProbe target={copyTarget} />
    </>)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('dialog', { name: 'Frame 2 of 3 · On-screen text' })).toBeVisible()
    const field = screen.getByLabelText('Text')
    expect(field).toHaveValue('**2.** Frame two')
    fireEvent.change(field, { target: { value: '**2.** Frame 2, edited' } })
    await waitFor(() => expect(screen.getByTestId('draft')).toHaveTextContent('**1.** Frame one **2.** Frame 2, edited **3.** Frame three'))
    expect(screen.getByText('Saved · not sent yet')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('draft')).toHaveTextContent('Frame 2, edited')
  })

  it('asks before discarding', async () => {
    renderInPage(<>
      <Opener request={{ kind: 'copy', slotId: 'reel-script:whole', target: copyTarget, title: 'Whole script', initialText: SCRIPT, baseText: SCRIPT, compose: (t) => t }} />
      <DraftProbe target={copyTarget} />
    </>)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'A new script' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(screen.getByText('Discard this edit? It cannot be recovered.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText('Text')).toHaveValue('A new script')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('draft')).toHaveTextContent('')
  })

  it('stores a visual note on one frame of the asset', async () => {
    renderInPage(<>
      <Opener request={{ kind: 'note', target: noteTarget, title: 'Frame 3 of 8 · Suggest a change' }} />
      <DraftProbe target={noteTarget} />
    </>)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Make the headline bigger.' } })
    await waitFor(() => expect(screen.getByTestId('draft')).toHaveTextContent('Make the headline bigger.'))
  })

  it('treats Escape as Done', () => {
    renderInPage(<Opener request={{ kind: 'note', target: noteTarget, title: 'Note' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('discards only the one frame and keeps every other frame edit saved', async () => {
    renderInPage(<>
      <Opener name="frame 2" request={frameRequest(1)} />
      <Opener name="frame 4" request={frameRequest(3)} />
      <DraftProbe target={fourTarget} />
    </>)
    await editFrame('frame 2', '**2.** Frame two, edited')
    await editFrame('frame 4', '**4.** Frame four, edited')
    expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\n**2.** Frame two, edited\n\n**3.** Frame three\n\n**4.** Frame four, edited')
    fireEvent.click(screen.getByRole('button', { name: 'frame 2' }))
    expect(screen.getByLabelText('Text')).toHaveValue('**2.** Frame two, edited')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\n**2.** Frame two\n\n**3.** Frame three\n\n**4.** Frame four, edited')
    // The surviving edit is still the provider's draft, so it reaches the browser copy too.
    await waitFor(() => expect(JSON.stringify({ ...window.localStorage })).toContain('Frame four, edited'))
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('Frame two, edited')
  })

  it('removes the whole draft when discarding the last edited frame', async () => {
    renderInPage(<>
      <Opener name="frame 2" request={frameRequest(1)} />
      <DraftProbe target={fourTarget} />
    </>)
    await editFrame('frame 2', '**2.** Frame two, edited')
    fireEvent.click(screen.getByRole('button', { name: 'frame 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.getByTestId('draft').textContent).toBe('')
  })

  it('opens on the draft frame, not the released text the caller passes, and keeps other frames', async () => {
    renderInPage(<>
      <Opener name="frame 2" request={frameRequest(1)} />
      <Opener name="frame 4" request={frameRequest(3)} />
      <DraftProbe target={fourTarget} />
    </>)
    await editFrame('frame 4', '**4.** Frame four, edited')
    await editFrame('frame 2', '**2.** Frame two, edited')
    fireEvent.click(screen.getByRole('button', { name: 'frame 4' }))
    expect(screen.getByLabelText('Text')).toHaveValue('**4.** Frame four, edited')
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '**4.** Frame four, edited again' } })
    expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\n**2.** Frame two, edited\n\n**3.** Frame three\n\n**4.** Frame four, edited again')
  })

  it('returns focus to the element that opened the editor', () => {
    renderInPage(<Opener request={{ kind: 'note', target: noteTarget, title: 'Note' }} />)
    const opener = screen.getByRole('button', { name: 'open' })
    opener.focus()
    fireEvent.click(opener)
    expect(opener).not.toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(opener).toHaveFocus()
  })
})
