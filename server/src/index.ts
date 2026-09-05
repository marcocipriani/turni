import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import { caricaAlbero, caricaAttore, type Env, HttpError } from './context'
import { absences } from './routes/absences'
import { auth, utenteDaToken } from './routes/auth'
import { admin } from './routes/admin'
import { notifications } from './routes/notifications'
import { org } from './routes/org'
import { periods } from './routes/periods'

const COOKIE = process.env.SESSION_COOKIE ?? 'turni_session'
const app = new Hono<Env>()

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

// Il frontend compilato viene servito dallo stesso processo: un solo slot
// applicativo da configurare sull'hosting. In alternativa i file di web/dist
// possono essere copiati in public_html e serviti dal server web.
const RADICE_WEB = process.env.WEB_DIST ?? '../web/dist'
app.use('/assets/*', serveStatic({ root: RADICE_WEB }))
app.use('/sw.js', serveStatic({ root: RADICE_WEB }))
app.use('/manifest.webmanifest', serveStatic({ root: RADICE_WEB }))

// Le rotte del client sono gestite da React: tutto ciò che non è API torna l'indice.
app.get('*', serveStatic({ root: RADICE_WEB, rewriteRequestPath: () => '/index.html' }))

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`API su http://localhost:${port}`))
