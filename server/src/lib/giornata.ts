/**
 * Come si divide una giornata fra chi è in sede, chi lavora da remoto e chi
 * manca.
 *
 * L'assenza dichiarata vince sulla cella. Tutte le assenze partecipano al
 * calcolo delle presenze; soltanto quelle autorizzate compaiono come tali,
 * mentre le altre diventano lavoro da remoto senza causale.
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
  /** Chiavi `userId|data` di tutte le assenze. */
  assenze: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  numeroScrivania: Map<number, string>,
  assenzeVisibili?: ReadonlySet<number>,
): { presenti: Presente[]; remoti: Chi[]; assenti: Chi[] } {
  const presenti: Presente[] = [], remoti: Chi[] = [], assenti: Chi[] = []

  for (const x of celle) {
    const p = perPersona.get(x.userId)
    // Una cella di chi non è più in forza non racconta niente a nessuno.
    if (!p) continue
    const chi: Chi = {
      userId: x.userId, nome: p.nome, cognome: p.cognome, unitId: p.unitId, sectorId: p.sectorId,
    }
    if (assenze.has(`${x.userId}|${data}`)) {
      if (!assenzeVisibili || assenzeVisibili.has(x.userId)) assenti.push(chi)
      else remoti.push(chi)
    }
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
