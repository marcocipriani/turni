import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ProvvedimentoSessione } from './sessione'
import './stili.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvvedimentoSessione>
        <App />
      </ProvvedimentoSessione>
    </BrowserRouter>
  </StrictMode>,
)
