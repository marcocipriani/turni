/**
 * Service worker: notifiche push e funzionamento offline.
 *
 * Tre regole, una per tipo di richiesta, e nessuna libreria.
 *
 *   guscio       (navigazioni)  rete, e se non c'è la copia dell'ultima pagina
 *   statici      (/assets, font, icone)  copia, e rete solo la prima volta
 *   /api/auth/me, /api/mio, /api/panoramica   rete, e se non c'è l'ultima risposta riuscita
 *
 * Niente elenco di file da precaricare: gli assetti hanno il digest nel nome,
 * quindi la copia non scade mai per conto suo e la prima visita online riempie
 * la dispensa da sé. Chi installa l'applicazione e va offline prima di averla
 * mai aperta non ha niente da mostrare, ed è giusto così.
 *
 * DEI DATI SI CONSERVANO «/api/mio» E «/api/panoramica»: le proprie giornate
 * e chi c'è in sede, cioè le due cose che si guardano col telefono in mano
 * davanti al portone. Della panoramica nessuna causale arriva mai sul disco:
 * chi è assente vi compare come nome e settore, e le assenze di chi non si ha
 * titolo a vedere non lasciano il server affatto. Si conserva anche «chi sono»
 * (`/api/auth/me`): senza, l'applicazione offline non sa di chi è e apre la
 * pagina di accesso, e le copie qui sopra non le vede nessuno. Un 401 non si
 * conserva mai: una sessione scaduta resta scaduta. La dispensa dei dati si
 * svuota all'uscita: ci pensa l'applicazione chiamando `caches.delete`.
 */
const VERSIONE = 'v1'
const GUSCIO = `turni-guscio-${VERSIONE}`
const DATI = `turni-dati-${VERSIONE}`
const NOSTRE = [GUSCIO, DATI]

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Le dispense di una versione precedente non servono più: i nomi degli
    // assetti sono cambiati insieme al loro contenuto.
    for (const nome of await caches.keys()) {
      if (nome.startsWith('turni-') && !NOSTRE.includes(nome)) await caches.delete(nome)
    }
    await self.clients.claim()
  })())
})

/** Rete, e se la rete non c'è quello che avevamo. Aggiorna la copia quando riesce. */
async function reteOCopia(richiesta, dispensa, marcaLaData) {
  const cache = await caches.open(dispensa)
  try {
    const risposta = await fetch(richiesta)
    if (risposta.ok) await cache.put(richiesta, risposta.clone())
    return risposta
  } catch (errore) {
    const copia = await cache.match(richiesta)
    if (!copia) throw errore
    if (!marcaLaData) return copia
    // Chi legge deve poter dire «questi dati sono di ieri sera»: la data è
    // quella della risposta conservata, non quella di adesso.
    const intestazioni = new Headers(copia.headers)
    intestazioni.set('x-turni-copia', copia.headers.get('date') ?? new Date().toUTCString())
    return new Response(await copia.blob(), {
      status: copia.status, statusText: copia.statusText, headers: intestazioni,
    })
  }
}

/** Copia, e rete solo se non ce l'abbiamo. Per ciò che non cambia mai a parità di nome. */
async function copiaORete(richiesta, dispensa) {
  const cache = await caches.open(dispensa)
  const copia = await cache.match(richiesta)
  if (copia) return copia
  const risposta = await fetch(richiesta)
  if (risposta.ok) await cache.put(richiesta, risposta.clone())
  return risposta
}

self.addEventListener('fetch', (event) => {
  const richiesta = event.request
  if (richiesta.method !== 'GET') return

  const url = new URL(richiesta.url)
  if (url.origin !== self.location.origin) return

  // La navigazione: senza rete si riapre il guscio, e l'applicazione dirà lei
  // che sta mostrando dati vecchi.
  if (richiesta.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const risposta = await fetch(richiesta)
        const cache = await caches.open(GUSCIO)
        if (risposta.ok) await cache.put('/index.html', risposta.clone())
        return risposta
      } catch (errore) {
        const copia = await caches.match('/index.html', { cacheName: GUSCIO })
        if (copia) return copia
        throw errore
      }
    })())
    return
  }

  if (url.pathname === '/api/mio' || url.pathname === '/api/panoramica') {
    event.respondWith(reteOCopia(richiesta, DATI, true))
    return
  }
  if (url.pathname === '/api/auth/me') {
    event.respondWith(reteOCopia(richiesta, DATI, false))
    return
  }

  // Il resto delle chiamate all'API non si conserva: senza rete falliscono, e
  // l'interfaccia mostra il suo errore invece di una verità di ieri.
  if (url.pathname.startsWith('/api/')) return

  if (/^\/(assets|marchio)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    event.respondWith(copiaORete(richiesta, GUSCIO))
  }
})

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
