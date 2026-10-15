export type PortalActivitySignal = {
  label: string
  count: number
  latestAt: string | null
}

export type PortalQuietDecision = {
  active: boolean
  exitCode: 0 | 2
  signals: PortalActivitySignal[]
}

export function decidePortalQuiet(signals: PortalActivitySignal[]): PortalQuietDecision {
  const activeSignals = signals
    .filter((signal) => signal.count > 0)
    .sort((left, right) => Date.parse(right.latestAt ?? '') - Date.parse(left.latestAt ?? ''))
  return {
    active: activeSignals.length > 0,
    exitCode: activeSignals.length > 0 ? 2 : 0,
    signals: activeSignals,
  }
}
