import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'
import DocumentEditor, { editorViews } from '@/components/portal/editor/DocumentEditor'
import { provideDocumentEditor } from '@/components/portal/editor/LazyDocumentEditor'
import { stubEditorLayout } from '@/components/portal/editor/test-layout'
import { parseMarkdown, serializeMarkdown } from '@/lib/portal/piece-page/markdown-doc'
import ReviewDraftProvider from '../ReviewDraftProvider'
import ReviewTicksProvider from './ReviewTicksProvider'
import EditorHost from './EditorHost'

// Every v2 component test that touches drafts mocks the server actions at the top of its own file
// (vi.mock is hoisted per file):
//   vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
//   vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(async () => ({ success: 'Your edit was sent to The Dot.' })), acknowledgePiecePageIntro: vi.fn(async () => undefined), requestContentRemoval: vi.fn(async () => ({})) }))
//   vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

export function stubDialogs(): void {
  stubEditorLayout()
  provideDocumentEditor(DocumentEditor)
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  })
}

// serverDrafts switches the provider to plan 3's server mode (needed for drafts carried over from
// an earlier version, which the browser-only mode never loads). Use PageProviders around the new
// element when a test calls rerender, so the providers (and their state) stay mounted.
type PageOptions = { version?: number; mode?: 'client' | 'preview'; serverDrafts?: ServerDraftRow[] }

export function PageProviders({ children, version = 2, mode = 'client', serverDrafts }: PageOptions & { children: React.ReactNode }) {
  return <ReviewDraftProvider draftScope="maria" slug="kanset" contentId="piece" version={version}
    serverSync={serverDrafts !== undefined} initialServerDrafts={serverDrafts ?? null}>
    <ReviewTicksProvider slug="kanset" contentId="piece" version={version} scope="maria" initial={[]} persist={false}>
      <EditorHost mode={mode}>{children}</EditorHost>
    </ReviewTicksProvider>
  </ReviewDraftProvider>
}

export function renderInPage(ui: React.ReactNode, options: PageOptions = {}) {
  return render(<PageProviders {...options}>{ui}</PageProviders>)
}

// The Markdown the open document editor labelled `name` holds now.
export function editorMarkdown(name: string): string {
  return serializeMarkdown(editorViews.get(screen.getByRole('textbox', { name }))!.state.doc)
}

// Replaces everything in the open document editor labelled `name`, as one edit she typed.
export function replaceEditorText(name: string, markdown: string): void {
  const view = editorViews.get(screen.getByRole('textbox', { name }))!
  act(() => view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, parseMarkdown(markdown).content)))
}
