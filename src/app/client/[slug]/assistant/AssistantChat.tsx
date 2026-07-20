'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import styles from './assistant.module.css'

// Chat panel for the Client Work Assistant. Talks to /api/client/[slug]/assistant.
// The route buffers and validates everything server-side and answers plain JSON:
//   { sections, notices }        validated answer sections (portal and/or web)
//   { refused, message }         fixed client-safe refusal
//   { error }                    client-safe error
// This component renders exactly what the server validated, keeps the conversation in
// PAGE MEMORY ONLY (cleared on refresh/logout, resent as untrusted context), and renders
// every web citation as a visible, clickable official-source link.

type PortalCitation = { chunkId: string; title: string; route: string }
type PortalSection = {
  kind: 'portal'
  runId: string
  blocks: Array<{ text: string; citations: PortalCitation[] }>
  suggestedRoutes: Array<{ route: string; title: string }>
}
type WebCitation = { url: string; title: string; startIndex: number; endIndex: number }
type WebSection = { kind: 'web'; runId: string; text: string; citations: WebCitation[] }
type Section = PortalSection | WebSection

type Turn =
  | { role: 'user'; text: string }
  | {
      role: 'assistant'
      sections: Section[]
      notices: string[]
      text?: string
      pending?: boolean
      error?: boolean
    }

const MAX_QUESTION_CHARS = 2000

function turnToPlainText(turn: Turn): string {
  if (turn.role === 'user') return turn.text
  const parts: string[] = []
  for (const section of turn.sections) {
    if (section.kind === 'portal') {
      parts.push(section.blocks.map((block) => block.text).join('\n'))
    } else {
      parts.push(section.text)
    }
  }
  parts.push(...turn.notices)
  if (turn.text) parts.push(turn.text)
  return parts.join('\n').trim()
}

// Inline clickable citations: split the text at each validated citation range. Ranges the
// server preserved from OpenAI's annotations; anything inconsistent falls back to the
// visible Sources list below the text, so a citation is never silently dropped.
function renderWebText(section: WebSection): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const sorted = [...section.citations].sort((a, b) => a.startIndex - b.startIndex)
  let cursor = 0
  sorted.forEach((citation, index) => {
    if (
      citation.startIndex < cursor ||
      citation.endIndex <= citation.startIndex ||
      citation.endIndex > section.text.length
    ) {
      return // out-of-range annotation: shown in Sources instead
    }
    if (citation.startIndex > cursor) {
      nodes.push(section.text.slice(cursor, citation.startIndex))
    }
    nodes.push(
      <a
        key={`cite-${index}`}
        className={styles.webLink}
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {section.text.slice(citation.startIndex, citation.endIndex)}
      </a>,
    )
    cursor = citation.endIndex
  })
  if (cursor < section.text.length) nodes.push(section.text.slice(cursor))
  return nodes
}

function uniqueSources(citations: WebCitation[]): Array<{ url: string; title: string }> {
  const seen = new Map<string, string>()
  for (const citation of citations) {
    if (!seen.has(citation.url)) seen.set(citation.url, citation.title)
  }
  return [...seen.entries()].map(([url, title]) => ({ url, title }))
}

function ReportControl({ slug, runIds }: { slug: string; runIds: string[] }) {
  const [state, setState] = useState<'idle' | 'open' | 'sending' | 'done' | 'failed'>('idle')
  const [category, setCategory] = useState('inaccurate')
  const [comment, setComment] = useState('')

  if (runIds.length === 0) return null
  if (state === 'done') return <p className={styles.reportDone}>Thanks, this answer was reported.</p>

  async function submit() {
    setState('sending')
    try {
      const results = await Promise.all(runIds.map((runId) =>
        fetch(`/api/client/${encodeURIComponent(slug)}/assistant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report: true, runId, category, comment: comment || null }),
        }),
      ))
      setState(results.every((response) => response.ok) ? 'done' : 'failed')
    } catch {
      setState('failed')
    }
  }

  return (
    <div className={styles.reportRow}>
      {state === 'idle' || state === 'failed' ? (
        <button type="button" className={styles.reportButton} onClick={() => setState('open')}>
          {state === 'failed' ? 'Report failed, try again' : 'Report this answer'}
        </button>
      ) : (
        <div className={styles.reportForm}>
          <select
            className={styles.reportSelect}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Report category"
          >
            <option value="inaccurate">Inaccurate</option>
            <option value="unsafe">Inappropriate or unsafe</option>
            <option value="other">Something else</option>
          </select>
          <input
            className={styles.reportComment}
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 2000))}
            placeholder="Optional details"
            aria-label="Report details"
          />
          <button
            type="button"
            className={styles.reportButton}
            disabled={state === 'sending'}
            onClick={() => void submit()}
          >
            {state === 'sending' ? 'Sending' : 'Send report'}
          </button>
          <p className={styles.reportNote}>
            Reports go to The Dot for review. Please don&rsquo;t include personal case
            details here.
          </p>
        </div>
      )}
    </div>
  )
}

export default function AssistantChat({ slug }: { slug: string }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [turns])

  const replaceLastAssistant = (turn: Partial<Turn> & { role: 'assistant' }) => {
    setTurns((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') {
          next[i] = { sections: [], notices: [], ...turn }
          break
        }
      }
      return next
    })
  }

  async function send() {
    const question = draft.trim()
    if (!question || busy) return
    setBusy(true)
    setDraft('')

    // page-memory transcript, resent as untrusted context (never stored server-side)
    const transcript = turns
      .map((turn) => ({ role: turn.role, text: turnToPlainText(turn) }))
      .filter((turn) => turn.text)

    setTurns((prev) => [
      ...prev,
      { role: 'user', text: question },
      { role: 'assistant', sections: [], notices: [], pending: true },
    ])

    try {
      const response = await fetch(`/api/client/${encodeURIComponent(slug)}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, transcript }),
      })
      const data = (await response.json()) as {
        sections?: Section[]
        notices?: string[]
        refused?: boolean
        message?: string
        error?: string
      }
      if (data.refused && data.message) {
        replaceLastAssistant({ role: 'assistant', sections: [], notices: [], text: data.message })
      } else if (!response.ok || data.error) {
        replaceLastAssistant({
          role: 'assistant', sections: [], notices: [],
          text: data.error ?? 'Something went wrong. Please try again.', error: true,
        })
      } else {
        replaceLastAssistant({
          role: 'assistant',
          sections: data.sections ?? [],
          notices: data.notices ?? [],
        })
      }
    } catch {
      replaceLastAssistant({
        role: 'assistant', sections: [], notices: [],
        text: 'Something went wrong. Please check your connection and try again.', error: true,
      })
    } finally {
      setBusy(false)
    }
  }

  const base = `/client/${slug}`

  return (
    <div>
      <div className={styles.panel}>
        <div className={styles.transcript} ref={scrollRef} aria-live="polite">
          {turns.length === 0 ? (
            <p className={styles.empty}>
              Ask about your content, schedule, reports, library, or invoices, or about
              public immigration news from official sources. For example: &ldquo;When does
              my next reel go out?&rdquo;
            </p>
          ) : (
            turns.map((turn, index) => {
              if (turn.role === 'user') {
                return (
                  <div key={index} className={`${styles.turn} ${styles.turnUser}`}>
                    {turn.text}
                  </div>
                )
              }
              const showLabels = turn.sections.length > 1
              return (
                <div
                  key={index}
                  className={`${styles.turn} ${styles.turnAssistant}${turn.error ? ` ${styles.turnError}` : ''}`}
                >
                  {turn.sections.map((section, sectionIndex) => (
                    <div key={sectionIndex} className={styles.section}>
                      {(showLabels || section.kind === 'web') && (
                        <p className={styles.sectionLabel}>
                          {section.kind === 'portal'
                            ? 'Your portal'
                            : 'Public immigration information (official sources)'}
                        </p>
                      )}
                      {section.kind === 'portal' ? (
                        <>
                          {section.blocks.map((block, blockIndex) => (
                            <div key={blockIndex} className={styles.block}>
                              <span>{block.text}</span>
                              {block.citations.length > 0 && (
                                <span className={styles.citationRow}>
                                  {block.citations.map((citation, citationIndex) => (
                                    <Link
                                      key={citationIndex}
                                      className={styles.citationChip}
                                      href={`${base}/${citation.route}`}
                                    >
                                      {citation.title}
                                    </Link>
                                  ))}
                                </span>
                              )}
                            </div>
                          ))}
                          {section.suggestedRoutes.length > 0 && (
                            <p className={styles.sources}>
                              See:{' '}
                              {section.suggestedRoutes.map((route, routeIndex) => (
                                <Link
                                  key={routeIndex}
                                  className={styles.citationChip}
                                  href={`${base}/${route.route}`}
                                >
                                  {route.title}
                                </Link>
                              ))}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <div className={styles.block}>{renderWebText(section)}</div>
                          <div className={styles.sources}>
                            Sources:{' '}
                            {uniqueSources(section.citations).map((source, sourceIndex) => (
                              <a
                                key={sourceIndex}
                                className={styles.citationChip}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {source.title}
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {turn.notices.map((notice, noticeIndex) => (
                    <p key={noticeIndex} className={styles.notice}>{notice}</p>
                  ))}
                  {turn.text && <span>{turn.text}</span>}
                  {turn.pending ? <span className={styles.pendingDot}> ...</span> : null}
                  {!turn.pending && (
                    <ReportControl
                      slug={slug}
                      runIds={turn.sections.map((section) => section.runId)}
                    />
                  )}
                </div>
              )
            })
          )}
        </div>
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <textarea
            className={styles.input}
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_QUESTION_CHARS))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder="Ask about your account or public immigration news..."
            rows={2}
            disabled={busy}
            aria-label="Your question"
          />
          <button className={styles.send} type="submit" disabled={busy || !draft.trim()}>
            {busy ? 'Thinking' : 'Ask'}
          </button>
        </form>
      </div>
      <p className={styles.disclaimer}>
        The assistant answers questions about your account with The Dot, and general
        immigration questions from official public sources only. It cannot give immigration
        or case-specific advice; for anything about eligibility or an application, please
        book a consultation with the Kanset team. Never enter personal case data here
        (names, application or ID numbers, birth dates, contact details): automated
        detection is a safety net, not a guarantee. Conversations are not saved; refreshing
        the page clears them.
      </p>
    </div>
  )
}
