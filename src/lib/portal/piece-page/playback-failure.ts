// Playback failure reports (migration 0094, amended 2026-10-03). Pure and browser-safe. The client
// player maps media errors to these codes; the server action maps the request's user agent to one
// device and one browser from fixed lists, so no raw user agent is ever stored. The lists match the
// check constraints on content_review_playback_failures exactly.

export const PLAYBACK_ERROR_CODES = [
  'media_err_aborted', 'media_err_network', 'media_err_decode', 'media_err_src_not_supported',
  'stalled', 'link_expired', 'unknown',
] as const
export type PlaybackErrorCode = (typeof PLAYBACK_ERROR_CODES)[number]

export const PLAYBACK_DEVICES = [
  'iPhone', 'iPad', 'Android phone', 'Android tablet', 'Mac', 'Windows PC', 'Linux PC', 'Other device',
] as const
export type PlaybackDevice = (typeof PLAYBACK_DEVICES)[number]

export const PLAYBACK_BROWSERS = [
  'Safari', 'Chrome', 'Firefox', 'Edge', 'Samsung Internet', 'In-app browser', 'Other browser',
] as const
export type PlaybackBrowser = (typeof PLAYBACK_BROWSERS)[number]

// A wait longer than this after she pressed play counts as a failed play.
export const STALL_TIMEOUT_MS = 15_000

export function isPlaybackErrorCode(value: unknown): value is PlaybackErrorCode {
  return typeof value === 'string' && (PLAYBACK_ERROR_CODES as readonly string[]).includes(value)
}

// HTMLMediaElement.error.code: 1 aborted, 2 network, 3 decode, 4 source not supported.
export function mediaErrorCode(code: number | null | undefined): PlaybackErrorCode {
  switch (code) {
    case 1: return 'media_err_aborted'
    case 2: return 'media_err_network'
    case 3: return 'media_err_decode'
    case 4: return 'media_err_src_not_supported'
    default: return 'unknown'
  }
}

function deviceOf(ua: string): PlaybackDevice {
  if (/iPad/.test(ua)) return 'iPad'
  if (/iPhone|iPod/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Linux|X11|CrOS/.test(ua)) return 'Linux PC'
  return 'Other device'
}

function browserOf(ua: string): PlaybackBrowser {
  if (/FBAN|FBAV|Instagram|LinkedInApp|GSA\//.test(ua)) return 'In-app browser'
  if (/EdgiOS|EdgA\/|Edg\//.test(ua)) return 'Edge'
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet'
  if (/FxiOS|Firefox\//.test(ua)) return 'Firefox'
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome'
  if (/Version\/[\d.]+.*Safari\//.test(ua)) return 'Safari'
  return 'Other browser'
}

export function summarizeUserAgent(userAgent: string | null | undefined): { device: PlaybackDevice; browser: PlaybackBrowser } {
  const ua = userAgent ?? ''
  return { device: deviceOf(ua), browser: browserOf(ua) }
}

const LABELS: Record<PlaybackErrorCode, string> = {
  media_err_aborted: 'loading stopped',
  media_err_network: 'network error',
  media_err_decode: 'could not decode',
  media_err_src_not_supported: 'format not supported',
  stalled: 'stalled while playing',
  link_expired: 'signed link expired',
  unknown: 'unknown error',
}

export function playbackErrorLabel(code: string): string {
  return isPlaybackErrorCode(code) ? LABELS[code] : code.replaceAll('_', ' ')
}
