import { type FormEvent, useState } from 'react'
import { ErroreApi } from '../api'
import { Avviso, Bottone, Campo, classiInput } from '../componenti'
import { useSessione } from '../sessione'

export default function Accesso() {
  const { entra } = useSessione()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  async function invia(e: FormEvent) {
    e.preventDefault()
    setErrore(null); setInCorso(true)
    try {
      await entra(email, password)
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Accesso non riuscito')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-light">Programmazione delle presenze</h1>
      <p className="mt-1 text-xs tracking-wide text-tenue">Accedi con le tue credenziali</p>

      <form onSubmit={invia} className="mt-8 space-y-4 rounded-sm border border-filo bg-white p-6">
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        <Campo etichetta="Indirizzo di posta">
          <input
            className={classiInput} type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </Campo>
        <Campo etichetta="Password">
          <input
            className={classiInput} type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </Campo>
        <Bottone type="submit" variante="primario" disabled={inCorso} className="w-full justify-center">
          {inCorso ? 'Accesso in corso…' : 'Entra'}
        </Bottone>
        <p className="text-[11px] leading-relaxed text-tenue">
          Password dimenticata? L'applicazione non invia messaggi di posta: chiedi
          all'amministratore di sistema di reimpostarla.
        </p>
      </form>
    </main>
  )
}
