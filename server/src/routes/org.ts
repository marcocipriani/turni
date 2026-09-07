import { and, asc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Env, HttpError, nonTrovato, vietato } from '../context'
import { db, schema } from '../db/index'
import { traccia } from '../lib/audit'
import { avvisa } from '../lib/notify'
import {
  type Albero, puoAmministrareUnita, puoLeggereUnita, radice, sottoalbero, unitaDiProgrammazione,
} from '../permissions'

export const org = new Hono<Env>()

export type PersonaUnita = {
  id: number; nome: string; cognome: string; ruolo: 'dirigente' | 'dipendente'
  unitId: number; sectorId: number | null; comeDirigenteDi: number | null
}

/**
 * Chi compare nella griglia di un'unità: i propri dipendenti diretti più i
 * dirigenti delle unità figlie, che vi siedono al posto dell'intera unità che
 * comandano. Il dirigente di una radice è programmato nella propria unità.
 */
export async function personeDellUnita(albero: Albero, unitId: number): Promise<PersonaUnita[]> {
  const figlie = [...albero.entries()].filter(([, p]) => p === unitId).map(([id]) => id)
  const candidate = [unitId, ...figlie]
  const utenti = await db.select().from(schema.user).where(
    and(inArray(schema.user.unitId, candidate), eq(schema.user.attivo, true)),
  )
  return utenti
    .filter((u) => u.ruolo !== 'admin' && u.unitId != null)
    .filter((u) => unitaDiProgrammazione(albero, u.ruolo, u.unitId) === unitId)
    .map((u) => ({
      id: u.id, nome: u.nome, cognome: u.cognome,
      ruolo: u.ruolo as 'dirigente' | 'dipendente',
      unitId: u.unitId!, sectorId: u.sectorId,
      comeDirigenteDi: u.ruolo === 'dirigente' ? u.unitId! : null,
    }))
    .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.id - b.id)
}

/* ── Unità ──────────────────────────────────────────────────────── */

org.get('/unita/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoLeggereUnita(alb, a, id)) throw vietato()
  const [u] = await db.select().from(schema.unit).where(eq(schema.unit.id, id)).limit(1)
  if (!u) throw nonTrovato('Unità non trovata')
  const figlie = await db.select().from(schema.unit).where(eq(schema.unit.parentId, id))
  const [dir] = await db.select({ id: schema.user.id, nome: schema.user.nome, cognome: schema.user.cognome })
    .from(schema.user).where(and(eq(schema.user.unitId, id), eq(schema.user.ruolo, 'dirigente'))).limit(1)
  return c.json({ ...u, figlie, dirigente: dir ?? null, radiceId: radice(alb, id) })
})

/** L'albero visibile all'utente: il proprio sottoalbero, o la sola unità di programmazione. */
org.get('/albero', async (c) => {
  const a = c.get('attore'), alb = c.get('albero')
  const tutte = await db.select().from(schema.unit).orderBy(asc(schema.unit.nome))
  if (a.ruolo === 'admin') return c.json(tutte)
  const visibili = a.ruolo === 'dirigente' && a.unitId != null
    ? sottoalbero(alb, a.unitId)
    : new Set([unitaDiProgrammazione(alb, a.ruolo, a.unitId)].filter((n): n is number => n != null))
  return c.json(tutte.filter((u) => visibili.has(u.id)))
})

org.post('/unita', async (c) => {
  const b = z.object({
    parentId: z.number().int(), nome: z.string().min(2), sigla: z.string().max(32).optional(),
    dirigenteUserId: z.number().int(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati incompleti per la nuova unità')

  const a = c.get('attore')
  if (!puoAmministrareUnita(a, b.data.parentId)) throw vietato('Solo il dirigente crea unità figlie')

  const [dir] = await db.select().from(schema.user).where(eq(schema.user.id, b.data.dirigenteUserId)).limit(1)
  if (!dir) throw nonTrovato('Dirigente designato non trovato')

  const [ins] = await db.insert(schema.unit).values({
    parentId: b.data.parentId, nome: b.data.nome, sigla: b.data.sigla ?? null,
  })
  // Il ruolo è proprietà stabile della persona: chi comanda un'unità è dirigente.
  await db.update(schema.user).set({ ruolo: 'dirigente', unitId: ins.insertId, sectorId: null })
    .where(eq(schema.user.id, b.data.dirigenteUserId))
  await traccia({ entita: 'unit', entitaId: ins.insertId, azione: 'crea_figlia', utente: a.id, dopo: b.data })
  return c.json({ id: ins.insertId }, 201)
})

org.patch('/unita/:id/limiti', async (c) => {
  const id = Number(c.req.param('id'))
  if (!puoAmministrareUnita(c.get('attore'), id)) throw vietato()
  const b = z.object({
    smartMinSettimana: z.number().int().min(0).max(7).nullable(),
    smartMaxSettimana: z.number().int().min(0).max(7).nullable(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Limiti non validi')
  const { smartMinSettimana: min, smartMaxSettimana: max } = b.data
  if (min != null && max != null && min > max) throw new HttpError(422, 'Il minimo non può superare il massimo')
  await db.update(schema.unit).set(b.data).where(eq(schema.unit.id, id))
  await traccia({ entita: 'unit', entitaId: id, azione: 'limiti_agile', utente: c.get('attore').id, dopo: b.data })
  return c.json({ ok: true })
})

/** Interruttore e ora limite dello scambio: scelta dell'unità, non del sistema. */
org.patch('/unita/:id/scambio', async (c) => {
  const id = Number(c.req.param('id'))
  if (!puoAmministrareUnita(c.get('attore'), id)) throw vietato()
  const b = z.object({
    scambioAttivo: z.boolean(),
    scambioOraLimite: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ora non valida'),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Impostazioni dello scambio non valide')
  await db.update(schema.unit).set(b.data).where(eq(schema.unit.id, id))
  await traccia({ entita: 'unit', entitaId: id, azione: 'scambio', utente: c.get('attore').id, dopo: b.data })
  return c.json({ ok: true })
})

org.get('/unita/:id/persone', async (c) => {
  const id = Number(c.req.param('id'))
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoLeggereUnita(alb, a, id)) throw vietato()
  return c.json(await personeDellUnita(alb, id))
})

/* ── Settori ────────────────────────────────────────────────────── */

org.get('/unita/:id/settori', async (c) => {
  const id = Number(c.req.param('id'))
  if (!puoLeggereUnita(c.get('albero'), c.get('attore'), id)) throw vietato()
  return c.json(await db.select().from(schema.sector).where(eq(schema.sector.unitId, id)).orderBy(asc(schema.sector.ordine)))
})

org.post('/unita/:id/settori', async (c) => {
  const id = Number(c.req.param('id'))
  if (!puoAmministrareUnita(c.get('attore'), id)) throw vietato()
  const b = z.object({
    nome: z.string().min(2), richiedePresidio: z.boolean().default(false), ordine: z.number().int().default(0),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Settore non valido')
  const [ins] = await db.insert(schema.sector).values({ unitId: id, ...b.data })
  return c.json({ id: ins.insertId }, 201)
})

org.patch('/settori/:sid', async (c) => {
  const sid = Number(c.req.param('sid'))
  const [s] = await db.select().from(schema.sector).where(eq(schema.sector.id, sid)).limit(1)
  if (!s) throw nonTrovato('Settore non trovato')
  if (!puoAmministrareUnita(c.get('attore'), s.unitId)) throw vietato()
  const b = z.object({
    nome: z.string().min(2).optional(), richiedePresidio: z.boolean().optional(), ordine: z.number().int().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati non validi')
  await db.update(schema.sector).set(b.data).where(eq(schema.sector.id, sid))
  return c.json({ ok: true })
})

org.delete('/settori/:sid', async (c) => {
  const sid = Number(c.req.param('sid'))
  const [s] = await db.select().from(schema.sector).where(eq(schema.sector.id, sid)).limit(1)
  if (!s) throw nonTrovato('Settore non trovato')
  if (!puoAmministrareUnita(c.get('attore'), s.unitId)) throw vietato()
  await db.update(schema.user).set({ sectorId: null }).where(eq(schema.user.sectorId, sid))
  await db.delete(schema.sector).where(eq(schema.sector.id, sid))
  return c.json({ ok: true })
})

/** Assegna una persona a un settore, o la toglie passando `sectorId: null`. */
org.post('/unita/:id/assegna-settore', async (c) => {
  const id = Number(c.req.param('id'))
  if (!puoAmministrareUnita(c.get('attore'), id)) throw vietato()
  const b = z.object({ userId: z.number().int(), sectorId: z.number().int().nullable() })
    .safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati non validi')
  if (b.data.sectorId != null) {
    const [s] = await db.select().from(schema.sector).where(eq(schema.sector.id, b.data.sectorId)).limit(1)
    if (!s || s.unitId !== id) throw new HttpError(422, 'Il settore non appartiene a questa unità')
  }
  await db.update(schema.user).set({ sectorId: b.data.sectorId }).where(eq(schema.user.id, b.data.userId))
  return c.json({ ok: true })
})

/* ── Deleghe di organizzatore ───────────────────────────────────── */

org.get('/unita/:id/organizzatori', async (c) => {
  const id = Number(c.req.param('id'))
  if (!puoLeggereUnita(c.get('albero'), c.get('attore'), id)) throw vietato()
  const righe = await db.select({
    userId: schema.organizer.userId, nome: schema.user.nome, cognome: schema.user.cognome,
  }).from(schema.organizer).innerJoin(schema.user, eq(schema.user.id, schema.organizer.userId))
    .where(eq(schema.organizer.unitId, id))
  return c.json(righe)
})

org.post('/unita/:id/organizzatori', async (c) => {
  const id = Number(c.req.param('id'))
  const a = c.get('attore')
  if (!puoAmministrareUnita(a, id)) throw vietato('Solo il dirigente nomina gli organizzatori')
  const b = z.object({ userId: z.number().int() }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Utente non indicato')
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, b.data.userId)).limit(1)
  if (!u || u.unitId !== id || u.ruolo !== 'dipendente') {
    throw new HttpError(422, 'La delega spetta a un dipendente della stessa unità')
  }
  await db.insert(schema.organizer).values({ userId: b.data.userId, unitId: id, nominatoDa: a.id })
    .onDuplicateKeyUpdate({ set: { nominatoDa: a.id } })
  await traccia({ entita: 'organizer', entitaId: `${b.data.userId}:${id}`, azione: 'nomina', utente: a.id })
  await avvisa([b.data.userId], {
    tipo: 'delega_organizzatore', titolo: 'Sei stato nominato organizzatore',
    corpo: 'Puoi costruire la programmazione della tua unità e inviarla in approvazione.', link: '/programmazione',
  })
  return c.json({ ok: true }, 201)
})

org.delete('/unita/:id/organizzatori/:userId', async (c) => {
  const id = Number(c.req.param('id')), userId = Number(c.req.param('userId'))
  const a = c.get('attore')
  if (!puoAmministrareUnita(a, id)) throw vietato()
  await db.delete(schema.organizer)
    .where(and(eq(schema.organizer.unitId, id), eq(schema.organizer.userId, userId)))
  await traccia({ entita: 'organizer', entitaId: `${userId}:${id}`, azione: 'revoca', utente: a.id })
  await avvisa([userId], {
    tipo: 'delega_revocata', titolo: 'Delega revocata',
    corpo: 'Non sei più organizzatore della tua unità.',
  })
  return c.json({ ok: true })
})

/* ── Stanze e scrivanie ─────────────────────────────────────────── */

org.get('/unita/:id/stanze', async (c) => {
  const id = Number(c.req.param('id'))
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoLeggereUnita(alb, a, id)) throw vietato()
  const stanze = await db.select().from(schema.room).where(eq(schema.room.unitId, id))
  const scrivanie = stanze.length
    ? await db.select().from(schema.desk).where(inArray(schema.desk.roomId, stanze.map((s) => s.id)))
    : []
  return c.json(stanze.map((s) => ({
    ...s,
    scrivanie: scrivanie.filter((d) => d.roomId === s.id).sort((x, y) => x.numero.localeCompare(y.numero, 'it')),
    capienza: scrivanie.filter((d) => d.roomId === s.id && d.attiva).length,
  })))
})

/** Ogni unità ha le proprie stanze, e le gestisce il suo dirigente. */
org.post('/stanze', async (c) => {
  const b = z.object({
    unitId: z.number().int(), etichetta: z.string().min(1), piano: z.string().optional(),
    scrivanie: z.number().int().min(1).max(200),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati della stanza non validi')

  const a = c.get('attore')
  if (!puoAmministrareUnita(a, b.data.unitId)) {
    throw vietato('Le stanze le gestisce il dirigente dell\'unità')
  }
  const [ins] = await db.insert(schema.room).values({
    unitId: b.data.unitId, etichetta: b.data.etichetta, piano: b.data.piano ?? null,
  })
  // Nascono numerate e disposte in fila: la planimetria arriverà a spostarle.
  await db.insert(schema.desk).values(
    Array.from({ length: b.data.scrivanie }, (_, i) => ({
      roomId: ins.insertId, numero: String(i + 1), x: 40 + i * 120, y: 60,
    })),
  )
  return c.json({ id: ins.insertId }, 201)
})

org.post('/stanze/:rid/scrivanie', async (c) => {
  const rid = Number(c.req.param('rid'))
  const [r] = await db.select().from(schema.room).where(eq(schema.room.id, rid)).limit(1)
  if (!r) throw nonTrovato('Stanza non trovata')
  const a = c.get('attore')
  if (a.ruolo !== 'dirigente' || a.unitId !== r.unitId) throw vietato()
  const b = z.object({ numero: z.string().min(1), x: z.number().int().optional(), y: z.number().int().optional() })
    .safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Scrivania non valida')
  const [ins] = await db.insert(schema.desk).values({ roomId: rid, ...b.data })
  return c.json({ id: ins.insertId }, 201)
})

org.patch('/scrivanie/:did', async (c) => {
  const did = Number(c.req.param('did'))
  const [d] = await db.select().from(schema.desk).where(eq(schema.desk.id, did)).limit(1)
  if (!d) throw nonTrovato('Scrivania non trovata')
  const [r] = await db.select().from(schema.room).where(eq(schema.room.id, d.roomId)).limit(1)
  const a = c.get('attore')
  if (!r || a.ruolo !== 'dirigente' || a.unitId !== r.unitId) throw vietato()
  const b = z.object({
    numero: z.string().min(1).optional(), x: z.number().int().optional(), y: z.number().int().optional(),
    rotazione: z.number().int().optional(), attiva: z.boolean().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati non validi')
  await db.update(schema.desk).set(b.data).where(eq(schema.desk.id, did))
  return c.json({ ok: true })
})

/* ── Trasferimenti ──────────────────────────────────────────────── */

/**
 * Il cambio di unità non tocca le programmazioni pubblicate: restano com'erano.
 * Avvisa chi programma nella nuova unità, che deve tenerne conto.
 */
org.post('/trasferisci', async (c) => {
  const b = z.object({ userId: z.number().int(), unitId: z.number().int() }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati non validi')
  const a = c.get('attore')
  if (!puoAmministrareUnita(a, b.data.unitId)) throw vietato('Solo il dirigente della nuova unità può accogliere')

  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, b.data.userId)).limit(1)
  if (!u) throw nonTrovato('Utente non trovato')
  const precedente = u.unitId
  await db.update(schema.user).set({ unitId: b.data.unitId, sectorId: null }).where(eq(schema.user.id, b.data.userId))
  await traccia({
    entita: 'user', entitaId: u.id, azione: 'trasferimento', utente: a.id,
    prima: { unitId: precedente }, dopo: { unitId: b.data.unitId },
  })

  const deleghe = await db.select({ userId: schema.organizer.userId })
    .from(schema.organizer).where(eq(schema.organizer.unitId, b.data.unitId))
  const [dir] = await db.select({ id: schema.user.id }).from(schema.user)
    .where(and(eq(schema.user.unitId, b.data.unitId), eq(schema.user.ruolo, 'dirigente'))).limit(1)
  await avvisa([...deleghe.map((d) => d.userId), ...(dir ? [dir.id] : [])], {
    tipo: 'persona_trasferita',
    titolo: `${u.nome} ${u.cognome} è ora nella tua unità`,
    corpo: 'Le programmazioni già pubblicate non sono state modificate: verifica i periodi futuri e riprogramma se serve.',
    link: '/programmazione',
  })
  return c.json({ ok: true })
})
