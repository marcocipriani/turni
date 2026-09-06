import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Env, HttpError, nonTrovato, vietato } from '../context'
import { db, schema } from '../db/index'
import { traccia } from '../lib/audit'
import { type ISODate, weekKey, weekday, workingDays } from '../lib/dates'
import { avvisa } from '../lib/notify'
import { generate, type Persona, type Stanza } from '../generate'
import {
  type Albero, mascheraCella, puoApprovare, puoLeggereUnita, puoProgrammare, puoVedereCausale,
  radice, unitaDiProgrammazione,
} from '../permissions'
import { giorniIndisponibili } from './absences'
import { personeDellUnita, type PersonaUnita } from './org'

export const periods = new Hono<Env>()
const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida')

async function caricaPeriodo(id: number) {
  const [p] = await db.select().from(schema.period).where(eq(schema.period.id, id)).limit(1)
  if (!p) throw nonTrovato('Periodo non trovato')
  return p
}

/** Tutto ciò che serve sia alla griglia sia alla generazione. */
async function contesto(p: typeof schema.period.$inferSelect, alb: Albero) {
  const persone = await personeDellUnita(alb, p.unitId)
  const ids = persone.map((u) => u.id)

  const rid = radice(alb, p.unitId)
  const festivi = await db.select({ data: schema.holiday.data }).from(schema.holiday).where(
    and(gte(schema.holiday.data, p.dataInizio), lte(schema.holiday.data, p.dataFine),
        or(isNull(schema.holiday.unitId), eq(schema.holiday.unitId, rid))),
  )
  const giorni = workingDays(p.dataInizio, p.dataFine, new Set(festivi.map((f) => f.data)))

  const settori = await db.select().from(schema.sector)
    .where(eq(schema.sector.unitId, p.unitId)).orderBy(asc(schema.sector.ordine))

  const stanzeRighe = await db.select().from(schema.room)
    .where(and(eq(schema.room.unitId, rid), eq(schema.room.attiva, true))).orderBy(asc(schema.room.id))
  const scrivanie = stanzeRighe.length
    ? await db.select().from(schema.desk).where(
        and(inArray(schema.desk.roomId, stanzeRighe.map((s) => s.id)), eq(schema.desk.attiva, true)))
    : []
  const stanze: Stanza[] = stanzeRighe.map((s) => ({
    roomId: s.id, capienza: scrivanie.filter((d) => d.roomId === s.id).length,
  })).filter((s) => s.capienza > 0)

  const indisponibili = await giorniIndisponibili(ids, p.dataInizio, p.dataFine)

  const regoleRighe = await db.select().from(schema.recurringRule).where(
    and(eq(schema.recurringRule.unitId, p.unitId), lte(schema.recurringRule.validoDa, p.dataFine),
        or(isNull(schema.recurringRule.validoA), gte(schema.recurringRule.validoA, p.dataInizio))),
  )
  const regole = new Map<string, 'presenza' | 'smart'>()
  for (const r of regoleRighe) {
    const bersagli = r.ambito === 'utente'
      ? persone.filter((u) => u.id === r.targetId)
      : persone.filter((u) => u.sectorId === r.targetId)
    for (const u of bersagli) {
      for (const g of giorni) {
        if (weekday(g) !== r.giornoSettimana) continue
        if (g < r.validoDa || (r.validoA && g > r.validoA)) continue
        regole.set(`${u.id}|${g}`, r.stato)
      }
    }
  }

  const celle = await db.select().from(schema.assignment).where(eq(schema.assignment.periodId, p.id))
  const preferenze = ids.length
    ? await db.select().from(schema.userPreference).where(inArray(schema.userPreference.userId, ids))
    : []

  return { persone, giorni, settori, stanzeRighe, scrivanie, stanze, indisponibili, regole, celle, preferenze }
}

type Contesto = Awaited<ReturnType<typeof contesto>>

function personePerMotore(ctx: Contesto): Persona[] {
  return ctx.persone.map((u) => {
    const pref = ctx.preferenze.find((p) => p.userId === u.id)
    return {
      userId: u.id, cognome: u.cognome, sectorId: u.sectorId,
      giorniPreferiti: pref?.giorniPreferiti ?? [], giorniDaEvitare: pref?.giorniDaEvitare ?? [],
    }
  })
}

/** Le validazioni della griglia: capienza, assenze, presidio, quote. */
function validazioni(ctx: Contesto, p: typeof schema.period.$inferSelect) {
  const avvisi: { gravita: 'errore' | 'attenzione'; messaggio: string; data?: string }[] = []
  const capienza = ctx.stanze.reduce((s, r) => s + r.capienza, 0)

  for (const g of ctx.giorni) {
    const presenti = ctx.celle.filter((c) => c.data === g && c.stato === 'presenza')
    if (presenti.length > capienza) {
      avvisi.push({ gravita: 'errore', data: g, messaggio: `${g}: ${presenti.length} presenze per ${capienza} postazioni` })
    }
    for (const s of ctx.settori.filter((s) => s.richiedePresidio)) {
      const coperto = presenti.some((c) => ctx.persone.find((u) => u.id === c.userId)?.sectorId === s.id)
      if (!coperto) avvisi.push({ gravita: 'attenzione', data: g, messaggio: `${g}: settore ${s.nome} senza presidio` })
    }
  }

  for (const c of ctx.celle) {
    if (c.stato !== 'presenza') continue
    if (ctx.indisponibili.has(`${c.userId}|${c.data}`)) {
      const u = ctx.persone.find((x) => x.id === c.userId)
      avvisi.push({
        gravita: 'errore', data: c.data,
        messaggio: `${c.data}: ${u?.cognome ?? c.userId} è in presenza ma ha dichiarato un'assenza`,
      })
    }
  }

  if (p.smartMinSettimana != null || p.smartMaxSettimana != null) {
    const giorniPerSettimana = new Map<string, number>()
    for (const g of ctx.giorni) giorniPerSettimana.set(weekKey(g), (giorniPerSettimana.get(weekKey(g)) ?? 0) + 1)

    const presenze = new Map<string, number>()
    for (const c of ctx.celle) {
      if (c.stato !== 'presenza') continue
      const k = `${c.userId}|${weekKey(c.data)}`
      presenze.set(k, (presenze.get(k) ?? 0) + 1)
    }
    for (const u of ctx.persone) {
      for (const [sett, quante] of giorniPerSettimana) {
        const inSede = presenze.get(`${u.id}|${sett}`) ?? 0
        const agile = quante - inSede
        if (p.smartMinSettimana != null && agile < p.smartMinSettimana) {
          avvisi.push({
            gravita: 'attenzione', data: sett,
            messaggio: `Settimana del ${sett}: ${u.cognome} ha ${agile} giornate in agile, il minimo è ${p.smartMinSettimana}`,
          })
        }
        if (p.smartMaxSettimana != null && agile > p.smartMaxSettimana) {
          avvisi.push({
            gravita: 'attenzione', data: sett,
            messaggio: `Settimana del ${sett}: ${u.cognome} ha ${agile} giornate in agile, il massimo è ${p.smartMaxSettimana}`,
          })
        }
      }
    }
  }

  return avvisi
}

/* ── Elenco e creazione ─────────────────────────────────────────── */

periods.get('/', async (c) => {
  const unitId = Number(c.req.query('unitId'))
  if (!Number.isInteger(unitId)) throw new HttpError(422, 'Unità non indicata')
  const a = c.get('attore')
  if (!puoLeggereUnita(c.get('albero'), a, unitId)) throw vietato()
  // Chi non programma vede solo il pubblicato: una bozza è un ragionamento in
  // corso, non una comunicazione, e leggerla come tale fa più danno che bene.
  const soloPubblicati = !puoProgrammare(a, unitId)
  return c.json(await db.select().from(schema.period)
    .where(soloPubblicati
      ? and(eq(schema.period.unitId, unitId), eq(schema.period.stato, 'pubblicato'))
      : eq(schema.period.unitId, unitId))
    .orderBy(desc(schema.period.dataInizio)))
})

periods.post('/', async (c) => {
  const b = z.object({
    unitId: z.number().int(), dataInizio: ISO, dataFine: ISO,
    assegnaScrivanie: z.boolean().default(false),
    copiaDaId: z.number().int().nullable().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati del periodo non validi')
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoProgrammare(a, b.data.unitId)) throw vietato('Non hai la delega per programmare questa unità')
  if (b.data.dataFine < b.data.dataInizio) throw new HttpError(422, 'La data di fine precede quella di inizio')

  // I periodi della stessa unità non si sovrappongono.
  const collisioni = await db.select({ id: schema.period.id }).from(schema.period).where(
    and(eq(schema.period.unitId, b.data.unitId), lte(schema.period.dataInizio, b.data.dataFine),
        gte(schema.period.dataFine, b.data.dataInizio)),
  )
  if (collisioni.length) throw new HttpError(409, 'Esiste già un periodo che si sovrappone a queste date')

  const [u] = await db.select().from(schema.unit).where(eq(schema.unit.id, b.data.unitId)).limit(1)
  const [ins] = await db.insert(schema.period).values({
    unitId: b.data.unitId, dataInizio: b.data.dataInizio, dataFine: b.data.dataFine,
    assegnaScrivanie: b.data.assegnaScrivanie, creatoDa: a.id,
    smartMinSettimana: u?.smartMinSettimana ?? null, smartMaxSettimana: u?.smartMaxSettimana ?? null,
  })
  const periodId = ins.insertId

  if (b.data.copiaDaId) {
    const sorgente = await caricaPeriodo(b.data.copiaDaId)
    if (sorgente.unitId !== b.data.unitId) throw vietato('Si copia solo da un periodo della stessa unità')
    await copiaPeriodo(sorgente, { ...ins, id: periodId } as never, b.data, alb, periodId)
  }
  await traccia({ entita: 'period', entitaId: periodId, azione: 'crea', utente: a.id, dopo: b.data })
  return c.json({ id: periodId }, 201)
})

/** Ricalca il ritmo del periodo precedente sulle nuove date, saltando le assenze. */
async function copiaPeriodo(
  sorgente: typeof schema.period.$inferSelect,
  _nuovo: unknown,
  dati: { unitId: number; dataInizio: ISODate; dataFine: ISODate },
  alb: Albero,
  periodId: number,
) {
  const vecchie = await db.select().from(schema.assignment).where(eq(schema.assignment.periodId, sorgente.id))
  if (vecchie.length === 0) return

  const persone = await personeDellUnita(alb, dati.unitId)
  const ids = new Set(persone.map((p) => p.id))
  const giorniVecchi = [...new Set(vecchie.map((v) => v.data))].sort()
  const giorniNuovi = workingDays(dati.dataInizio, dati.dataFine, new Set())
  const indisp = await giorniIndisponibili([...ids], dati.dataInizio, dati.dataFine)

  const righe: (typeof schema.assignment.$inferInsert)[] = []
  for (const [i, g] of giorniNuovi.entries()) {
    const sorgenteGiorno = giorniVecchi[i % giorniVecchi.length]
    if (!sorgenteGiorno) continue
    for (const v of vecchie.filter((v) => v.data === sorgenteGiorno)) {
      if (!ids.has(v.userId)) continue
      const bloccatoDaAssenza = indisp.has(`${v.userId}|${g}`)
      righe.push({
        periodId, userId: v.userId, data: g,
        stato: bloccatoDaAssenza ? 'smart' : v.stato,
        roomId: bloccatoDaAssenza ? null : v.roomId, deskId: null,
        bloccata: false, origine: 'copiata',
      })
    }
  }
  if (righe.length) await db.insert(schema.assignment).values(righe)
}

/* ── Griglia ────────────────────────────────────────────────────── */

periods.get('/:id/griglia', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoLeggereUnita(alb, a, p.unitId)) throw vietato()
  // Una bozza si apre solo a chi la sta costruendo, anche puntandola per id.
  if (p.stato !== 'pubblicato' && !puoProgrammare(a, p.unitId)) {
    throw vietato('Questa programmazione non è ancora pubblicata')
  }
  const ctx = await contesto(p, alb)

  const perChiave = new Map(ctx.celle.map((x) => [`${x.userId}|${x.data}`, x]))
  const celle = ctx.persone.flatMap((u) =>
    ctx.giorni.map((g) => {
      const c0 = perChiave.get(`${u.id}|${g}`)
      const causale = ctx.indisponibili.get(`${u.id}|${g}`) ?? null
      const grezza = {
        userId: u.id, data: g,
        stato: (causale ? 'assenza' : c0?.stato ?? 'smart') as 'presenza' | 'smart' | 'assenza',
        roomId: causale ? null : c0?.roomId ?? null,
        deskId: causale ? null : c0?.deskId ?? null,
        bloccata: c0?.bloccata ?? false,
        // Una cella nata da uno scambio va riconosciuta: chi programma non
        // riceve notifiche, se ne accorge guardando la griglia.
        daScambio: c0?.origine === 'scambio',
        causale,
      }
      return mascheraCella(alb, a, grezza, { id: u.id, unitId: u.unitId })
    }),
  )

  const puoScrivere = puoProgrammare(a, p.unitId)
  return c.json({
    periodo: p,
    giorni: ctx.giorni,
    persone: ctx.persone,
    settori: ctx.settori,
    stanze: ctx.stanzeRighe.map((s) => ({
      ...s, capienza: ctx.scrivanie.filter((d) => d.roomId === s.id).length,
      scrivanie: ctx.scrivanie.filter((d) => d.roomId === s.id),
    })),
    celle,
    permessi: { scrivere: puoScrivere, approvare: puoApprovare(a, p.unitId) },
    avvisi: puoScrivere ? validazioni(ctx, p) : [],
  })
})

/* ── Modifica di una cella ──────────────────────────────────────── */

periods.put('/:id/cella', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoProgrammare(a, p.unitId)) throw vietato()

  const b = z.object({
    userId: z.number().int(), data: ISO,
    stato: z.enum(['presenza', 'smart']),
    roomId: z.number().int().nullable().default(null),
    deskId: z.number().int().nullable().default(null),
    bloccata: z.boolean().default(false),
    motivazione: z.string().max(500).optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati della cella non validi')

  // Una modifica su un periodo pubblicato apre una nuova versione, con motivo obbligatorio.
  if (p.stato === 'pubblicato') {
    if (!b.data.motivazione?.trim()) {
      throw new HttpError(422, 'Modificare un periodo pubblicato richiede una motivazione')
    }
    await nuovaVersione(p, a.id, b.data.motivazione)
  }

  const precedente = await db.select().from(schema.assignment).where(
    and(eq(schema.assignment.periodId, p.id), eq(schema.assignment.userId, b.data.userId),
        eq(schema.assignment.data, b.data.data)),
  ).limit(1)

  await db.insert(schema.assignment).values({
    periodId: p.id, userId: b.data.userId, data: b.data.data, stato: b.data.stato,
    roomId: b.data.stato === 'presenza' ? b.data.roomId : null,
    deskId: b.data.stato === 'presenza' ? b.data.deskId : null,
    bloccata: b.data.bloccata, origine: 'manuale', motivazione: b.data.motivazione ?? null,
  }).onDuplicateKeyUpdate({
    set: {
      stato: b.data.stato,
      roomId: b.data.stato === 'presenza' ? b.data.roomId : null,
      deskId: b.data.stato === 'presenza' ? b.data.deskId : null,
      bloccata: b.data.bloccata, origine: 'manuale', motivazione: b.data.motivazione ?? null,
    },
  })

  if (p.stato === 'pubblicato' || b.data.motivazione) {
    await traccia({
      entita: 'assignment', entitaId: `${p.id}:${b.data.userId}:${b.data.data}`, azione: 'modifica_manuale',
      utente: a.id, prima: precedente[0] ?? null, dopo: b.data, motivazione: b.data.motivazione ?? null,
    })
  }
  return c.json({ ok: true })
})

/* ── Generazione ────────────────────────────────────────────────── */

periods.post('/:id/genera', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoProgrammare(a, p.unitId)) throw vietato()
  if (p.stato === 'pubblicato') throw new HttpError(409, 'Un periodo pubblicato va prima riaperto con una revisione')

  const ctx = await contesto(p, alb)
  if (ctx.stanze.length === 0) throw new HttpError(422, 'Nessuna stanza con scrivanie attive: non c\'è capienza da distribuire')

  const bloccate = ctx.celle.filter((x) => x.bloccata).map((x) => ({
    userId: x.userId, data: x.data, stato: x.stato, roomId: x.roomId,
  }))

  const esito = generate({
    giorni: ctx.giorni,
    persone: personePerMotore(ctx),
    stanze: ctx.stanze,
    bloccate,
    indisponibili: new Set(ctx.indisponibili.keys()),
    regole: ctx.regole,
    presidioSettori: ctx.settori.filter((s) => s.richiedePresidio).map((s) => s.id),
    smartMinSettimana: p.smartMinSettimana,
    smartMaxSettimana: p.smartMaxSettimana,
  })

  // Le celle bloccate sopravvivono: si riscrive tutto il resto.
  await db.delete(schema.assignment).where(
    and(eq(schema.assignment.periodId, p.id), eq(schema.assignment.bloccata, false)),
  )
  const bloccateChiavi = new Set(bloccate.map((x) => `${x.userId}|${x.data}`))
  const daInserire = esito.assegnazioni.filter((x) => !bloccateChiavi.has(`${x.userId}|${x.data}`))

  const scrivanieLibere = new Map<string, number[]>()
  if (p.assegnaScrivanie) {
    for (const g of ctx.giorni) {
      for (const s of ctx.stanze) {
        scrivanieLibere.set(`${g}|${s.roomId}`, ctx.scrivanie.filter((d) => d.roomId === s.roomId).map((d) => d.id))
      }
    }
  }

  if (daInserire.length) {
    await db.insert(schema.assignment).values(daInserire.map((x) => {
      let deskId: number | null = null
      if (p.assegnaScrivanie && x.stato === 'presenza' && x.roomId != null) {
        deskId = scrivanieLibere.get(`${x.data}|${x.roomId}`)?.shift() ?? null
      }
      return {
        periodId: p.id, userId: x.userId, data: x.data, stato: x.stato,
        roomId: x.roomId, deskId, bloccata: false, origine: 'generata' as const,
      }
    }))
  }

  await traccia({ entita: 'period', entitaId: p.id, azione: 'genera', utente: a.id })
  return c.json({
    quote: esito.quote,
    sottoQuota: esito.sottoQuota.map((s) => ({
      ...s, persona: ctx.persone.find((u) => u.id === s.userId)?.cognome ?? String(s.userId),
    })),
    presidiScoperti: esito.presidiScoperti.map((s) => ({
      ...s, settore: ctx.settori.find((x) => x.id === s.sectorId)?.nome ?? String(s.sectorId),
    })),
  })
})

/* ── Approvazione e pubblicazione ───────────────────────────────── */

async function nuovaVersione(p: typeof schema.period.$inferSelect, autore: number, motivo: string) {
  const celle = await db.select().from(schema.assignment).where(eq(schema.assignment.periodId, p.id))
  await db.insert(schema.periodSnapshot).values({
    periodId: p.id, versione: p.versione, assegnazioni: celle as never, motivo, autore,
  })
  await db.update(schema.period)
    .set({ versione: p.versione + 1, stato: 'in_approvazione' })
    .where(eq(schema.period.id, p.id))
}

periods.post('/:id/invia', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore')
  if (!puoProgrammare(a, p.unitId)) throw vietato()
  if (p.stato === 'pubblicato') throw new HttpError(409, 'Il periodo è già pubblicato')

  await db.update(schema.period).set({ stato: 'in_approvazione' }).where(eq(schema.period.id, p.id))
  const [dir] = await db.select({ id: schema.user.id }).from(schema.user)
    .where(and(eq(schema.user.unitId, p.unitId), eq(schema.user.ruolo, 'dirigente'))).limit(1)
  if (dir) {
    await avvisa([dir.id], {
      tipo: 'periodo_in_approvazione',
      titolo: 'Programmazione da approvare',
      corpo: `Periodo ${p.dataInizio} – ${p.dataFine} in attesa della tua approvazione.`,
      link: `/programmazione/${p.id}`,
    })
  }
  await traccia({ entita: 'period', entitaId: p.id, azione: 'invia_approvazione', utente: a.id })
  return c.json({ ok: true })
})

periods.post('/:id/respingi', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore')
  if (!puoApprovare(a, p.unitId)) throw vietato('Solo il dirigente approva o respinge')
  const b = z.object({ nota: z.string().min(3).max(500) }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Serve una nota che spieghi il rinvio')

  await db.update(schema.period).set({ stato: 'bozza', notaApprovazione: b.data.nota })
    .where(eq(schema.period.id, p.id))
  const deleghe = await db.select({ userId: schema.organizer.userId })
    .from(schema.organizer).where(eq(schema.organizer.unitId, p.unitId))
  await avvisa([...deleghe.map((d) => d.userId), p.creatoDa], {
    tipo: 'periodo_respinto', titolo: 'Programmazione rinviata',
    corpo: b.data.nota, link: `/programmazione/${p.id}`,
  })
  await traccia({ entita: 'period', entitaId: p.id, azione: 'respingi', utente: a.id, motivazione: b.data.nota })
  return c.json({ ok: true })
})

periods.post('/:id/approva', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoApprovare(a, p.unitId)) throw vietato('Solo il dirigente approva')
  if (p.stato !== 'in_approvazione') throw new HttpError(409, 'Il periodo non è in approvazione')

  await db.update(schema.period)
    .set({ stato: 'pubblicato', pubblicatoDa: a.id, pubblicatoIl: new Date(), notaApprovazione: null })
    .where(eq(schema.period.id, p.id))

  // Prima pubblicazione: avvisa tutti. Revisione: solo chi ha una cella cambiata.
  const persone = await personeDellUnita(alb, p.unitId)
  let destinatari = persone.map((u) => u.id)
  if (p.versione > 1) {
    const [snap] = await db.select().from(schema.periodSnapshot)
      .where(and(eq(schema.periodSnapshot.periodId, p.id), eq(schema.periodSnapshot.versione, p.versione - 1)))
      .limit(1)
    const prima = new Map<string, string>()
    for (const x of (snap?.assegnazioni ?? []) as { userId: number; data: string; stato: string; roomId: number | null }[]) {
      prima.set(`${x.userId}|${x.data}`, `${x.stato}|${x.roomId ?? ''}`)
    }
    const ora = await db.select().from(schema.assignment).where(eq(schema.assignment.periodId, p.id))
    const toccati = new Set<number>()
    for (const x of ora) {
      if (prima.get(`${x.userId}|${x.data}`) !== `${x.stato}|${x.roomId ?? ''}`) toccati.add(x.userId)
    }
    destinatari = [...toccati]
  }

  await avvisa(destinatari, {
    tipo: p.versione > 1 ? 'revisione_pubblicata' : 'periodo_pubblicato',
    titolo: p.versione > 1 ? 'La tua programmazione è cambiata' : 'Programmazione pubblicata',
    corpo: `Periodo ${p.dataInizio} – ${p.dataFine}.`,
    link: `/calendario`,
  })
  await traccia({ entita: 'period', entitaId: p.id, azione: 'pubblica', utente: a.id, dopo: { versione: p.versione } })
  return c.json({ ok: true, destinatari: destinatari.length })
})

periods.get('/:id/versioni', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  if (!puoLeggereUnita(c.get('albero'), c.get('attore'), p.unitId)) throw vietato()
  const righe = await db.select({
    versione: schema.periodSnapshot.versione, motivo: schema.periodSnapshot.motivo,
    autore: schema.periodSnapshot.autore, creatoIl: schema.periodSnapshot.creatoIl,
  }).from(schema.periodSnapshot).where(eq(schema.periodSnapshot.periodId, p.id))
    .orderBy(desc(schema.periodSnapshot.versione))
  return c.json(righe)
})

/* ── Consultazione e export ─────────────────────────────────────── */

periods.get('/mio-calendario', async (c) => {
  const a = c.get('attore'), alb = c.get('albero')
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, a.id)).limit(1)
  if (!u || u.unitId == null) return c.json({ giornate: [] })
  const unitId = unitaDiProgrammazione(alb, u.ruolo, u.unitId)
  if (unitId == null) return c.json({ giornate: [] })

  const periodi = await db.select().from(schema.period)
    .where(and(eq(schema.period.unitId, unitId), eq(schema.period.stato, 'pubblicato')))
  if (periodi.length === 0) return c.json({ giornate: [] })

  const celle = await db.select().from(schema.assignment).where(
    and(inArray(schema.assignment.periodId, periodi.map((p) => p.id)), eq(schema.assignment.userId, a.id)),
  )
  // L'intervallo delle assenze si limita a quello dei periodi trovati.
  const p0 = periodi.reduce((m, p) => (p.dataInizio < m ? p.dataInizio : m), periodi[0]!.dataInizio)
  const p1 = periodi.reduce((m, p) => (p.dataFine > m ? p.dataFine : m), periodi[0]!.dataFine)
  const idStanze = [...new Set(celle.map((x) => x.roomId).filter((n): n is number => n != null))]
  const idScrivanie = [...new Set(celle.map((x) => x.deskId).filter((n): n is number => n != null))]
  const stanze = idStanze.length ? await db.select().from(schema.room).where(inArray(schema.room.id, idStanze)) : []
  const scrivanie = idScrivanie.length ? await db.select().from(schema.desk).where(inArray(schema.desk.id, idScrivanie)) : []
  const stanzePerId = new Map(stanze.map((s) => [s.id, s.etichetta]))
  const scrivaniePerId = new Map(scrivanie.map((d) => [d.id, d.numero]))
  const assenze = await giorniIndisponibili([a.id], p0, p1)

  return c.json({
    giornate: celle.map((x) => ({
      data: x.data,
      stato: assenze.has(`${a.id}|${x.data}`) ? 'assenza' : x.stato,
      stanza: x.roomId != null ? stanzePerId.get(x.roomId) ?? null : null,
      scrivania: x.deskId != null ? scrivaniePerId.get(x.deskId) ?? null : null,
      causale: assenze.get(`${a.id}|${x.data}`) ?? null,
    })).sort((x, y) => x.data.localeCompare(y.data)),
  })
})

/** Chi è in sede in una certa giornata. Nessuna informazione su chi non c'è. */
periods.get('/:id/giornata/:data', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoLeggereUnita(alb, a, p.unitId)) throw vietato()
  const data = c.req.param('data')

  const persone = await personeDellUnita(alb, p.unitId)
  const celle = await db.select().from(schema.assignment).where(
    and(eq(schema.assignment.periodId, p.id), eq(schema.assignment.data, data), eq(schema.assignment.stato, 'presenza')),
  )
  const idStanze = [...new Set(celle.map((x) => x.roomId).filter((n): n is number => n != null))]
  const idScrivanie = [...new Set(celle.map((x) => x.deskId).filter((n): n is number => n != null))]
  const stanze = idStanze.length ? await db.select().from(schema.room).where(inArray(schema.room.id, idStanze)) : []
  const scrivanie = idScrivanie.length ? await db.select().from(schema.desk).where(inArray(schema.desk.id, idScrivanie)) : []
  const perId = <T extends { id: number }>(righe: T[]) => new Map(righe.map((r) => [r.id, r]))
  const stanzePerId = perId(stanze), scrivaniePerId = perId(scrivanie)
  const personePerId = perId(persone)
  const assenti = await giorniIndisponibili(persone.map((u) => u.id), data, data)

  return c.json({
    data,
    presenti: celle
      .filter((x) => !assenti.has(`${x.userId}|${data}`))
      .map((x) => {
        const u = personePerId.get(x.userId)
        return {
          userId: x.userId, nome: u?.nome ?? '', cognome: u?.cognome ?? '',
          stanza: x.roomId != null ? stanzePerId.get(x.roomId)?.etichetta ?? null : null,
          scrivania: x.deskId != null ? scrivaniePerId.get(x.deskId)?.numero ?? null : null,
        }
      })
      .sort((x, y) => x.cognome.localeCompare(y.cognome, 'it')),
  })
})

/** L'export non contiene causali di assenza. Mai. */
periods.get('/:id/export.csv', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore'), alb = c.get('albero')
  if (!puoLeggereUnita(alb, a, p.unitId)) throw vietato()

  const ctx = await contesto(p, alb)
  const stanzePerId = new Map(ctx.stanzeRighe.map((s) => [s.id, s.etichetta]))
  const scrivaniePerId = new Map(ctx.scrivanie.map((d) => [d.id, d.numero]))
  const settoriPerId = new Map(ctx.settori.map((s) => [s.id, s.nome]))
  const cellePerChiave = new Map(ctx.celle.map((x) => [`${x.userId}|${x.data}`, x]))
  const nomeStanza = (id: number | null) => (id == null ? '' : stanzePerId.get(id) ?? '')
  const nomeScrivania = (id: number | null) => (id == null ? '' : scrivaniePerId.get(id) ?? '')
  const nomeSettore = (id: number | null) => (id == null ? '' : settoriPerId.get(id) ?? '')

  const virgolette = (v: string) => `"${v.replace(/"/g, '""')}"`
  const righe = [['cognome', 'nome', 'settore', 'data', 'stato', 'stanza', 'scrivania'].join(';')]
  for (const u of ctx.persone) {
    for (const g of ctx.giorni) {
      const cella = cellePerChiave.get(`${u.id}|${g}`)
      // L'export dice se una persona è in sede, e nient'altro. Distinguere
      // «assenza» da «lavoro agile» — anche solo con due parole diverse e
      // nessuna causale — direbbe a chiunque apra il file chi era assente.
      const inSede = cella?.stato === 'presenza' && !ctx.indisponibili.has(`${u.id}|${g}`)
      const stato = inSede ? 'presenza' : 'fuori_sede'
      righe.push([
        u.cognome, u.nome, nomeSettore(u.sectorId), g, stato,
        stato === 'presenza' ? nomeStanza(cella?.roomId ?? null) : '',
        stato === 'presenza' ? nomeScrivania(cella?.deskId ?? null) : '',
      ].map(virgolette).join(';'))
    }
  }
  return new Response('﻿' + righe.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="programmazione-${p.dataInizio}_${p.dataFine}.csv"`,
    },
  })
})

/* ── Regole ricorrenti ──────────────────────────────────────────── */

periods.get('/regole/:unitId', async (c) => {
  const unitId = Number(c.req.param('unitId'))
  if (!puoLeggereUnita(c.get('albero'), c.get('attore'), unitId)) throw vietato()
  return c.json(await db.select().from(schema.recurringRule).where(eq(schema.recurringRule.unitId, unitId)))
})

periods.post('/regole', async (c) => {
  const b = z.object({
    unitId: z.number().int(), ambito: z.enum(['utente', 'settore']), targetId: z.number().int(),
    giornoSettimana: z.number().int().min(1).max(5), stato: z.enum(['presenza', 'smart']),
    validoDa: ISO, validoA: ISO.nullable().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Regola non valida')
  const a = c.get('attore')
  if (!puoProgrammare(a, b.data.unitId)) throw vietato()
  const [ins] = await db.insert(schema.recurringRule).values({ ...b.data, validoA: b.data.validoA ?? null, creataDa: a.id })
  return c.json({ id: ins.insertId }, 201)
})

periods.delete('/regole/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [r] = await db.select().from(schema.recurringRule).where(eq(schema.recurringRule.id, id)).limit(1)
  if (!r) throw nonTrovato('Regola non trovata')
  if (!puoProgrammare(c.get('attore'), r.unitId)) throw vietato()
  await db.delete(schema.recurringRule).where(eq(schema.recurringRule.id, id))
  return c.json({ ok: true })
})
