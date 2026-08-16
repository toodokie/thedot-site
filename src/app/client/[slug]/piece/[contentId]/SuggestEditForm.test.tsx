import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SuggestEditForm from './SuggestEditForm'
import ReviewDraftProvider from './ReviewDraftProvider'
import { editDraftKey } from '@/lib/portal/edit-drafts'

function subject() {
  return <ReviewDraftProvider draftScope="maria-user" slug="kanset" contentId="episode-two" version={3}>
    <SuggestEditForm targetKind="copy_block" targetKey="article-body"
      targetLabel="Article body" currentText="Current article." />
  </ReviewDraftProvider>
}

describe('SuggestEditForm draft recovery', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      get length() { return values.size }, clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key) },
      setItem: (key: string, value: string) => { values.set(key, value) },
    } })
  })

  it('restores a version-scoped draft', async () => {
    const key = editDraftKey('maria-user', 'kanset', 'episode-two', 3, 'copy_block', 'article-body')
    window.localStorage.setItem(key, JSON.stringify({ proposedText: 'Maria rewrote this article.' }))
    render(subject())
    expect(await screen.findByDisplayValue('Maria rewrote this article.')).toBeVisible()
    expect(screen.getByText(/Saved in this browser/)).toBeVisible()
  })

  it('saves a full-block edit without sending it immediately', async () => {
    const key = editDraftKey('maria-user', 'kanset', 'episode-two', 3, 'copy_block', 'article-body')
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    fireEvent.change(screen.getByLabelText('Edit Article body'), { target: { value: 'A recovered rewrite.' } })
    expect(JSON.parse(window.localStorage.getItem(key) ?? '{}').proposedText).toBe('A recovered rewrite.')
    expect(screen.queryByRole('button', { name: /send suggestion/i })).not.toBeInTheDocument()
  })
})
