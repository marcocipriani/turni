/**
 * Come si divide una giornata fra chi è in sede, chi lavora da remoto e chi
 * manca.
 *
 * La regola delicata sta qui dentro, in tre righe: l'assenza dichiarata vince
 * sulla cella, e l'insieme delle assenze che arriva è già stato filtrato da
 * chi chiama con `puoVedereCausale`. Chi non ha titolo a vedere l'assenza di
 * un collega riceve una mappa che quel collega non contiene, e se lo ritrova
 * fra i remoti — che è esattamente ciò che vede in griglia.
 *
 * Non decide niente sui permessi: li applica chi la chiama, una volta sola.
 */

export type Anagrafica = {
  id: number; nome: string; cognome: string
  unitId: number | null; sectorId: number | null
}
export type CellaGiorno = {
  userId: number
  stato: 'presenza' | 'smart'
  roomId: number | null
  deskId: number | null
}
export type Chi = {
  userId: number; nome: string; cognome: string
  unitId: number | null; sectorId: number | null
}
export type Presente = Chi & { roomId: number | null; scrivania: string | null }

export function dividiGiornata(
  data: string,
  celle: CellaGiorno[],
  perPersona: Map<number, Anagrafica>,
  /** Chiavi `userId|data` delle assenze che chi guarda ha titolo di vedere. */
  assenze: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  numeroScrivania: Map<number, string>,
): { presenti: Presente[]; remoti: Chi[]; assenti: Chi[] } {
  const presenti: Presente[] = [], remoti: Chi[] = [], assenti: Chi[] = []

  for (const x of celle) {
    const p = perPersona.get(x.userId)
    // Una cella di chi non è più in forza non racconta niente a nessuno.
    if (!p) continue
    const chi: Chi = {
      userId: x.userId, nome: p.nome, cognome: p.cognome, unitId: p.unitId, sectorId: p.sectorId,
    }
    if (assenze.has(`${x.userId}|${data}`)) assenti.push(chi)
    else if (x.stato === 'presenza') {
      presenti.push({
        ...chi,
        roomId: x.roomId,
        scrivania: x.deskId != null ? numeroScrivania.get(x.deskId) ?? null : null,
      })
    } else remoti.push(chi)
  }

  const perCognome = (a: Chi, b: Chi) => a.cognome.localeCompare(b.cognome, 'it') || a.userId - b.userId
  return {
    presenti: presenti.sort(perCognome),
    remoti: remoti.sort(perCognome),
    assenti: assenti.sort(perCognome),
  }
}
