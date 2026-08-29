import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseFetch } from './request-timeout'

describe('createSupabaseFetch', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts a provider request at the configured deadline', async () => {
    vi.useFakeTimers()
    let observedSignal: AbortSignal | null | undefined
    const hangingFetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'))
        }, { once: true })
      })
    }) as unknown as typeof fetch
    const boundedFetch = createSupabaseFetch(25, hangingFetch)

    const request = boundedFetch('https://example.com/auth/v1/user')
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(25)

    await rejection
    expect(observedSignal?.aborted).toBe(true)
  })

  it('returns a healthy provider response unchanged', async () => {
    const providerResponse = new Response('ok', { status: 200 })
    const providerFetch = vi.fn().mockResolvedValue(providerResponse) as unknown as typeof fetch

    const response = await createSupabaseFetch(25, providerFetch)('https://example.com/rest/v1/')

    expect(response).toBe(providerResponse)
  })
})
