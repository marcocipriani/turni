export type Ruolo = 'admin' | 'dirigente' | 'dipendente'

export type Attore = {
  id: number
  ruolo: Ruolo
  unitId: number | null
  /** Unità in cui l'utente è stato delegato come organizzatore. */
  organizzatoreDi: number[]
}

/** id unità → id del padre (null se radice). L'albero è piccolo: si tiene in memoria. */
export type Albero = Map<number, number | null>

export function padre(albero: Albero, unitId: number): number | null {
  return albero.get(unitId) ?? null
}

export function radice(albero: Albero, unitId: number): number {
  let corrente = unitId
  for (let i = 0; i < 64; i++) {
    const p = albero.get(corrente)
    if (p == null) return corrente
    corrente = p
  }
  return corrente   // ciclo nei dati: si ferma invece di girare all'infinito
}

/** Tutte le unità del sottoalbero, l'unità stessa inclusa. */
export function sottoalbero(albero: Albero, unitId: number): Set<number> {
  const figli = new Map<number, number[]>()
  for (const [id, p] of albero) {
    if (p == null) continue
    if (!figli.has(p)) figli.set(p, [])
    figli.get(p)!.push(id)
  }
  const out = new Set<number>()
  const coda = [unitId]
  while (coda.length) {
    const u = coda.pop()!
    if (out.has(u)) continue
    out.add(u)
    for (const f of figli.get(u) ?? []) coda.push(f)
  }
  return out
}

/**
 * Unità in cui una persona compare nella griglia.
 * Il dipendente nella propria; il dirigente in quella del padre, perché nell'unità
 * superiore siede lui al posto dell'intera unità che comanda.
 */
export function unitaDiProgrammazione(albero: Albero, ruolo: Ruolo, unitId: number | null): number | null {
  if (unitId == null) return null
  if (ruolo !== 'dirigente') return unitId
  return padre(albero, unitId) ?? unitId
}

/** Il dirigente vede in lettura tutto il proprio sottoalbero. */
export function puoLeggereUnita(albero: Albero, a: Attore, unitId: number): boolean {
  if (a.ruolo === 'admin') return false        // l'amministratore non vede programmazioni
  if (a.ruolo === 'dirigente' && a.unitId != null) {
    if (sottoalbero(albero, a.unitId).has(unitId)) return true
    // Il dirigente è programmato nell'unità del padre: deve poterla leggere.
    if (unitaDiProgrammazione(albero, 'dirigente', a.unitId) === unitId) return true
    return false
  }
  return unitaDiProgrammazione(albero, a.ruolo, a.unitId) === unitId
}

/** Costruisce la programmazione: il dirigente dell'unità o un suo delegato. */
export function puoProgrammare(a: Attore, unitId: number): boolean {
  if (a.ruolo === 'dirigente' && a.unitId === unitId) return true
  return a.organizzatoreDi.includes(unitId)
}

/** Approva e pubblica: solo il dirigente dell'unità. */
export function puoApprovare(a: Attore, unitId: number): boolean {
  return a.ruolo === 'dirigente' && a.unitId === unitId
}

/**
 * Chi registra un'assenza per qualcun altro: chi programma l'unità in cui
 * quella persona è programmata. È lo stesso perimetro in cui vede la causale,
 * quindi registrarla non gli rivela niente che non sapesse già.
 */
export function puoRegistrareAssenzaPer(
  albero: Albero, a: Attore, interessato: { id: number; ruolo: Ruolo; unitId: number | null },
): boolean {
  if (a.id === interessato.id) return true
  const uid = unitaDiProgrammazione(albero, interessato.ruolo, interessato.unitId)
  return uid != null && puoProgrammare(a, uid)
}

/** Anagrafiche dell'unità: settori, unità figlie, deleghe, assegnazione persone. */
export function puoAmministrareUnita(a: Attore, unitId: number): boolean {
  return a.ruolo === 'dirigente' && a.unitId === unitId
}

/**
 * Chi vede la causale di un'assenza: l'interessato, gli organizzatori della sua
 * unità di programmazione, e il dirigente di qualunque unità che la contenga.
 */
export function puoVedereCausale(albero: Albero, a: Attore, interessato: { id: number; unitId: number | null; ruolo?: 'admin' | 'dirigente' | 'dipendente' }): boolean {
  if (a.id === interessato.id) return true
  if (a.ruolo === 'admin') return false
  if (interessato.unitId == null) return false
  const programmata = unitaDiProgrammazione(albero, interessato.ruolo ?? 'dipendente', interessato.unitId)
  if (programmata != null && a.organizzatoreDi.includes(programmata)) return true
  if (a.ruolo === 'dirigente' && a.unitId != null) return sottoalbero(albero, a.unitId).has(interessato.unitId)
  return false
}

export type CellaGriglia = {
  userId: number
  data: string
  stato: 'presenza' | 'smart' | 'assenza'
  roomId: number | null
  deskId: number | null
  bloccata: boolean
  /** La cella nasce da uno scambio fra colleghi, non dalla generazione. */
  daScambio?: boolean
  causale: string | null
  /** Assenza registrata da chi programma, non dall'interessato. */
  perConto?: boolean
  /** Serve a toglierla dalla griglia; solo a chi può farlo. */
  assenzaId?: number | null
}

/**
 * Unico punto in cui si decide chi vede cosa. Per un collega, assenza e lavoro
 * agile sono la stessa cosa: "fuori sede". Nessuna causale lascia questa funzione
 * se il richiedente non ha titolo per vederla.
 */
export function mascheraCella(
  albero: Albero,
  a: Attore,
  cella: CellaGriglia,
  interessato: { id: number; unitId: number | null; ruolo?: 'admin' | 'dirigente' | 'dipendente' },
): CellaGriglia {
  if (puoVedereCausale(albero, a, interessato)) return cella
  return {
    ...cella,
    stato: cella.stato === 'assenza' ? 'smart' : cella.stato,
    causale: null,
    perConto: false,
    assenzaId: null,
  }
}
