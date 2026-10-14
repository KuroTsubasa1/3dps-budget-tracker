// Push notifications for Akinai's service worker; Workbox loads this file with importScripts (nuxt.config.ts)
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  if (!data || typeof data !== 'object') data = {}
  event.waitUntil(self.registration.showNotification(data.title || 'Akinai', {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: { url: data.url || '/calendar' }
  }))
})

// Tapping a notification focuses an open Akinai window on its page, or opens one
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Only pages of this site: anything else opens the calendar
  const target = (path) => {
    try {
      const url = new URL(path, self.location.origin)
      return url.origin === self.location.origin ? url.href : null
    } catch {
      return null
    }
  }
  const url = target(event.notification.data?.url || '/calendar') || target('/calendar')
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (open) {
      try {
        await open.focus()
        return await open.navigate(url)
      } catch {
        // An uncontrolled window cannot be navigated from here: open a new one instead
      }
    }
    return self.clients.openWindow(url)
  })())
})
