export const SUPABASE_MIDDLEWARE_TIMEOUT_MS = 4_000
export const SUPABASE_SERVER_TIMEOUT_MS = 8_000

type FetchImplementation = typeof fetch

// Supabase uses the supplied fetch for Auth and Data API requests. Bound every request so a
// provider slowdown cannot consume the entire Vercel middleware or server-render deadline.
export function createSupabaseFetch(
  timeoutMs: number,
  fetchImplementation: FetchImplementation = fetch,
): FetchImplementation {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController()
    const callerSignal = init?.signal
    const abortFromCaller = () => controller.abort()

    if (callerSignal?.aborted) {
      controller.abort()
    } else {
      callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
    }

    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetchImplementation(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
      callerSignal?.removeEventListener('abort', abortFromCaller)
    }
  }) as FetchImplementation
}
