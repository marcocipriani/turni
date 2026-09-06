import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, type Periodo } from '../api'
import * as I from '../icone'
import { useSessione } from '../sessione'
import { Ricerca } from '../ui'

/** Sottovoci della sezione attiva. Il pannello non contiene mai comandi di I/O. */
export function PannelloContestuale() {
  const { utente } = useSessione()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [cerca, setCerca] = useState('')
  const sezione = pathname.split('/')[1] ?? 'panoramica'

  // ⌘K porta il fuoco sulla ricerca globale, come annunciato nel campo.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('[data-ricerca-globale] input')?.focus()
      }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  const destinazioni = useMemo(() => {
    const tutte = [
      { a: '/panoramica', t: 'Panoramica', s: 'panoramica' },
      { a: '/programmazione', t: 'Turni', s: 'programmazione' },
      { a: '/calendario', t: 'Il mio calendario', s: 'calendario' },
      { a: '/assenze', t: 'Assenze e preferenze', s: 'assenze' },
      { a: '/notifiche', t: 'Notifiche', s: 'notifiche' },
      ...(utente?.ruolo === 'dirigente' ? [{ a: '/organizzazione', t: 'Struttura', s: 'organizzazione' }] : []),
      ...(utente?.ruolo === 'admin' ? [{ a: '/amministrazione', t: 'Sistema', s: 'amministrazione' }] : []),
    ]
    if (!cerca.trim()) return null
    const q = cerca.toLowerCase()
    return tutte.filter((d) => d.t.toLowerCase().includes(q))
  }, [cerca, utente])

  return (
    <>
      <div data-ricerca-globale>
        <Ricerca valore={cerca} onCambia={setCerca} segnaposto="Cerca nell'app" scorciatoia="⌘K" />
      </div>

      {destinazioni ? (
        <Gruppo titolo="Risultati" conteggio={destinazioni.length}>
          {destinazioni.length === 0
            ? <p className="px-2 py-3 text-sm text-ink-faint">Nessuna corrispondenza.</p>
            : destinazioni.map((d) => (
                <button key={d.a} onClick={() => { navigate(d.a); setCerca('') }}
                        className="w-full cursor-pointer rounded-r2 px-2 py-1.5 text-left text-base text-ink-muted hover:bg-surface-2 hover:text-ink">
                  {d.t}
                </button>
              ))}
        </Gruppo>
      ) : (
        <ContenutoSezione sezione={sezione} />
      )}
    </>
  )
}

function Gruppo({ titolo, conteggio, children }: { titolo: string; conteggio?: number; children: React.ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col gap-1 overflow-hidden">
      <h2 className="mono flex items-center justify-between px-1 text-2xs uppercase tracking-[0.06em] text-ink-faint">
        {titolo}{conteggio != null && <span>{conteggio}</span>}
      </h2>
      <div className="flex min-h-0 flex-col gap-px overflow-y-auto rounded-r3 border border-border bg-surface p-1">
        {children}
      </div>
    </section>
  )
}

const voce = ({ isActive }: { isActive: boolean }) =>
  `block rounded-r2 px-2 py-1.5 text-base transition-colors duration-[120ms] ease-out ${
    isActive ? 'bg-bg font-semibold text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`

function ContenutoSezione({ sezione }: { sezione: string }) {
  const { utente } = useSessione()
  const [periodi, setPeriodi] = useState<Periodo[] | null>(null)
  const unitId = utente?.ruolo === 'dirigente' ? utente.unitId : utente?.organizzatoreDi[0] ?? utente?.unitId ?? null

  useEffect(() => {
    if (sezione !== 'programmazione' || unitId == null) return
    void api.get<Periodo[]>(`/periodi?unitId=${unitId}`).then(setPeriodi).catch(() => setPeriodi([]))
  }, [sezione, unitId])

  if (sezione === 'programmazione') {
    return (
      <Gruppo titolo="Periodi" conteggio={periodi?.length}>
        <NavLink to="/programmazione" end className={voce}>Tutti i periodi</NavLink>
        {(periodi ?? []).slice(0, 14).map((p) => (
          <NavLink key={p.id} to={`/programmazione/${p.id}`} className={voce}>
            <span className="mono text-sm">{p.dataInizio.slice(5)} → {p.dataFine.slice(5)}</span>
            <span className="ml-1.5 text-2xs text-ink-faint">
              {p.stato === 'pubblicato' ? 'pubblicato' : p.stato === 'in_approvazione' ? 'in approvazione' : 'bozza'}
            </span>
          </NavLink>
        ))}
        {periodi?.length === 0 && <p className="px-2 py-3 text-sm text-ink-faint">Nessun periodo ancora.</p>}
      </Gruppo>
    )
  }

  const ancore: Record<string, { t: string; a: string }[]> = {
    panoramica: [
      { t: 'Prossimi giorni', a: '#giorni' },
      { t: 'Occupazione delle stanze', a: '#stanze' },
    ],
    assenze: [
      { t: 'Dichiara un\'assenza', a: '#dichiara' },
      { t: 'Indisponibilità ricorrenti', a: '#ricorrenti' },
      { t: 'Preferenze', a: '#preferenze' },
    ],
    calendario: [
      { t: 'Le mie giornate', a: '#mie' },
      { t: 'Chi è in sede', a: '#chi' },
    ],
    organizzazione: [
      { t: 'Limiti di lavoro agile', a: '#limiti' },
      { t: 'Settori', a: '#settori' },
      { t: 'Persone', a: '#persone' },
      { t: 'Organizzatori', a: '#organizzatori' },
      { t: 'Stanze e scrivanie', a: '#stanze' },
      { t: 'Unità figlie', a: '#figlie' },
    ],
    amministrazione: [
      { t: 'Unità radice', a: '#unita' },
      { t: 'Utenti', a: '#utenti' },
      { t: 'Causali di assenza', a: '#causali' },
      { t: 'Giornate non lavorative', a: '#festivita' },
    ],
    notifiche: [],
  }

  const elenco = ancore[sezione] ?? []
  const titoli: Record<string, string> = {
    panoramica: 'Panoramica', calendario: 'Il mio calendario', assenze: 'Assenze',
    organizzazione: 'Struttura', amministrazione: 'Sistema', notifiche: 'Notifiche',
  }

  return (
    <Gruppo titolo={titoli[sezione] ?? 'Sezione'} conteggio={elenco.length || undefined}>
      {elenco.length === 0
        ? <p className="px-2 py-3 text-sm text-ink-faint">Niente da elencare qui.</p>
        : elenco.map((v) => (
            <a key={v.a} href={v.a}
               className="block rounded-r2 px-2 py-1.5 text-base text-ink-muted hover:bg-surface-2 hover:text-ink">
              {v.t}
            </a>
          ))}
    </Gruppo>
  )
}

/** Campanella del rail: pallino solo quando c'è davvero qualcosa da leggere. */
export function CampanellaRail() {
  const [daLeggere, setDaLeggere] = useState(0)

  useEffect(() => {
    const carica = () => void api.get<{ daLeggere: number }>('/notifiche')
      .then((d) => setDaLeggere(d.daLeggere)).catch(() => {})
    carica()
    const t = setInterval(carica, 60_000)
    return () => clearInterval(t)
  }, [])

  return (
    <NavLink
      to="/notifiche"
      aria-label={daLeggere > 0 ? `Notifiche, ${daLeggere} da leggere` : 'Notifiche'}
      className={({ isActive }) =>
        `relative cursor-pointer rounded-r1 p-1.5 ${isActive ? 'bg-surface-2 text-ink' : 'text-ink-faint hover:bg-surface-2 hover:text-ink'}`}
    >
      <I.Campana size={18} />
      {daLeggere > 0 && (
        <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-warn" aria-hidden="true" />
      )}
    </NavLink>
  )
}
