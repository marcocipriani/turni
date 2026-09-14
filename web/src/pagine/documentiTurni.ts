/**
 * Il documento dietro la carta e le immagini: chi va in che gruppo, quanti
 * posti sono presi, quale segno ha una cella, quali card ha una giornata.
 * Puro, così stampa e PNG dicono la stessa cosa e lo si prova senza DOM.
 */
import type { Cella, Griglia, Persona } from '../api'
import { pezziData } from '../date'
import type { Giorno, Stanza } from './Giorni'

export type GruppoDocumento = { titolo: string | null; persone: Persona[] }
export type OccupazioneDocumento = {
  /** data → postazioni occupate */
  totali: Map<string, number>
  /** `data|roomId` → persone nella stanza */
  stanze: Map<string, number>
  /** userId → giornate in sede */
  persone: Map<number, number>
}
export type SchedaGiorno = {
  chiave: string
  titolo: string
  contatore: string
  persone: { userId: number; nome: string; settore: string | null; scrivania: string | null }[]
}

/** Gli stessi blocchi della griglia a video, nello stesso ordine. */
export function gruppiDocumento(dati: Griglia, raggruppa: boolean): GruppoDocumento[] {
  if (!raggruppa) return [{ titolo: null, persone: dati.persone }]
  const out: GruppoDocumento[] = dati.settori
    .map((s) => ({ titolo: s.nome, persone: dati.persone.filter((p) => p.sectorId === s.id) }))
    .filter((g) => g.persone.length)
  const senza = dati.persone.filter((p) => !dati.settori.some((s) => s.id === p.sectorId))
  if (senza.length) out.push({ titolo: 'Senza settore', persone: senza })
  return out
}

export function occupazioneDocumento(dati: Pick<Griglia, 'celle'>): OccupazioneDocumento {
  const totali = new Map<string, number>(), stanze = new Map<string, number>(), persone = new Map<number, number>()
  for (const c of dati.celle) {
    if (c.stato !== 'presenza') continue
    totali.set(c.data, (totali.get(c.data) ?? 0) + 1)
    persone.set(c.userId, (persone.get(c.userId) ?? 0) + 1)
    if (c.roomId == null) continue
    const k = `${c.data}|${c.roomId}`
    stanze.set(k, (stanze.get(k) ?? 0) + 1)
  }
  return { totali, stanze, persone }
}

/**
 * Le stanze sotto il titolo, con la media dei posti occupati sulle giornate
 * programmate: il dettaglio giorno per giorno sta nel foglio delle stanze.
 */
export function elencoStanze(dati: Pick<Griglia, 'stanze' | 'celle'>, occupazione = occupazioneDocumento(dati)): string[] {
  const giornate = new Set(dati.celle.map((c) => c.data))
  return dati.stanze.filter((s) => s.capienza > 0).map((s) => {
    let somma = 0
    for (const g of giornate) somma += occupazione.stanze.get(`${g}|${s.id}`) ?? 0
    const media = giornate.size ? Math.round((somma / giornate.size) * 10) / 10 : 0
    return [
      s.etichetta, s.soprannome, s.piano, `${s.capienza} ${s.capienza === 1 ? 'posto' : 'posti'}`,
      `media ${media.toLocaleString('it-IT')}/${s.capienza}`,
    ].filter(Boolean).join(' · ')
  })
}

/**
 * Sulla carta l'assenza è una croce sola: chi l'ha registrata conta a video,
 * dove la si può togliere, non su un foglio in bacheca.
 */
export function simboloStampa(
  c: Pick<Cella, 'stato'> & Partial<Pick<Cella, 'roomId' | 'perConto'>> | undefined,
  stanze: { id: number; etichetta: string }[] = [],
): string {
  if (!c) return '·'
  if (c.stato === 'smart') return 'casa'
  if (c.stato === 'assenza') return '×'
  return stanze.find((s) => s.id === c.roomId)?.etichetta ?? '•'
}

/** Il lunedì apre la settimana; la prima colonna ha già il suo bordo. */
export const classeSettimana = (data: string, indice: number) =>
  indice > 0 && pezziData(data).lunedi ? 'inizio-settimana' : ''

/** Ogni stanza condivisa, anche vuota, poi chi è da remoto e chi manca. */
export function schedeGiorno(giorno: Giorno, stanze: Stanza[], settori: { id: number; nome: string }[]): SchedaGiorno[] {
  const settore = new Map(settori.map((s) => [s.id, s.nome]))
  const voce = (p: Giorno['remoti'][number] & { scrivania?: string | null }) => ({
    userId: p.userId, nome: `${p.cognome} ${p.nome}`,
    settore: p.sectorId != null ? settore.get(p.sectorId) ?? null : null,
    scrivania: p.scrivania ?? null,
  })
  const note = new Set(stanze.map((s) => s.id))
  const senza = giorno.presenti.filter((p) => p.roomId == null || !note.has(p.roomId))
  return [
    ...stanze.map((s) => {
      const dentro = giorno.presenti.filter((p) => p.roomId === s.id)
      return { chiave: `stanza-${s.id}`, titolo: s.etichetta, contatore: `${dentro.length}/${s.capienza}`, persone: dentro.map(voce) }
    }),
    ...(senza.length ? [{ chiave: 'senza-stanza', titolo: 'Senza stanza', contatore: String(senza.length), persone: senza.map(voce) }] : []),
    { chiave: 'smart', titolo: 'Smart working', contatore: String(giorno.remoti.length), persone: giorno.remoti.map(voce) },
    { chiave: 'assenti', titolo: 'Assenti', contatore: String(giorno.assenti.length), persone: giorno.assenti.map(voce) },
  ]
}
