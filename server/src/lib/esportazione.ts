/**
 * Scarico delle tabelle in CSV.
 *
 * Le colonne sono le stesse che il caricamento sa rileggere: un file esportato
 * si ricarica com'è, ed è il modo più onesto di documentare un formato. Fa
 * eccezione l'organigramma, che si esporta per leggerlo — le unità nascono con
 * il loro dirigente, non da un foglio.
 */
import { asc } from 'drizzle-orm'
import { db, schema } from '../db/index'

export const SEZIONI = ['unita', 'persone', 'settori', 'stanze', 'causali', 'giornate'] as const
export type Sezione = (typeof SEZIONI)[number]

/**
 * Il formato non conosce virgolette (vedi lib/csv.ts): un punto e virgola
 * dentro una cella spezzerebbe la riga a chi la rilegge, e diventa una virgola.
 * Meglio un carattere cambiato che un file che non torna dentro.
 */
function cella(v: unknown) {
  const pulita = v == null ? '' : String(v).replace(/[;\r\n]+/g, ',').trim()
  // Un valore che comincia per = + - @ è una formula per il foglio di calcolo
  // che aprirà il file, e i nomi qui dentro li scrivono gli utenti. Uno spazio
  // davanti lo rende testo, e chi rilegge il file lo toglie: il giro torna.
  return /^[=+\-@]/.test(pulita) ? ` ${pulita}` : pulita
}

const foglio = (intestazione: string[], righe: unknown[][]) =>
  [intestazione.join(';'), ...righe.map((r) => r.map(cella).join(';'))].join('\n') + '\n'

const perNome = <T extends { id: number }>(righe: T[]) => new Map(righe.map((r) => [r.id, r]))

export async function esporta(sezione: Sezione): Promise<string> {
  const unita = perNome(await db.select().from(schema.unit).orderBy(asc(schema.unit.nome)))
  const nomeUnita = (id: number | null) => (id == null ? '' : unita.get(id)?.nome ?? '')

  if (sezione === 'unita') {
    const utenti = await db.select().from(schema.user)
    const capi = new Map(utenti.filter((u) => u.ruolo === 'dirigente' && u.unitId != null)
      .map((u) => [u.unitId!, `${u.cognome} ${u.nome}`]))
    const quante = new Map<number, number>()
    for (const u of utenti) {
      if (u.unitId == null || u.ruolo === 'admin' || !u.attivo) continue
      quante.set(u.unitId, (quante.get(u.unitId) ?? 0) + 1)
    }
    return foglio(['unita', 'sigla', 'unitaPadre', 'dirigente', 'persone'],
      [...unita.values()].map((u) =>
        [u.nome, u.sigla, nomeUnita(u.parentId), capi.get(u.id) ?? '', quante.get(u.id) ?? 0]))
  }

  if (sezione === 'persone') {
    const utenti = await db.select().from(schema.user)
      .orderBy(asc(schema.user.cognome), asc(schema.user.nome))
    const settori = perNome(await db.select().from(schema.sector))
    const deleghe = new Set((await db.select().from(schema.organizer))
      .map((o) => `${o.userId}|${o.unitId}`))
    return foglio(
      ['persona', 'ruolo', 'unita', 'sigla', 'unitaPadre', 'settore', 'presidio', 'organizzatore', 'email'],
      utenti.map((u) => {
        const s = u.sectorId == null ? null : settori.get(u.sectorId)
        const mia = u.unitId == null ? null : unita.get(u.unitId)
        return [
          `${u.cognome} ${u.nome}`, u.ruolo, mia?.nome ?? '', mia?.sigla ?? '',
          nomeUnita(mia?.parentId ?? null), s?.nome ?? '', s?.richiedePresidio ? 'si' : '',
          deleghe.has(`${u.id}|${u.unitId}`) ? 'si' : '', u.email,
        ]
      }))
  }

  if (sezione === 'settori') {
    const righe = await db.select().from(schema.sector).orderBy(asc(schema.sector.ordine))
    return foglio(['settore', 'unita', 'presidio', 'ordine'],
      righe.map((s) => [s.nome, nomeUnita(s.unitId), s.richiedePresidio ? 'si' : '', s.ordine]))
  }

  if (sezione === 'stanze') {
    const righe = await db.select().from(schema.room).orderBy(asc(schema.room.etichetta))
    const scrivanie = await db.select().from(schema.desk)
    const perStanza = new Map<number, string[]>()
    for (const d of scrivanie) perStanza.set(d.roomId, [...(perStanza.get(d.roomId) ?? []), d.numero])
    // «10» viene dopo «2», non prima: l'ordinamento del database è alfabetico,
    // e su una numerazione di scrivanie non è quello che serve.
    const numerico = new Intl.Collator('it', { numeric: true })
    for (const l of perStanza.values()) l.sort(numerico.compare)
    return foglio(['stanza', 'piano', 'scrivanie', 'unita'],
      righe.map((r) => [r.etichetta, r.piano, (perStanza.get(r.id) ?? []).join(','), nomeUnita(r.unitId)]))
  }

  if (sezione === 'causali') {
    const righe = await db.select().from(schema.absenceReason).orderBy(asc(schema.absenceReason.ordine))
    return foglio(['codice', 'etichetta', 'attiva', 'ordine'],
      righe.map((c) => [c.codice, c.etichetta, c.attiva ? 'si' : 'no', c.ordine]))
  }

  const righe = await db.select().from(schema.holiday).orderBy(asc(schema.holiday.data))
  return foglio(['data', 'descrizione', 'unita'],
    righe.map((h) => [h.data, h.descrizione, nomeUnita(h.unitId)]))
}
