import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Portal review previews are signed Supabase Storage links. Without these sources the browser
// blocks the reel video and its poster (found 2026-10-04 on the first real preview).
const config = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8')

describe('Content-Security-Policy allows portal review previews', () => {
  it('lets images load from the Supabase project', () => {
    expect(config).toMatch(/"img-src [^"]*https:\/\/ltotkkpytvtcgelrgdkg\.supabase\.co/)
  })
  it('lets video load from the Supabase project', () => {
    expect(config).toMatch(/"media-src [^"]*https:\/\/ltotkkpytvtcgelrgdkg\.supabase\.co/)
  })
})
