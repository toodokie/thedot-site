import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(screen.getByText(/saved in this browser/i)).toBeVisible()
  })

  it('saves a full-block edit without sending it immediately', async () => {
    const key = editDraftKey('maria-user', 'kanset', 'episode-two', 3, 'copy_block', 'article-body')
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    fireEvent.change(screen.getByLabelText('Edit Article body'), { target: { value: 'A recovered rewrite.' } })
    expect(JSON.parse(window.localStorage.getItem(key) ?? '{}').proposedText).toBe('A recovered rewrite.')
    expect(screen.queryByRole('button', { name: /send suggestion/i })).not.toBeInTheDocument()
    expect(screen.getByText('Draft saved in this browser. It has not been sent yet.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save and close' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Review and send edits' })).toBeVisible()
  })

  it('takes a saved draft directly to the bundle send action', () => {
    const finish = document.createElement('div')
    finish.id = 'review-decision'
    finish.scrollIntoView = vi.fn()
    document.body.appendChild(finish)
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    fireEvent.change(screen.getByLabelText('Edit Article body'), { target: { value: 'A recovered rewrite.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review and send edits' }))
    expect(finish.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })
})
