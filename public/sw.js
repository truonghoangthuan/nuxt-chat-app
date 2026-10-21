// Service Worker for native Windows Action Center notifications and click routing
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  const conversationId = notification?.data?.conversationId
  notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Find open chat window/tab
      for (const client of windowClients) {
        if ('focus' in client) {
          return client.focus().then(() => {
            if (conversationId && 'postMessage' in client) {
              client.postMessage({
                type: 'NAVIGATE_CONVERSATION',
                conversationId,
              })
            }
          })
        }
      }
      // If no window client is open, open root
      if (self.clients.openWindow) {
        return self.clients.openWindow('/')
      }
    }),
  )
})
