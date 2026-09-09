/**
 * «Cosa è cambiato».
 *
 * Le istantanee delle versioni erano già in archivio e non le guardava
 * nessuno: quando esce una revisione, la domanda che segue «la programmazione
 * è cambiata» è sempre *cosa* è cambiato, e per chi. Qui si legge, versione per
 * versione, giornata per giornata.
 */
import { useEffect, useState } from 'react'
import { api } from '../api'
import { pezziData } from '../date'
import { etichette } from '../persone'
import { useSessione } from '../sessione'
import { EtichettaStato } from '../stati'
import { Badge, Messaggio, Modale, Scheletro, StatoVuoto } from '../ui'
import { quando } from './novita'

type Cambiamento = {
  userId: number; data: string
  prima: 'presenza' | 'smart' | null
  dopo: 'presenza' | 'smart' | null
  stanzaPrima: number | null; stanzaDopo: number | null
}
type Differenze = {
  versione: number
  cambiamenti: Cambiamento[]
  persone: { id: number; nome: string; cognome: string; sectorId: number | null }[]
  stanze: { id: number; etichetta: string; soprannome: string | null }[]
}
type Versione = { versione: number; motivo: string | null; autore: number; creatoIl: string }

export function ModaleCambiamenti({ periodId, versioneCorrente, aperta, onChiudi }: {
  periodId: number
  versioneCorrente: number
  aperta: boolean
  onChiudi: () => void
}) {
  const { utente } = useSessione()
  const [versioni, setVersioni] = useState<Versione[] | null>(null)
  const [scelta, setScelta] = useState(versioneCorrente)
  const [dati, setDati] = useState<Differenze | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => { setScelta(versioneCorrente) }, [versioneCorrente])

  useEffect(() => {
    if (!aperta) return
    void api.get<Versione[]>(`/periodi/${periodId}/versioni`).then(setVersioni).catch(() => setVersioni([]))
  }, [aperta, periodId])

  useEffect(() => {
    if (!aperta) return
    setDati(null); setErrore(null)
    void api.get<Differenze>(`/periodi/${periodId}/differenze?versione=${scelta}`)
      .then(setDati).catch((e) => setErrore(e.message))
  }, [aperta, periodId, scelta])

  const nomi = etichette(dati?.persone ?? [])
  const stanza = (id: number | null) =>
    id == null ? null : dati?.stanze.find((s) => s.id === id)?.etichetta ?? null

  /* Una revisione si racconta per persona: «a me cosa è successo» viene prima
     di «quel giovedì cosa è successo», e chi programma cerca comunque il nome
     di chi deve avvisare. */
  const perPersona = new Map<number, Cambiamento[]>()
  for (const x of dati?.cambiamenti ?? []) {
    if (!perPersona.has(x.userId)) perPersona.set(x.userId, [])
    perPersona.get(x.userId)!.push(x)
  }
  // Prima io, se sono fra i toccati: è la riga che si cerca per prima.
  const ordinate = [...perPersona.entries()].sort(([a], [b]) =>
    (a === utente?.id ? -1 : b === utente?.id ? 1 : 0)
    || (nomi.get(a) ?? '').localeCompare(nomi.get(b) ?? '', 'it'))

  const revisioni = (versioni ?? []).map((v) => v.versione + 1).filter((v) => v >= 2)
  const nota = versioni?.find((v) => v.versione === scelta - 1)

  return (
    <Modale titolo="Cosa è cambiato" aperta={aperta} onChiudi={onChiudi}>
      <div className="flex flex-col gap-4">
        {revisioni.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Versione
            <select
              value={scelta} onChange={(e) => setScelta(Number(e.target.value))}
              className="min-h-[32px] cursor-pointer rounded-r2 border border-border-controllo bg-bg px-2 text-sm text-ink"
            >
              {revisioni.map((v) => <option key={v} value={v}>v{v}</option>)}
            </select>
          </label>
        )}

        {nota && (
          <p className="text-sm text-ink-faint">
            Rivista il {quando(nota.creatoIl)}
            {nota.motivo && <> · <span className="text-ink-muted">{nota.motivo}</span></>}
          </p>
        )}

        {errore && <Messaggio tono="errore">{errore}</Messaggio>}
        {!dati && !errore && <Scheletro righe={4} />}

        {dati && dati.cambiamenti.length === 0 && (
          <StatoVuoto testo={scelta < 2
            ? 'Questa è la prima versione pubblicata: non c\'è ancora niente con cui confrontarla.'
            : 'Nessuna giornata è cambiata con questa versione.'} />
        )}

        {ordinate.length > 0 && (
          <ul className="flex flex-col gap-3">
            {ordinate.map(([userId, righe]) => (
              <li key={userId}>
                <p className="flex items-center gap-2 text-base font-semibold">
                  {nomi.get(userId) ?? `Persona ${userId}`}
                  {userId === utente?.id && <Badge>tu</Badge>}
                  <span className="mono text-2xs font-normal text-ink-faint">
                    {righe.length} {righe.length === 1 ? 'giornata' : 'giornate'}
                  </span>
                </p>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {righe.map((x) => {
                    const { giorno, mese, breve } = pezziData(x.data)
                    return (
                      <li key={x.data}
                          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-r1 bg-surface px-2 py-1 text-sm">
                        <span className="mono w-[68px] shrink-0 text-ink-muted">{breve} {giorno} {mese}</span>
                        <Verso stato={x.prima} stanza={stanza(x.stanzaPrima)} />
                        <span aria-hidden="true" className="text-ink-faint">→</span>
                        <Verso stato={x.dopo} stanza={stanza(x.stanzaDopo)} />
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modale>
  )
}

/** Un capo del cambiamento: com'era, o com'è. */
function Verso({ stato, stanza }: { stato: 'presenza' | 'smart' | null; stanza: string | null }) {
  if (stato == null) return <span className="text-ink-faint">non programmata</span>
  return (
    <span className="inline-flex items-center gap-1">
      <EtichettaStato stato={stato} size={13} />
      {stanza && <span className="mono text-ink-faint">{stanza}</span>}
    </span>
  )
}
