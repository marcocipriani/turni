/**
 * Scambio di turni fra colleghi.
 *
 * Non passa da nessuna approvazione: vale l'accordo fra due persone. Proprio
 * per questo i vincoli devono reggere da soli, ed è tutto qui dentro — una
 * funzione pura, usata sia per elencare gli scambi possibili sia per applicarli.
 * La stessa regola in lettura e in scrittura: non si può proporre ciò che verrà
 * poi rifiutato, e non si può accettare ciò che non era proponibile.
 *
 * Tre forme, un'unica verifica:
 *
 *   offro    cedo la mia giornata in sede a chi quel giorno lavora da casa
 *   chiedo   prendo la giornata in sede di chi accetta di restare a casa
 *   permuta  due giornate in sede si scambiano di proprietario
 *
 * In tutte e tre la capienza della giornata resta identica: qualcuno esce dalla
 * sede ed esattamente qualcun altro ci entra. La verifica sulla capienza c'è
 * lo stesso, perché un archivio già fuori regola non deve peggiorare.
 */
import { type ISODate, weekKey } from './lib/dates'

export type StatoCella = 'presenza' | 'smart'
export type Tipo = 'offro' | 'chiedo' | 'permuta'

export type Proposta = {
  tipo: Tipo
  proponenteId: number
  destinatarioId: number
  dataProponente: ISODate
  dataDestinatario: ISODate
}

export type Contesto = {
  oggi: ISODate
  /** Ora locale corrente, 'HH:MM'. */
  ora: string
  /** L'unità può spegnere lo scambio, e scegliere fin quando si tocca la giornata di oggi. */
  scambioAttivo: boolean
  oraLimite: string
  /** Giornate lavorative del periodo pubblicato. */
  giornate: Set<ISODate>
  /** `${userId}|${data}` → stato programmato. */
  stati: Map<string, StatoCella>
  /** `${userId}|${data}` per ogni assenza dichiarata. */
  assenze: Set<string>
  settoreDi: Map<number, number | null>
  /** Settori che richiedono presidio quotidiano. */
  presidio: Set<number>
  membriSettore: Map<number, number[]>
  capienza: number
  /** Presenze già programmate per giornata: si aggiorna per differenza, non si riconta. */
  presenzePerGiorno: Map<ISODate, number>
  smartMinSettimana: number | null
  smartMaxSettimana: number | null
  /** Celle già impegnate in una proposta aperta. */
  impegnate: Set<string>
  /** `${userId}|${lunedì}` → giornate agili e giornate programmate di quella settimana. */
  agilePerSettimana: Map<string, number>
  programmatePerSettimana: Map<string, number>
  /** Giornate lavorative del periodo in ciascuna settimana. */
  giornateDellaSettimana: Map<string, number>
}

export type Esito = { ok: true } | { ok: false; motivo: string }

export const chiave = (userId: number, data: ISODate) => `${userId}|${data}`

const opposto = (s: StatoCella): StatoCella => s === 'presenza' ? 'smart' : 'presenza'

/** Le celle che cambiano, e lo stato che assumono. Non tocca niente: descrive. */
export function effetti(p: Proposta): { userId: number; data: ISODate; stato: StatoCella }[] {
  if (p.tipo === 'offro') {
    return [
      { userId: p.proponenteId, data: p.dataProponente, stato: 'smart' },
      { userId: p.destinatarioId, data: p.dataProponente, stato: 'presenza' },
    ]
  }
  if (p.tipo === 'chiedo') {
    return [
      { userId: p.destinatarioId, data: p.dataDestinatario, stato: 'smart' },
      { userId: p.proponenteId, data: p.dataDestinatario, stato: 'presenza' },
    ]
  }
  return [
    { userId: p.proponenteId, data: p.dataProponente, stato: 'smart' },
    { userId: p.destinatarioId, data: p.dataProponente, stato: 'presenza' },
    { userId: p.destinatarioId, data: p.dataDestinatario, stato: 'smart' },
    { userId: p.proponenteId, data: p.dataDestinatario, stato: 'presenza' },
  ]
}

export function validaScambio(ctx: Contesto, p: Proposta): Esito {
  const no = (motivo: string): Esito => ({ ok: false, motivo })

  if (!ctx.scambioAttivo) return no('Lo scambio dei turni non è attivo in questa unità.')
  if (p.proponenteId === p.destinatarioId) return no('Non si scambia un turno con se stessi.')

  const permuta = p.tipo === 'permuta'
  if (permuta && p.dataProponente === p.dataDestinatario) {
    return no('Una permuta riguarda due giornate diverse.')
  }
  if (!permuta && p.dataProponente !== p.dataDestinatario) {
    return no('Cedere o chiedere un turno riguarda una sola giornata.')
  }

  const cambi = effetti(p)
  const giorniCoinvolti = [...new Set(cambi.map((c) => c.data))]

  for (const g of giorniCoinvolti) {
    if (!ctx.giornate.has(g)) return no('Quella giornata non è nel periodo pubblicato.')
    if (g < ctx.oggi) return no('Le giornate passate non si scambiano.')
    if (g === ctx.oggi && ctx.ora >= ctx.oraLimite) {
      return no(`Per la giornata di oggi lo scambio si chiude alle ${ctx.oraLimite}.`)
    }
  }

  // Ogni cella deve trovarsi nello stato opposto a quello che assumerà: è ciò
  // che rende lo scambio uno scambio e non una riscrittura del turno.
  for (const c of cambi) {
    const attuale = ctx.stati.get(chiave(c.userId, c.data))
    if (attuale == null) return no('Una delle giornate non è programmata.')
    if (attuale !== opposto(c.stato)) return no('Le giornate scelte non si possono scambiare.')
  }

  // Nessuno dei due è assente in nessuna delle giornate toccate. La verifica
  // sta qui, e non solo all'accettazione, così una giornata di assenza non
  // viene neppure proposta.
  for (const u of [p.proponenteId, p.destinatarioId]) {
    for (const g of giorniCoinvolti) {
      if (ctx.assenze.has(chiave(u, g))) return no('Una delle due persone è assente in quella giornata.')
    }
  }

  for (const c of cambi) {
    if (ctx.impegnate.has(chiave(c.userId, c.data))) {
      return no('Una delle giornate è già dentro un altro scambio in corso.')
    }
  }

  // Da qui in poi si guarda il mondo dopo lo scambio. Non si ricopia lo stato:
  // le celle toccate sono al massimo quattro, e tutto il resto si conta per
  // differenza. Con cinquecento persone e sessanta giornate la differenza fra
  // ricopiare e sommare è fra qualche minuto e qualche millisecondo.
  const cambiati = new Map(cambi.map((c) => [chiave(c.userId, c.data), c.stato]))
  const statoDopo = (u: number, g: ISODate) =>
    cambiati.get(chiave(u, g)) ?? ctx.stati.get(chiave(u, g))

  // Un settore perde il presidio solo se qualcuno dei suoi esce dalla sede.
  const aRischio = new Set<number>()
  for (const c of cambi) {
    if (c.stato !== 'smart') continue
    const s = ctx.settoreDi.get(c.userId)
    if (s != null && ctx.presidio.has(s)) aRischio.add(s)
  }
  for (const g of giorniCoinvolti) {
    for (const sectorId of aRischio) {
      const membri = ctx.membriSettore.get(sectorId) ?? []
      const coperto = membri.some((u) =>
        statoDopo(u, g) === 'presenza' && !ctx.assenze.has(chiave(u, g)))
      if (!coperto) return no('Lo scambio lascerebbe un settore senza presidio.')
    }
  }

  // La capienza, per costruzione, non cambia mai: a ogni uscita dalla sede
  // corrisponde un ingresso, nella stessa giornata. Il controllo resta perché
  // un archivio già fuori regola non deve peggiorare per colpa di uno scambio.
  const deltaPresenze = new Map<ISODate, number>()
  for (const c of cambi) {
    const prima = ctx.stati.get(chiave(c.userId, c.data))
    const d = (c.stato === 'presenza' ? 1 : 0) - (prima === 'presenza' ? 1 : 0)
    deltaPresenze.set(c.data, (deltaPresenze.get(c.data) ?? 0) + d)
  }
  for (const g of giorniCoinvolti) {
    const inSede = (ctx.presenzePerGiorno.get(g) ?? 0) + (deltaPresenze.get(g) ?? 0)
    if (inSede > ctx.capienza) return no('Quella giornata non ha più postazioni libere.')
  }

  const limite = limitiAgile(ctx, cambi)
  if (limite) return no(limite)

  return { ok: true }
}

/**
 * Minimi e massimi settimanali di lavoro agile, quando il dirigente li impone.
 * Si guardano le sole settimane toccate: le altre non cambiano.
 */
function limitiAgile(ctx: Contesto, cambi: { userId: number; data: ISODate; stato: StatoCella }[]): string | null {
  if (ctx.smartMinSettimana == null && ctx.smartMaxSettimana == null) return null

  const delta = new Map<string, number>()
  for (const c of cambi) {
    const prima = ctx.stati.get(chiave(c.userId, c.data))
    const k = `${c.userId}|${weekKey(c.data)}`
    delta.set(k, (delta.get(k) ?? 0) + (c.stato === 'smart' ? 1 : 0) - (prima === 'smart' ? 1 : 0))
  }

  for (const [k, d] of delta) {
    if (d === 0) continue
    const settimana = k.split('|')[1]!
    // Una settimana a cavallo dell'inizio o della fine del periodo non si
    // giudica: mancano le giornate fuori periodo e il conto sarebbe in difetto.
    if ((ctx.programmatePerSettimana.get(k) ?? 0) < (ctx.giornateDellaSettimana.get(settimana) ?? 0)) continue
    const agile = (ctx.agilePerSettimana.get(k) ?? 0) + d
    if (ctx.smartMaxSettimana != null && agile > ctx.smartMaxSettimana) {
      return `Supererebbe il massimo di ${ctx.smartMaxSettimana} giornate agili a settimana.`
    }
    if (ctx.smartMinSettimana != null && agile < ctx.smartMinSettimana) {
      return `Scenderebbe sotto il minimo di ${ctx.smartMinSettimana} giornate agili a settimana.`
    }
  }
  return null
}

/**
 * Le persone con cui si può scambiare, e in quali giornate.
 *
 * L'elenco lo costruisce il server applicando le stesse regole: al client non
 * arriva mai una possibilità che verrebbe poi rifiutata. Le esclusioni non si
 * spiegano — assenza, capienza, presidio, limiti e scambi già aperti escludono
 * allo stesso modo, e una motivazione racconterebbe di terzi ciò che non è
 * affare di chi guarda.
 */
export function possibili(ctx: Contesto, io: number, miaData: ISODate, persone: number[]) {
  const mioStato = ctx.stati.get(chiave(io, miaData))
  if (mioStato == null) return []

  const out: { userId: number; giornate: { data: ISODate; tipo: Tipo }[] }[] = []

  for (const altro of persone) {
    if (altro === io) continue
    const giornate: { data: ISODate; tipo: Tipo }[] = []

    // Stessa giornata: cedo la mia se sono in sede, chiedo la sua se non ci sono.
    const tipo: Tipo = mioStato === 'presenza' ? 'offro' : 'chiedo'
    if (validaScambio(ctx, {
      tipo, proponenteId: io, destinatarioId: altro,
      dataProponente: miaData, dataDestinatario: miaData,
    }).ok) giornate.push({ data: miaData, tipo })

    // Giornate diverse: si permutano due giornate in sede, quindi ha senso solo
    // partendo da una giornata in cui ci sono.
    if (mioStato === 'presenza') {
      for (const g of ctx.giornate) {
        if (g === miaData) continue
        if (validaScambio(ctx, {
          tipo: 'permuta', proponenteId: io, destinatarioId: altro,
          dataProponente: miaData, dataDestinatario: g,
        }).ok) giornate.push({ data: g, tipo: 'permuta' })
      }
    }

    if (giornate.length) {
      giornate.sort((a, b) => a.data.localeCompare(b.data))
      out.push({ userId: altro, giornate })
    }
  }
  return out
}
