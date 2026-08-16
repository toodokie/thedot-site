const TORONTO_OFFSETS = [-240, -300] as const

export type TorontoOffsetResult =
  | { ok: true; offsetMinutes: -240 | -300 }
  | { ok: false; reason: 'invalid' | 'nonexistent' | 'ambiguous' }

function localParts(value: string): {
  year: number; month: number; day: number; hour: number; minute: number
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1
      || probe.getUTCDate() !== day || probe.getUTCHours() !== hour
      || probe.getUTCMinutes() !== minute) return null
  return { year, month, day, hour, minute }
}

function partsInToronto(instant: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)
  return Object.fromEntries(parts.flatMap((part) => {
    if (!['year', 'month', 'day', 'hour', 'minute'].includes(part.type)) return []
    return [[part.type, Number(part.value)]]
  }))
}

export function resolveTorontoOffset(value: string): TorontoOffsetResult {
  const local = localParts(value)
  if (!local) return { ok: false, reason: 'invalid' }
  const matching = TORONTO_OFFSETS.filter((offsetMinutes) => {
    const utc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute)
      - offsetMinutes * 60_000
    const actual = partsInToronto(new Date(utc))
    return actual.year === local.year && actual.month === local.month && actual.day === local.day
      && actual.hour === local.hour && actual.minute === local.minute
  })
  if (matching.length === 0) return { ok: false, reason: 'nonexistent' }
  if (matching.length > 1) return { ok: false, reason: 'ambiguous' }
  return { ok: true, offsetMinutes: matching[0] }
}
