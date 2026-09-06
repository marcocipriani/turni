import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { caricaAttore, type Env, HttpError } from '../context'
import { db, schema } from '../db/index'
import { traccia } from '../lib/audit'
import { attesaResidua, tentativoFallito, tentativoRiuscito } from '../lib/limite'
import { hashPassword, verifyPassword } from '../lib/password'

const COOKIE = process.env.SESSION_COOKIE ?? 'turni_session'
const DURATA_GIORNI = 14

const impronta = (token: string) => createHash('sha256').update(token).digest('hex')

export async function creaSessione(userId: number, userAgent: string | undefined) {
  const token = randomBytes(32).toString('base64url')
  const scadeIl = new Date(Date.now() + DURATA_GIORNI * 86_400_000)
  await db.insert(schema.session).values({
    id: impronta(token),
    userId,
    scadeIl,
    userAgent: userAgent?.slice(0, 300) ?? null,
  })
  return { token, scadeIl }
}

export async function utenteDaToken(token: string): Promise<number | null> {
  const [s] = await db
    .select({ userId: schema.session.userId })
    .from(schema.session)
    .where(and(eq(schema.session.id, impronta(token)), gt(schema.session.scadeIl, new Date())))
    .limit(1)
  return s?.userId ?? null
}

export const auth = new Hono<Env>()

auth.post('/login', async (c) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(await c.req.json())
  if (!body.success) throw new HttpError(422, 'Email o password mancanti')

  const email = body.data.email.toLowerCase()
  const attesa = attesaResidua(email)
  if (attesa > 0) {
    const minuti = Math.ceil(attesa / 60)
    throw new HttpError(429, `Troppi tentativi. Riprova fra ${minuti} ${minuti === 1 ? 'minuto' : 'minuti'}.`)
  }

  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1)
  // Messaggio unico: non si rivela se l'indirizzo esista.
  const generico = new HttpError(401, 'Credenziali non valide')
  if (!u || !u.attivo) { tentativoFallito(email); throw generico }
  if (!(await verifyPassword(body.data.password, u.passwordHash))) { tentativoFallito(email); throw generico }
  tentativoRiuscito(email)

  // Occasione buona per togliere di mezzo le sessioni scadute: succede a ogni
  // accesso, costa una cancellazione su indice, e nessun processo deve restare
  // vivo a fare pulizia su un hosting condiviso.
  await db.delete(schema.session).where(lt(schema.session.scadeIl, new Date()))

  const { token, scadeIl } = await creaSessione(u.id, c.req.header('user-agent'))
  setCookie(c, COOKIE, token, {
    httpOnly: true, sameSite: 'Lax', path: '/', expires: scadeIl,
    secure: process.env.NODE_ENV === 'production',
  })
  return c.json({ ok: true, passwordDaCambiare: u.passwordDaCambiare })
})

auth.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE)
  if (token) await db.delete(schema.session).where(eq(schema.session.id, impronta(token)))
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

auth.get('/me', async (c) => {
  const a = c.get('attore')
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, a.id)).limit(1)
  if (!u) throw new HttpError(404, 'Utente non trovato')
  const unita = u.unitId ? await db.select().from(schema.unit).where(eq(schema.unit.id, u.unitId)).limit(1) : []
  return c.json({
    id: u.id, email: u.email, nome: u.nome, cognome: u.cognome, ruolo: u.ruolo,
    unitId: u.unitId, sectorId: u.sectorId, passwordDaCambiare: u.passwordDaCambiare,
    unitNome: unita[0]?.nome ?? null,
    organizzatoreDi: a.organizzatoreDi,
  })
})

auth.post('/password', async (c) => {
  const a = c.get('attore')
  const body = z.object({ attuale: z.string().min(1), nuova: z.string().min(8) }).safeParse(await c.req.json())
  if (!body.success) throw new HttpError(422, 'La nuova password deve avere almeno 8 caratteri')

  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, a.id)).limit(1)
  if (!u || !(await verifyPassword(body.data.attuale, u.passwordHash))) {
    throw new HttpError(401, 'Password attuale non corretta')
  }
  await db.update(schema.user)
    .set({ passwordHash: await hashPassword(body.data.nuova), passwordDaCambiare: false })
    .where(eq(schema.user.id, a.id))
  // Cambiare password chiude ogni altra sessione aperta.
  await db.delete(schema.session).where(eq(schema.session.userId, a.id))
  await traccia({ entita: 'user', entitaId: a.id, azione: 'cambio_password', utente: a.id })
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})
