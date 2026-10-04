import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubEditorLayout } from './test-layout'

// ProseMirror (about 65 KB gzipped) must load only when an editor opens on the new piece page,
// never with today's review page, which shares the route.
describe('LazyDocumentEditor', () => {
  beforeEach(() => {
    vi.resetModules()
    stubEditorLayout()
  })

  it('shows a plain box that saves while the editor loads, and never drops what she typed', async () => {
    const { default: Lazy, loadDocumentEditor } = await import('./LazyDocumentEditor')
    const onChange = vi.fn()
    render(<Lazy label="Caption" value="Hello" baseText="Hello" onChange={onChange} />)
    const box = screen.getByRole('textbox', { name: 'Caption' })
    expect(box).toHaveValue('Hello')
    fireEvent.change(box, { target: { value: 'Hello there' } })
    expect(onChange).toHaveBeenLastCalledWith('Hello there')
    await loadDocumentEditor()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Caption' })).toHaveValue('Hello there'))
  })

  it('becomes the document editor once loaded when she has not typed yet', async () => {
    const { default: Lazy, loadDocumentEditor } = await import('./LazyDocumentEditor')
    render(<Lazy label="Caption" value="**Hello**" baseText={null} onChange={vi.fn()} />)
    await loadDocumentEditor()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Caption' }).querySelector('strong')).toHaveTextContent('Hello'))
  })

  it('is the only way the piece page reaches the document editor', () => {
    for (const file of [
      'src/app/client/[slug]/piece/[contentId]/v2/EditorHost.tsx',
      'src/app/client/[slug]/piece/[contentId]/v2/editors/YouTubeForms.tsx',
    ]) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(src).not.toMatch(/^import (?!type)[^\n]*['"]@\/components\/portal\/editor\/DocumentEditor['"]/m)
      expect(src).toContain('LazyDocumentEditor')
    }
  })
})
