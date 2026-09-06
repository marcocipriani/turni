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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvvedimentoSessione>
        <App />
      </ProvvedimentoSessione>
    </BrowserRouter>
  </StrictMode>,
)
