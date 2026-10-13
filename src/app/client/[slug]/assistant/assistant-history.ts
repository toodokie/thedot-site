export type AssistantHistoryTurn = {
  role: 'user' | 'assistant'
  text: string
}

export type AssistantStoredChat = {
  id: string
  title: string
  updatedAt: number
  turns: AssistantHistoryTurn[]
}

export const MAX_STORED_CHATS = 3
const MAX_STORED_TURNS = 24
const MAX_STORED_TEXT = 6000

function isHistoryTurn(value: unknown): value is AssistantHistoryTurn {
  if (!value || typeof value !== 'object') return false
  const turn = value as Record<string, unknown>
  return (
    (turn.role === 'user' || turn.role === 'assistant')
    && typeof turn.text === 'string'
    && turn.text.length > 0
    && turn.text.length <= MAX_STORED_TEXT
  )
}

export function parseStoredChats(value: string | null): AssistantStoredChat[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const chat = entry as Record<string, unknown>
      if (
        typeof chat.id !== 'string'
        || chat.id.length < 1
        || chat.id.length > 100
        || typeof chat.title !== 'string'
        || chat.title.length < 1
        || chat.title.length > 120
        || typeof chat.updatedAt !== 'number'
        || !Number.isFinite(chat.updatedAt)
        || !Array.isArray(chat.turns)
      ) {
        return []
      }
      const turns = chat.turns.filter(isHistoryTurn).slice(-MAX_STORED_TURNS)
      if (turns.length === 0) return []
      return [{
        id: chat.id,
        title: chat.title,
        updatedAt: chat.updatedAt,
        turns,
      }]
    })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORED_CHATS)
  } catch {
    return []
  }
}

export function titleFromTurns(turns: AssistantHistoryTurn[]): string {
  const firstQuestion = turns.find((turn) => turn.role === 'user')?.text.trim()
  if (!firstQuestion) return 'New chat'
  return firstQuestion.length > 58 ? `${firstQuestion.slice(0, 57).trimEnd()}…` : firstQuestion
}

export function upsertStoredChat(
  chats: AssistantStoredChat[],
  chat: AssistantStoredChat,
): AssistantStoredChat[] {
  const boundedChat = {
    ...chat,
    turns: chat.turns.slice(-MAX_STORED_TURNS).map((turn) => ({
      role: turn.role,
      text: turn.text.slice(0, MAX_STORED_TEXT),
    })),
  }
  return [boundedChat, ...chats.filter((item) => item.id !== chat.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STORED_CHATS)
}
