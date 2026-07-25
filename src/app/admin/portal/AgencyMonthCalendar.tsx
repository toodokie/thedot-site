import MonthGrid, { type CalendarChip } from '@/app/client/[slug]/calendar/MonthGrid'
import { deriveContentStage, type ContentStage } from '@/lib/portal/gates'
import type { AgencyPieceCalendarRow } from '@/lib/portal/gates-loader'
import { stageDisplay } from './GatesAdmin'

export type AgencyCalendarDays = Record<string, CalendarChip[]>

function accentForStage(stage: ContentStage): CalendarChip['accent'] {
  if (stage === 'done' || stage === 'posted_unverified' || stage === 'legacy') return 'grey'
  if (stage === 'approved' || stage === 'direction_approved'
    || stage === 'scheduled' || stage === 'scheduled_partial') return 'graphite'
  return 'yellow'
}

export function buildAgencyCalendarDays(rows: AgencyPieceCalendarRow[]): AgencyCalendarDays {
  const days: AgencyCalendarDays = {}
  for (const row of rows) {
    if (row.archived || !row.plannedDate) continue
    const result = deriveContentStage(row)
    const display = stageDisplay(result.stage, result.label)
    const key = row.plannedDate.slice(0, 10)
    const chip: CalendarChip = {
      id: `${row.clientId}:${row.contentId}`,
      href: `/admin/portal/pieces/${encodeURIComponent(row.contentId)}`,
      title: row.title,
      meta: [row.format, row.pillar].filter(Boolean).join(' · ') || null,
      platforms: row.platforms,
      stateNote: [display.label, display.detail].filter(Boolean).join(' · '),
      syncLabel: null,
      accent: accentForStage(result.stage),
    }
    ;(days[key] ??= []).push(chip)
  }
  return days
}

export function torontoTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export default function AgencyMonthCalendar({
  rows,
  todayIso,
}: {
  rows: AgencyPieceCalendarRow[]
  todayIso: string
}) {
  return <MonthGrid days={buildAgencyCalendarDays(rows)} todayIso={todayIso} />
}
