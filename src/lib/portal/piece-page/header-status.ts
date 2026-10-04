// The one status line under the piece title (spec 2026-10-03 section 4.1). It replaces the
// Schedule and Publication sections. Toronto time throughout.
import type { PublicationTargetRow } from '@/lib/portal/publication'
import type { ScheduleTargetRow } from '@/lib/portal/schedule'
import type { PieceLayout } from './copy-tabs'

const TZ = 'America/Toronto'
const NAMES: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', linkedin: 'LinkedIn',
  squarespace: 'kanset.com', website: 'kanset.com', tiktok: 'TikTok',
}

export function destinationLabel(destination: string): string {
  const key = destination.trim().toLowerCase()
  return NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

function parts(iso: string): Record<string, string> {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
  return Object.fromEntries(format.formatToParts(new Date(iso)).map((part) => [part.type, part.value]))
}

export function torontoDateLabel(iso: string): string {
  const p = parts(iso)
  return `${p.weekday} ${p.month} ${p.day}`
}

export function torontoTimeLabel(iso: string): string {
  const p = parts(iso)
  return `${p.hour}${p.minute === '00' ? '' : `:${p.minute}`} ${p.dayPeriod.toUpperCase() === 'AM' ? 'a.m.' : 'p.m.'}`
}

export function plannedDateLabel(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
    .format(day).replace(',', '')
}

export type HeaderStatus =
  | { kind: 'live'; links: { label: string; url: string }[]; postedLabel: string | null; keyFact: string }
  | { kind: 'scheduled'; verb: 'Posts' | 'Publishes'; dateLabel: string; groups: { time: string; destinations: string }[]; keyFact: string }
  | { kind: 'unconfirmed'; verb: 'Posts' | 'Publishes'; dateLabel: string; keyFact: string }
  | { kind: 'undated'; keyFact: string }

const CONFIRMED = new Set<ScheduleTargetRow['status']>(['scheduled', 'reschedule_pending', 'cancel_pending'])

export function headerStatus(input: {
  isPublished: boolean
  publication: PublicationTargetRow[]
  schedule: ScheduleTargetRow[]
  plannedDate: string | null
  layout: PieceLayout
}): HeaderStatus {
  if (input.isPublished) {
    const liveTargets = input.publication.filter((t) => t.status === 'live')
    const first = liveTargets.map((t) => t.published_at).filter((v): v is string => Boolean(v)).sort()[0]
    return {
      kind: 'live',
      keyFact: 'Live',
      postedLabel: first ? `Posted ${torontoDateLabel(first)}` : null,
      links: liveTargets.filter((t) => t.live_url && /^https:\/\//i.test(t.live_url))
        .map((t) => ({ label: destinationLabel(t.destination), url: t.live_url as string })),
    }
  }
  const verb = input.layout === 'article' ? 'Publishes' : 'Posts'
  const required = input.schedule.filter((t) => t.required && t.status !== 'cancelled')
  const times = required.map((t) => t.scheduled_at).filter((v): v is string => Boolean(v)).sort()
  if (required.length > 0 && required.every((t) => t.scheduled_at && CONFIRMED.has(t.status))) {
    const groups = new Map<string, string[]>()
    for (const t of [...required].sort((a, b) => (a.scheduled_at as string).localeCompare(b.scheduled_at as string))) {
      const time = torontoTimeLabel(t.scheduled_at as string)
      groups.set(time, [...(groups.get(time) ?? []), destinationLabel(t.destination)])
    }
    const dateLabel = torontoDateLabel(times[0])
    return {
      kind: 'scheduled', verb, dateLabel, keyFact: `${verb} ${dateLabel}`,
      groups: [...groups].map(([time, names]) => ({ time, destinations: names.join(', ') })),
    }
  }
  const dateLabel = (input.plannedDate ? plannedDateLabel(input.plannedDate) : null)
    ?? (times[0] ? torontoDateLabel(times[0]) : null)
  if (dateLabel) return { kind: 'unconfirmed', verb, dateLabel, keyFact: `${verb} ${dateLabel}` }
  return { kind: 'undated', keyFact: 'No date yet' }
}
