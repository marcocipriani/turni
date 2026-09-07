import { useId, useState } from 'react'
import { api, ErroreApi } from '../api'
import * as I from '../icone'
import { Bottone, inputCls, Messaggio, Pannello, stileBottone } from '../ui'
import type { Credenziale } from './Utenti'

type Esito = {
  aggiunti: number; saltati: number
  errori: string[]; note: string[]; credenziali: Credenziale[]
}

/**
 * Le assenze non compaiono: sono dati personali, e l'amministratore di sistema
 * non li vede. Chi deve caricarne di storiche passa dalla riga di comando.
 */
const SEZIONI = [
  { id: 'unita', titolo: 'Organigramma', spiega: 'Unità, sigle, dirigenti e persone. Solo in uscita: le unità nascono col loro dirigente, dal file delle persone.', carica: false },
  { id: 'persone', titolo: 'Persone', spiega: 'Anagrafica, ruoli, unità e settori. Ogni persona nuova riceve una password provvisoria.', carica: true },
  { id: 'settori', titolo: 'Settori', spiega: 'Le articolazioni interne di un’unità, con il presidio dove serve.', carica: true },
  { id: 'stanze', titolo: 'Stanze e scrivanie', spiega: 'Le stanze con il loro piano e le scrivanie che contengono.', carica: true },
  { id: 'causali', titolo: 'Causali di assenza', spiega: 'L’elenco chiuso da cui si sceglie quando si dichiara un’assenza.', carica: true },
  { id: 'giornate', titolo: 'Giornate non lavorative', spiega: 'Festività, patrono e chiusure d’ufficio.', carica: true },
] as const

type Sezione = (typeof SEZIONI)[number]
/** L'esportazione dell'organigramma sta sotto «unita», il caricamento non esiste. */
const percorsoEsporta = (s: Sezione) => `/api/admin/esporta/${s.id}`

export default function Dati({ onFatto, onCredenziali }: {
  onFatto: () => Promise<void>
  onCredenziali: (c: Credenziale[]) => void
}) {
  const [tabella, setTabella] = useState<string | null>(null)
  const [nomeFile, setNomeFile] = useState('')
  const [testo, setTesto] = useState('')
  const [dominio, setDominio] = useState('')
  const [esito, setEsito] = useState<Esito | null>(null)
  const [scritto, setScritto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const idCampo = useId()

  function azzera() {
    setTabella(null); setNomeFile(''); setTesto(''); setEsito(null); setScritto(false); setErrore(null)
  }

  async function manda(t: string, contenuto: string, prova: boolean) {
    setInCorso(true); setErrore(null)
    try {
      const r = await api.post<Esito>(`/admin/importa/${t}`, { testo: contenuto, prova, dominio: dominio || undefined })
      setEsito(r); setScritto(!prova)
      if (!prova) {
        if (r.credenziali.length) onCredenziali(r.credenziali)
        await onFatto()
      }
    } catch (e) {
      setEsito(null)
      setErrore(e instanceof ErroreApi ? e.message : 'Il file non è stato letto.')
    } finally { setInCorso(false) }
  }

  async function scegli(s: Sezione, file: File | undefined) {
    if (!file) return
    const contenuto = await file.text()
    setTabella(s.id); setNomeFile(file.name); setTesto(contenuto); setScritto(false)
    await manda(s.id, contenuto, true)
  }

  const aperta = SEZIONI.find((s) => s.id === tabella)

  return (
    <Pannello titolo="Dati" icona={<I.Scarica size={18} />}
              piede="Il formato è CSV con punto e virgola, quello che Excel italiano scrive e rilegge senza chiedere niente. Le assenze non passano di qui: sono dati personali, e si caricano dal server.">
      <div className="overflow-x-auto rounded-r2 border border-border bg-bg">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {['Sezione', 'Comandi'].map((t) => (
                <th key={t} scope="col"
                    className="border-b border-border bg-surface px-2.5 py-1.5 text-left text-xs font-semibold text-ink-muted">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SEZIONI.map((s) => (
              <tr key={s.id}>
                <td className="border-b border-border px-2.5 py-2 align-top">
                  <div className="text-base">{s.titolo}</div>
                  <p className="max-w-[52ch] text-sm text-ink-faint">{s.spiega}</p>
                </td>
                <td className="border-b border-border px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.carica && (
                      <>
                        <a href={`/api/admin/modelli/${s.id}`} download className={stileBottone('piccolo')}>
                          <I.Scarica size={14} />Modello
                        </a>
                        <label className={`${stileBottone('piccolo')} relative`}>
                          <I.Piu size={14} />Carica…
                          <input
                            type="file" accept=".csv,text/csv" id={`${idCampo}-${s.id}`}
                            className="sr-only"
                            onChange={(e) => { void scegli(s, e.target.files?.[0]); e.target.value = '' }}
                          />
                        </label>
                      </>
                    )}
                    <a href={percorsoEsporta(s)} download className={stileBottone('piccolo')}>
                      <I.Scarica size={14} />Esporta
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errore && <Messaggio tono="errore">{errore}</Messaggio>}

      {aperta && esito && (
        <div className="flex flex-col gap-3 rounded-r2 border border-border-controllo bg-surface-2 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold">
              {scritto ? 'Caricato' : 'Prova'}: {aperta.titolo} — <span className="mono text-sm">{nomeFile}</span>
            </h3>
            <Bottone variante="piccolo" onClick={azzera}>Chiudi</Bottone>
          </div>

          <p role="status" className="text-base">
            {scritto
              ? `${esito.aggiunti} ${esito.aggiunti === 1 ? 'riga caricata' : 'righe caricate'}`
              : `${esito.aggiunti} ${esito.aggiunti === 1 ? 'riga entrerebbe' : 'righe entrerebbero'}`}
            {esito.saltati > 0 && `, ${esito.saltati} già in archivio`}
            {esito.errori.length > 0 && `, ${esito.errori.length} da correggere`}.
          </p>

          {esito.errori.length > 0 && (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto text-sm text-danger-ink"
                tabIndex={0} aria-label="Righe da correggere">
              {esito.errori.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          )}
          {esito.note.length > 0 && (
            <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto text-sm text-ink-muted"
                tabIndex={0} aria-label="Dettaglio del caricamento">
              {esito.note.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          )}

          {!scritto && (
            <div className="flex flex-wrap items-center gap-2">
              <Bottone variante="primario" disabled={inCorso || esito.aggiunti === 0}
                       onClick={() => void manda(aperta.id, testo, false)}>
                Carica davvero
              </Bottone>
              <Bottone onClick={azzera}>Annulla</Bottone>
              {aperta.id === 'persone' && (
                <label className="flex items-center gap-2 text-sm text-ink-muted">
                  Dominio per gli indirizzi mancanti
                  <input className={inputCls} value={dominio} placeholder="comune.it"
                         onChange={(e) => setDominio(e.target.value)}
                         onBlur={() => void manda(aperta.id, testo, true)} />
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </Pannello>
  )
}
