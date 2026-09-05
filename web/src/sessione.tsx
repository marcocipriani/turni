import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { api, ErroreApi, type Utente } from './api'

type Stato = { utente: Utente | null; caricamento: boolean }
type Contesto = Stato & {
  entra: (email: string, password: string) => Promise<void>
  esci: () => Promise<void>
  ricarica: () => Promise<void>
}

const Sessione = createContext<Contesto | null>(null)

export function ProvvedimentoSessione({ children }: { children: ReactNode }) {
  const [stato, setStato] = useState<Stato>({ utente: null, caricamento: true })

  const ricarica = useCallback(async () => {
    try {
      setStato({ utente: await api.get<Utente>('/auth/me'), caricamento: false })
    } catch (e) {
      if (e instanceof ErroreApi && e.stato === 401) setStato({ utente: null, caricamento: false })
      else setStato({ utente: null, caricamento: false })
    }
  }, [])

  useEffect(() => { void ricarica() }, [ricarica])

  const entra = useCallback(async (email: string, password: string) => {
    await api.post('/auth/login', { email, password })
    await ricarica()
  }, [ricarica])

  const esci = useCallback(async () => {
    await api.post('/auth/logout')
    setStato({ utente: null, caricamento: false })
  }, [])

  return <Sessione.Provider value={{ ...stato, entra, esci, ricarica }}>{children}</Sessione.Provider>
}

export function useSessione() {
  const c = useContext(Sessione)
  if (!c) throw new Error('useSessione fuori dal provider')
  return c
}

/** Unità in cui l'utente è programmato: la propria, o quella del padre se dirigente. */
export function useUnitaDiLavoro(): number | null {
  const { utente } = useSessione()
  return utente?.unitId ?? null
}

export function puoProgrammare(u: Utente | null, unitId: number | null): boolean {
  if (!u || unitId == null) return false
  if (u.ruolo === 'dirigente' && u.unitId === unitId) return true
  return u.organizzatoreDi.includes(unitId)
}
