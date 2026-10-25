const DAY_MS = 24 * 60 * 60 * 1000

function dateOnly(value: string): Date | null {
  const iso = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

type PlannedReviewTiming = {
  label: string
  postingNote: string | null
}

// Review cards describe what the client needs to do now. A missed editorial date is
// not a new posting commitment; the original date remains in the calendar record.
export function getPlannedReviewTiming(
  plannedDate: string | null,
  todayIso: string,
): PlannedReviewTiming | null {
  if (!plannedDate) return null
  const planned = dateOnly(plannedDate)
  const today = dateOnly(todayIso)
  if (!planned || !today) return null

  const dayOffset = Math.round((planned.getTime() - today.getTime()) / DAY_MS)
  const weekday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC', weekday: 'long',
  }).format(planned)
  const monthDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
  }).format(planned)

  if (dayOffset < 0) return {
    label: 'Review overdue',
    postingNote: 'After approval, this will be posted in the next available slot.',
  }
  const label = dayOffset === 0 ? `Today · ${weekday}, ${monthDay}`
    : dayOffset === 1 ? `Tomorrow · ${weekday}, ${monthDay}`
      : `${weekday} · ${monthDay}`
  return { label, postingNote: null }
}
