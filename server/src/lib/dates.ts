/** Date di calendario come stringhe `YYYY-MM-DD`: nessun fuso, nessuna sorpresa. */
export type ISODate = string

export function toISO(d: Date): ISODate {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}

/** 1 = lunedì … 7 = domenica */
export function weekday(s: ISODate): number {
  const d = fromISO(s).getUTCDay()
  return d === 0 ? 7 : d
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** Chiave della settimana, per applicare i limiti settimanali di lavoro agile. */
export function weekKey(s: ISODate): string {
  return addDays(s, -(weekday(s) - 1))
}

/** Giornate lavorative: dal lunedì al venerdì, al netto delle festività. */
export function workingDays(start: ISODate, end: ISODate, holidays: Set<ISODate>): ISODate[] {
  return eachDay(start, end).filter((d) => weekday(d) <= 5 && !holidays.has(d))
}

/** Algoritmo gregoriano anonimo. La Pasqua si calcola, non si elenca. */
export function easterSunday(year: number): ISODate {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return toISO(new Date(Date.UTC(year, month - 1, day)))
}

export function italianHolidays(year: number): { data: ISODate; descrizione: string }[] {
  const fisse: [string, string][] = [
    ['01-01', 'Capodanno'], ['01-06', 'Epifania'], ['04-25', 'Festa della Liberazione'],
    ['05-01', 'Festa del lavoro'], ['06-02', 'Festa della Repubblica'], ['08-15', 'Ferragosto'],
    ['11-01', 'Ognissanti'], ['12-08', 'Immacolata Concezione'], ['12-25', 'Natale'],
    ['12-26', 'Santo Stefano'],
  ]
  // Il 4 ottobre torna festa nazionale dal 2026, ottocentesimo anniversario
  // della morte di Francesco d'Assisi. Prima di quell'anno era una solennità
  // civile e si lavorava: caricarlo all'indietro falserebbe gli archivi.
  if (year >= 2026) fisse.push(['10-04', "San Francesco d'Assisi"])
  const out = fisse.map(([md, descrizione]) => ({ data: `${year}-${md}`, descrizione }))
  out.push({ data: addDays(easterSunday(year), 1), descrizione: "Lunedì dell'Angelo" })
  return out.sort((a, b) => a.data.localeCompare(b.data))
}
