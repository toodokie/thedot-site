import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import AssistantWidget from './AssistantWidget'

describe('AssistantWidget', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    })
    window.localStorage.clear()
  })

  it('opens and closes the chat drawer from the floating bird button', () => {
    render(<AssistantWidget slug="kanset" storageScope="user-1" />)

    const openButton = screen.getByRole('button', { name: 'Open Kanset Assistant' })
    expect(openButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'Kanset Assistant' })).toBeNull()

    fireEvent.click(openButton)
    expect(screen.getByRole('dialog', { name: 'Kanset Assistant' })).toBeVisible()
    expect(screen.getByText('Portal help and official-source research')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(screen.getByRole('button', {
      name: 'What is the current LMIA processing fee?',
    })).toBeVisible()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'History' })).toBeVisible()
    expect(openButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getAllByRole('button', { name: 'Close Kanset Assistant' })[0])
    expect(screen.queryByRole('dialog', { name: 'Kanset Assistant' })).toBeNull()
    expect(openButton).toHaveFocus()
  })

  it('always renders the bird because the widget belongs on every portal page', () => {
    render(<AssistantWidget slug="kanset" storageScope="user-1" />)

    expect(screen.getByRole('button', { name: 'Open Kanset Assistant' })).toBeVisible()
  })

  it('opens and restores browser-only recent chats', async () => {
    window.localStorage.setItem(
      'kanset-assistant-history:v1:user-1:kanset',
      JSON.stringify([{
        id: 'chat-1',
        title: 'What is the next post about?',
        updatedAt: Date.now(),
        turns: [
          { role: 'user', text: 'What is the next post about?' },
          { role: 'assistant', text: 'The next planned piece is the Monday carousel.' },
        ],
      }]),
    )
    render(<AssistantWidget slug="kanset" storageScope="user-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Kanset Assistant' }))
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    const historyRegion = await screen.findByRole('region', { name: 'Recent chat history' })
    expect(historyRegion).toBeVisible()
    expect(screen.getByText('Saved only in this browser.')).toBeVisible()

    fireEvent.click(within(historyRegion).getByText('What is the next post about?').closest('button')!)
    expect(await screen.findByText('The next planned piece is the Monday carousel.')).toBeVisible()
  })
})
