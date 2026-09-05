// Service worker minimo: serve solo a ricevere le notifiche push.
// Nessuna cache: l'applicazione richiede comunque la rete per i dati.
self.addEventListener('push', (event) => {
  const d = event.data ? event.data.json() : {}
  event.waitUntil(self.registration.showNotification(d.titolo || 'Turni', {
    body: d.corpo || '',
    data: { link: d.link || '/' },
    tag: d.tipo || 'turni',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) if ('focus' in c) return c.focus().then(() => c.navigate(link))
    return clients.openWindow(link)
  }))
})
