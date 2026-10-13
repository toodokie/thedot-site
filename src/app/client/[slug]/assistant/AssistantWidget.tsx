'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import AssistantChat from './AssistantChat'
import {
  parseStoredChats,
  titleFromTurns,
  upsertStoredChat,
  type AssistantHistoryTurn,
  type AssistantStoredChat,
} from './assistant-history'
import styles from './assistant.module.css'

function createChatId(): string {
  if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function historyTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export default function AssistantWidget({
  slug,
  storageScope,
}: {
  slug: string
  storageScope: string
}) {
  const [open, setOpen] = useState(false)
  const [chatKey, setChatKey] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<AssistantStoredChat[]>([])
  const [activeChatId, setActiveChatId] = useState('new-chat')
  const [initialTurns, setInitialTurns] = useState<AssistantHistoryTurn[]>([])
  const buttonRef = useRef<HTMLButtonElement>(null)
  const storageKey = useMemo(
    () => `kanset-assistant-history:v1:${storageScope}:${slug}`,
    [slug, storageScope],
  )

  const persistHistory = useCallback((chats: AssistantStoredChat[]) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(chats))
    } catch {
      // Storage can be unavailable in a private browser. The live chat still works.
    }
  }, [storageKey])

  const beginNewChat = useCallback(() => {
    setActiveChatId(createChatId())
    setInitialTurns([])
    setChatKey((current) => current + 1)
    setHistoryOpen(false)
  }, [])

  useEffect(() => {
    let stored: AssistantStoredChat[] = []
    try {
      stored = parseStoredChats(window.localStorage.getItem(storageKey))
    } catch {
      stored = []
    }
    setHistory(stored)
    if (stored[0]) {
      setActiveChatId(stored[0].id)
      setInitialTurns(stored[0].turns)
      setChatKey((current) => current + 1)
    } else {
      setActiveChatId(createChatId())
    }
  }, [storageKey])

  const saveConversation = useCallback((turns: AssistantHistoryTurn[]) => {
    if (turns.length === 0) return
    setInitialTurns(turns)
    setHistory((current) => {
      const next = upsertStoredChat(current, {
        id: activeChatId,
        title: titleFromTurns(turns),
        updatedAt: Date.now(),
        turns,
      })
      persistHistory(next)
      return next
    })
  }, [activeChatId, persistHistory])

  const openStoredChat = (chat: AssistantStoredChat) => {
    setActiveChatId(chat.id)
    setInitialTurns(chat.turns)
    setChatKey((current) => current + 1)
    setHistoryOpen(false)
  }

  const deleteStoredChat = (chatId: string) => {
    const next = history.filter((chat) => chat.id !== chatId)
    setHistory(next)
    persistHistory(next)
    if (chatId === activeChatId) beginNewChat()
  }

  const clearHistory = () => {
    setHistory([])
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // The in-memory history is still cleared.
    }
    beginNewChat()
  }

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  return (
    <>
      {open && (
        <button
          type="button"
          className={styles.widgetBackdrop}
          aria-label="Close Kanset Assistant"
          onClick={() => {
            setOpen(false)
            buttonRef.current?.focus()
          }}
        />
      )}
      <section
        id="kanset-assistant-widget"
        className={`${styles.widgetPanel}${open ? ` ${styles.widgetPanelOpen}` : ''}`}
        role="dialog"
        aria-label="Kanset Assistant"
        aria-hidden={!open}
        hidden={!open}
      >
        <header className={styles.widgetHeader}>
          <Image
            className={styles.widgetHeaderAvatar}
            src="/images/kanset-assistant-avatar.png"
            alt=""
            width={44}
            height={44}
          />
          <div>
            <p className={styles.widgetTitle}>Kanset Assistant</p>
            <p className={styles.widgetSubtitle}>Portal help and official-source research</p>
          </div>
          <div className={styles.widgetHeaderActions}>
            <button
              type="button"
              className={styles.widgetHistoryButton}
              aria-expanded={historyOpen}
              aria-controls="kanset-assistant-history"
              onClick={() => setHistoryOpen((current) => !current)}
            >
              History
            </button>
            <button
              type="button"
              className={styles.widgetNewChat}
              onClick={beginNewChat}
            >
              New chat
            </button>
            <button
              type="button"
              className={styles.widgetClose}
              aria-label="Close Kanset Assistant"
              onClick={() => {
                setOpen(false)
                buttonRef.current?.focus()
              }}
            >
              ×
            </button>
          </div>
        </header>
        {historyOpen ? (
          <section
            id="kanset-assistant-history"
            className={styles.historyPanel}
            aria-label="Recent chat history"
          >
            <div className={styles.historyHeading}>
              <div>
                <p className={styles.historyTitle}>Recent chats</p>
                <p className={styles.historyIntro}>Saved only in this browser.</p>
              </div>
              <button
                type="button"
                className={styles.historyClose}
                onClick={() => setHistoryOpen(false)}
                aria-label="Close chat history"
              >
                ×
              </button>
            </div>
            {history.length === 0 ? (
              <p className={styles.historyEmpty}>No saved chats yet.</p>
            ) : (
              <div className={styles.historyList}>
                {history.map((chat) => (
                  <div
                    key={chat.id}
                    className={`${styles.historyItem}${chat.id === activeChatId
                      ? ` ${styles.historyItemActive}`
                      : ''}`}
                  >
                    <button
                      type="button"
                      className={styles.historySelect}
                      onClick={() => openStoredChat(chat)}
                    >
                      <span className={styles.historyItemTitle}>{chat.title}</span>
                      <span className={styles.historyItemTime}>{historyTime(chat.updatedAt)}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.historyDelete}
                      aria-label={`Delete chat: ${chat.title}`}
                      onClick={() => deleteStoredChat(chat.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
            {history.length > 0 && (
              <button type="button" className={styles.historyClear} onClick={clearHistory}>
                Clear all chats
              </button>
            )}
            <p className={styles.historyPrivacy}>
              Chat text stays on this device. Do not include personal immigration case data.
            </p>
          </section>
        ) : (
          <AssistantChat
            key={chatKey}
            slug={slug}
            embedded
            active={open}
            initialTurns={initialTurns}
            onConversationChange={saveConversation}
          />
        )}
      </section>
      <button
        ref={buttonRef}
        type="button"
        className={styles.widgetButton}
        aria-label={open ? 'Close Kanset Assistant' : 'Open Kanset Assistant'}
        aria-expanded={open}
        aria-controls="kanset-assistant-widget"
        onClick={() => setOpen((current) => !current)}
      >
        <Image
          className={styles.widgetButtonAvatar}
          src="/images/kanset-assistant-avatar.png"
          alt=""
          width={68}
          height={68}
          priority
        />
        <span className={styles.widgetStatus} aria-hidden="true" />
      </button>
    </>
  )
}
