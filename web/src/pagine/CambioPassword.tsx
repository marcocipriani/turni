import { type FormEvent, useState } from 'react'
import { api, ErroreApi } from '../api'
import { Avviso, Bottone, Campo, classiInput } from '../componenti'
import { useSessione } from '../sessione'

export default function CambioPassword({ obbligatorio }: { obbligatorio?: boolean }) {
  const { esci } = useSessione()
  const [attuale, setAttuale] = useState('')
  const [nuova, setNuova] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [fatto, setFatto] = useState(false)

  async function invia(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    if (nuova !== ripeti) return setErrore('Le due password non coincidono')
    try {
      await api.post('/auth/password', { attuale, nuova })
      setFatto(true)
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Cambio non riuscito')
    }
  }

  if (fatto) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <Avviso>Password aggiornata. Le altre sessioni aperte sono state chiuse: accedi di nuovo.</Avviso>
        <Bottone className="mt-4" variante="primario" onClick={() => void esci()}>Vai all'accesso</Bottone>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-xl font-light">Cambia la password</h1>
      {obbligatorio && (
        <p className="mt-2 text-[13px] text-grigio">
          Stai usando una password provvisoria: prima di continuare devi sceglierne una tua.
        </p>
      )}
      <form onSubmit={invia} className="mt-6 space-y-4 rounded-sm border border-filo bg-white p-6">
        {errore && <Avviso tipo="errore">{errore}</Avviso>}
        <Campo etichetta="Password attuale">
          <input className={classiInput} type="password" autoComplete="current-password" required
                 value={attuale} onChange={(e) => setAttuale(e.target.value)} />
        </Campo>
        <Campo etichetta="Nuova password" aiuto="Almeno 8 caratteri">
          <input className={classiInput} type="password" autoComplete="new-password" required minLength={8}
                 value={nuova} onChange={(e) => setNuova(e.target.value)} />
        </Campo>
        <Campo etichetta="Ripeti la nuova password">
          <input className={classiInput} type="password" autoComplete="new-password" required minLength={8}
                 value={ripeti} onChange={(e) => setRipeti(e.target.value)} />
        </Campo>
        <Bottone type="submit" variante="primario" className="w-full justify-center">Aggiorna</Bottone>
      </form>
    </main>
  )
}
