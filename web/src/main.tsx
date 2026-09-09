import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ProvvedimentoSessione } from './sessione'
import './styles/app.css'
import { applicaTema, temaSalvato } from './tema'

// Il tema si applica prima del primo disegno: nessun lampo di tema sbagliato.
applicaTema(temaSalvato())
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (temaSalvato() === 'auto') applicaTema('auto')
})

/* Il service worker serviva solo alle notifiche, e si registrava aprendo la
   pagina delle notifiche. Ora tiene anche il guscio e l'ultimo «Mio» per
   quando la rete non c'è: va registrato all'avvio, non quando qualcuno passa
   di lì. Se fallisce non importa: l'applicazione funziona lo stesso. */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

/* Chiusa l'anteprima di stampa, Chrome su Android non sempre ridisegna la
   pagina: la shell è alta `100svh`, il documento non scorre, e quello che
   resta sullo schermo è bianco finché non si riavvia l'applicazione. Durante
   la stampa il foglio di stile sfila via l'altezza e gli scorrimenti — è il
   blocco `@media print` — e al ritorno il ricalcolo non riparte da solo.

   Qui glielo si chiede: si toglie l'altezza, si legge una misura (che obbliga
   il browser a ricalcolare subito il layout invece di rimandarlo), e la si
   rimette. Fuori dalla stampa non fa niente e non costa niente. */
addEventListener('afterprint', () => {
  const radice = document.documentElement
  radice.style.height = 'auto'
  void radice.offsetHeight
  radice.style.height = ''
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvvedimentoSessione>
        <App />
      </ProvvedimentoSessione>
    </BrowserRouter>
  </StrictMode>,
)
