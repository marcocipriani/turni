export class ErroreApi extends Error {
  constructor(public stato: number, messaggio: string) { super(messaggio) }
}

async function richiesta<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
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
  return r.status === 204 ? (undefined as T) : r.json()
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
}

export type Unita = {
  id: number; parentId: number | null; nome: string; sigla: string | null
  smartMinSettimana: number | null; smartMaxSettimana: number | null
}

export type Persona = {
  id: number; nome: string; cognome: string; ruolo: 'dirigente' | 'dipendente'
  unitId: number; sectorId: number | null; comeDirigenteDi: number | null
}

export type Settore = { id: number; unitId: number; nome: string; richiedePresidio: boolean; ordine: number }
export type Scrivania = { id: number; roomId: number; numero: string; attiva: boolean }
export type StanzaVista = { id: number; etichetta: string; piano: string | null; capienza: number; scrivanie: Scrivania[] }

export type Periodo = {
  id: number; unitId: number; dataInizio: string; dataFine: string
  stato: 'bozza' | 'in_approvazione' | 'pubblicato'
  versione: number; assegnaScrivanie: boolean
  smartMinSettimana: number | null; smartMaxSettimana: number | null
  notaApprovazione: string | null; pubblicatoIl: string | null
}

export type Cella = {
  userId: number; data: string
  stato: 'presenza' | 'smart' | 'assenza'
  roomId: number | null; deskId: number | null; bloccata: boolean; causale: string | null
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
