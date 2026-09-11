export class ErroreApi extends Error {
  constructor(public stato: number, messaggio: string) { super(messaggio) }
}

async function grezza(metodo: string, percorso: string, corpo?: unknown): Promise<Response> {
  const r = await fetch(`/api${percorso}`, {
    method: metodo,
    credentials: 'include',
    headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  if (!r.ok) {
    const dati = await r.json().catch(() => ({ errore: r.statusText }))
    throw new ErroreApi(r.status, dati.errore ?? 'Errore imprevisto')
  }
  return r
}

async function richiesta<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
  const r = await grezza(metodo, percorso, corpo)
  return r.status === 204 ? (undefined as T) : r.json()
}

/**
 * Come `get`, ma dice anche se la risposta è quella conservata dal service
 * worker e di quando è. Serve alle sole schermate che si possono guardare
 * senza rete: mostrare dati vecchi senza dirlo sarebbe peggio che non
 * mostrarli.
 */
export async function getConEta<T>(percorso: string): Promise<{ dati: T; copiaDel: Date | null }> {
  const r = await grezza('GET', percorso)
  const marca = r.headers.get('x-turni-copia')
  return { dati: await r.json() as T, copiaDel: marca ? new Date(marca) : null }
}

/** Svuota i dati conservati offline: si chiama uscendo. */
export async function dimenticaDatiOffline() {
  if (!('caches' in globalThis)) return
  for (const nome of await caches.keys()) if (nome.startsWith('turni-dati')) await caches.delete(nome)
}

export const api = {
  get: <T,>(p: string) => richiesta<T>('GET', p),
  post: <T,>(p: string, c?: unknown) => richiesta<T>('POST', p, c ?? {}),
  put: <T,>(p: string, c?: unknown) => richiesta<T>('PUT', p, c ?? {}),
  patch: <T,>(p: string, c?: unknown) => richiesta<T>('PATCH', p, c ?? {}),
  del: <T,>(p: string) => richiesta<T>('DELETE', p),
}

/* ── Forme dei dati scambiati con l'API ─────────────────────────── */

export type Utente = {
  id: number; email: string; nome: string; cognome: string
  ruolo: 'admin' | 'dirigente' | 'dipendente'
  unitId: number | null; sectorId: number | null; unitNome: string | null
  passwordDaCambiare: boolean; organizzatoreDi: number[]
  preferenze: { vistaTurni: 'giorni' | 'griglia'; filtriMio: ('presenza' | 'smart' | 'assenza')[] }
}

export type Unita = {
  id: number; parentId: number | null; nome: string; sigla: string | null
  smartMinSettimana: number | null; smartMaxSettimana: number | null
  scambioAttivo: boolean; scambioOraLimite: string
}

export type Persona = {
  id: number; nome: string; cognome: string; ruolo: 'dirigente' | 'dipendente'
  unitId: number; sectorId: number | null; comeDirigenteDi: number | null
}

export type Settore = { id: number; unitId: number; nome: string; richiedePresidio: boolean; ordine: number }
export type Scrivania = { id: number; roomId: number; numero: string; attiva: boolean }
export type StanzaVista = {
  id: number; etichetta: string; soprannome: string | null; piano: string | null
  sede: string | null
  /** Ufficio di una persona sola: fuori dalla capienza condivisa. */
  riservataA: number | null
  attiva: boolean; capienza: number; scrivanie: Scrivania[]
}

export type Periodo = {
  id: number; unitId: number; dataInizio: string; dataFine: string
  stato: 'bozza' | 'in_approvazione' | 'pubblicato'
  versione: number; assegnaScrivanie: boolean
  smartMinSettimana: number | null; smartMaxSettimana: number | null
  notaApprovazione: string | null
  /** Prima pubblicazione: non cambia più. */
  pubblicatoIl: string | null
  /** Ultima pubblicazione, cioè la data della versione in corso. */
  aggiornatoIl: string | null
}

export type Cella = {
  userId: number; data: string
  stato: 'presenza' | 'smart' | 'assenza'
  roomId: number | null; deskId: number | null; bloccata: boolean
  /** Nata da uno scambio fra colleghi: la generazione non l'ha decisa. */
  daScambio?: boolean
  causale: string | null
}

export type Griglia = {
  periodo: Periodo; giorni: string[]; persone: Persona[]; settori: Settore[]
  stanze: StanzaVista[]; celle: Cella[]
  permessi: { scrivere: boolean; approvare: boolean }
  avvisi: { gravita: 'errore' | 'attenzione'; messaggio: string; data?: string }[]
}

export type Notifica = {
  id: number; tipo: string; titolo: string; corpo: string
  link: string | null; lettaIl: string | null; creatoIl: string
}
