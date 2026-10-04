import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import { editorViews } from '@/components/portal/editor/DocumentEditor'
import { useReviewDrafts, type ReviewTarget } from '../ReviewDraftProvider'
import { EditSlot, useEditorHost, type EditorRequest } from './EditorHost'
import { saveReviewDraft } from '@/app/client/[slug]/draft-actions'
import { editorMarkdown, renderInPage, replaceEditorText, stubDialogs } from './test-utils'

const SCRIPT = '**1.** Frame one\n\n**2.** Frame two\n\n**3.** Frame three'
const copyTarget: ReviewTarget = { kind: 'copy_block', key: 'reel-script', label: 'Reel, on screen', currentText: SCRIPT }
const frame: EditorRequest = {
  kind: 'copy', slotId: 'reel-script:frame:1', target: copyTarget, title: 'Frame 2 of 3 · On-screen text',
  initialText: '**2.** Frame two', baseText: '**2.** Frame two', compose: (text) => SCRIPT.replace('**2.** Frame two', text),
  segment: { mode: 'frames', index: 1 },
}
const noteTarget: ReviewTarget = { kind: 'asset', key: 'reel-video', label: 'Reel video', urlSnapshot: 'https://drive.google.com/x', anchor: 'frame:3', anchorLabel: 'Frame 3' }

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

function Opener({ request, name = 'open' }: { request: EditorRequest; name?: string }) {
  const { open } = useEditorHost()
  return <button type="button" onClick={() => open(request)}>{name}</button>
}

function DraftProbe({ target }: { target: ReviewTarget }) {
  const { readDraft } = useReviewDrafts()
  return <output data-testid="draft">{readDraft(target)?.proposedText ?? ''}</output>
}

function phone(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
}

function page(request: EditorRequest, target: ReviewTarget) {
  return renderInPage(<>
    <Opener request={request} />
    <EditSlot slotId="reel-script:frame:1"><p>Frame two, read view</p></EditSlot>
    <DraftProbe target={target} />
  </>)
}

// Types at the end of the open document editor, the way a keystroke does.
function typeAtEnd(name: string, text: string) {
  const view = editorViews.get(screen.getByRole('textbox', { name }))!
  act(() => view.dispatch(view.state.tr.insertText(text, view.state.doc.content.size - 1)))
}

function editFrame(name: string, title: string, suffix: string) {
  fireEvent.click(screen.getByRole('button', { name }))
  typeAtEnd(title, suffix)
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
}

beforeEach(() => { stubDialogs(); window.localStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('EditorHost', () => {
  it('edits in place on a computer and stores the whole block', async () => {
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.queryByText('Frame two, read view')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const box = screen.getByRole('textbox', { name: 'Frame 2 of 3 · On-screen text' })
    expect(box.querySelector('strong')).toHaveTextContent('2.')
    typeAtEnd('Frame 2 of 3 · On-screen text', ', edited')
    await waitFor(() => expect(screen.getByTestId('draft')).toHaveTextContent('**2.** Frame two, edited'))
    expect(screen.getByTestId('draft')).toHaveTextContent('**1.** Frame one')
    expect(Array.from(box.querySelectorAll('ins')).map((el) => el.textContent).join(' ')).toContain('edited')
    expect(screen.getByText('Saved · not sent yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Frame two, read view')).toBeInTheDocument()
  })

  it('saves every keystroke, not only the last one', () => {
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    typeAtEnd('Frame 2 of 3 · On-screen text', 'A')
    expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\n**2.** Frame twoA\n\n**3.** Frame three')
    typeAtEnd('Frame 2 of 3 · On-screen text', 'B')
    expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\n**2.** Frame twoAB\n\n**3.** Frame three')
  })

  it('Escape in place is Done', () => {
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Frame 2 of 3 · On-screen text' }), { key: 'Escape' })
    expect(screen.getByText('Frame two, read view')).toBeInTheDocument()
  })

  it('opening and closing without typing never writes the released text as a draft', () => {
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByTestId('draft').textContent).toBe('')
  })

  it('opens a full-screen sheet on a phone, and Escape is Done', () => {
    phone(true)
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('dialog', { name: 'Frame 2 of 3 · On-screen text' })).toBeVisible()
    expect(screen.getByText('Frame two, read view')).toBeInTheDocument()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the phone sheet clear of the keyboard', () => {
    phone(true)
    const listeners: Record<string, () => void> = {}
    const viewport = { height: 800, offsetTop: 0, addEventListener: (name: string, fn: () => void) => { listeners[name] = fn }, removeEventListener: vi.fn() }
    vi.stubGlobal('visualViewport', viewport)
    vi.stubGlobal('innerHeight', 800)
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    viewport.height = 500
    act(() => listeners.resize())
    expect(screen.getByRole('dialog')).toHaveStyle({ paddingBottom: '300px' })
  })

  it('edits a block the document model cannot keep exactly in a plain text box, through the same save', async () => {
    const odd = '1. one\n1. one again'
    const oddTarget: ReviewTarget = { kind: 'copy_block', key: 'caption', label: 'Caption', currentText: odd }
    renderInPage(<>
      <Opener request={{ kind: 'copy', slotId: 'caption:whole', target: oddTarget, title: 'Caption', initialText: odd, baseText: odd, compose: (t) => t }} />
      <DraftProbe target={oddTarget} />
    </>)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    const box = screen.getByRole('textbox', { name: 'Caption' })
    expect(box).toHaveValue(odd)
    fireEvent.change(box, { target: { value: `${odd}, edited` } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(`${odd}, edited`))
  })

  it('keeps visual notes in a small sheet, anchored to the frame', async () => {
    page({ kind: 'note', target: noteTarget, title: 'Frame 3 of 8 · Suggest a change' }, noteTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('dialog', { name: 'Frame 3 of 8 · Suggest a change' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Make the headline bigger.' } })
    await waitFor(() => expect(screen.getByTestId('draft')).toHaveTextContent('Make the headline bigger.'))
  })

  it('asks before discarding', async () => {
    page(frame, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    typeAtEnd('Frame 2 of 3 · On-screen text', 'X')
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(screen.getByText('Discard this edit? It cannot be recovered.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.getByTestId('draft')).toHaveTextContent('')
    expect(screen.getByText('Frame two, read view')).toBeInTheDocument()
  })

  it('discards only the one frame and keeps every other frame edit saved', async () => {
    renderInPage(<>
      <Opener name="frame 2" request={frameRequest(1)} />
      <Opener name="frame 4" request={frameRequest(3)} />
      <DraftProbe target={fourTarget} />
    </>)
    editFrame('frame 2', 'Frame 2 of 4', ', edited')
    editFrame('frame 4', 'Frame 4 of 4', ', edited')
    expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\n**2.** Frame two, edited\n\n**3.** Frame three\n\n**4.** Frame four, edited')
    fireEvent.click(screen.getByRole('button', { name: 'frame 2' }))
    expect(editorMarkdown('Frame 2 of 4')).toBe('**2.** Frame two, edited')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.queryByRole('textbox', { name: 'Frame 2 of 4' })).not.toBeInTheDocument()
    expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\n**2.** Frame two\n\n**3.** Frame three\n\n**4.** Frame four, edited')
    await waitFor(() => expect(JSON.stringify({ ...window.localStorage })).toContain('Frame four, edited'))
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('Frame two, edited')
  })

  it('removes the whole draft when discarding the last edited frame', () => {
    renderInPage(<>
      <Opener name="frame 2" request={frameRequest(1)} />
      <DraftProbe target={fourTarget} />
    </>)
    editFrame('frame 2', 'Frame 2 of 4', ', edited')
    fireEvent.click(screen.getByRole('button', { name: 'frame 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.getByTestId('draft').textContent).toBe('')
  })

  it('opens on the draft frame, not the released text the caller passes, and keeps other frames', () => {
    renderInPage(<>
      <Opener name="frame 2" request={frameRequest(1)} />
      <Opener name="frame 4" request={frameRequest(3)} />
      <DraftProbe target={fourTarget} />
    </>)
    editFrame('frame 4', 'Frame 4 of 4', ', edited')
    editFrame('frame 2', 'Frame 2 of 4', ', edited')
    fireEvent.click(screen.getByRole('button', { name: 'frame 4' }))
    expect(editorMarkdown('Frame 4 of 4')).toBe('**4.** Frame four, edited')
    typeAtEnd('Frame 4 of 4', ' again')
    expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\n**2.** Frame two, edited\n\n**3.** Frame three\n\n**4.** Frame four, edited again')
  })

  it('shows the counter from 45,000 characters of the whole block', () => {
    const long = 'a'.repeat(49_999)
    const longTarget: ReviewTarget = { kind: 'copy_block', key: 'article', label: 'Article', currentText: long }
    renderInPage(<Opener request={{ kind: 'copy', slotId: 'article:whole', target: longTarget, title: 'Article', initialText: long, baseText: long, compose: (t) => t }} />)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByText('49,999 of 50,000 characters')).toBeInTheDocument()
    typeAtEnd('Article', 'bb')
    expect(screen.getByRole('alert')).toHaveTextContent('1 character over the 50,000 limit.')
  })

  it('returns focus to the element that opened the editor, in place and in a sheet', () => {
    renderInPage(<>
      <Opener name="note" request={{ kind: 'note', target: noteTarget, title: 'Note' }} />
      <Opener name="frame" request={frame} />
      <EditSlot slotId="reel-script:frame:1"><p>Frame two, read view</p></EditSlot>
    </>)
    for (const name of ['note', 'frame']) {
      const opener = screen.getByRole('button', { name })
      opener.focus()
      fireEvent.click(opener)
      expect(opener).not.toHaveFocus()
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(opener).toHaveFocus()
    }
  })

  it('falls back to a sheet on a computer when the page has no place for the edit', () => {
    renderInPage(<Opener request={frame} />)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByRole('dialog', { name: 'Frame 2 of 3 · On-screen text' })).toBeVisible()
  })

  it('renders a form request in place with the same toolbar', () => {
    page({ kind: 'form', slotId: 'reel-script:frame:1', targets: [copyTarget], title: 'Structured', render: () => <p>form body</p> }, copyTarget)
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(screen.getByText('form body')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  describe('when she deletes a frame marker', () => {
    const TWO = '**1.** Frame one\n\n**2.** Frame two'
    const twoTarget: ReviewTarget = { kind: 'copy_block', key: 'reel-script', label: 'Reel, on screen', currentText: TWO }
    const two: EditorRequest = { ...frame, target: twoTarget, title: 'Frame 2 of 2', compose: (text) => TWO.replace('**2.** Frame two', text) }

    it('keeps every other frame of a three-frame block byte for byte', () => {
      page(frame, copyTarget)
      fireEvent.click(screen.getByRole('button', { name: 'open' }))
      replaceEditorText('Frame 2 of 3 · On-screen text', 'Frame two')
      expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\nFrame two\n\n**3.** Frame three')
      typeAtEnd('Frame 2 of 3 · On-screen text', ' more')
      expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\nFrame two more\n\n**3.** Frame three')
    })

    it('never collapses a two-frame block to her text', () => {
      page(two, twoTarget)
      fireEvent.click(screen.getByRole('button', { name: 'open' }))
      replaceEditorText('Frame 2 of 2', 'Frame two')
      typeAtEnd('Frame 2 of 2', ' more')
      expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\nFrame two more')
    })

    it('discard puts back the frame she opened and keeps her other frame edits', () => {
      renderInPage(<>
        <Opener name="frame 2" request={frameRequest(1)} />
        <Opener name="frame 4" request={frameRequest(3)} />
        <DraftProbe target={fourTarget} />
      </>)
      editFrame('frame 4', 'Frame 4 of 4', ', edited')
      fireEvent.click(screen.getByRole('button', { name: 'frame 2' }))
      replaceEditorText('Frame 2 of 4', 'Frame two')
      typeAtEnd('Frame 2 of 4', ' more')
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
      fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
      expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one\n\n**2.** Frame two\n\n**3.** Frame three\n\n**4.** Frame four, edited')
    })
  })

  describe('when a newer draft arrives while she types', () => {
    function OtherDevice({ body }: { body: string }) {
      const { saveDraft } = useReviewDrafts()
      return <button type="button" onClick={() => saveDraft(copyTarget, body, null)}>other device</button>
    }

    it('composes onto the newer draft and keeps the other device edit to another frame', () => {
      renderInPage(<>
        <Opener request={frame} />
        <OtherDevice body={'**1.** Frame one, from the phone\n\n**2.** Frame twoA\n\n**3.** Frame three'} />
        <DraftProbe target={copyTarget} />
      </>)
      fireEvent.click(screen.getByRole('button', { name: 'open' }))
      typeAtEnd('Frame 2 of 3 · On-screen text', 'A')
      fireEvent.click(screen.getByRole('button', { name: 'other device' }))
      typeAtEnd('Frame 2 of 3 · On-screen text', 'B')
      expect(screen.getByTestId('draft').textContent).toBe('**1.** Frame one, from the phone\n\n**2.** Frame twoAB\n\n**3.** Frame three')
    })

    it('keeps both texts when the other device changed the same frame', () => {
      renderInPage(<>
        <Opener request={frame} />
        <OtherDevice body={'**1.** Frame one\n\n**2.** Frame 2 from the phone\n\n**3.** Frame three'} />
        <DraftProbe target={copyTarget} />
      </>)
      fireEvent.click(screen.getByRole('button', { name: 'open' }))
      typeAtEnd('Frame 2 of 3 · On-screen text', 'A')
      fireEvent.click(screen.getByRole('button', { name: 'other device' }))
      typeAtEnd('Frame 2 of 3 · On-screen text', 'B')
      const draft = screen.getByTestId('draft').textContent ?? ''
      expect(draft).toContain('**2.** Frame 2 from the phone')
      expect(draft).toContain('**2.** Frame twoAB')
      expect(draft).toContain('**3.** Frame three')
      expect(screen.getByText('This text also changed on another device. Both versions are kept in your draft. Remove the one you do not want.')).toBeInTheDocument()
    })
  })

  it('saves a form at once when it closes without Done', async () => {
    function Form() {
      const { saveDraft } = useReviewDrafts()
      return <button type="button" onClick={() => saveDraft(copyTarget, 'Form edit', null)}>type</button>
    }
    vi.mocked(saveReviewDraft).mockClear()
    vi.mocked(saveReviewDraft).mockResolvedValue({ error: 'offline', retryable: false } as never)
    renderInPage(<>
      <Opener name="form" request={{ kind: 'form', slotId: 'reel-script:frame:1', targets: [copyTarget], title: 'Structured', render: () => <Form /> }} />
      <Opener name="note" request={{ kind: 'note', target: noteTarget, title: 'Note' }} />
      <EditSlot slotId="reel-script:frame:1"><p>read</p></EditSlot>
    </>, { serverDrafts: [] })
    fireEvent.click(screen.getByRole('button', { name: 'form' }))
    fireEvent.click(screen.getByRole('button', { name: 'type' }))
    expect(saveReviewDraft).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'note' }))
    await waitFor(() => expect(saveReviewDraft).toHaveBeenCalled(), { timeout: 500 })
  })
})

