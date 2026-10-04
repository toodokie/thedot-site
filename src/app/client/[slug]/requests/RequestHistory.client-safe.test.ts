import { describe, expect, it, vi } from 'vitest'

// The new piece page renders RequestHistory inside a client component (the Questions drawer), so
// nothing it imports at runtime may pull in the server-only Supabase client (next/headers).
// Server actions cross the boundary as references in Next, so their module is stubbed here.
vi.mock('../request-actions', () => ({ replyToContentRequest: vi.fn() }))
vi.mock('@/lib/supabase/server', () => {
  throw new Error('server-only module imported by a client-rendered component')
})

describe('RequestHistory client safety', () => {
  it('loads without importing the server Supabase client', async () => {
    await expect(import('./RequestHistory')).resolves.toHaveProperty('default')
  })
})
