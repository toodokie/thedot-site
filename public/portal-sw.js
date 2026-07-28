const CACHE_PREFIX = 'portal-static-'
const CACHE_NAME = `${CACHE_PREFIX}v1`

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // Never intercept non-GET, cross-origin, HTML, API, auth, or Supabase traffic.
  if (
    request.method !== 'GET'
    || url.origin !== self.location.origin
    || !url.pathname.startsWith('/_next/static/')
  ) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(request)
    const network = fetch(request).then((response) => {
      if (response.ok) void cache.put(request, response.clone())
      return response
    }).catch(() => cached ?? new Response('', { status: 504, statusText: 'Offline' }))
    return cached ?? network
  })())
})
