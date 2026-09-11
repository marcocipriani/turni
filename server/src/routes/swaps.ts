import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Env, HttpError, invalido, nonTrovato, vietato } from '../context'
import { db, pool, schema } from '../db/index'
import { type ISODate, weekKey, workingDays } from '../lib/dates'
import { avvisa } from '../lib/notify'
import { type Albero, radice, unitaDiProgrammazione } from '../permissions'
import { chiave, type Contesto, effetti, possibili, type Proposta, type Tipo, validaScambio } from '../scambio'
import { giorniIndisponibili } from './absences'
import { personeDellUnita } from './org'

export const swaps = new Hono<Env>()
const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida')

/** Ora locale, come la legge chi ha in mano il telefono. */
const oraCorrente = () =>
  new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false })

const oggiISO = () => new Date().toISOString().slice(0, 10) as ISODate

/**
 * Il periodo pubblicato che copre una giornata, nell'unità in cui la persona è
 * programmata. Fuori da un periodo pubblicato non c'è niente da scambiare.
 */
async function periodoDi(alb: Albero, ruolo: 'admin' | 'dirigente' | 'dipendente',
                         unitId: number | null, data: ISODate) {
  const uid = unitaDiProgrammazione(alb, ruolo, unitId)
  if (uid == null) return null
  const [p] = await db.select().from(schema.period).where(
    and(eq(schema.period.unitId, uid), eq(schema.period.stato, 'pubblicato'),
        lte(schema.period.dataInizio, data), gte(schema.period.dataFine, data)),
  ).limit(1)
  return p ?? null
}

/** Una revisione aperta riscriverà queste celle: uno scambio adesso andrebbe perso. */
async function inRevisione(periodId: number) {
  const [g] = await db.select({ id: schema.period.id }).from(schema.period)
    .where(eq(schema.period.revisioneDi, periodId)).limit(1)
  return Boolean(g)
}

/**
 * Il contesto di verifica di un periodo: stato programmato, assenze, presidio,
 * capienza, limiti settimanali e celle già impegnate.
 *
 * Si costruisce una volta e serve sia per elencare gli scambi possibili sia per
 * accettarne uno. È la stessa fotografia in entrambi i casi: le regole non
 * possono divergere fra ciò che si propone e ciò che si applica.
 */
async function contestoScambio(
  p: typeof schema.period.$inferSelect, alb: Albero, escludiScambio?: number,
): Promise<{ ctx: Contesto; persone: Awaited<ReturnType<typeof personeDellUnita>> }> {
  const persone = await personeDellUnita(alb, p.unitId)
  const ids = persone.map((u) => u.id)
  const rid = radice(alb, p.unitId)

  const [unita] = await db.select().from(schema.unit).where(eq(schema.unit.id, p.unitId)).limit(1)
  const festivi = await db.select({ data: schema.holiday.data }).from(schema.holiday).where(
    and(gte(schema.holiday.data, p.dataInizio), lte(schema.holiday.data, p.dataFine),
        or(isNull(schema.holiday.unitId), eq(schema.holiday.unitId, rid))),
  )
  const giorni = workingDays(p.dataInizio, p.dataFine, new Set(festivi.map((f) => f.data)))

  const [settori, stanze, celle, indisponibili] = await Promise.all([
    db.select().from(schema.sector).where(eq(schema.sector.unitId, p.unitId)),
    db.select().from(schema.room).where(and(eq(schema.room.unitId, p.unitId), eq(schema.room.attiva, true),
      isNull(schema.room.riservataA))),
    db.select().from(schema.assignment).where(eq(schema.assignment.periodId, p.id)),
    giorniIndisponibili(ids, p.dataInizio, p.dataFine),
  ])
  const scrivanie = stanze.length
    ? await db.select().from(schema.desk).where(
        and(inArray(schema.desk.roomId, stanze.map((s) => s.id)), eq(schema.desk.attiva, true)))
    : []

  const stati = new Map<string, 'presenza' | 'smart'>()
  const presenzePerGiorno = new Map<string, number>()
  const agilePerSettimana = new Map<string, number>()
  const programmatePerSettimana = new Map<string, number>()
  for (const c of celle) {
    stati.set(chiave(c.userId, c.data), c.stato)
    if (c.stato === 'presenza') presenzePerGiorno.set(c.data, (presenzePerGiorno.get(c.data) ?? 0) + 1)
    const k = `${c.userId}|${weekKey(c.data)}`
    programmatePerSettimana.set(k, (programmatePerSettimana.get(k) ?? 0) + 1)
    if (c.stato === 'smart') agilePerSettimana.set(k, (agilePerSettimana.get(k) ?? 0) + 1)
  }

  const giornateDellaSettimana = new Map<string, number>()
  for (const g of giorni) {
    const w = weekKey(g)
    giornateDellaSettimana.set(w, (giornateDellaSettimana.get(w) ?? 0) + 1)
  }

  const membriSettore = new Map<number, number[]>()
  for (const u of persone) {
    if (u.sectorId == null) continue
    const lista = membriSettore.get(u.sectorId) ?? membriSettore.set(u.sectorId, []).get(u.sectorId)!
    lista.push(u.id)
  }

  // Le proposte ancora aperte bloccano le loro celle. Accettandone una si
  // esclude se stessa dal conteggio, altrimenti si bloccherebbe da sola.
  const aperte = await db.select().from(schema.swap).where(
    and(eq(schema.swap.periodId, p.id), eq(schema.swap.stato, 'proposto')),
  )
  const impegnate = new Set<string>()
  for (const s of aperte) {
    if (s.id === escludiScambio) continue
    for (const e of effetti(daRiga(s))) impegnate.add(chiave(e.userId, e.data))
  }

  return {
    persone,
    ctx: {
      oggi: oggiISO(), ora: oraCorrente(),
      scambioAttivo: unita?.scambioAttivo ?? false,
      oraLimite: unita?.scambioOraLimite ?? '10:00',
      giornate: new Set(giorni),
      stati,
      assenze: new Set(indisponibili.keys()),
      settoreDi: new Map(persone.map((u) => [u.id, u.sectorId])),
      presidio: new Set(settori.filter((s) => s.richiedePresidio).map((s) => s.id)),
      membriSettore,
      capienza: scrivanie.length,
      presenzePerGiorno,
      smartMinSettimana: p.smartMinSettimana ?? unita?.smartMinSettimana ?? null,
      smartMaxSettimana: p.smartMaxSettimana ?? unita?.smartMaxSettimana ?? null,
      impegnate,
      agilePerSettimana, programmatePerSettimana, giornateDellaSettimana,
    },
  }
}

const daRiga = (s: typeof schema.swap.$inferSelect): Proposta => ({
  tipo: s.tipo as Tipo, proponenteId: s.proponenteId, destinatarioId: s.destinatarioId,
  dataProponente: s.dataProponente, dataDestinatario: s.dataDestinatario,
})

/** Una proposta su giornate ormai passate è scaduta: si filtra, non si aggiorna. */
const scaduta = (s: typeof schema.swap.$inferSelect, oggi: ISODate) =>
  s.dataProponente < oggi && s.dataDestinatario < oggi

/* ── Elenco ─────────────────────────────────────────────────────── */

swaps.get('/', async (c) => {
  const a = c.get('attore')
  if (a.ruolo === 'admin') throw vietato('L\'amministratore non partecipa agli scambi')
  const oggi = oggiISO()

  const righe = await db.select().from(schema.swap).where(
    or(eq(schema.swap.proponenteId, a.id), eq(schema.swap.destinatarioId, a.id)),
  ).orderBy(desc(schema.swap.creatoIl)).limit(60)

  const altri = [...new Set(righe.flatMap((s) => [s.proponenteId, s.destinatarioId]))]
  const persone = altri.length
    ? await db.select({ id: schema.user.id, nome: schema.user.nome, cognome: schema.user.cognome })
        .from(schema.user).where(inArray(schema.user.id, altri))
    : []
  const nome = new Map(persone.map((p) => [p.id, p]))

  const vista = righe
    .filter((s) => !(s.stato === 'proposto' && scaduta(s, oggi)))
    .map((s) => ({
      id: s.id, tipo: s.tipo, stato: s.stato,
      dataProponente: s.dataProponente, dataDestinatario: s.dataDestinatario,
      messaggio: s.messaggio, creatoIl: s.creatoIl,
      ioPropongo: s.proponenteId === a.id,
      controparte: nome.get(s.proponenteId === a.id ? s.destinatarioId : s.proponenteId) ?? null,
    }))

  return c.json({
    inArrivo: vista.filter((s) => !s.ioPropongo && s.stato === 'proposto'),
    inUscita: vista.filter((s) => s.ioPropongo && s.stato === 'proposto'),
    conclusi: vista.filter((s) => s.stato !== 'proposto').slice(0, 12),
  })
})

/* ── Chi e quando ───────────────────────────────────────────────── */

/**
 * Le persone con cui posso scambiare la giornata indicata, e in quali giornate.
 *
 * Chi non compare è escluso senza spiegazione: assenza, capienza, presidio,
 * limiti di lavoro agile e proposte già aperte escludono allo stesso modo. Una
 * motivazione racconterebbe di terzi ciò che non è affare di chi guarda.
 */
swaps.get('/possibili', async (c) => {
  const a = c.get('attore'), alb = c.get('albero')
  if (a.ruolo === 'admin') throw vietato('L\'amministratore non partecipa agli scambi')

  const data = c.req.query('data')
  if (!data || !ISO.safeParse(data).success) throw invalido('Giornata non indicata')

  const p = await periodoDi(alb, a.ruolo, a.unitId, data)
  if (!p) return c.json({ candidati: [], scambio: null })

  const { ctx, persone } = await contestoScambio(p, alb)
  const elenco = possibili(ctx, a.id, data, persone.map((u) => u.id))
  const anagrafica = new Map(persone.map((u) => [u.id, u]))

  return c.json({
    scambio: { attivo: ctx.scambioAttivo, oraLimite: ctx.oraLimite },
    candidati: elenco.map((e) => ({
      userId: e.userId,
      nome: anagrafica.get(e.userId)?.nome ?? '',
      cognome: anagrafica.get(e.userId)?.cognome ?? '',
      giornate: e.giornate,
    })),
  })
})

/* ── Proposta ───────────────────────────────────────────────────── */

swaps.post('/', async (c) => {
  const a = c.get('attore'), alb = c.get('albero')
  if (a.ruolo === 'admin') throw vietato('L\'amministratore non partecipa agli scambi')

  const b = z.object({
    tipo: z.enum(['offro', 'chiedo', 'permuta']),
    destinatarioId: z.number().int(),
    dataProponente: ISO,
    dataDestinatario: ISO,
    messaggio: z.string().max(280).optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw invalido('Proposta di scambio non valida')

  const p = await periodoDi(alb, a.ruolo, a.unitId, b.data.dataProponente)
  if (!p) throw invalido('Quella giornata non è in un periodo pubblicato')
  if (await inRevisione(p.id)) {
    throw new HttpError(409, 'Programmazione in revisione: gli scambi riaprono dopo l\'approvazione')
  }

  const { ctx, persone } = await contestoScambio(p, alb)
  if (!persone.some((u) => u.id === b.data.destinatarioId)) {
    throw vietato('Si scambia solo con chi è nella tua stessa programmazione')
  }

  const proposta: Proposta = { ...b.data, proponenteId: a.id }
  const esito = validaScambio(ctx, proposta)
  if (!esito.ok) throw new HttpError(422, esito.motivo)

  try {
    const [ins] = await db.insert(schema.swap).values({
      periodId: p.id, tipo: proposta.tipo,
      proponenteId: a.id, destinatarioId: proposta.destinatarioId,
      dataProponente: proposta.dataProponente, dataDestinatario: proposta.dataDestinatario,
      messaggio: b.data.messaggio?.trim() || null,
    })
    await avvisa([proposta.destinatarioId], {
      tipo: 'scambio_proposto',
      titolo: 'Proposta di scambio turno',
      corpo: descrivi(proposta, persone),
      link: '/mio',
    })
    return c.json({ id: ins.insertId }, 201)
  } catch (e) {
    // L'indice unico sulle celle bloccate è l'ultima parola: due proposte
    // arrivate insieme sulla stessa giornata non passano entrambe.
    if (String(e).includes('Duplicate entry')) {
      throw new HttpError(409, 'Quella giornata è appena entrata in un altro scambio.')
    }
    throw e
  }
})

function descrivi(p: Proposta, persone: { id: number; nome: string; cognome: string }[]) {
  const chi = persone.find((u) => u.id === p.proponenteId)
  const nome = chi ? `${chi.nome} ${chi.cognome}` : 'Un collega'
  if (p.tipo === 'offro') return `${nome} ti cede la giornata in sede del ${p.dataProponente}.`
  if (p.tipo === 'chiedo') return `${nome} ti chiede la giornata in sede del ${p.dataDestinatario}.`
  return `${nome} propone di permutare la tua giornata del ${p.dataDestinatario} con la sua del ${p.dataProponente}.`
}

/* ── Accettazione, rifiuto, ritiro ──────────────────────────────── */

async function caricaScambio(id: number) {
  const [s] = await db.select().from(schema.swap).where(eq(schema.swap.id, id)).limit(1)
  if (!s) throw nonTrovato('Scambio non trovato')
  return s
}

swaps.post('/:id/accetta', async (c) => {
  const a = c.get('attore'), alb = c.get('albero')
  const s = await caricaScambio(Number(c.req.param('id')))
  if (s.destinatarioId !== a.id) throw vietato('Solo chi riceve la proposta può accettarla')
  if (s.stato !== 'proposto') throw new HttpError(409, 'Questa proposta è già stata chiusa')
  if (scaduta(s, oggiISO())) throw new HttpError(409, 'Questa proposta è scaduta')

  const [p] = await db.select().from(schema.period).where(eq(schema.period.id, s.periodId)).limit(1)
  if (!p || p.stato !== 'pubblicato') throw new HttpError(409, 'Il periodo non è più pubblicato')
  if (await inRevisione(p.id)) {
    throw new HttpError(409, 'Programmazione in revisione: gli scambi riaprono dopo l\'approvazione')
  }

  // Si rivalida tutto: fra la proposta e l'accettazione il mondo può essere
  // cambiato — un'assenza dichiarata, un altro scambio accettato, la griglia
  // ritoccata da chi programma.
  const { ctx } = await contestoScambio(p, alb, s.id)
  const esito = validaScambio(ctx, daRiga(s))
  if (!esito.ok) throw new HttpError(409, esito.motivo)

  await applica(p.id, daRiga(s), s.id, a.id)

  await avvisa([s.proponenteId], {
    tipo: 'scambio_accettato',
    titolo: 'Scambio accettato',
    corpo: 'La tua proposta di scambio è stata accettata: il calendario è aggiornato.',
    link: '/mio',
  })
  return c.json({ ok: true })
})

swaps.post('/:id/rifiuta', async (c) => {
  const a = c.get('attore')
  const s = await caricaScambio(Number(c.req.param('id')))
  if (s.destinatarioId !== a.id) throw vietato('Solo chi riceve la proposta può rifiutarla')
  if (s.stato !== 'proposto') throw new HttpError(409, 'Questa proposta è già stata chiusa')

  await db.update(schema.swap).set({ stato: 'rifiutato', chiusoIl: new Date() })
    .where(eq(schema.swap.id, s.id))
  await avvisa([s.proponenteId], {
    tipo: 'scambio_rifiutato',
    titolo: 'Scambio rifiutato',
    corpo: 'La tua proposta di scambio non è stata accettata.',
    link: '/mio',
  })
  return c.json({ ok: true })
})

swaps.delete('/:id', async (c) => {
  const a = c.get('attore')
  const s = await caricaScambio(Number(c.req.param('id')))
  if (s.proponenteId !== a.id) throw vietato('Solo chi propone può ritirare')
  if (s.stato !== 'proposto') throw new HttpError(409, 'Questa proposta è già stata chiusa')

  await db.update(schema.swap).set({ stato: 'ritirato', chiusoIl: new Date() })
    .where(eq(schema.swap.id, s.id))
  await avvisa([s.destinatarioId], {
    tipo: 'scambio_ritirato',
    titolo: 'Proposta ritirata',
    corpo: 'La proposta di scambio è stata ritirata da chi l\'aveva fatta.',
    link: '/mio',
  })
  return c.json({ ok: true })
})

/**
 * Applica lo scambio: le celle si scambiano stato e postazione, e restano
 * bloccate. Il blocco è quello che chi programma già conosce — la generazione
 * non lo tocca — e si può sempre togliere dalla griglia.
 *
 * Tutto in una transazione: uno scambio a metà lascerebbe una giornata con una
 * persona in più e nessuna in meno.
 */
async function applica(periodId: number, p: Proposta, swapId: number, attore: number) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const date = [...new Set([p.dataProponente, p.dataDestinatario])]
    const [righe] = await conn.query(
      'SELECT * FROM `assignment` WHERE `period_id` = ? AND `user_id` IN (?, ?) AND `data` IN (?) FOR UPDATE',
      [periodId, p.proponenteId, p.destinatarioId, date],
    )
    const celle = righe as { id: number; user_id: number; data: string; stato: string; room_id: number | null; desk_id: number | null }[]
    const dove = new Map(celle.map((r) => [`${r.user_id}|${r.data}`, r]))

    for (const e of effetti(p)) {
      const mia = dove.get(chiave(e.userId, e.data))
      if (!mia) throw new HttpError(409, 'La programmazione è cambiata: riprova.')

      // La postazione sta con la giornata, non con la persona: chi entra in
      // sede prende la stanza e la scrivania di chi esce, in quella giornata.
      const altro = e.stato === 'presenza'
        ? celle.find((r) => r.data === e.data && r.user_id !== e.userId && r.stato === 'presenza')
        : null

      await conn.query(
        'UPDATE `assignment` SET `stato` = ?, `room_id` = ?, `desk_id` = ?, `bloccata` = 1, ' +
        '`origine` = ?, `motivazione` = ? WHERE `id` = ?',
        [
          e.stato,
          e.stato === 'presenza' ? altro?.room_id ?? null : null,
          e.stato === 'presenza' ? altro?.desk_id ?? null : null,
          'scambio',
          `scambio ${swapId}`,
          mia.id,
        ],
      )
    }

    await conn.query('UPDATE `scambio` SET `stato` = ?, `chiuso_il` = now() WHERE `id` = ?',
      ['accettato', swapId])
    await conn.query(
      'INSERT INTO `audit_log` (`entita`, `entita_id`, `azione`, `utente`, `dopo`) VALUES (?, ?, ?, ?, ?)',
      ['scambio', String(swapId), 'accettato', attore, JSON.stringify(p)],
    )

    await conn.commit()
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}
