import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { type Env, HttpError } from '../context'
import { db, schema } from '../db/index'
import { addDays, eachDay, type ISODate, weekday } from '../lib/dates'
import { dividiGiornata } from '../lib/giornata'
import { puoVedereCausale, radice, sottoalbero, unitaDiProgrammazione } from '../permissions'
import { giorniIndisponibili } from './absences'

export const overview = new Hono<Env>()

/**
 * Panoramica di chi è in sede, giorno per giorno. È la prima cosa che si vede
 * entrando, quindi deve costare poco: cinque interrogazioni a intervallo fisso,
 * nessuna per giornata, nessuna per persona.
 */
overview.get('/', async (c) => {
  const a = c.get('attore'), alb = c.get('albero')
  if (a.ruolo === 'admin') throw new HttpError(403, 'L\'amministratore non accede alle programmazioni')

  const oggi = new Date().toISOString().slice(0, 10)
  const da = (c.req.query('da') ?? oggi) as ISODate
  const aData = (c.req.query('a') ?? addDays(da, 20)) as ISODate
  if (aData < da) throw new HttpError(422, 'Intervallo non valido')

  // Il dirigente guarda tutto il sottoalbero; gli altri la propria unità.
  const unitaVisibili = a.ruolo === 'dirigente' && a.unitId != null
    ? [...sottoalbero(alb, a.unitId)]
    : [unitaDiProgrammazione(alb, a.ruolo, a.unitId)].filter((n): n is number => n != null)
  if (unitaVisibili.length === 0) {
    return c.json({
      da, a: aData, giorni: [], persone: [], stanze: [], stanzeRiservate: [],
      settori: [], unita: [], periodiPubblicati: 0,
    })
  }

  const periodi = await db.select().from(schema.period).where(
    and(inArray(schema.period.unitId, unitaVisibili), eq(schema.period.stato, 'pubblicato'),
        lte(schema.period.dataInizio, aData), gte(schema.period.dataFine, da)),
  )

  const unitaRighe = await db.select().from(schema.unit).where(inArray(schema.unit.id, unitaVisibili))
  const radici = [...new Set(unitaVisibili.map((u) => radice(alb, u)))]

  const [persone, stanzeRighe, scrivanie, festivi] = await Promise.all([
    db.select({
      id: schema.user.id, nome: schema.user.nome, cognome: schema.user.cognome,
      unitId: schema.user.unitId, sectorId: schema.user.sectorId, ruolo: schema.user.ruolo,
    }).from(schema.user).where(and(inArray(schema.user.unitId, unitaVisibili), eq(schema.user.attivo, true))),
    db.select().from(schema.room).where(and(inArray(schema.room.unitId, unitaVisibili), eq(schema.room.attiva, true))),
    db.select().from(schema.desk).where(eq(schema.desk.attiva, true)),
    db.select().from(schema.holiday).where(and(gte(schema.holiday.data, da), lte(schema.holiday.data, aData),
      or(isNull(schema.holiday.unitId), inArray(schema.holiday.unitId, radici)))),
  ])

  // Presenze e lavoro agile insieme: la giornata si racconta per intero, e chi
  // manca da entrambe le liste non è programmato, non è «fuori».
  const celle = periodi.length
    ? await db.select().from(schema.assignment).where(
        and(inArray(schema.assignment.periodId, periodi.map((p) => p.id)),
            gte(schema.assignment.data, da), lte(schema.assignment.data, aData)),
      )
    : []

  /**
   * Le assenze si vedono solo di chi si ha titolo a vederle — l'interessato, i
   * suoi organizzatori, il suo dirigente. Per tutti gli altri il collega resta
   * fra chi lavora da remoto: è la stessa regola di `mascheraCella`, applicata
   * qui prima che i nomi lascino il server, e non una scelta dell'interfaccia.
   */
  const conCausaleVisibile = persone.filter((p) => puoVedereCausale(alb, a, { id: p.id, unitId: p.unitId }))
  const assenze = await giorniIndisponibili(conCausaleVisibile.map((p) => p.id), da, aData)

  // Le assenze proprie servono anche fuori dalla programmazione: la propria
  // giornata si segnala pure dove nessun periodo pubblicato la copre.
  const mieAssenze = await db.select().from(schema.absence).where(
    and(eq(schema.absence.userId, a.id), lte(schema.absence.dataInizio, aData), gte(schema.absence.dataFine, da)),
  )
  const mieiGiorniAssenti = new Set(mieAssenze.flatMap((x) => eachDay(x.dataInizio, x.dataFine)))

  const perPersona = new Map(persone.map((p) => [p.id, p]))
  const capienzaPerStanza = new Map<number, number>()
  for (const d of scrivanie) capienzaPerStanza.set(d.roomId, (capienzaPerStanza.get(d.roomId) ?? 0) + 1)
  const descrivi = (s: typeof stanzeRighe[number]) => ({
    id: s.id, etichetta: s.etichetta, soprannome: s.soprannome, piano: s.piano,
    capienza: capienzaPerStanza.get(s.id) ?? 0,
  })
  // La stanza riservata a una persona non è capienza condivisa: esce dal conto
  // e viaggia a parte, col nome di chi ci si trova. Chi cerca quella persona
  // sa dove andare senza che nessun altro venga programmato lì.
  const stanze = stanzeRighe.filter((s) => s.riservataA == null).map(descrivi).filter((s) => s.capienza > 0)
  const stanzeRiservate = stanzeRighe
    .filter((s) => s.riservataA != null)
    .map((s) => {
      const p = perPersona.get(s.riservataA!)
      return { ...descrivi(s), persona: p ? { id: p.id, nome: p.nome, cognome: p.cognome, ruolo: p.ruolo } : null }
    })
  const capienzaTotale = stanze.reduce((n, s) => n + s.capienza, 0)
  const numeroScrivania = new Map(scrivanie.map((d) => [d.id, d.numero]))

  const perGiorno = new Map<string, typeof celle>()
  for (const x of celle) {
    if (!perGiorno.has(x.data)) perGiorno.set(x.data, [])
    perGiorno.get(x.data)!.push(x)
  }
  const giorniFestivi = new Map(festivi.map((f) => [f.data, f.descrizione]))

  const giorni = eachDay(da, aData).map((g) => {
    // La divisione — e con lei la precedenza dell'assenza sulla cella — sta in
    // `lib/giornata`, dove si può provare senza un archivio davanti.
    const { presenti, remoti, assenti } =
      dividiGiornata(g, perGiorno.get(g) ?? [], perPersona, assenze, numeroScrivania)

    return {
      data: g,
      feriale: weekday(g) <= 5,
      festivo: giorniFestivi.get(g) ?? null,
      presenti,
      remoti,
      assenti,
      capienza: capienzaTotale,
      ioCiSono: presenti.some((p) => p.userId === a.id),
      ioAssente: mieiGiorniAssenti.has(g),
    }
  })

  const settori = await db.select().from(schema.sector).where(inArray(schema.sector.unitId, unitaVisibili))

  return c.json({
    da, a: aData, giorni, stanze, stanzeRiservate, settori,
    unita: unitaRighe.map((u) => ({ id: u.id, nome: u.nome, sigla: u.sigla })),
    persone: persone.map((p) => ({ id: p.id, nome: p.nome, cognome: p.cognome, unitId: p.unitId, sectorId: p.sectorId })),
    periodiPubblicati: periodi.length,
  })
})
