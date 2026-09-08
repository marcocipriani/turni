import { type FormEvent, useState } from 'react'
import { ErroreApi } from '../api'
import { COPYRIGHT, Marchio } from '../Marchio'
import { useSessione } from '../sessione'
import { Bottone, Campo, inputCls, Messaggio } from '../ui'

export default function Accesso() {
  const { entra } = useSessione()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  async function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null); setInCorso(true)
    try { await entra(email, password) }
    catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Accesso non riuscito') }
    finally { setInCorso(false) }
  }

  return (
    // min-h-full e non h-full: su uno schermo basso — un telefono in orizzontale,
    // o la tastiera aperta — la card cresce oltre la finestra e la pagina scorre,
    // invece di farsi tagliare in cima dal centraggio.
    <div className="grid min-h-full place-items-center bg-surface p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      <main className="entra w-full max-w-[420px] rounded-r4 border border-border bg-bg p-6 shadow-float sm:p-8">
        <div className="flex items-center justify-center gap-3">
          <Marchio size={44} className="text-ink" />
          <h1 className="mono text-[22px] font-semibold leading-tight tracking-[-0.02em]">Turni</h1>
        </div>

        <p className="mx-auto mt-5 max-w-[38ch] text-center text-base text-ink-muted text-pretty">
          Sai sempre quando sei in sede, e con chi. Accedi per vedere la tua programmazione.
        </p>

        <form onSubmit={invia} className="mt-6 flex flex-col gap-4">
          {errore && <Messaggio tono="errore">{errore}</Messaggio>}
          {/* Il campo resta un indirizzo di posta — è quello che il server verifica —
              ma l'etichetta lo chiama col nome che gli danno qui dentro. */}
          <Campo etichetta="Identificativo">
            <input className={inputCls} type="email" autoComplete="username" required
                   value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <Campo etichetta="Password">
            <input className={inputCls} type="password" autoComplete="current-password" required
                   value={password} onChange={(e) => setPassword(e.target.value)} />
          </Campo>
          <Bottone type="submit" variante="primario" disabled={inCorso} className="justify-center">
            {inCorso ? 'Accesso in corso…' : 'Entra'}
          </Bottone>
        </form>

        {/* Popover nativo: il browser gli dà il top layer, la chiusura con Esc e
            col clic fuori, e lo stato aria-expanded sul bottone. Niente stato in
            React, niente z-index, niente ascoltatori da smontare. */}
        <div className="mt-5 text-center">
          <button type="button" popoverTarget="aiuto-password"
                  className="ancora-aiuto cursor-pointer rounded-r1 p-2 text-sm text-ink-muted
                             underline decoration-border-strong underline-offset-2
                             transition-colors duration-[120ms] ease-out hover:text-ink">
            Password dimenticata?
          </button>
          <div id="aiuto-password" popover="auto"
               className="suggerimento entra-overlay rounded-r3 border border-border-controllo bg-bg
                          p-3 text-left text-sm text-ink-muted shadow-overlay text-pretty">
            Turni non manda messaggi di posta. Chiedi all'amministratore di sistema
            di reimpostarla: ti darà una password provvisoria da cambiare al primo
            accesso.
          </div>
        </div>

        <p className="mono mt-6 border-t border-border pt-3 text-center text-2xs text-ink-faint">{COPYRIGHT}</p>
      </main>
    </div>
  )
}
