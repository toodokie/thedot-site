import { describe, expect, it } from 'vitest'
import {
  checkOnScreenTextBlock,
  ON_SCREEN_TEXT_BLOCK_KEYS,
  readOnScreenTextOptOut,
} from './on-screen-text-rule'

const canonical = (extra: string) => `---
portal_kind: content
content_id: kanset-2026-10-foreign-worker-cost-reel
client: kanset
title: "Foreign worker cost"
format: reel
${extra}version: 2
---
<!-- portal-block:social-caption -->
## Caption
Body.

<!-- internal -->
`

describe('readOnScreenTextOptOut', () => {
  it('is null when the key is absent', () => {
    expect(readOnScreenTextOptOut(canonical(''), 'x.md')).toBeNull()
  })

  it('reads captions_only', () => {
    expect(readOnScreenTextOptOut(canonical('on_screen_text: captions_only\n'), 'x.md')).toBe('captions_only')
  })

  it('refuses any other value so a typo cannot opt out', () => {
    expect(() => readOnScreenTextOptOut(canonical('on_screen_text: caption_only\n'), 'x.md'))
      .toThrow(/on_screen_text must be captions_only in x\.md; got "caption_only"/)
    expect(() => readOnScreenTextOptOut(canonical('on_screen_text: true\n'), 'x.md'))
      .toThrow(/got true/)
  })
})

describe('checkOnScreenTextBlock', () => {
  const base = { contentId: 'kanset-2026-10-foreign-worker-cost-reel', optOut: null }

  it('passes a reel that carries a reel-script block', () => {
    expect(checkOnScreenTextBlock({ ...base, format: 'reel', blockKeys: ['reel-script', 'social-caption'] }))
      .toEqual({ status: 'present', blockKey: 'reel-script' })
  })

  it('accepts every known on-screen block key', () => {
    for (const key of ON_SCREEN_TEXT_BLOCK_KEYS) {
      expect(checkOnScreenTextBlock({ ...base, format: 'carousel', blockKeys: [key] }).status).toBe('present')
    }
  })

  it('flags a reel with only a caption and a YouTube package (the 2026-10-02 incident)', () => {
    const verdict = checkOnScreenTextBlock({ ...base, format: 'reel', blockKeys: ['social-caption', 'youtube-package'] })
    expect(verdict.status).toBe('missing')
    if (verdict.status !== 'missing') throw new Error('unreachable')
    expect(verdict.message).toContain('kanset-2026-10-foreign-worker-cost-reel')
    expect(verdict.message).toContain('format "reel"')
    expect(verdict.message).toContain('<!-- portal-block:reel-script -->')
    expect(verdict.message).toContain('on_screen_text: captions_only')
  })

  it('covers short, vertical_video, carousel and single, case-insensitively', () => {
    for (const format of ['short', 'vertical_video', 'carousel', 'single', 'Reel', ' reel ']) {
      expect(checkOnScreenTextBlock({ ...base, format, blockKeys: ['caption'] }).status).toBe('missing')
    }
  })

  it('lets a captions-only talking-head clip opt out explicitly', () => {
    expect(checkOnScreenTextBlock({ ...base, format: 'reel', blockKeys: ['social-caption'], optOut: 'captions_only' }))
      .toEqual({ status: 'opted-out', optOut: 'captions_only' })
  })

  it('prefers a present block over an opt-out', () => {
    expect(checkOnScreenTextBlock({ ...base, format: 'reel', blockKeys: ['on-screen-copy'], optOut: 'captions_only' }).status)
      .toBe('present')
  })

  it('does not apply to formats without on-screen media text', () => {
    for (const format of ['article', 'podcast', 'podcast_article', 'post', 'linkedin-post', 'story', null]) {
      expect(checkOnScreenTextBlock({ ...base, format, blockKeys: ['caption'] }))
        .toEqual({ status: 'not-applicable' })
    }
  })
})
