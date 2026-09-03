// The weekly content plan is a heads-up, not a gate (Anastasia, 2026-09-02). Production runs
// from the week's Monday whether or not the client has decided, and every piece still comes to
// the client for its own approval. This helper produces the one sentence that says so, with the
// real dates, so the Overview and the Plan page can show the same line and the client is never
// left guessing what silence means.

const DAY_MS = 24 * 60 * 60 * 1000

function dateOnly(value: string): Date | null {
  const iso = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(date).replace(',', '')
}

export type PlanHeadsUp = {
  /** YYYY-MM-DD of the last day we wait for a decision: the Friday before the week starts. */
  deadlineIso: string
  /** True once today is past the deadline, so the week is already running as planned. */
  deadlinePassed: boolean
  /** Full sentence for the Plan page. */
  sentence: string
  /** Shorter line for the Overview row. */
  short: string
}

/**
 * Builds the heads-up line for a submitted plan cycle. `weekStart` is the cycle's Monday;
 * the deadline is the Friday before it. Returns null when the date is unusable.
 */
export function planHeadsUp(weekStart: string, todayIso: string): PlanHeadsUp | null {
  const start = dateOnly(weekStart)
  const today = dateOnly(todayIso)
  if (!start || !today) return null
  const deadline = new Date(start.getTime() - 3 * DAY_MS)
  const deadlineIso = isoOf(deadline)
  const deadlinePassed = today.getTime() > deadline.getTime()
  const startLabel = shortDate(start)
  const deadlineLabel = shortDate(deadline)
  if (deadlinePassed) {
    return {
      deadlineIso,
      deadlinePassed,
      sentence: `This week is running as planned from ${startLabel}. Each piece still comes to you for approval before it posts.`,
      short: `Running as planned from ${startLabel}. Each piece still comes to you for approval.`,
    }
  }
  return {
    deadlineIso,
    deadlinePassed,
    sentence: `If we have not heard from you by ${deadlineLabel}, the week runs as planned from ${startLabel}, and each piece still comes to you for approval before it posts.`,
    short: `Runs as planned from ${startLabel} unless we hear from you by ${deadlineLabel}. Each piece still comes to you for approval.`,
  }
}

/** "Sep 7" style label for a YYYY-MM-DD string, for chips that used to show the raw ISO date. */
export function shortMonthDay(iso: string): string {
  const date = dateOnly(iso)
  if (!date) return iso
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(date).replace(',', '')
}
