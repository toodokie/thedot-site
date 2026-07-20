'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './assistant.module.css'

// Chat panel for the Client Work Assistant. Talks to /api/client/[slug]/assistant.
// The route answers either JSON (gate/refusal/error outcomes) or an SSE stream of
// {type:'chunk'|'replace'|'done'|'error'} events; a 'replace' swaps the visible text
// for a safe message (the server withheld the model's answer), so this component
// always renders exactly what the guardrails released, nothing more.

type Turn = {
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
  error?: boolean
}

const MAX_QUESTION_CHARS = 2000

export default function AssistantChat({ slug }: { slug: string }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [turns])

  const updateLastAssistant = (updater: (turn: Turn) => Turn) => {
    setTurns((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') {
          next[i] = updater(next[i])
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
    setTurns((prev) => [
      ...prev,
      { role: 'user', text: question },
      { role: 'assistant', text: '', pending: true },
    ])

    try {
      const response = await fetch(`/api/client/${encodeURIComponent(slug)}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      const contentType = response.headers.get('content-type') ?? ''

      if (contentType.includes('application/json')) {
        const data = (await response.json()) as {
          refused?: boolean
          message?: string
          error?: string
        }
        const text = data.message ?? data.error ?? 'Something went wrong. Please try again.'
        updateLastAssistant((turn) => ({
          ...turn, text, pending: false, error: !data.refused && !response.ok,
        }))
        return
      }

      if (!response.ok || !response.body) {
        updateLastAssistant((turn) => ({
          ...turn, text: 'Something went wrong. Please try again.', pending: false, error: true,
        }))
        return
      }

      // SSE: data: {json}\n\n frames.
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finished = false
      while (!finished) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          boundary = buffer.indexOf('\n\n')
          const line = frame.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          let event: { type?: string; text?: string; message?: string }
          try {
            event = JSON.parse(line.slice(6))
          } catch {
            continue
          }
          if (event.type === 'chunk' && typeof event.text === 'string') {
            const text = event.text
            updateLastAssistant((turn) => ({ ...turn, text: turn.text + text, pending: true }))
          } else if (event.type === 'replace' && typeof event.text === 'string') {
            const text = event.text
            updateLastAssistant((turn) => ({ ...turn, text, pending: true }))
          } else if (event.type === 'error') {
            const text = event.message ?? 'Something went wrong. Please try again.'
            updateLastAssistant((turn) => ({ ...turn, text, pending: false, error: true }))
            finished = true
          } else if (event.type === 'done') {
            updateLastAssistant((turn) => ({ ...turn, pending: false }))
            finished = true
          }
        }
      }
      // Stream ended without a terminal event: settle whatever text arrived.
      updateLastAssistant((turn) =>
        turn.pending
          ? { ...turn, pending: false, text: turn.text || 'Something went wrong. Please try again.', error: !turn.text }
          : turn,
      )
    } catch {
      updateLastAssistant((turn) => ({
        ...turn, text: 'Something went wrong. Please check your connection and try again.',
        pending: false, error: true,
      }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className={styles.panel}>
        <div className={styles.transcript} ref={scrollRef} aria-live="polite">
          {turns.length === 0 ? (
            <p className={styles.empty}>
              Ask about your content, schedule, reports, library, or invoices. For example:
              &ldquo;When does my next reel go out?&rdquo;
            </p>
          ) : (
            turns.map((turn, index) => (
              <div
                key={index}
                className={
                  turn.role === 'user'
                    ? `${styles.turn} ${styles.turnUser}`
                    : `${styles.turn} ${styles.turnAssistant}${turn.error ? ` ${styles.turnError}` : ''}`
                }
              >
                {turn.text}
                {turn.pending ? <span className={styles.pendingDot}> ...</span> : null}
              </div>
            ))
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
            placeholder="Ask about your account..."
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
        The assistant answers questions about your account with The Dot only. It cannot give
        immigration or case-specific advice; for anything about eligibility or an application,
        please book a consultation with the Kanset team.
      </p>
    </div>
  )
}
