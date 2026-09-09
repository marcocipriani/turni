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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvvedimentoSessione>
        <App />
      </ProvvedimentoSessione>
    </BrowserRouter>
  </StrictMode>,
)
