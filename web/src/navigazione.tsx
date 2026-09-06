/**
 * Navigazione e comandi sempre presenti.
 *
 * Le destinazioni sono le stesse su ogni schermo e cambiano solo di posto:
 * a sinistra sul rail quando c'è larghezza, in basso sul telefono, dove il
 * pollice arriva. Nessuna seconda barra, nessuna ricerca: con quattro
 * destinazioni non c'è niente da cercare.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { api, type Utente } from './api'
import * as I from './icone'
import { Marchio } from './Marchio'
import { useSessione } from './sessione'
import { applicaTema, type Tema, temaSalvato } from './tema'
import { Segmented, Stato } from './ui'

export type Sezione = { a: string; t: string; Icona: (p: { size?: number }) => ReactNode }

/**
 * L'amministratore è un amministratore di sistema: censisce unità e utenti e
 * non vede nessuna programmazione. Non ha quindi né Mio né Turni.
 */
export function sezioniPer(utente: Utente): Sezione[] {
  if (utente.ruolo === 'admin') return [{ a: '/amministrazione', t: 'Sistema', Icona: I.Amministrazione }]
  return [
    { a: '/mio', t: 'Mio', Icona: I.Calendario },
    { a: '/turni', t: 'Turni', Icona: I.Griglia },
    { a: '/assenze', t: 'Assenze', Icona: I.Assenza },
    ...(utente.ruolo === 'dirigente'
      ? [{ a: '/organizzazione', t: 'Struttura', Icona: I.Organizzazione }]
      : []),
  ]
}

export const casaDi = (utente: Utente) => utente.ruolo === 'admin' ? '/amministrazione' : '/mio'

/* ── Rail: da tablet in su ────────────────────────────────────────── */

export function Rail({ sezioni, casa }: { sezioni: Sezione[]; casa: string }) {
  return (
    <nav aria-label="Sezioni"
         className="hidden min-h-0 flex-col items-center gap-1 rounded-r4 border border-border bg-bg
                    px-2 py-3 shadow-float md:flex">
      <NavLink to={casa} aria-label="Turni, vai alla pagina iniziale" className="mb-2">
        <Marchio size={40} />
      </NavLink>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
        {sezioni.map(({ a, t, Icona }) => (
          <NavLink
            key={a} to={a}
            className={({ isActive }) =>
              `flex w-[52px] cursor-pointer flex-col items-center gap-1 rounded-r2 px-1 py-2 transition-colors
               duration-[120ms] ease-out ${isActive
                ? 'bg-surface-2 font-semibold text-ink'
                : 'text-ink-faint hover:bg-surface-2 hover:text-ink'}`}
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

      <Campanella />
      <MenuUtente ancoraggio="rail" />
    </nav>
  )
}

/* ── Barra in basso: telefono ─────────────────────────────────────── */

export function BarraBasso({ sezioni }: { sezioni: Sezione[] }) {
  return (
    <nav aria-label="Sezioni"
         className="flex items-stretch justify-around gap-1 rounded-r4 border border-border bg-bg
                    px-1 py-1 shadow-float md:hidden">
      {sezioni.map(({ a, t, Icona }) => (
        <NavLink
          key={a} to={a}
          className={({ isActive }) =>
            `flex min-h-[48px] min-w-[56px] flex-1 cursor-pointer flex-col items-center justify-center gap-0.5
             rounded-r2 px-1 py-1 transition-colors duration-[120ms] ease-out ${isActive
              ? 'bg-surface-2 font-semibold text-ink'
              : 'text-ink-faint active:bg-surface-2'}`}
        >
          {({ isActive }) => (
            <>
              <Icona size={20} />
              <span className="w-full truncate text-center text-2xs leading-none">{t}</span>
              {isActive && <span className="solo-lettori-schermo">sezione corrente</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/**
 * Campanella e menu utente nell'header della vista, sul solo telefono:
 * la barra in basso resta navigazione pura, senza comandi mescolati dentro.
 */
export function ControlliGlobali() {
  return (
    <div className="flex items-center gap-1 md:hidden">
      <Campanella />
      <MenuUtente ancoraggio="header" />
    </div>
  )
}

/* ── Notifiche ────────────────────────────────────────────────────── */

/** Il pallino compare solo quando c'è davvero qualcosa da leggere. */
function Campanella() {
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
        `relative grid size-9 cursor-pointer place-items-center rounded-r1 ${isActive
          ? 'bg-surface-2 text-ink' : 'text-ink-faint hover:bg-surface-2 hover:text-ink'}`}
    >
      <I.Campana size={18} />
      {daLeggere > 0 && (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-warn" aria-hidden="true" />
      )}
    </NavLink>
  )
}

/* ── Menu utente: le cose che si toccano una volta a settimana ────── */

function MenuUtente({ ancoraggio }: { ancoraggio: 'rail' | 'header' }) {
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
  const posto = ancoraggio === 'rail'
    ? 'bottom-0 left-[calc(100%+8px)]'
    : 'right-0 top-[calc(100%+8px)]'

  return (
    <div className={`relative ${ancoraggio === 'rail' ? 'mt-1' : ''}`} ref={rif}>
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
             className={`entra-overlay absolute z-[400] w-[248px] rounded-r3 border border-border-strong
                         bg-bg p-2 shadow-overlay ${posto}`}>
          <div className="border-b border-border px-2 pb-2">
            <p className="truncate text-base font-semibold">{utente.nome} {utente.cognome}</p>
            <p className="mono truncate text-xs text-ink-faint">{utente.email}</p>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-2">
            <Stato tono="ok">Connesso</Stato>
            <span className="mono text-2xs text-ink-faint">v 0.3.0</span>
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
