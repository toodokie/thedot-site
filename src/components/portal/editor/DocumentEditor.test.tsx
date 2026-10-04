import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TextSelection } from 'prosemirror-state'
import DocumentEditor, { editorViews, isLosslessMarkdown } from './DocumentEditor'
import { stubEditorLayout } from './test-layout'

beforeEach(() => stubEditorLayout())

function mount(props: Partial<React.ComponentProps<typeof DocumentEditor>> = {}) {
  const onChange = vi.fn()
  render(<DocumentEditor label="Caption" value={'**Title:** Hello\n\nSecond'} baseText={null} onChange={onChange} {...props} />)
  const box = screen.getByRole('textbox', { name: 'Caption' })
  return { box, view: editorViews.get(box)!, onChange }
}

describe('DocumentEditor', () => {
  it('shows formatted text with no Markdown', () => {
    const { box } = mount()
    expect(box).toHaveAttribute('aria-multiline', 'true')
    expect(box.querySelector('strong')).toHaveTextContent('Title:')
    expect(box.textContent).not.toContain('**')
  })

  it('hands back Markdown on every change', () => {
    const { view, onChange } = mount()
    act(() => view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size - 1)))
    expect(onChange).toHaveBeenLastCalledWith('**Title:** Hello\n\nSecond!')
  })

  it('highlights added words against the released text', () => {
    const { box, view } = mount({ value: 'Hello world', baseText: 'Hello world' })
    act(() => view.dispatch(view.state.tr.insertText(' big', 6)))
    expect(box.querySelector('ins')).toHaveTextContent('big')
  })

  it('makes text bold with the keyboard', () => {
    const { view, onChange } = mount({ value: 'Hello world' })
    act(() => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6))))
    fireEvent.keyDown(view.dom, { key: 'b', ctrlKey: true })
    expect(onChange).toHaveBeenLastCalledWith('**Hello** world')
  })

  it('tells the page when it loses focus', () => {
    const onBlur = vi.fn()
    const { view } = mount({ onBlur })
    fireEvent.blur(view.dom)
    expect(onBlur).toHaveBeenCalled()
  })

  it('undoes and redoes with the keyboard', () => {
    const { view, onChange } = mount({ value: 'Hello' })
    act(() => view.dispatch(view.state.tr.insertText('!', 6)))
    expect(onChange).toHaveBeenLastCalledWith('Hello!')
    fireEvent.keyDown(view.dom, { key: 'z', ctrlKey: true })
    expect(onChange).toHaveBeenLastCalledWith('Hello')
    fireEvent.keyDown(view.dom, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith('Hello!')
  })

  it('tells a screen reader what was added and what was removed', () => {
    const { box, view } = mount({ value: 'One two three', baseText: 'One two three' })
    act(() => view.dispatch(view.state.tr.delete(5, 9).insertText('four ', 5)))
    expect(box.textContent).toContain('added: four')
    expect(box.querySelector('del')).toHaveTextContent('removed: two')
  })

  it('keeps ordinary Markdown in the document editor', () => {
    expect(isLosslessMarkdown('**Title:** Hello\n\n- one\n- two\n\n> quote\r\n')).toBe(true)
  })

  it('edits as a plain text box when asked, keeping every character', () => {
    const awkward = 'Line one  \n\tTabbed\n\n'
    const onChange = vi.fn()
    render(<DocumentEditor label="Caption" value={awkward} baseText={null} onChange={onChange} forcePlain />)
    const box = screen.getByRole('textbox', { name: 'Caption' })
    expect(box.tagName).toBe('TEXTAREA')
    expect(box).toHaveValue(awkward)
    fireEvent.change(box, { target: { value: `${awkward}x` } })
    expect(onChange).toHaveBeenLastCalledWith(`${awkward}x`)
  })

  it('uses the plain text box on its own when the round trip would change the text', async () => {
    vi.resetModules()
    vi.doMock('@/lib/portal/piece-page/markdown-doc', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/portal/piece-page/markdown-doc')>()),
      serializeMarkdown: () => 'changed',
    }))
    try {
      const { default: Editor, isLosslessMarkdown: lossless } = await import('./DocumentEditor')
      expect(lossless('Hello')).toBe(false)
      render(<Editor label="Draft" value="Hello" baseText={null} onChange={vi.fn()} />)
      const box = screen.getByRole('textbox', { name: 'Draft' })
      expect(box.tagName).toBe('TEXTAREA')
      expect(box).toHaveValue('Hello')
    } finally {
      vi.doUnmock('@/lib/portal/piece-page/markdown-doc')
      vi.resetModules()
    }
  })
})
