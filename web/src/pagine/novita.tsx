/**
 * «C'è una programmazione nuova».
 *
 * Il centro notifiche riceve tutto, ma va aperto: chi entra e guarda la
 * settimana non si accorge che nel frattempo il calendario è cambiato. Questo
 * è l'avviso che glielo dice in faccia, una volta sola — scartarlo è
 * dichiarare di averlo letto, e ricompare solo alla revisione successiva.
 */
import { type MouseEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Messaggio } from '../ui'

export type Novita = {
  id: number; dataInizio: string; dataFine: string; versione: number
  pubblicatoIl: string | null; aggiornatoIl: string | null
  nuova: boolean
}

const giorno = (iso: string) => new Date(`${iso}T00:00:00Z`)
  .toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/** Data e ora dell'aggiornamento: «il 9 settembre alle 14:05». */
export const quando = (istante: string) => {
  const d = new Date(istante)
  return `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} alle ` +
    d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Come si presenta un periodo: date, versione, e da quando vale quel che
 * c'è scritto. La versione compare solo dalla seconda in poi — «v1» su una
 * programmazione mai rivista è rumore.
 */
export function descriviPeriodo(p: Novita): string {
  const durata = `${giorno(p.dataInizio)} → ${giorno(p.dataFine)}`
  if (p.versione > 1) {
    return `${durata} · versione ${p.versione}` +
      (p.aggiornatoIl ? `, aggiornata il ${quando(p.aggiornatoIl)}` : '')
  }
  return durata + (p.pubblicatoIl ? ` · pubblicata il ${quando(p.pubblicatoIl)}` : '')
}

export function AvvisoNovita() {
  const [novita, setNovita] = useState<Novita | null>(null)

  useEffect(() => {
    void api.get<{ periodo: Novita | null }>('/periodi/novita')
      .then((r) => setNovita(r.periodo?.nuova ? r.periodo : null))
      // L'avviso è un di più: se la richiesta fallisce, la pagina resta intera.
      .catch(() => setNovita(null))
  }, [])

  /* Segna letto quando si tocca un comando — il collegamento o la × — non
     quando si clicca di fianco al testo: un avviso che sparisce per un clic a
     vuoto è un avviso che non si è letto. */
  const visto = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest('a, button')) return
    void api.post('/periodi/vista').catch(() => {})
  }, [])

  if (!novita) return null
  const revisione = novita.versione > 1

  return (
    <div onClickCapture={visto}>
      <Messaggio
        tono="info" chiudibile
        titolo={revisione ? 'La programmazione è cambiata' : 'Una nuova programmazione è disponibile'}
      >
        <p>
          {descriviPeriodo(novita)}.{' '}
          <Link to={`/turni/${novita.id}`} className="underline underline-offset-2">
            Vai a vederla
          </Link>
        </p>
      </Messaggio>
    </div>
  )
}
