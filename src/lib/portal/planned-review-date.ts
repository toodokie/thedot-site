const DAY_MS = 24 * 60 * 60 * 1000

function dateOnly(value: string): Date | null {
  const iso = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatPlannedReviewDate(
  plannedDate: string | null,
  todayIso: string,
): string | null {
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

  if (dayOffset < 0) return `Overdue · ${weekday}, ${monthDay}`
  if (dayOffset === 0) return `Today · ${weekday}, ${monthDay}`
  if (dayOffset === 1) return `Tomorrow · ${weekday}, ${monthDay}`
  return `${weekday} · ${monthDay}`
}
