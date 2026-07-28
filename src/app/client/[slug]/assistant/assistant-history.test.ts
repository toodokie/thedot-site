import { describe, expect, it } from 'vitest'
import {
  MAX_STORED_CHATS,
  parseStoredChats,
  titleFromTurns,
  upsertStoredChat,
  type AssistantStoredChat,
} from './assistant-history'

const chat = (id: string, updatedAt: number): AssistantStoredChat => ({
  id,
  updatedAt,
  title: `Chat ${id}`,
  turns: [{ role: 'user', text: `Question ${id}` }],
})

describe('assistant browser history', () => {
  it('keeps only the three newest chats', () => {
    const result = [chat('1', 1), chat('2', 2), chat('3', 3), chat('4', 4)]
      .reduce(upsertStoredChat, [])
    expect(result).toHaveLength(MAX_STORED_CHATS)
    expect(result.map((item) => item.id)).toEqual(['4', '3', '2'])
  })

  it('parses valid local history and drops malformed entries', () => {
    const value = JSON.stringify([
      chat('safe', 2),
      { id: 'bad', title: 'Bad', updatedAt: 1, turns: [{ role: 'tool', text: 'no' }] },
    ])
    expect(parseStoredChats(value).map((item) => item.id)).toEqual(['safe'])
    expect(parseStoredChats('{broken')).toEqual([])
  })

  it('uses the first question as a compact chat title', () => {
    expect(titleFromTurns([{ role: 'user', text: 'What is the next post about?' }]))
      .toBe('What is the next post about?')
    expect(titleFromTurns([{ role: 'assistant', text: 'Hello' }])).toBe('New chat')
  })
})
