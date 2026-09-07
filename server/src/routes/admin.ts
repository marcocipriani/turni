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

/**
 * L'organigramma ha bisogno, oltre alla gerarchia, di chi comanda ogni unità e
 * di quanta gente ci lavora. Due letture intere di tabelle piccole: l'albero si
 * disegna tutto insieme, e nessuna schermata fa una domanda per nodo.
 */
admin.get('/unita', async (c) => {
  const righe = await db.select().from(schema.unit).orderBy(asc(schema.unit.id))
  const persone = await db.select({
    id: schema.user.id, nome: schema.user.nome, cognome: schema.user.cognome,
    ruolo: schema.user.ruolo, unitId: schema.user.unitId,
  }).from(schema.user).where(eq(schema.user.attivo, true))

  const quante = new Map<number, number>()
  const capi = new Map<number, { nome: string; cognome: string }>()
  for (const p of persone) {
    if (p.unitId == null || p.ruolo === 'admin') continue
    quante.set(p.unitId, (quante.get(p.unitId) ?? 0) + 1)
    if (p.ruolo === 'dirigente') capi.set(p.unitId, { nome: p.nome, cognome: p.cognome })
  }
  return c.json(righe.map((u) => ({
    ...u, persone: quante.get(u.id) ?? 0, dirigente: capi.get(u.id) ?? null,
  })))
})

const esiste = async (id: number) =>
  (await db.select({ id: schema.unit.id }).from(schema.unit).where(eq(schema.unit.id, id)).limit(1)).length > 0

/** Unità e dirigente nascono insieme: un'unità senza chi la comanda non esiste. */
admin.post('/unita', async (c) => {
  const b = z.object({
    nome: z.string().min(2),
    sigla: z.string().max(32).optional(),
    parentId: z.number().int().nullable().optional(),
    dirigente: z.object({
      nome: z.string().min(1), cognome: z.string().min(1), email: z.string().email(),
    }),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati incompleti: servono nome dell\'unità e dati del dirigente')

  const a = c.get('attore')
  const parentId = b.data.parentId ?? null
  if (parentId != null && !(await esiste(parentId))) throw new HttpError(404, 'Unità superiore non trovata')
  const password = randomBytes(9).toString('base64url')
  const hash = await hashPassword(password)

  const [ins] = await db.insert(schema.unit).values({ nome: b.data.nome, sigla: b.data.sigla ?? null, parentId })
  const unitId = ins.insertId
  await db.insert(schema.user).values({
    email: b.data.dirigente.email.toLowerCase(), passwordHash: hash,
    nome: b.data.dirigente.nome, cognome: b.data.dirigente.cognome,
    ruolo: 'dirigente', unitId, passwordDaCambiare: true,
  })
  await traccia({ entita: 'unit', entitaId: unitId, azione: parentId == null ? 'crea_radice' : 'crea_figlia', utente: a.id, dopo: b.data })
  return c.json({ unitId, passwordProvvisoria: password }, 201)
})

/** L'unità e tutte le sue discendenti: nessuna può finire sotto una di queste. */
async function conDiscendenti(id: number): Promise<Set<number>> {
  const righe = await db.select({ id: schema.unit.id, parentId: schema.unit.parentId }).from(schema.unit)
  const figlie = new Map<number, number[]>()
  for (const r of righe) if (r.parentId != null) figlie.set(r.parentId, [...(figlie.get(r.parentId) ?? []), r.id])
  const dentro = new Set([id])
  const coda = [id]
  while (coda.length) {
    for (const f of figlie.get(coda.pop()!) ?? []) { dentro.add(f); coda.push(f) }
  }
  return dentro
}

/** Rinomina o sposta un'unità nell'organigramma. */
admin.patch('/unita/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const b = z.object({
    nome: z.string().min(2).optional(),
    sigla: z.string().max(32).nullable().optional(),
    parentId: z.number().int().nullable().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati dell\'unità non validi')
  if (!(await esiste(id))) throw new HttpError(404, 'Unità non trovata')

  const campi: Record<string, unknown> = {}
  if (b.data.nome !== undefined) campi.nome = b.data.nome
  if (b.data.sigla !== undefined) campi.sigla = b.data.sigla || null
  if (b.data.parentId !== undefined) {
    const p = b.data.parentId
    if (p != null) {
      if (!(await esiste(p))) throw new HttpError(404, 'Unità superiore non trovata')
      if ((await conDiscendenti(id)).has(p)) {
        throw new HttpError(409, 'Un\'unità non può finire sotto sé stessa o sotto una propria discendente')
      }
    }
    campi.parentId = p
  }
  if (Object.keys(campi).length === 0) throw new HttpError(422, 'Niente da modificare')

  await db.update(schema.unit).set(campi).where(eq(schema.unit.id, id))
  await traccia({ entita: 'unit', entitaId: id, azione: 'modifica', utente: c.get('attore').id, dopo: campi })
  return c.json({ ok: true })
})

/**
 * Si cancella solo un'unità che non contiene niente: figlie, persone, settori,
 * stanze o programmazioni. Svuotarla è una decisione, non un effetto collaterale.
 */
admin.delete('/unita/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!(await esiste(id))) throw new HttpError(404, 'Unità non trovata')

  const legami: [string, string, number][] = [
    ['unità figlia', 'unità figlie', (await db.select({ id: schema.unit.id }).from(schema.unit).where(eq(schema.unit.parentId, id))).length],
    ['persona', 'persone', (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.unitId, id))).length],
    ['settore', 'settori', (await db.select({ id: schema.sector.id }).from(schema.sector).where(eq(schema.sector.unitId, id))).length],
    ['stanza', 'stanze', (await db.select({ id: schema.room.id }).from(schema.room).where(eq(schema.room.unitId, id))).length],
    ['programmazione', 'programmazioni', (await db.select({ id: schema.period.id }).from(schema.period).where(eq(schema.period.unitId, id))).length],
  ]
  const pieni = legami.filter(([, , n]) => n > 0).map(([uno, molti, n]) => `${n} ${n === 1 ? uno : molti}`)
  if (pieni.length) throw new HttpError(409, `L'unità contiene ancora ${pieni.join(', ')}. Sposta o rimuovi prima quelli.`)

  await db.delete(schema.unit).where(eq(schema.unit.id, id))
  await traccia({ entita: 'unit', entitaId: id, azione: 'elimina', utente: c.get('attore').id })
  return c.json({ ok: true })
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

/** Correzione dell'anagrafica: nome, posta, unità. Il ruolo non si tocca da qui. */
admin.patch('/utenti/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const b = z.object({
    nome: z.string().min(1).optional(), cognome: z.string().min(1).optional(),
    email: z.string().email().optional(), unitId: z.number().int().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati utente non validi')

  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id)).limit(1)
  if (!u) throw new HttpError(404, 'Utente non trovato')

  const campi: Record<string, unknown> = {}
  if (b.data.nome !== undefined) campi.nome = b.data.nome
  if (b.data.cognome !== undefined) campi.cognome = b.data.cognome
  if (b.data.email !== undefined) campi.email = b.data.email.toLowerCase()
  if (b.data.unitId !== undefined) {
    if (!(await esiste(b.data.unitId))) throw new HttpError(404, 'Unità non trovata')
    campi.unitId = b.data.unitId
  }
  if (Object.keys(campi).length === 0) throw new HttpError(422, 'Niente da modificare')

  // Gli indici unici del database sono l'ultima parola: posta irripetibile e
  // un solo dirigente per unità. Qui si traduce il loro rifiuto in italiano.
  try {
    await db.update(schema.user).set(campi).where(eq(schema.user.id, id))
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ER_DUP_ENTRY') {
      const perDirigente = String(e.message).includes('uk_dirigente_unit')
      throw new HttpError(409, perDirigente
        ? 'Quell\'unità ha già un dirigente.'
        : 'Quell\'indirizzo di posta è già di un\'altra persona.')
    }
    throw e
  }
  await traccia({ entita: 'user', entitaId: id, azione: 'modifica', utente: c.get('attore').id, dopo: campi })
  return c.json({ ok: true })
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

/** Il codice serve al programma, non all'utente: se non arriva, si ricava. */
const codiceDa = (etichetta: string) =>
  etichetta.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

admin.post('/causali', async (c) => {
  const b = z.object({
    codice: z.string().min(2).optional(), etichetta: z.string().min(2).max(120),
    ordine: z.number().int().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Causale non valida')
  const codice = b.data.codice ?? codiceDa(b.data.etichetta)
  if (codice.length < 2) throw new HttpError(422, 'Etichetta troppo povera per ricavarne un codice')
  try {
    const [ins] = await db.insert(schema.absenceReason)
      .values({ codice, etichetta: b.data.etichetta, ordine: b.data.ordine ?? 100 })
    await traccia({ entita: 'causale', entitaId: ins.insertId, azione: 'crea', utente: c.get('attore').id, dopo: { codice } })
    return c.json({ id: ins.insertId }, 201)
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Esiste già una causale con questo nome.')
    }
    throw e
  }
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
