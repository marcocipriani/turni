import { randomBytes } from 'node:crypto'
import { asc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Env, HttpError, vietato } from '../context'
import { db, schema } from '../db/index'
import { traccia } from '../lib/audit'
import { italianHolidays } from '../lib/dates'
import { hashPassword } from '../lib/password'
import { avvisa } from '../lib/notify'

export const admin = new Hono<Env>()

// L'amministratore gestisce contenitori e credenziali, mai programmazioni.
admin.use('*', async (c, next) => {
  if (c.get('attore').ruolo !== 'admin') throw vietato('Riservato all\'amministratore di sistema')
  return next()
})

/* ── Unità radice ───────────────────────────────────────────────── */

admin.get('/unita', async (c) => {
  const righe = await db.select().from(schema.unit).orderBy(asc(schema.unit.id))
  return c.json(righe)
})

/** Unità e dirigente nascono insieme: un'unità senza chi la comanda non esiste. */
admin.post('/unita', async (c) => {
  const b = z.object({
    nome: z.string().min(2),
    sigla: z.string().max(32).optional(),
    dirigente: z.object({
      nome: z.string().min(1), cognome: z.string().min(1), email: z.string().email(),
    }),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati incompleti: servono nome dell\'unità e dati del dirigente')

  const a = c.get('attore')
  const password = randomBytes(9).toString('base64url')
  const hash = await hashPassword(password)

  const [ins] = await db.insert(schema.unit).values({ nome: b.data.nome, sigla: b.data.sigla ?? null })
  const unitId = ins.insertId
  await db.insert(schema.user).values({
    email: b.data.dirigente.email.toLowerCase(), passwordHash: hash,
    nome: b.data.dirigente.nome, cognome: b.data.dirigente.cognome,
    ruolo: 'dirigente', unitId, passwordDaCambiare: true,
  })
  await traccia({ entita: 'unit', entitaId: unitId, azione: 'crea_radice', utente: a.id, dopo: b.data })
  return c.json({ unitId, passwordProvvisoria: password }, 201)
})

/* ── Utenti ─────────────────────────────────────────────────────── */

admin.get('/utenti', async (c) => {
  const righe = await db.select({
    id: schema.user.id, email: schema.user.email, nome: schema.user.nome,
    cognome: schema.user.cognome, ruolo: schema.user.ruolo, unitId: schema.user.unitId,
    attivo: schema.user.attivo,
  }).from(schema.user).orderBy(asc(schema.user.cognome))
  return c.json(righe)
})

admin.post('/utenti', async (c) => {
  const b = z.object({
    nome: z.string().min(1), cognome: z.string().min(1), email: z.string().email(),
    ruolo: z.enum(['dirigente', 'dipendente']), unitId: z.number().int(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati utente incompleti')

  const password = randomBytes(9).toString('base64url')
  const [ins] = await db.insert(schema.user).values({
    email: b.data.email.toLowerCase(), passwordHash: await hashPassword(password),
    nome: b.data.nome, cognome: b.data.cognome, ruolo: b.data.ruolo,
    unitId: b.data.unitId, passwordDaCambiare: true,
  })
  await traccia({ entita: 'user', entitaId: ins.insertId, azione: 'censimento', utente: c.get('attore').id })
  return c.json({ id: ins.insertId, passwordProvvisoria: password }, 201)
})

admin.post('/utenti/:id/reset-password', async (c) => {
  const id = Number(c.req.param('id'))
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id)).limit(1)
  if (!u) throw new HttpError(404, 'Utente non trovato')

  const password = randomBytes(9).toString('base64url')
  await db.update(schema.user)
    .set({ passwordHash: await hashPassword(password), passwordDaCambiare: true })
    .where(eq(schema.user.id, id))
  // Reimpostare la password chiude ogni sessione aperta dell'interessato.
  await db.delete(schema.session).where(eq(schema.session.userId, id))
  await traccia({ entita: 'user', entitaId: id, azione: 'reset_password', utente: c.get('attore').id })
  await avvisa([id], {
    tipo: 'password_reimpostata',
    titolo: 'Password reimpostata',
    corpo: 'Un amministratore ha reimpostato la tua password. Dovrai cambiarla al prossimo accesso.',
  })
  return c.json({ passwordProvvisoria: password })
})

admin.post('/utenti/:id/attivo', async (c) => {
  const id = Number(c.req.param('id'))
  const b = z.object({ attivo: z.boolean() }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Valore non valido')
  await db.update(schema.user).set({ attivo: b.data.attivo }).where(eq(schema.user.id, id))
  if (!b.data.attivo) await db.delete(schema.session).where(eq(schema.session.userId, id))
  await traccia({ entita: 'user', entitaId: id, azione: b.data.attivo ? 'riattiva' : 'disattiva', utente: c.get('attore').id })
  return c.json({ ok: true })
})

/* ── Cataloghi ──────────────────────────────────────────────────── */

admin.get('/causali', async (c) =>
  c.json(await db.select().from(schema.absenceReason).orderBy(asc(schema.absenceReason.ordine))))

admin.post('/causali', async (c) => {
  const b = z.object({ codice: z.string().min(2), etichetta: z.string().min(2), ordine: z.number().int().optional() })
    .safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Causale non valida')
  const [ins] = await db.insert(schema.absenceReason)
    .values({ codice: b.data.codice, etichetta: b.data.etichetta, ordine: b.data.ordine ?? 100 })
  return c.json({ id: ins.insertId }, 201)
})

admin.patch('/causali/:id', async (c) => {
  const b = z.object({ etichetta: z.string().min(2).optional(), attiva: z.boolean().optional() })
    .safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati non validi')
  await db.update(schema.absenceReason).set(b.data).where(eq(schema.absenceReason.id, Number(c.req.param('id'))))
  return c.json({ ok: true })
})

admin.get('/festivita', async (c) =>
  c.json(await db.select().from(schema.holiday).orderBy(asc(schema.holiday.data))))

admin.post('/festivita', async (c) => {
  const b = z.object({
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), descrizione: z.string().min(2),
    unitId: z.number().int().nullable().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Festività non valida')
  const [ins] = await db.insert(schema.holiday)
    .values({ data: b.data.data, descrizione: b.data.descrizione, unitId: b.data.unitId ?? null })
  return c.json({ id: ins.insertId }, 201)
})

admin.delete('/festivita/:id', async (c) => {
  await db.delete(schema.holiday).where(eq(schema.holiday.id, Number(c.req.param('id'))))
  return c.json({ ok: true })
})

/** Precarica le festività nazionali di un anno, saltando quelle già presenti. */
admin.post('/festivita/nazionali/:anno', async (c) => {
  const anno = Number(c.req.param('anno'))
  if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) throw new HttpError(422, 'Anno non valido')
  const esistenti = new Set(
    (await db.select({ data: schema.holiday.data }).from(schema.holiday).where(isNull(schema.holiday.unitId)))
      .map((h) => h.data),
  )
  const nuove = italianHolidays(anno).filter((h) => !esistenti.has(h.data))
  if (nuove.length) await db.insert(schema.holiday).values(nuove.map((h) => ({ ...h, unitId: null })))
  return c.json({ aggiunte: nuove.length })
})
