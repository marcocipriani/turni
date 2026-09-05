import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Accesso from './pagine/Accesso'
import Amministrazione from './pagine/Amministrazione'
import Assenze from './pagine/Assenze'
import Calendario from './pagine/Calendario'
import CambioPassword from './pagine/CambioPassword'
import { Campanella } from './pagine/Notifiche'
import Organizzazione from './pagine/Organizzazione'
import Programmazione from './pagine/Programmazione'
import { useSessione } from './sessione'

export default function App() {
  const { utente, caricamento, esci } = useSessione()

  if (caricamento) return <p className="p-8 text-sm text-tenue">Caricamento…</p>
  if (!utente) return <Accesso />
  if (utente.passwordDaCambiare) return <CambioPassword obbligatorio />

  const voci = [
    { a: '/calendario', t: 'Il mio calendario' },
    { a: '/programmazione', t: 'Programmazione' },
    { a: '/assenze', t: 'Assenze e preferenze' },
    ...(utente.ruolo === 'dirigente' ? [{ a: '/organizzazione', t: 'Organizzazione' }] : []),
    ...(utente.ruolo === 'admin' ? [{ a: '/amministrazione', t: 'Amministrazione' }] : []),
  ]

  return (
    <div className="min-h-screen">
      <a href="#contenuto" className="salta-al-contenuto">Salta al contenuto</a>

      <header className="border-b-2 border-az bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-4 px-6 pb-3 pt-4">
          <div>
            <p className="text-lg font-light leading-tight">Programmazione delle presenze</p>
            <p className="text-[11px] tracking-wide text-tenue">
              {utente.unitNome ?? 'Amministrazione di sistema'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-grigio">
              {utente.nome} {utente.cognome}
              <span className="ml-1.5 text-tenue">
                · {utente.ruolo === 'admin' ? 'amministratore'
                  : utente.ruolo === 'dirigente' ? 'dirigente'
                  : utente.organizzatoreDi.length ? 'organizzatore' : 'dipendente'}
              </span>
            </span>
            {utente.ruolo !== 'admin' && <Campanella />}
            <button onClick={() => void esci()} className="text-[13px] text-az underline-offset-2 hover:underline">Esci</button>
          </div>
        </div>

        <nav aria-label="Sezioni" className="mx-auto max-w-[1500px] px-6">
          <ul className="flex flex-wrap gap-1">
            {voci.map((v) => (
              <li key={v.a}>
                <NavLink
                  to={v.a}
                  className={({ isActive }) =>
                    `inline-block border-b-2 px-3 py-2 text-[13px] transition ${
                      isActive ? 'border-az font-medium text-az' : 'border-transparent text-grigio hover:text-az'}`}
                >
                  {v.t}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="contenuto" className="mx-auto max-w-[1500px] px-6 py-7">
        <Routes>
          <Route path="/calendario" element={<Calendario />} />
          <Route path="/programmazione" element={<Programmazione />} />
          <Route path="/programmazione/:id" element={<Programmazione />} />
          <Route path="/assenze" element={<Assenze />} />
          <Route path="/organizzazione" element={<Organizzazione />} />
          <Route path="/amministrazione" element={<Amministrazione />} />
          <Route path="/password" element={<CambioPassword />} />
          <Route path="*" element={<Navigate to={utente.ruolo === 'admin' ? '/amministrazione' : '/calendario'} replace />} />
        </Routes>
      </main>
    </div>
  )
}
