import type { CSSProperties } from 'react'

// Item 1 (2026-10-06): media take their own shape. The player, frame stills and cover tiles read
// CSS custom properties set from the media's real width and height, with the old 9:16 (or 4:5
// for pages) as the stylesheet fallback when the size is unknown. aspect-ratio reserves the box
// before the file loads, so nothing shifts.
function valid(width: number | null | undefined, height: number | null | undefined): width is number {
  return typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0
    && Number.isFinite(width) && Number.isFinite(height)
}

function ratio(width: number, height: number): string {
  return String(Math.round((width / height) * 10_000) / 10_000)
}

// --media-ar for aspect-ratio, --media-wr (width over height) to cap a portrait player by height.
export function mediaVars(width: number | null | undefined, height: number | null | undefined): CSSProperties | undefined {
  if (!valid(width, height)) return undefined
  return { '--media-ar': `${width} / ${height}`, '--media-wr': ratio(width, height!) } as CSSProperties
}

// --frame-ar for the stills of a video or the pages of a document.
export function frameVars(width: number | null | undefined, height: number | null | undefined): CSSProperties | undefined {
  if (!valid(width, height)) return undefined
  return { '--frame-ar': `${width} / ${height}` } as CSSProperties
}

export function aspectStyle(width: number | null | undefined, height: number | null | undefined): CSSProperties | undefined {
  if (!valid(width, height)) return undefined
  return { aspectRatio: `${width} / ${height}` }
}
