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
import { notifications } from './routes/notifications'
import { org } from './routes/org'
import { overview } from './routes/overview'
import { periods } from './routes/periods'

const COOKIE = process.env.SESSION_COOKIE ?? 'turni_session'
const app = new Hono<Env>()

app.use('*', compress())
app.use('*', cors({
  origin: (o) => o ?? '*',
  credentials: true,
}))

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
