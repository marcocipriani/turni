/**
 * Cosa è cambiato fra due versioni di una programmazione.
 *
 * Le istantanee conservano le righe di `assignment` così come sono: presenza o
 * lavoro da remoto, e la stanza. L'assenza non ci finisce mai — non è un dato
 * della programmazione ma una sovrapposizione letta al momento dalla tabella
 * delle assenze — quindi da un confronto fra istantanee non può uscire nessuna
 * causale. Non è una precauzione dell'interfaccia: è il formato che non
 * contiene l'informazione.
 */

export type CellaVersione = {
  userId: number
  data: string
  stato: 'presenza' | 'smart'
  roomId: number | null
}

export type Cambiamento = {
  userId: number
  data: string
  /** `null` quando la giornata non esisteva ancora, o non c'è più. */
  prima: 'presenza' | 'smart' | null
  dopo: 'presenza' | 'smart' | null
  stanzaPrima: number | null
  stanzaDopo: number | null
}

/**
 * Le celle di un'istantanea, comunque le restituisca il driver.
 *
 * MariaDB non ha un tipo JSON nativo: la colonna è un LONGTEXT, e `mysql2` la
 * riconsegna come stringa invece che come array. Su MySQL 8 arriva già
 * decodificata. Chi legge un'istantanea passa di qui e non deve saperlo — è la
 * differenza fra un elenco di persone da avvisare e un `for…of` che scorre i
 * caratteri di una stringa senza lamentarsi.
 */
export function celleIstantanea(valore: unknown): CellaVersione[] {
  if (Array.isArray(valore)) return valore as CellaVersione[]
  if (typeof valore !== 'string' || valore.trim() === '') return []
  try {
    const letto: unknown = JSON.parse(valore)
    return Array.isArray(letto) ? letto as CellaVersione[] : []
  } catch {
    // Un'istantanea illeggibile non deve impedire una pubblicazione: si perde
    // il confronto, e nel dubbio si avvisano tutti.
    return []
  }
}

const chiave = (c: { userId: number; data: string }) => `${c.userId}|${c.data}`

/**
 * Le sole giornate che sono cambiate, in ordine di data e poi di persona.
 *
 * Cambia una giornata se cambia lo stato, oppure se resta in sede e cambia la
 * stanza: spostare qualcuno di stanza è una modifica che lo riguarda, e
 * tacerla renderebbe l'elenco inutile proprio a chi deve sapere dove andare.
 * Il numero di scrivania no: si assegna solo dove l'unità lo usa, e cambia da
 * sé a ogni rigenerazione.
 */
export function confronta(prima: CellaVersione[], dopo: CellaVersione[]): Cambiamento[] {
  const primaPerChiave = new Map(prima.map((c) => [chiave(c), c]))
  const dopoPerChiave = new Map(dopo.map((c) => [chiave(c), c]))

  const cambiamenti: Cambiamento[] = []
  for (const k of new Set([...primaPerChiave.keys(), ...dopoPerChiave.keys()])) {
    const a = primaPerChiave.get(k), b = dopoPerChiave.get(k)
    const statoUguale = (a?.stato ?? null) === (b?.stato ?? null)
    // La stanza conta solo fra due presenze: da remoto non ce n'è una, e
    // confrontare `null` con la stanza di ieri segnalerebbe due volte lo
    // stesso cambiamento di stato.
    const stanzaUguale = a?.stato !== 'presenza' || b?.stato !== 'presenza'
      || (a.roomId ?? null) === (b.roomId ?? null)
    if (statoUguale && stanzaUguale) continue

    cambiamenti.push({
      userId: (a ?? b)!.userId,
      data: (a ?? b)!.data,
      prima: a?.stato ?? null,
      dopo: b?.stato ?? null,
      stanzaPrima: a?.stato === 'presenza' ? a.roomId ?? null : null,
      stanzaDopo: b?.stato === 'presenza' ? b.roomId ?? null : null,
    })
  }

  return cambiamenti.sort((x, y) => x.data.localeCompare(y.data) || x.userId - y.userId)
}

/**
 * Se una programmazione è nuova per chi la guarda.
 *
 * Il confronto è fra l'ultima pubblicazione e il segno lasciato da chi legge.
 * Chi non ha mai guardato niente ha `visto` a null, e per lui è nuova: è il
 * caso di ogni persona il giorno in cui la colonna nasce, e va bene così —
 * meglio un avviso in più che una programmazione mai aperta.
 *
 * Un periodo pubblicato senza data non è nuovo per nessuno: non sapendo quando
 * è uscito, l'avviso non si spegnerebbe mai.
 */
export function programmazioneNuova(visto: Date | null, aggiornata: Date | null): boolean {
  if (aggiornata == null) return false
  return visto == null || visto < aggiornata
}
