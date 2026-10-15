'use client'

import { unstable_isUnrecognizedActionError } from 'next/navigation'

export const STALE_PAGE_EVENT = 'portal:stale-page'

export function isStalePageError(error: unknown): boolean {
  return unstable_isUnrecognizedActionError(error)
}

export function reportStalePage(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(STALE_PAGE_EVENT))
}

// Server actions reject before reaching application code when an older page calls an action that
// no longer exists in the current deploy. Stale failures get the global reload notice; every other
// error keeps its existing rejection behavior.
export async function runWithStalePageReporting<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run()
  } catch (error) {
    if (!isStalePageError(error)) throw error
    reportStalePage()
    return undefined
  }
}

export function withStalePageReporting<State, Payload>(
  action: (previous: State, payload: Payload) => State | Promise<State>,
): (previous: State, payload: Payload) => Promise<State> {
  return async (previous, payload) => {
    const result = await runWithStalePageReporting(() => Promise.resolve(action(previous, payload)))
    return result ?? previous
  }
}
