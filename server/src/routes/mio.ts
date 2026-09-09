import { and, eq, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { type Env, HttpError } from '../context'
import { db, schema } from '../db/index'
import { eachDay, type ISODate, weekday } from '../lib/dates'
import { INTESTAZIONE_CALENDARIO, righeCalendario } from '../lib/esportazione'
import { radice, unitaDiProgrammazione } from '../permissions'

export const mio = new Hono<Env>()

type Stato = 'presenza' | 'smart' | 'assenza'

/**
 * La pagina iniziale: le mie giornate da oggi in avanti, e per quelle in sede
 * chi ci sarà insieme a me.
 *
 * Una chiamata sola. La versione precedente chiedeva i presenti una giornata
 * alla volta, cioè una richiesta per riga dell'elenco: qui le interrogazioni
 * sono sette e non dipendono da quante giornate ci sono.
 *
 * Le assenze altrui non lasciano il server: dei colleghi si sa solo chi è in
 * sede, che è un dato di presidio, non un dato sanitario.
 */
mio.get('/', async (c) => {
  const a = c.get('attore'), alb = c.get('albero')
  if (a.ruolo === 'admin') throw new HttpError(403, 'L\'amministratore non accede alle programmazioni')

  const oggi = new Date().toISOString().slice(0, 10) as ISODate
  const da = (c.req.query('da') ?? oggi) as ISODate

  const unitId = unitaDiProgrammazione(alb, a.ruolo, a.unitId)
  if (unitId == null) return c.json({ da, giorni: [], stanze: [], settore: null, settori: [], scambio: null })

  // Solo il pubblicato: una bozza non è una promessa a nessuno.
  const periodi = await db.select().from(schema.period).where(
    and(eq(schema.period.unitId, unitId), eq(schema.period.stato, 'pubblicato'),
        gte(schema.period.dataFine, da)),
  ).orderBy(schema.period.dataInizio)

  const mieAssenze = await db.select().from(schema.absence)
    .where(and(eq(schema.absence.userId, a.id), gte(schema.absence.dataFine, da)))
    .orderBy(schema.absence.dataInizio)

  const fine = [
    ...periodi.map((p) => p.dataFine),
    ...mieAssenze.map((x) => x.dataFine),
  ].sort().at(-1)
  if (!fine) return c.json({ da, giorni: [], stanze: [], settore: null, settori: [], scambio: null })

  const idPeriodi = periodi.map((p) => p.id)
  const [mieCelle, festivi, unita] = await Promise.all([
    idPeriodi.length
      ? db.select().from(schema.assignment).where(
          and(inArray(schema.assignment.periodId, idPeriodi), eq(schema.assignment.userId, a.id),
              gte(schema.assignment.data, da)))
      : Promise.resolve([]),
    db.select().from(schema.holiday).where(
      and(gte(schema.holiday.data, da), lte(schema.holiday.data, fine),
          or(isNull(schema.holiday.unitId), eq(schema.holiday.unitId, radice(alb, unitId))))),
    db.select().from(schema.unit).where(eq(schema.unit.id, unitId)),
  ])

  const mieiGiorniInSede = mieCelle.filter((x) => x.stato === 'presenza').map((x) => x.data)

  // I colleghi si caricano solo per le giornate in cui ci sono anch'io: chi non
  // condivide la stanza con me non è affar mio.
  const colleghiRighe = mieiGiorniInSede.length
    ? await db.select({
        userId: schema.assignment.userId, data: schema.assignment.data,
        roomId: schema.assignment.roomId, deskId: schema.assignment.deskId,
        nome: schema.user.nome, cognome: schema.user.cognome, sectorId: schema.user.sectorId,
      })
      .from(schema.assignment)
      .innerJoin(schema.user, eq(schema.user.id, schema.assignment.userId))
      .where(and(
        inArray(schema.assignment.periodId, idPeriodi),
        inArray(schema.assignment.data, mieiGiorniInSede),
        eq(schema.assignment.stato, 'presenza'),
        ne(schema.assignment.userId, a.id),
        eq(schema.user.attivo, true),
      ))
    : []

  const [stanzeRighe, scrivanie] = await Promise.all([
    db.select().from(schema.room)
      .where(and(eq(schema.room.unitId, unitId), eq(schema.room.attiva, true))),
    db.select().from(schema.desk).where(eq(schema.desk.attiva, true)),
  ])
  const capienza = new Map<number, number>()
  for (const d of scrivanie) capienza.set(d.roomId, (capienza.get(d.roomId) ?? 0) + 1)
  const stanze = stanzeRighe.map((s) => ({
    id: s.id, etichetta: s.etichetta, soprannome: s.soprannome, piano: s.piano,
    capienza: capienza.get(s.id) ?? 0,
  }))
  const numeroScrivania = new Map(scrivanie.map((d) => [d.id, d.numero]))

  const colleghiPerGiorno = new Map<string, typeof colleghiRighe>()
  for (const r of colleghiRighe) {
    const lista = colleghiPerGiorno.get(r.data) ?? colleghiPerGiorno.set(r.data, []).get(r.data)!
    lista.push(r)
  }

  const cellaPerGiorno = new Map(mieCelle.map((x) => [x.data, x]))
  const periodoPerGiorno = new Map(periodi.map((p) => [p.id, p]))
  const causalePerGiorno = new Map<string, string>()
  for (const x of mieAssenze) {
    for (const g of eachDay(x.dataInizio > da ? x.dataInizio : da, x.dataFine)) causalePerGiorno.set(g, x.causale)
  }
  const giorniFestivi = new Map(festivi.map((f) => [f.data, f.descrizione]))

  const giorni = eachDay(da, fine)
    .filter((g) => weekday(g) <= 5 && !giorniFestivi.has(g))
    // Una giornata entra in elenco se ho una programmazione o un'assenza: fuori
    // dai periodi pubblicati non c'è niente da dire, e una riga vuota è rumore.
    .filter((g) => cellaPerGiorno.has(g) || causalePerGiorno.has(g))
    .map((g) => {
      const cella = cellaPerGiorno.get(g)
      const causale = causalePerGiorno.get(g) ?? null
      // L'assenza dichiarata vince sulla programmazione: la griglia pubblicata
      // non si riscrive da sola, ma a me la giornata risulta di assenza.
      const stato: Stato = causale ? 'assenza' : cella?.stato ?? 'smart'
      const periodo = cella ? periodoPerGiorno.get(cella.periodId) : undefined

      return {
        data: g,
        stato,
        causale,
        periodId: periodo?.id ?? null,
        roomId: stato === 'presenza' ? cella?.roomId ?? null : null,
        scrivania: stato === 'presenza' && cella?.deskId != null
          ? numeroScrivania.get(cella.deskId) ?? null : null,
        bloccata: cella?.bloccata ?? false,
        colleghi: stato === 'presenza'
          ? (colleghiPerGiorno.get(g) ?? [])
              .map((r) => ({
                userId: r.userId, nome: r.nome, cognome: r.cognome, sectorId: r.sectorId,
                roomId: r.roomId, scrivania: r.deskId != null ? numeroScrivania.get(r.deskId) ?? null : null,
              }))
              .sort((x, y) => x.cognome.localeCompare(y.cognome, 'it') || x.userId - y.userId)
          : [],
      }
    })

  // Il proprio settore: serve a decidere quali colleghi si vedono subito e
  // quali espandendo. Sta sull'anagrafica, non fra i permessi, e per un solo
  // punto di lettura non vale la pena allargare l'attore.
  const [mioSettore] = await db
    .select({ id: schema.sector.id, nome: schema.sector.nome })
    .from(schema.user)
    .innerJoin(schema.sector, eq(schema.sector.id, schema.user.sectorId))
    .where(eq(schema.user.id, a.id)).limit(1)

  // I settori dell'unità: il settore di un collega è un dato d'organigramma,
  // già visibile in griglia e in organigramma. Qui serve a dire, di chi trovo
  // in sede, con che gruppo lavora.
  const settori = await db.select({ id: schema.sector.id, nome: schema.sector.nome })
    .from(schema.sector).where(eq(schema.sector.unitId, unitId))

  const u = unita[0]
  return c.json({
    da,
    a: fine,
    giorni,
    stanze,
    settore: mioSettore ?? null,
    settori,
    scambio: u ? { attivo: u.scambioAttivo, oraLimite: u.scambioOraLimite } : null,
  })
})

/**
 * Il proprio calendario in CSV.
 *
 * È il solo export in cui la causale può comparire: sono giornate proprie, e
 * l'interessato la causale la conosce già. Dei colleghi non esce niente —
 * nemmeno chi era in sede con me: quello è un elenco di terzi, e un file che
 * gira per posta non è il posto dove metterlo.
 */
mio.get('/export.csv', async (c) => {
  const a = c.get('attore'), alb = c.get('albero')
  if (a.ruolo === 'admin') throw new HttpError(403, 'L\'amministratore non accede alle programmazioni')

  const oggi = new Date().toISOString().slice(0, 10) as ISODate
  const da = (c.req.query('da') ?? oggi) as ISODate
  const unitId = unitaDiProgrammazione(alb, a.ruolo, a.unitId)

  const periodi = unitId == null ? [] : await db.select().from(schema.period).where(
    and(eq(schema.period.unitId, unitId), eq(schema.period.stato, 'pubblicato'),
        gte(schema.period.dataFine, da)),
  )
  const mieAssenze = await db.select().from(schema.absence)
    .where(and(eq(schema.absence.userId, a.id), gte(schema.absence.dataFine, da)))

  const idPeriodi = periodi.map((p) => p.id)
  const celle = idPeriodi.length
    ? await db.select().from(schema.assignment).where(
        and(inArray(schema.assignment.periodId, idPeriodi), eq(schema.assignment.userId, a.id),
            gte(schema.assignment.data, da)))
    : []

  const stanze = new Map((await db.select().from(schema.room)).map((s) => [s.id, s]))
  const scrivanie = new Map((await db.select().from(schema.desk)).map((d) => [d.id, d.numero]))
  const causale = new Map<string, string>()
  for (const x of mieAssenze) {
    for (const g of eachDay(x.dataInizio > da ? x.dataInizio : da, x.dataFine)) causale.set(g, x.causale)
  }

  const virgolette = (v: string) => `"${v.replace(/"/g, '""')}"`
  const righe = [
    INTESTAZIONE_CALENDARIO.join(';'),
    ...righeCalendario(celle, causale, stanze, scrivanie).map((r) => r.map(virgolette).join(';')),
  ]

  return new Response('\ufeff' + righe.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="mio-calendario-${da}.csv"`,
    },
  })
})
