import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { compress } from 'hono/compress'
import { cors } from 'hono/cors'
import { caricaAlbero, caricaAttore, type Env, HttpError } from './context'
import { absences } from './routes/absences'
import { auth, utenteDaToken } from './routes/auth'
import { admin } from './routes/admin'
import { mio } from './routes/mio'
import { notifications } from './routes/notifications'
import { org } from './routes/org'
import { overview } from './routes/overview'
import { periods } from './routes/periods'
import { swaps } from './routes/swaps'

const COOKIE = process.env.SESSION_COOKIE ?? 'turni_session'
const PRODUZIONE = process.env.NODE_ENV === 'production'
const app = new Hono<Env>()

/**
 * In produzione il frontend è servito da questo stesso processo: stessa
 * origine, CORS inutile. In sviluppo Vite sta su un'altra porta, e lì serve.
 * Un CORS che rimanda indietro qualunque origine con le credenziali aperte
 * lascerebbe a un sito qualunque la porta di servizio.
 */
if (!PRODUZIONE) {
  app.use('/api/*', cors({ origin: (o) => o ?? '*', credentials: true }))
} else if (process.env.APP_ORIGIN) {
  const consentite = process.env.APP_ORIGIN.split(',').map((s) => s.trim())
  app.use('/api/*', cors({ origin: (o) => consentite.includes(o) ? o : '', credentials: true }))
}

app.use('*', compress())

/**
 * Intestazioni di sicurezza. La politica dei contenuti è stretta perché
 * l'applicazione non carica niente da fuori: nessun CDN, nessun carattere
 * remoto, nessuna analitica. Se un giorno servisse, va allargata qui.
 */
app.use('*', async (c, next) => {
  await next()
  c.header('x-content-type-options', 'nosniff')
  c.header('referrer-policy', 'same-origin')
  c.header('x-frame-options', 'DENY')
  c.header('permissions-policy', 'geolocation=(), camera=(), microphone=(), interest-cohort=()')
  c.header('content-security-policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; " +
    "base-uri 'self'; form-action 'self'; object-src 'none'")
  if (PRODUZIONE) c.header('strict-transport-security', 'max-age=15552000; includeSubDomains')
})

/** Un corpo enorme è o un errore o un tentativo: non lo si legge nemmeno. */
const CORPO_MASSIMO = 256 * 1024
app.use('/api/*', async (c, next) => {
  const lunghezza = Number(c.req.header('content-length') ?? 0)
  if (lunghezza > CORPO_MASSIMO) throw new HttpError(413, 'Richiesta troppo grande')
  return next()
})

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ errore: err.message }, err.status)
  console.error(err)
  return c.json({ errore: 'Errore interno' }, 500)
})

app.get('/api/salute', (c) => c.json({ ok: true }))

// Il login è l'unica rotta raggiungibile senza sessione.
app.use('/api/*', async (c, next) => {
  const pubbliche = ['/api/auth/login', '/api/auth/logout', '/api/salute']
  if (pubbliche.includes(c.req.path)) return next()

  const token = getCookie(c, COOKIE)
  const userId = token ? await utenteDaToken(token) : null
  if (!userId) throw new HttpError(401, 'Sessione assente o scaduta')
  const attore = await caricaAttore(userId)
  if (!attore) throw new HttpError(401, 'Utente non più attivo')
  c.set('attore', attore)
  c.set('albero', await caricaAlbero())
  return next()
})

app.route('/api/auth', auth)
app.route('/api/admin', admin)
app.route('/api/org', org)
app.route('/api/assenze', absences)
app.route('/api/periodi', periods)
app.route('/api/notifiche', notifications)
app.route('/api/panoramica', overview)
app.route('/api/mio', mio)
app.route('/api/scambi', swaps)

// Una rotta di API inesistente risponde con un errore, non con la pagina
// dell'applicazione: chi chiama l'API si aspetta JSON anche quando sbaglia.
app.all('/api/*', (c) => c.json({ errore: 'Rotta non trovata' }, 404))

// Il frontend compilato viene servito dallo stesso processo: un solo slot
// applicativo da configurare sull'hosting. In alternativa i file di web/dist
// possono essere copiati in public_html e serviti dal server web.
const RADICE_WEB = process.env.WEB_DIST ?? '../web/dist'
// I nomi degli asset contengono l'impronta del contenuto: memorizzabili per sempre.
app.use('/assets/*', async (c, next) => {
  await next()
  c.header('cache-control', 'public, max-age=31536000, immutable')
})
app.use('/assets/*', serveStatic({ root: RADICE_WEB }))

// Ogni altro file statico pubblicato (marchio, service worker, manifest).
app.use('*', serveStatic({ root: RADICE_WEB }))

// Le rotte del client sono gestite da React: ciò che non è né API né file torna l'indice.
app.get('*', serveStatic({ root: RADICE_WEB, rewriteRequestPath: () => '/index.html' }))

/**
 * Controlli all'avvio: meglio non partire che partire sbagliati. In produzione
 * un archivio non configurato o un cookie di sessione lasciato al valore
 * predefinito sono errori che si scoprono tardi e male.
 */
function controllaAmbiente() {
  const mancanti: string[] = []
  if (!process.env.DATABASE_URL) mancanti.push('DATABASE_URL')
  if (PRODUZIONE && !process.env.SESSION_COOKIE) mancanti.push('SESSION_COOKIE')
  if (mancanti.length) {
    console.error(`\nVariabili mancanti nel file .env: ${mancanti.join(', ')}\n`)
    process.exit(1)
  }
  if (PRODUZIONE && (process.env.SEED_PASSWORD || process.env.SEED_EMAIL_DOMAIN)) {
    console.error('\nIn produzione il file .env non deve contenere SEED_PASSWORD né SEED_EMAIL_DOMAIN.\n')
    process.exit(1)
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('Chiavi VAPID assenti: le notifiche push non partiranno. Il centro notifiche funziona lo stesso.')
  }
}

controllaAmbiente()

const port = Number(process.env.PORT ?? 8787)
const server = serve({ fetch: app.fetch, port }, () => console.log(`Turni in ascolto su http://localhost:${port}`))

// Un indirizzo occupato è la causa più comune di avvio fallito: dillo, non
// rovesciare uno stack trace addosso a chi legge.
server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(
      `\nLa porta ${port} è già occupata.\n` +
      `  Chi la occupa:  lsof -ti :${port}\n` +
      `  Liberarla:      lsof -ti :${port} | xargs kill\n` +
      `  Oppure usa un'altra porta:  PORT=8788 npm start\n`,
    )
    process.exit(1)
  }
  throw e
})

// Chiusura ordinata: rilascia la porta invece di lasciarla occupata.
for (const segnale of ['SIGINT', 'SIGTERM'] as const) {
  process.on(segnale, () => { server.close(() => process.exit(0)) })
}
