/**
 * Chi riceve il promemoria della sera: è in sede domani, l'ha chiesto, domani
 * non ha un'assenza e oggi non l'ha già ricevuto. Pura, così la si prova senza
 * archivio; `promemoria.ts` le porta i dati.
 */
export type CellaDomani = { userId: number; roomId: number | null; deskId: number | null }

export function daAvvisare<T extends CellaDomani>(celle: T[], o: {
  data: string
  attivi: ReadonlySet<number>
  assenti: ReadonlyMap<string, unknown>
  giaAvvisati: ReadonlySet<number>
}): T[] {
  return celle.filter((c) =>
    o.attivi.has(c.userId) && !o.assenti.has(`${c.userId}|${o.data}`) && !o.giaAvvisati.has(c.userId))
}

export const testoPromemoria = (stanza: string | null, scrivania: string | null) =>
  stanza ? `Domani in sede · ${stanza}${scrivania ? `/${scrivania}` : ''}` : 'Domani in sede'

/** Il cron UTC gira due volte; solo le 18 di Roma inviano, anche al cambio d'ora. */
export function seraItaliana(adesso: Date): { oggi: string; invia: boolean } {
  const parti = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(adesso)
  const valore = (tipo: Intl.DateTimeFormatPartTypes) => parti.find((p) => p.type === tipo)!.value
  return { oggi: `${valore('year')}-${valore('month')}-${valore('day')}`, invia: valore('hour') === '18' }
}
