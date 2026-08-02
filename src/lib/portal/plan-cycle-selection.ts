export type PlanCycleSelectionRow = {
  week_start: string
  week_end: string
  revision: number
  status: string
  updated_at?: string
  id?: string
}

const OPEN_FOR_DECISION = new Set(['submitted', 'change_requested'])
const LIVE_PLAN_STATUSES = new Set(['submitted', 'approved', 'change_requested'])

function compareCycles<T extends PlanCycleSelectionRow>(a: T, b: T): number {
  return a.week_start.localeCompare(b.week_start)
    || b.revision - a.revision
    || (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
    || (b.id ?? '').localeCompare(a.id ?? '')
}

export function torontoToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const value = (type: string) => parts.find((part) => part.type === type)?.value
  const year = value('year'); const month = value('month'); const day = value('day')
  if (!year || !month || !day) throw new Error('could not determine Toronto date')
  return `${year}-${month}-${day}`
}

/**
 * The plan Maria should act on is the nearest live plan, never the furthest future one.
 * An open decision takes precedence over an already-approved current plan so an upcoming
 * submission cannot vanish from the review queue during the preceding week.
 */
export function selectCurrentPlanCycle<T extends PlanCycleSelectionRow>(
  cycles: readonly T[],
  today = torontoToday(),
): T | null {
  // A draft is visible as "Coming up" but must never become the plan selected for
  // approval, even when it is the only future cycle.
  const visible = cycles.filter((cycle) => LIVE_PLAN_STATUSES.has(cycle.status) && cycle.week_end >= today)
  const open = selectOpenPlanCycles(visible, today)
  return open[0] ?? [...visible].sort(compareCycles)[0] ?? null
}

/**
 * Every non-expired plan that is genuinely awaiting a client decision. The client may
 * review one, two, or more prepared weeks at once. `selectCurrentPlanCycle` remains a
 * narrow scheduling helper, never the approval queue.
 */
export function selectOpenPlanCycles<T extends PlanCycleSelectionRow>(
  cycles: readonly T[],
  today = torontoToday(),
): T[] {
  return cycles
    .filter((cycle) => OPEN_FOR_DECISION.has(cycle.status) && cycle.week_end >= today)
    .sort(compareCycles)
}
