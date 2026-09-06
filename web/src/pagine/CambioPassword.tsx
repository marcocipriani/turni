import { type FormEvent, useState } from 'react'
import { api, ErroreApi } from '../api'
import * as I from '../icone'
import { useSessione } from '../sessione'
import { Bottone, Campo, inputCls, Messaggio } from '../ui'
import { Vista } from '../Vista'

export default function CambioPassword({ obbligatorio }: { obbligatorio?: boolean }) {
  const { esci } = useSessione()
  const [attuale, setAttuale] = useState('')
  const [nuova, setNuova] = useState('')
  const [ripeti, setRipeti] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [fatto, setFatto] = useState(false)

  async function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null)
    if (nuova !== ripeti) return setErrore('Le due password non coincidono.')
    try { await api.post('/auth/password', { attuale, nuova }); setFatto(true) }
    catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Cambio non riuscito.') }
  }

  const modulo = (
    <div className="max-w-[420px]">
      {fatto ? (
        <div className="flex flex-col items-start gap-4">
          <Messaggio>Fatto. Le altre sessioni aperte sono state chiuse: entra di nuovo.</Messaggio>
          <Bottone variante="primario" onClick={() => void esci()}>Vai all'accesso</Bottone>
        </div>
      ) : (
        <form onSubmit={invia} className="flex flex-col gap-4">
          {obbligatorio && (
            <Messaggio tono="attenzione">
              Stai usando una password provvisoria. Prima di continuare scegline una tua.
            </Messaggio>
          )}
          {errore && <Messaggio tono="errore">{errore}</Messaggio>}
          <Campo etichetta="Password attuale">
            <input className={inputCls} type="password" autoComplete="current-password" required
                   value={attuale} onChange={(e) => setAttuale(e.target.value)} />
          </Campo>
          <Campo etichetta="Nuova password" aiuto="Almeno 8 caratteri.">
            <input className={inputCls} type="password" autoComplete="new-password" required minLength={8}
                   value={nuova} onChange={(e) => setNuova(e.target.value)} />
          </Campo>
          <Campo etichetta="Ripeti la nuova password">
            <input className={inputCls} type="password" autoComplete="new-password" required minLength={8}
                   value={ripeti} onChange={(e) => setRipeti(e.target.value)} />
          </Campo>
          <Bottone type="submit" variante="primario" className="self-start">Aggiorna</Bottone>
        </form>
      )}
    </div>
  )

  if (!obbligatorio) {
    return <Vista titolo="Cambia password" icona={<I.Lucchetto size={17} />}>{modulo}</Vista>
  }

  return (
    <div className="grid h-full place-items-center bg-surface p-2">
      <main className="entra w-full max-w-[480px] rounded-r4 border border-border bg-bg p-8 shadow-float">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Cambia la password</h1>
        <div className="mt-6">{modulo}</div>
      </main>
    </div>
  )
}
