import { type ISODate, weekKey, weekday } from './lib/dates'

export type Persona = {
  userId: number
  cognome: string
  sectorId: number | null
  giorniPreferiti: number[]
  giorniDaEvitare: number[]
}

export type Stanza = { roomId: number; capienza: number }

export type CellaFissata = {
  userId: number
  data: ISODate
  stato: 'presenza' | 'smart'
  roomId: number | null
}

export type GenerateInput = {
  /** Giornate lavorative del periodo, già al netto di weekend e festività. */
  giorni: ISODate[]
  persone: Persona[]
  stanze: Stanza[]
  /** Celle bloccate dall'organizzatore: vincoli, non suggerimenti. */
  bloccate: CellaFissata[]
  /** Chiavi `userId|data` in cui la persona non può essere in sede. */
  indisponibili: Set<string>
  /** Stato imposto dalle regole ricorrenti, chiave `userId|data`. */
  regole: Map<string, 'presenza' | 'smart'>
  presidioSettori: number[]
  smartMinSettimana: number | null
  smartMaxSettimana: number | null
}

export type GenerateResult = {
  assegnazioni: { userId: number; data: ISODate; stato: 'presenza' | 'smart'; roomId: number | null }[]
  quote: { userId: number; quota: number; assegnate: number }[]
  sottoQuota: { userId: number; mancanti: number; motivo: string }[]
  presidiScoperti: { sectorId: number; data: ISODate }[]
}

const key = (userId: number, data: ISODate) => `${userId}|${data}`

/**
 * Ripartisce `totale` col metodo dei resti maggiori, rispettando i tetti
 * individuali: la somma delle quote è esattamente `totale` quando i tetti lo
 * consentono, senza giornate perse o inventate per arrotondamento.
 */
function restiMaggiori(totale: number, chiavi: number[], tetti: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>()
  if (chiavi.length === 0) return out
  const base = Math.floor(totale / chiavi.length)
  let assegnato = 0
  for (const k of chiavi) {
    const q = Math.min(base, tetti.get(k) ?? Infinity)
    out.set(k, q)
    assegnato += q
  }
  let residuo = totale - assegnato
  // Distribuisce il resto un giro alla volta, saltando chi ha raggiunto il tetto.
  while (residuo > 0) {
    let mosso = false
    for (const k of chiavi) {
      if (residuo === 0) break
      const tetto = tetti.get(k) ?? Infinity
      const attuale = out.get(k)!
      if (attuale < tetto) { out.set(k, attuale + 1); residuo--; mosso = true }
    }
    if (!mosso) break   // tutti al tetto: la capienza eccede la disponibilità
  }
  return out
}

export function generate(input: GenerateInput): GenerateResult {
  const { giorni, persone, stanze, bloccate, indisponibili, regole, presidioSettori } = input
  const presidio = new Set(presidioSettori)
  const capienzaGiorno = stanze.reduce((s, r) => s + r.capienza, 0)

  // Ordinamento stabile: stesso ingresso, stessa uscita, sempre.
  const ordinate = [...persone].sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.userId - b.userId)
  const indice = new Map(giorni.map((d, i) => [d, i]))

  const fissata = new Map<string, CellaFissata>()
  for (const c of bloccate) fissata.set(key(c.userId, c.data), c)

  const settimane = new Map<string, ISODate[]>()
  for (const d of giorni) {
    const w = weekKey(d)
    if (!settimane.has(w)) settimane.set(w, [])
    settimane.get(w)!.push(d)
  }

  /** Stato imposto da cella bloccata, indisponibilità o regola ricorrente. */
  function imposto(u: number, d: ISODate): 'presenza' | 'smart' | null {
    const f = fissata.get(key(u, d))
    if (f) return f.stato
    if (indisponibili.has(key(u, d))) return 'smart'
    return regole.get(key(u, d)) ?? null
  }

  const disponibile = (u: number, d: ISODate) => imposto(u, d) === null

  /** Presenze massime in una settimana, se è attivo il minimo di lavoro agile. */
  function maxPresenzeSettimana(d: ISODate): number {
    if (input.smartMinSettimana == null) return Infinity
    return Math.max(0, (settimane.get(weekKey(d))?.length ?? 0) - input.smartMinSettimana)
  }

  /** Tetto individuale sull'intero periodo derivante dallo stesso limite. */
  function tettoSettimanale(): number {
    if (input.smartMinSettimana == null) return Infinity
    let tot = 0
    for (const gg of settimane.values()) tot += Math.max(0, gg.length - input.smartMinSettimana)
    return tot
  }

  // ── Quota individuale, derivata dalla capienza ───────────────────
  const tetti = new Map<number, number>()
  for (const p of ordinate) {
    let disponibili = 0
    for (const d of giorni) {
      const s = imposto(p.userId, d)
      if (s === null || s === 'presenza') disponibili++
    }
    tetti.set(p.userId, Math.min(disponibili, tettoSettimanale()))
  }

  const postiTotali = capienzaGiorno * giorni.length
  const quote = restiMaggiori(postiTotali, ordinate.map((p) => p.userId), tetti)

  // ── Assegnazione giorno per giorno ───────────────────────────────
  const scelte = new Map<string, 'presenza' | 'smart'>()
  const conteggio = new Map<number, number>()
  const ultimaPresenza = new Map<number, number>()
  const perSettimana = new Map<string, number>()
  for (const p of ordinate) conteggio.set(p.userId, 0)

  const passo = new Map<number, number>()
  for (const p of ordinate) {
    const q = quote.get(p.userId) ?? 0
    passo.set(p.userId, q > 0 ? giorni.length / q : giorni.length)
  }

  const wk = (u: number, d: ISODate) => `${u}|${weekKey(d)}`

  for (const d of giorni) {
    const i = indice.get(d)!
    let capienzaResidua = capienzaGiorno

    // Le celle imposte consumano capienza prima di ogni scelta automatica.
    for (const p of ordinate) {
      const f = imposto(p.userId, d)
      if (f === null) continue
      scelte.set(key(p.userId, d), f)
      if (f === 'presenza') {
        capienzaResidua--
        conteggio.set(p.userId, conteggio.get(p.userId)! + 1)
        ultimaPresenza.set(p.userId, i)
        perSettimana.set(wk(p.userId, d), (perSettimana.get(wk(p.userId, d)) ?? 0) + 1)
      }
    }

    const settoriCoperti = new Set<number>()
    for (const p of ordinate) {
      if (scelte.get(key(p.userId, d)) === 'presenza' && p.sectorId != null) settoriCoperti.add(p.sectorId)
    }

    const maxSett = maxPresenzeSettimana(d)

    /** Può ancora essere messa in presenza oggi, quota a parte. */
    const collocabile = (p: typeof ordinate[number]) =>
      disponibile(p.userId, d) &&
      !scelte.has(key(p.userId, d)) &&
      (perSettimana.get(wk(p.userId, d)) ?? 0) < maxSett

    const metti = (p: typeof ordinate[number]) => {
      scelte.set(key(p.userId, d), 'presenza')
      capienzaResidua--
      conteggio.set(p.userId, conteggio.get(p.userId)! + 1)
      ultimaPresenza.set(p.userId, i)
      perSettimana.set(wk(p.userId, d), (perSettimana.get(wk(p.userId, d)) ?? 0) + 1)
      if (p.sectorId != null) settoriCoperti.add(p.sectorId)
    }

    // Il presidio si copre per primo, così la capienza necessaria è riservata.
    // È l'unico caso in cui la quota individuale può essere superata: un settore
    // scoperto è una violazione, una quota superata è solo uno squilibrio.
    for (const s of presidioSettori) {
      if (capienzaResidua <= 0) break
      if (settoriCoperti.has(s)) continue
      const disponibili = ordinate
        .filter((p) => p.sectorId === s && collocabile(p))
        .sort((a, b) => {
          const da = (quote.get(b.userId) ?? 0) - conteggio.get(b.userId)!
          const db = (quote.get(a.userId) ?? 0) - conteggio.get(a.userId)!
          return da - db || a.cognome.localeCompare(b.cognome, 'it') || a.userId - b.userId
        })
      if (disponibili[0]) metti(disponibili[0])
    }

    const candidati = ordinate.filter((p) =>
      disponibile(p.userId, d) &&
      conteggio.get(p.userId)! < (quote.get(p.userId) ?? 0) &&
      (perSettimana.get(wk(p.userId, d)) ?? 0) < maxSett,
    )

    const wd = weekday(d)
    // Il punteggio si calcola una volta per giornata e si ordina una volta sola.
    // Il termine di presidio non compare qui: i settori scoperti sono già stati
    // serviti sopra, quindi durante il riempimento l'ordine non cambia più.
    // Riordinare a ogni posto assegnato costava O(posti · n log n) per giornata.
    const punteggi = new Map<number, number>()
    for (const p of candidati) {
      const restanti = (quote.get(p.userId) ?? 0) - conteggio.get(p.userId)!
      const urgenza = restanti / Math.max(1, giorni.length - i)
      const ultimo = ultimaPresenza.get(p.userId)
      const ritardo = ultimo === undefined ? 1.5 : Math.min(3, (i - ultimo) / (passo.get(p.userId) || 1))
      const pref = p.giorniPreferiti.includes(wd) ? 0.15 : p.giorniDaEvitare.includes(wd) ? -0.25 : 0
      punteggi.set(p.userId, urgenza * 2 + ritardo * 0.5 + pref)
    }

    const inOrdine = candidati.slice().sort((a, b) => {
      const diff = (punteggi.get(b.userId) ?? 0) - (punteggi.get(a.userId) ?? 0)
      if (Math.abs(diff) > 1e-9) return diff
      return a.cognome.localeCompare(b.cognome, 'it') || a.userId - b.userId
    })

    for (const p of inOrdine) {
      if (capienzaResidua <= 0) break
      if (scelte.has(key(p.userId, d))) continue   // già collocata dal presidio
      metti(p)
    }

    for (const p of ordinate) if (!scelte.has(key(p.userId, d))) scelte.set(key(p.userId, d), 'smart')
  }

  // ── Stanze: riempite nell'ordine dichiarato ──────────────────────
  const assegnazioni: GenerateResult['assegnazioni'] = []
  const presidiScoperti: GenerateResult['presidiScoperti'] = []

  for (const d of giorni) {
    const presenti = ordinate.filter((p) => scelte.get(key(p.userId, d)) === 'presenza')
    const residua = new Map(stanze.map((r) => [r.roomId, r.capienza]))

    for (const p of presenti) {
      const rid = fissata.get(key(p.userId, d))?.roomId
      if (rid == null) continue
      residua.set(rid, (residua.get(rid) ?? 0) - 1)
      assegnazioni.push({ userId: p.userId, data: d, stato: 'presenza', roomId: rid })
    }
    for (const p of presenti) {
      if (fissata.get(key(p.userId, d))?.roomId != null) continue
      const stanza = stanze.find((r) => (residua.get(r.roomId) ?? 0) > 0)
      if (stanza) residua.set(stanza.roomId, residua.get(stanza.roomId)! - 1)
      assegnazioni.push({ userId: p.userId, data: d, stato: 'presenza', roomId: stanza?.roomId ?? null })
    }
    for (const p of ordinate) {
      if (scelte.get(key(p.userId, d)) === 'smart') {
        assegnazioni.push({ userId: p.userId, data: d, stato: 'smart', roomId: null })
      }
    }

    const coperti = new Set(presenti.map((p) => p.sectorId).filter((s): s is number => s != null))
    for (const s of presidioSettori) if (!coperti.has(s)) presidiScoperti.push({ sectorId: s, data: d })
  }

  const sottoQuota = ordinate
    .filter((p) => conteggio.get(p.userId)! < (quote.get(p.userId) ?? 0))
    .map((p) => ({
      userId: p.userId,
      mancanti: (quote.get(p.userId) ?? 0) - conteggio.get(p.userId)!,
      motivo: 'Giornate disponibili insufficienti: assenze, regole ricorrenti o limiti settimanali.',
    }))

  assegnazioni.sort((a, b) => a.data.localeCompare(b.data) || a.userId - b.userId)

  return {
    assegnazioni,
    quote: ordinate.map((p) => ({
      userId: p.userId,
      quota: quote.get(p.userId) ?? 0,
      assegnate: conteggio.get(p.userId)!,
    })),
    sottoQuota,
    presidiScoperti,
  }
}
