import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import * as I from './icone'
import { Marchio } from './Marchio'
import Accesso from './pagine/Accesso'
import CambioPassword from './pagine/CambioPassword'
import { CampanellaRail, PannelloContestuale } from './pagine/pannelli'
import { useSessione } from './sessione'
import { applicaTema, type Tema, temaSalvato } from './tema'
import { Scheletro, Segmented, Stato } from './ui'

const Panoramica = lazy(() => import('./pagine/Panoramica'))
const Programmazione = lazy(() => import('./pagine/Programmazione'))
const Calendario = lazy(() => import('./pagine/Calendario'))
const Assenze = lazy(() => import('./pagine/Assenze'))
const Organizzazione = lazy(() => import('./pagine/Organizzazione'))
const Amministrazione = lazy(() => import('./pagine/Amministrazione'))
const Notifiche = lazy(() => import('./pagine/Notifiche'))

export default function App() {
  const { utente, caricamento } = useSessione()
  const [compresso, setCompresso] = useState(() => window.innerWidth < 960)

  // Sotto 960px il pannello si chiude da solo; il rail resta sempre.
  useEffect(() => {
    const f = () => { if (window.innerWidth < 960) setCompresso(true) }
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])

  if (caricamento) {
    return <div className="grid h-full place-items-center bg-surface"><div className="w-64"><Scheletro righe={3} /></div></div>
  }
  if (!utente) return <Accesso />
  if (utente.passwordDaCambiare) return <CambioPassword obbligatorio />

  const sezioni = [
    { a: '/panoramica', t: 'Oggi', Icona: I.Panoramica },
    { a: '/programmazione', t: 'Turni', Icona: I.Griglia },
    { a: '/calendario', t: 'Mio', Icona: I.Calendario },
    { a: '/assenze', t: 'Assenze', Icona: I.Assenza },
    ...(utente.ruolo === 'dirigente' ? [{ a: '/organizzazione', t: 'Struttura', Icona: I.Organizzazione }] : []),
    ...(utente.ruolo === 'admin' ? [{ a: '/amministrazione', t: 'Sistema', Icona: I.Amministrazione }] : []),
  ]
  const casa = utente.ruolo === 'admin' ? '/amministrazione' : '/panoramica'

  return (
    <div className="grid h-full grid-cols-[auto_1fr] grid-rows-[100%] gap-2 overflow-hidden bg-surface p-2">
      <a href="#contenuto" className="solo-lettori-schermo salta">Salta al contenuto</a>

      <div
        className="grid min-h-0 min-w-0 gap-2 transition-[grid-template-columns] duration-[180ms] ease-out"
        style={{ gridTemplateColumns: compresso ? '68px 0px' : '68px 214px' }}
      >
        <Rail sezioni={sezioni} casa={casa} onAlterna={() => setCompresso((v) => !v)} compresso={compresso} />
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-r4 border border-border bg-bg p-3 shadow-float">
          <PannelloContestuale />
        </div>
      </div>

      <main id="contenuto"
            className="grid min-h-0 min-w-0 grid-rows-[52px_1fr] overflow-hidden rounded-r4 border border-border bg-bg shadow-float">
        <Suspense fallback={<><div className="border-b border-border" /><div className="p-6"><Scheletro righe={4} /></div></>}>
          <Routes>
            <Route path="/panoramica" element={<Panoramica />} />
            <Route path="/programmazione" element={<Programmazione />} />
            <Route path="/programmazione/:id" element={<Programmazione />} />
            <Route path="/calendario" element={<Calendario />} />
            <Route path="/assenze" element={<Assenze />} />
            <Route path="/notifiche" element={<Notifiche />} />
            <Route path="/organizzazione" element={<Organizzazione />} />
            <Route path="/amministrazione" element={<Amministrazione />} />
            <Route path="/password" element={<CambioPassword />} />
            <Route path="*" element={<Navigate to={casa} replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

/* ── Rail: destinazioni sempre raggiungibili. Non sparisce mai. ───── */

function Rail({ sezioni, casa, compresso, onAlterna }: {
  sezioni: { a: string; t: string; Icona: (p: { size?: number }) => ReactNode }[]
  casa: string
  compresso: boolean
  onAlterna: () => void
}) {
  return (
    <nav aria-label="Sezioni"
         className="flex min-h-0 flex-col items-center gap-1 overflow-visible rounded-r4 border border-border bg-bg px-2 py-3 shadow-float">
      <NavLink to={casa} aria-label="Turni, vai alla panoramica" className="mb-2">
        <Marchio size={40} />
      </NavLink>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
        {sezioni.map(({ a, t, Icona }) => (
          <NavLink
            key={a} to={a}
            className={({ isActive }) =>
              `flex w-[52px] cursor-pointer flex-col items-center gap-1 rounded-r2 px-1 py-2 transition-colors
               duration-[120ms] ease-out ${isActive
                ? 'bg-surface-2 text-ink font-semibold'
                : 'text-ink-faint hover:bg-surface-2 hover:text-ink'}`}
            aria-current={undefined}
          >
            {({ isActive }) => (
              <>
                <Icona size={20} />
                <span className="w-full truncate text-center text-2xs leading-none tracking-[0.02em]">{t}</span>
                {isActive && <span className="solo-lettori-schermo">sezione corrente</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <CampanellaRail />

      <button onClick={onAlterna} aria-expanded={!compresso}
              aria-label={compresso ? 'Apri il pannello' : 'Chiudi il pannello'}
              className="mt-1 cursor-pointer rounded-r1 p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 4v16" />
        </svg>
      </button>

      <MenuUtente />
    </nav>
  )
}

/* ── Menu utente: le cose che si toccano una volta a settimana ───── */

function MenuUtente() {
  const { utente, esci } = useSessione()
  const [aperto, setAperto] = useState(false)
  const [tema, setTema] = useState<Tema>(temaSalvato)
  const rif = useRef<HTMLDivElement>(null)
  const posizione = useLocation()

  useEffect(() => setAperto(false), [posizione.pathname])

  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => { if (rif.current && !rif.current.contains(e.target as Node)) setAperto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAperto(false) }
    document.addEventListener('mousedown', fuori)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc) }
  }, [aperto])

  if (!utente) return null
  const iniziali = `${utente.nome[0] ?? ''}${utente.cognome[0] ?? ''}`.toUpperCase()

  return (
    <div className="relative mt-1" ref={rif}>
      <button
        onClick={() => setAperto((v) => !v)} aria-expanded={aperto} aria-haspopup="menu"
        aria-label={`Menu di ${utente.nome} ${utente.cognome}`}
        className="mono grid size-9 cursor-pointer place-items-center rounded-full border border-border-strong
                   bg-surface text-xs font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink"
      >
        {iniziali}
      </button>

      {aperto && (
        <div role="menu"
             className="entra-overlay absolute bottom-0 left-[calc(100%+8px)] z-[100] w-[248px] rounded-r3 border
                        border-border-strong bg-bg p-2 shadow-overlay">
          <div className="border-b border-border px-2 pb-2">
            <p className="truncate text-base font-semibold">{utente.nome} {utente.cognome}</p>
            <p className="mono truncate text-xs text-ink-faint">{utente.email}</p>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-2">
            <Stato tono="ok">Connesso</Stato>
            <span className="mono text-2xs text-ink-faint">v 0.2.0</span>
          </div>

          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <span className="text-sm text-ink-muted">Tema</span>
            <Segmented
              etichetta="Tema dell'interfaccia" valore={tema}
              onCambia={(v) => { setTema(v); applicaTema(v) }}
              opzioni={[
                { v: 'chiaro', icona: <I.Sole size={14} />, titolo: 'Tema chiaro' },
                { v: 'scuro', icona: <I.Luna size={14} />, titolo: 'Tema scuro' },
                { v: 'auto', icona: <I.Monitor size={14} />, titolo: 'Segui il sistema' },
              ]}
            />
          </div>

          <NavLink to="/password" role="menuitem"
                   className="flex items-center gap-2 rounded-r2 px-2 py-1.5 text-base text-ink-muted hover:bg-surface-2 hover:text-ink">
            <I.Lucchetto size={16} /> Cambia password
          </NavLink>
          <button role="menuitem" onClick={() => void esci()}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-r2 px-2 py-1.5 text-left text-base
                             text-ink-muted hover:bg-danger-wash hover:text-danger-ink">
            <I.Esci size={16} /> Esci
          </button>
        </div>
      )}
    </div>
  )
}
