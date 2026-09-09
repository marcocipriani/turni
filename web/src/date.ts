/**
 * Le date, dette in un posto solo.
 *
 * `pezziData` e `addDays` erano nati tre volte — elenco, griglia, stampa — con
 * tre firme leggermente diverse. Tutto quello che qui dentro ha una data la
 * tratta come una giornata di calendario, non come un istante: si legge in UTC
 * e non si sposta col fuso di chi guarda. Gli istanti veri (una pubblicazione)
 * non passano da qui.
 */

const BREVI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const MESI_INTERI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export const oggiISO = () => new Date().toISOString().slice(0, 10)

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Giorno della settimana, 0 = lunedì. La settimana qui comincia di lunedì. */
const indiceGiorno = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7

/**
 * Il lunedì della settimana di una data. Le finestre partono di lunedì: due
 * settimane che cominciano di mercoledì non si confrontano con niente, e le
 * frecce avanti e indietro finirebbero per scavalcare mezze settimane.
 */
export const lunediDi = (iso: string) => addDays(iso, -indiceGiorno(iso))

export function pezziData(iso: string) {
  const [, m, d] = iso.split('-').map(Number) as [number, number, number]
  const gs = indiceGiorno(iso)
  return {
    giorno: d, mese: MESI[m - 1]!, meseNome: MESI_INTERI[m - 1]!,
    breve: BREVI[gs]!, lunedi: gs === 0,
  }
}

/** «lunedì 7 settembre 2026»: per la carta, dove lo spazio c'è. */
export const esteso = (iso: string) => new Date(`${iso}T00:00:00Z`)
  .toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Numero di settimana ISO 8601, quello che si usa negli uffici.
 *
 * La regola ISO è che la settimana appartiene all'anno del suo giovedì: è
 * l'unico modo per cui il capodanno non produce una «settimana 53» seguita da
 * una «settimana 1» lunga tre giorni. Si scivola al giovedì della settimana
 * data e lo si conta a partire dal primo giovedì dell'anno.
 */
export function settimanaIso(iso: string): number {
  const giovedi = new Date(`${addDays(lunediDi(iso), 3)}T00:00:00Z`)
  const primoGiovedi = new Date(`${addDays(lunediDi(`${giovedi.getUTCFullYear()}-01-04`), 3)}T00:00:00Z`)
  return 1 + Math.round((giovedi.getTime() - primoGiovedi.getTime()) / (7 * 86400000))
}

/**
 * «Settimana 37 · 7 – 13 settembre». Il mese si ripete solo quando la
 * settimana lo scavalca: «29 settembre – 4 ottobre», non «29 settembre –
 * 4 ottobre» quando basterebbe «29 – 30 settembre».
 */
export function descriviSettimana(iso: string): string {
  const da = lunediDi(iso), a = addDays(da, 6)
  const p = pezziData(da), q = pezziData(a)
  const intervallo = p.meseNome === q.meseNome
    ? `${p.giorno} – ${q.giorno} ${q.meseNome}`
    : `${p.giorno} ${p.meseNome} – ${q.giorno} ${q.meseNome}`
  return `Settimana ${settimanaIso(iso)} · ${intervallo}`
}
