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
    <div className="grid h-full place-items-center bg-surface p-2">
      <main className="entra w-full max-w-[420px] rounded-r4 border border-border bg-bg p-8 shadow-float">
        <div className="flex items-center gap-3">
          <Marchio size={44} className="text-ink" />
          <h1 className="mono text-[22px] font-semibold leading-tight tracking-[-0.02em]">Turni</h1>
        </div>

        <p className="mt-5 max-w-[38ch] text-base text-ink-muted">
          Sai sempre quando sei in sede, e con chi. Accedi per vedere la tua programmazione.
        </p>

        <form onSubmit={invia} className="mt-6 flex flex-col gap-4">
          {errore && <Messaggio tono="errore">{errore}</Messaggio>}
          <Campo etichetta="Indirizzo di posta">
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

        <p className="mt-5 max-w-[46ch] text-sm text-ink-faint">
          Password dimenticata? Turni non manda messaggi di posta. Chiedi
          all'amministratore di sistema di reimpostarla: ti darà una password
          provvisoria da cambiare al primo accesso.
        </p>

        <p className="mono mt-6 border-t border-border pt-3 text-2xs text-ink-faint">{COPYRIGHT}</p>
      </main>
    </div>
  )
}
