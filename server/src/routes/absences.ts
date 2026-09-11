import { and, asc, eq, gte, inArray, lte, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Env, HttpError, nonTrovato, vietato } from '../context'
import { db, schema } from '../db/index'
import { traccia } from '../lib/audit'
import { eachDay, type ISODate, weekday } from '../lib/dates'
import { avvisa } from '../lib/notify'
import { puoRegistrareAssenzaPer, unitaDiProgrammazione } from '../permissions'

export const absences = new Hono<Env>()

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida')

export type Indisponibilita = { causale: string; assenzaId: number | null; perConto: boolean }

/** Giornate coperte da assenze o regole: chiave `userId|data` → causale. */
export async function giorniIndisponibili(userIds: number[], da: ISODate, a: ISODate): Promise<Map<string, string>> {
  const d = await giorniIndisponibiliDettaglio(userIds, da, a)
  return new Map([...d].map(([k, v]) => [k, v.causale]))
}

/**
 * Come `giorniIndisponibili`, ma dice anche quale assenza copre la giornata e
 * se l'ha registrata chi programma: serve alla griglia, per il segno ⊗ e per
 * poterla togliere. Le regole ricorrenti sono sempre dell'interessato.
 */
export async function giorniIndisponibiliDettaglio(
  userIds: number[], da: ISODate, a: ISODate,
): Promise<Map<string, Indisponibilita>> {
  const out = new Map<string, Indisponibilita>()
  if (userIds.length === 0) return out

  const puntuali = await db.select().from(schema.absence).where(
    and(inArray(schema.absence.userId, userIds), lte(schema.absence.dataInizio, a), gte(schema.absence.dataFine, da)),
  )
  for (const ass of puntuali) {
    for (const g of eachDay(ass.dataInizio, ass.dataFine)) {
      if (g >= da && g <= a) {
        out.set(`${ass.userId}|${g}`, { causale: ass.causale, assenzaId: ass.id, perConto: ass.registrataDa != null })
      }
    }
  }

  const regole = await db.select().from(schema.absenceRule).where(
    and(
      inArray(schema.absenceRule.userId, userIds),
      lte(schema.absenceRule.validoDa, a),
      or(eq(schema.absenceRule.validoA, null as never), gte(schema.absenceRule.validoA, da)),
    ),
  )
  for (const r of regole) {
    for (const g of eachDay(da, a)) {
      if (weekday(g) !== r.giornoSettimana) continue
      if (g < r.validoDa) continue
      if (r.validoA && g > r.validoA) continue
      if (!out.has(`${r.userId}|${g}`)) out.set(`${r.userId}|${g}`, { causale: r.causale, assenzaId: null, perConto: false })
    }
  }
  return out
}

absences.get('/causali', async (c) =>
  c.json(await db.select().from(schema.absenceReason)
    .where(eq(schema.absenceReason.attiva, true)).orderBy(asc(schema.absenceReason.ordine))))

absences.get('/mie', async (c) => {
  const a = c.get('attore')
  const puntuali = await db.select().from(schema.absence)
    .where(eq(schema.absence.userId, a.id)).orderBy(asc(schema.absence.dataInizio))
  const regole = await db.select().from(schema.absenceRule).where(eq(schema.absenceRule.userId, a.id))
  return c.json({ assenze: puntuali, regole })
})

/**
 * L'assenza è dichiarabile in qualsiasi momento, anche su giornate già
 * pubblicate: il calendario non cambia da solo, ma chi programma viene avvisato.
 */
absences.post('/', async (c) => {
  const a = c.get('attore'), alb = c.get('albero')
  const b = z.object({
    dataInizio: ISO, dataFine: ISO, causale: z.string().min(2),
    // Per conto di un collega: solo chi programma la sua unità.
    userId: z.number().int().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Assenza non valida')
  if (b.data.dataFine < b.data.dataInizio) throw new HttpError(422, 'La data di fine precede quella di inizio')

  const [causale] = await db.select().from(schema.absenceReason)
    .where(and(eq(schema.absenceReason.codice, b.data.causale), eq(schema.absenceReason.attiva, true))).limit(1)
  if (!causale) throw new HttpError(422, 'Causale non ammessa')

  const perId = b.data.userId ?? a.id
  let registrataDa: number | null = null
  if (perId !== a.id) {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, perId)).limit(1)
    if (!u || !u.attivo) throw nonTrovato('Persona non trovata')
    if (!puoRegistrareAssenzaPer(alb, a, { id: u.id, ruolo: u.ruolo, unitId: u.unitId })) {
      throw vietato('Registri assenze solo per chi programmi')
    }
    registrataDa = a.id
  }

  const { userId: _, ...periodo } = b.data
  const [ins] = await db.insert(schema.absence).values({ userId: perId, ...periodo, registrataDa })
  if (registrataDa != null) await notificaPerConto(a.id, perId, 'registrata', periodo)
  await segnalaConflitti(perId, alb, b.data.dataInizio, b.data.dataFine)
  return c.json({ id: ins.insertId }, 201)
})

absences.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const a = c.get('attore')
  const [ass] = await db.select().from(schema.absence).where(eq(schema.absence.id, id)).limit(1)
  if (!ass) throw nonTrovato('Assenza non trovata')
  if (ass.userId !== a.id) {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, ass.userId)).limit(1)
    // Chi programma toglie solo quelle che ha messo l'organizzazione: una
    // dichiarata dall'interessato resta sua.
    const ammesso = ass.registrataDa != null && u != null
      && puoRegistrareAssenzaPer(c.get('albero'), a, { id: u.id, ruolo: u.ruolo, unitId: u.unitId })
    if (!ammesso) throw vietato('Si possono revocare solo le proprie assenze')
  }
  await db.delete(schema.absence).where(eq(schema.absence.id, id))
  if (ass.userId !== a.id) await notificaPerConto(a.id, ass.userId, 'tolta', ass)
  return c.json({ ok: true })
})

absences.post('/regole', async (c) => {
  const a = c.get('attore')
  const b = z.object({
    giornoSettimana: z.number().int().min(1).max(5), causale: z.string().min(2),
    validoDa: ISO, validoA: ISO.nullable().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Regola non valida')
  const [ins] = await db.insert(schema.absenceRule).values({
    userId: a.id, giornoSettimana: b.data.giornoSettimana, causale: b.data.causale,
    validoDa: b.data.validoDa, validoA: b.data.validoA ?? null,
  })
  return c.json({ id: ins.insertId }, 201)
})

absences.delete('/regole/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const a = c.get('attore')
  const [r] = await db.select().from(schema.absenceRule).where(eq(schema.absenceRule.id, id)).limit(1)
  if (!r) throw nonTrovato('Regola non trovata')
  if (r.userId !== a.id) throw vietato()
  await db.delete(schema.absenceRule).where(eq(schema.absenceRule.id, id))
  return c.json({ ok: true })
})

absences.get('/preferenze', async (c) => {
  const a = c.get('attore')
  const [p] = await db.select().from(schema.userPreference).where(eq(schema.userPreference.userId, a.id)).limit(1)
  // Le colonne nate dopo la riga valgono null: si rimandano coi valori di partenza.
  return c.json({
    userId: a.id, nota: null, promemoriaSera: false, vistaTurni: 'giorni', ...p,
    giorniPreferiti: p?.giorniPreferiti ?? [], giorniDaEvitare: p?.giorniDaEvitare ?? [],
    filtriMio: p?.filtriMio?.length ? p.filtriMio : ['presenza'],
  })
})

absences.put('/preferenze', async (c) => {
  const a = c.get('attore')
  // Il modulo rimanda indietro la riga com'è in archivio, e lì un elenco mai
  // compilato vale null: null e assente sono la stessa cosa, un elenco vuoto.
  const giorni = z.array(z.number().int().min(1).max(5)).max(5).nullish().transform((v) => v ?? [])
  const b = z.object({
    giorniPreferiti: giorni, giorniDaEvitare: giorni,
    nota: z.string().max(500).nullable().default(null),
    promemoriaSera: z.boolean().default(false),
    vistaTurni: z.enum(['giorni', 'griglia']).default('giorni'),
    filtriMio: z.array(z.enum(['presenza', 'smart', 'assenza'])).min(1).max(3).nullish()
      .transform((v) => v ?? ['presenza' as const]),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Preferenze non valide')
  await db.insert(schema.userPreference).values({ userId: a.id, ...b.data })
    .onDuplicateKeyUpdate({ set: b.data })
  return c.json({ ok: true })
})

/** Avvisa chi programma se l'assenza cade su presenze già pubblicate. */
async function segnalaConflitti(userId: number, alb: Map<number, number | null>, da: ISODate, a: ISODate) {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1)
  if (!u || u.unitId == null) return
  const unitId = unitaDiProgrammazione(alb, u.ruolo, u.unitId)
  if (unitId == null) return

  const periodi = await db.select().from(schema.period).where(
    and(eq(schema.period.unitId, unitId), eq(schema.period.stato, 'pubblicato')),
  )
  const interessati = periodi.filter((p) => p.dataInizio <= a && p.dataFine >= da)
  if (interessati.length === 0) return

  const presenze = await db.select().from(schema.assignment).where(
    and(
      inArray(schema.assignment.periodId, interessati.map((p) => p.id)),
      eq(schema.assignment.userId, userId),
      eq(schema.assignment.stato, 'presenza'),
      gte(schema.assignment.data, da),
      lte(schema.assignment.data, a),
    ),
  )
  if (presenze.length === 0) return

  const deleghe = await db.select({ userId: schema.organizer.userId })
    .from(schema.organizer).where(eq(schema.organizer.unitId, unitId))
  const [dir] = await db.select({ id: schema.user.id }).from(schema.user)
    .where(and(eq(schema.user.unitId, unitId), eq(schema.user.ruolo, 'dirigente'))).limit(1)

  const date = presenze.map((p) => p.data).sort().join(', ')
  await avvisa([...deleghe.map((d) => d.userId), ...(dir ? [dir.id] : [])], {
    tipo: 'assenza_su_giornata_programmata',
    titolo: `Assenza su giornate già programmate: ${u.nome} ${u.cognome}`,
    corpo: `Presenze interessate: ${date}. Il calendario pubblicato non è stato modificato.`,
    link: '/programmazione',
  })
}

/** Traccia e avvisa l'interessato: un'assenza a proprio nome non arriva mai di nascosto. */
async function notificaPerConto(autoreId: number, interessatoId: number, cosa: 'registrata' | 'tolta',
                                p: { dataInizio: string; dataFine: string; causale: string }) {
  const [autore] = await db.select().from(schema.user).where(eq(schema.user.id, autoreId)).limit(1)
  const chi = autore ? `${autore.nome} ${autore.cognome}` : 'Chi programma'
  const quando = p.dataInizio === p.dataFine ? `il ${p.dataInizio}` : `dal ${p.dataInizio} al ${p.dataFine}`
  await traccia({
    entita: 'absence', entitaId: `${interessatoId}:${p.dataInizio}`, azione: `assenza_per_conto_${cosa}`,
    utente: autoreId, dopo: { dataInizio: p.dataInizio, dataFine: p.dataFine, causale: p.causale },
  })
  await avvisa([interessatoId], {
    tipo: 'assenza_per_conto',
    titolo: cosa === 'registrata' ? 'Un\'assenza registrata per te' : 'Un\'assenza tolta dal tuo calendario',
    corpo: `${chi} ${cosa === 'registrata' ? 'ha registrato' : 'ha tolto'} un'assenza ${quando}.`,
    link: '/assenze',
  })
}
