import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BarraBasso, casaDi, Rail, sezioniPer } from './navigazione'
import Accesso from './pagine/Accesso'
import CambioPassword from './pagine/CambioPassword'
import { useSessione } from './sessione'
import { Scheletro } from './ui'

const Mio = lazy(() => import('./pagine/Mio'))
const Turni = lazy(() => import('./pagine/Turni'))
const Assenze = lazy(() => import('./pagine/Assenze'))
const Organizzazione = lazy(() => import('./pagine/Organizzazione'))
const Amministrazione = lazy(() => import('./pagine/Amministrazione'))
const Notifiche = lazy(() => import('./pagine/Notifiche'))
const Stampa = lazy(() => import('./pagine/Stampa'))

export default function App() {
  const { utente, caricamento } = useSessione()

  if (caricamento) {
    return <div className="grid h-full place-items-center bg-surface"><div className="w-64"><Scheletro righe={3} /></div></div>
  }
  if (!utente) return <Accesso />
  if (utente.passwordDaCambiare) return <CambioPassword obbligatorio />

  const sezioni = sezioniPer(utente)
  const casa = casaDi(utente)

  return (
    /* Sul telefono il contenuto arriva ai bordi: la cornice dell'isola, su 390
       pixel, è spazio tolto a quello che si legge. Dell'isola resta la barra in
       basso, che flotta perché è un comando e non contenuto. Da tablet in su
       torna la scrivania con le sue isole. */
    <div className="grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden bg-surface
                    pb-[max(8px,env(safe-area-inset-bottom))]
                    md:grid-cols-[68px_minmax(0,1fr)] md:grid-rows-1 md:p-2 md:pb-2">
      <a href="#contenuto" className="solo-lettori-schermo salta">Salta al contenuto</a>

      <Rail sezioni={sezioni} casa={casa} />

      <main id="contenuto"
            className="grid min-h-0 min-w-0 grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-bg
                       md:grid-rows-[52px_minmax(0,1fr)] md:rounded-r4 md:border md:border-border md:shadow-float">
        <Suspense fallback={<><div className="border-b border-border" /><div className="p-6"><Scheletro righe={4} /></div></>}>
          <Routes>
            <Route path="/mio" element={<Mio />} />
            <Route path="/turni" element={<Turni />} />
            <Route path="/turni/:id" element={<Turni />} />
            <Route path="/assenze" element={<Assenze />} />
            <Route path="/notifiche" element={<Notifiche />} />
            <Route path="/organizzazione" element={<Organizzazione />} />
            <Route path="/amministrazione" element={<Amministrazione />} />
            <Route path="/password" element={<CambioPassword />} />
            <Route path="/stampa/:cosa" element={<Stampa />} />
            {/* Gli indirizzi della prima versione restano validi: i segnalibri tengono. */}
            <Route path="/panoramica" element={<Navigate to="/turni" replace />} />
            <Route path="/calendario" element={<Navigate to="/mio" replace />} />
            <Route path="/programmazione" element={<Navigate to="/turni" replace />} />
            <Route path="/programmazione/:id" element={<VecchiaProgrammazione />} />
            <Route path="*" element={<Navigate to={casa} replace />} />
          </Routes>
        </Suspense>
      </main>

      <div className="px-2 md:contents"><BarraBasso sezioni={sezioni} /></div>
    </div>
  )
}

/** /programmazione/12 → /turni/12, conservando il periodo puntato. */
function VecchiaProgrammazione() {
  const { pathname } = useLocation()
  return <Navigate to={pathname.replace('/programmazione', '/turni')} replace />
}
