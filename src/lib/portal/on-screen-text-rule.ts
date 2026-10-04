// Production rule (spec 2026-10-03-piece-page-redesign-design.md section 9.3): every piece whose
// media carries on-screen text ships to the portal with that text as a client-facing block, so the
// client can read what the frames say before approving. Added after 2026-10-02, when a reel's copy
// was approved without its frames and the post had to come down.
//
// Pure and I/O-free. scripts/update-portal.ts calls it before any write.
import matter from 'gray-matter'

export const ON_SCREEN_TEXT_FORMATS: ReadonlySet<string> = new Set([
  'reel', 'short', 'vertical_video', 'carousel', 'single',
])

// Every on-screen block key already used in portal-content (2026-10-03 inventory).
export const ON_SCREEN_TEXT_BLOCK_KEYS: readonly string[] = [
  'reel-script', 'on-screen-copy', 'onscreen-script', 'video-script',
  'carousel-copy', 'carousel-slides', 'carousel', 'document-copy', 'linkedin-document-copy',
]

export type OnScreenTextOptOut = 'captions_only'

export type OnScreenTextVerdict =
  | { status: 'not-applicable' }
  | { status: 'present'; blockKey: string }
  | { status: 'opted-out'; optOut: OnScreenTextOptOut }
  | { status: 'missing'; message: string }

// Reads the optional `on_screen_text` frontmatter key from a canonical file. Absent = no opt-out.
// Any value other than captions_only throws, so a misspelling can never switch the rule off.
export function readOnScreenTextOptOut(canonicalRaw: string, source: string): OnScreenTextOptOut | null {
  const value = (matter(canonicalRaw).data as Record<string, unknown>).on_screen_text
  if (value === undefined || value === null) return null
  if (value === 'captions_only') return value
  throw new Error(`on_screen_text must be captions_only in ${source}; got ${JSON.stringify(value)}`)
}

export function checkOnScreenTextBlock(input: {
  contentId: string
  format: string | null
  blockKeys: readonly string[]
  optOut: OnScreenTextOptOut | null
}): OnScreenTextVerdict {
  const format = input.format?.trim().toLowerCase() ?? null
  if (!format || !ON_SCREEN_TEXT_FORMATS.has(format)) return { status: 'not-applicable' }
  const blockKey = input.blockKeys.find((key) => ON_SCREEN_TEXT_BLOCK_KEYS.includes(key))
  if (blockKey) return { status: 'present', blockKey }
  if (input.optOut) return { status: 'opted-out', optOut: input.optOut }
  return {
    status: 'missing',
    message: `${input.contentId} is format "${format}" but has no on-screen text block `
      + `(one of: ${ON_SCREEN_TEXT_BLOCK_KEYS.join(', ')}). Add <!-- portal-block:reel-script --> `
      + '(or on-screen-copy / carousel-copy) with the text frame by frame, so the client reads what the '
      + 'media says before approving. For a talking-head clip whose only on-screen text is captions of '
      + 'the speech, add "on_screen_text: captions_only" to the canonical frontmatter instead.',
  }
}
