/**
 * I pezzi che ruotano attorno a un periodo: stato, esito della generazione,
 * editor di una cella, creazione di un nuovo periodo. Stanno fuori da Turni.tsx
 * perché quello deve restare leggibile come mappa della pagina.
 */
import { type FormEvent, useEffect, useState } from 'react'
import { api, ErroreApi, type Griglia as DatiGriglia, type Periodo } from '../api'
import { oggiISO } from '../date'
import { EtichettaStato } from '../stati'
import { Badge, Bottone, Campo, inputCls, Messaggio, Modale, Pill } from '../ui'

export type EsitoGenerazione = {
  quote: { userId: number; quota: number; assegnate: number }[]
  sottoQuota: { userId: number; mancanti: number; motivo: string; persona: string }[]
  presidiScoperti: { sectorId: number; data: string; settore: string }[]
}

const oggi = () => new Date().toISOString().slice(0, 10)

/** Il periodo su cui atterrare quando non ne è indicato uno: quello di oggi, o il più recente. */
export function periodoDiRiferimento(lista: Periodo[]): Periodo | null {
  const oggi = oggiISO()
  return lista.find((p) => p.dataInizio <= oggi && p.dataFine >= oggi) ?? lista[0] ?? null
}

export function StatoPeriodo({ periodo }: { periodo: Periodo }) {
  if (periodo.stato === 'pubblicato') return <Pill tono="ok">Pubblicato</Pill>
  if (periodo.stato === 'in_approvazione') return <Pill tono="attesa">In approvazione</Pill>
  return <Badge>bozza</Badge>
}

export function EsitoProposta({ esito }: { esito: EsitoGenerazione }) {
  const scoperti = [...new Set(esito.presidiScoperti.map((x) => x.settore))]
  return (
    <Messaggio tono={esito.sottoQuota.length || scoperti.length ? 'attenzione' : 'info'}>
      <p>Proposta generata su {esito.quote.length} persone.</p>
      {esito.sottoQuota.length > 0 && (
        <p className="mt-0.5">
          Sotto quota: {esito.sottoQuota.map((s) => `${s.persona} (−${s.mancanti})`).join(', ')}.
        </p>
      )}
      {scoperti.length > 0 && (
        <p className="mt-0.5">Presidio scoperto in {esito.presidiScoperti.length} giornate: {scoperti.join(', ')}.</p>
      )}
    </Messaggio>
  )
}

export function EditorCella({ dati, selezione, abilitato, onSalvato }: {
  dati: DatiGriglia
  selezione: { userId: number; data: string }
  abilitato: boolean
  onSalvato: () => void
}) {
  const cella = dati.celle.find((c) => c.userId === selezione.userId && c.data === selezione.data)
  const persona = dati.persone.find((p) => p.id === selezione.userId)
  const [stato, setStato] = useState<'presenza' | 'smart'>('smart')
  const [roomId, setRoomId] = useState<number | null>(null)
  const [deskId, setDeskId] = useState<number | null>(null)
  const [bloccata, setBloccata] = useState(false)
  const [motivazione, setMotivazione] = useState('')
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    setStato(cella?.stato === 'presenza' ? 'presenza' : 'smart')
    setRoomId(cella?.roomId ?? dati.stanze[0]?.id ?? null)
    setDeskId(cella?.deskId ?? null)
    // Salvare a mano è una modifica a mano: parte bloccata. Per restituirla al
    // generatore si toglie la spunta.
    setBloccata(true)
    setMotivazione(''); setErrore(null)
  }, [selezione.userId, selezione.data, cella?.stato, cella?.roomId, cella?.deskId, cella?.bloccata, dati.stanze])

  if (!persona) return null
  const stanza = dati.stanze.find((s) => s.id === roomId)

  async function salva(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null)
    try {
      await api.put(`/periodi/${dati.periodo.id}/cella`, {
        userId: selezione.userId, data: selezione.data, stato,
        roomId: stato === 'presenza' ? roomId : null,
        deskId: stato === 'presenza' && dati.periodo.assegnaScrivanie ? deskId : null,
        bloccata, motivazione: motivazione.trim() || undefined,
      })
      onSalvato()
    } catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Salvataggio non riuscito.') }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-md font-semibold">{persona.cognome} {persona.nome}</p>
        <p className="mono text-xs text-ink-faint">{selezione.data}</p>
      </div>

      {cella?.stato === 'assenza' && (
        <Messaggio tono="attenzione">
          Assenza dichiarata{cella.causale ? ` · ${cella.causale}` : ''}. Finché resta, la giornata non è programmabile.
        </Messaggio>
      )}

      {!abilitato ? (
        <p className="text-base text-ink-faint">
          {dati.permessi.scrivere
            ? 'Per cambiarla premi «Modifica» nella barra della griglia.'
            : 'Non hai i permessi per modificare questa programmazione.'}
        </p>
      ) : (
        <form onSubmit={salva} className="flex flex-col gap-4">
          {errore && <Messaggio tono="errore">{errore}</Messaggio>}

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-ink-muted">Stato della giornata</legend>
            <div className="flex flex-col gap-1.5">
              {(['presenza', 'smart'] as const).map((v) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 text-base">
                  <input type="radio" name="stato" value={v} checked={stato === v} onChange={() => setStato(v)} />
                  <EtichettaStato stato={v} />
                </label>
              ))}
            </div>
          </fieldset>

          {stato === 'presenza' && (
            <>
              <Campo etichetta="Stanza">
                <select className={inputCls} value={roomId ?? ''}
                        onChange={(e) => { setRoomId(Number(e.target.value)); setDeskId(null) }}>
                  {dati.stanze.map((s) => <option key={s.id} value={s.id}>{s.etichetta} · {s.capienza} posti</option>)}
                </select>
              </Campo>
              {dati.periodo.assegnaScrivanie && (
                <Campo etichetta="Scrivania">
                  <select className={inputCls} value={deskId ?? ''}
                          onChange={(e) => setDeskId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Nessuna</option>
                    {(stanza?.scrivanie ?? []).map((d) => <option key={d.id} value={d.id}>Scrivania {d.numero}</option>)}
                  </select>
                </Campo>
              )}
            </>
          )}

          <label className="flex cursor-pointer items-start gap-2 text-base">
            <input type="checkbox" className="mt-1" checked={bloccata} onChange={(e) => setBloccata(e.target.checked)} />
            <span>
              Blocca la cella
              <span className="block text-sm text-ink-faint">La generazione non la tocca. Toglila per restituirla al generatore.</span>
            </span>
          </label>

          <Campo etichetta="Motivazione" aiuto="Facoltativa: resta nello storico.">
            <textarea className={`${inputCls} min-h-[56px] resize-y`} rows={2}
                      value={motivazione} onChange={(e) => setMotivazione(e.target.value)} />
          </Campo>

          <Bottone type="submit" variante="primario" className="justify-center">Salva</Bottone>
        </form>
      )}
    </div>
  )
}

/**
 * Una nota da scrivere prima di un'azione sul periodo. Sostituisce `prompt()`,
 * che sul telefono è un riquadro di sistema senza stile e senza «annulla»
 * leggibile. Obbligatoria per il rinvio, facoltativa per la richiesta.
 */
export function ModaleNota({ titolo, etichetta, aperta, obbligatoria, conferma, variante = 'primario', onChiudi, onConferma }: {
  titolo: string
  etichetta: string
  aperta: boolean
  obbligatoria: boolean
  conferma: string
  variante?: 'primario' | 'distruttivo'
  onChiudi: () => void
  onConferma: (nota: string) => Promise<void>
}) {
  const [nota, setNota] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  useEffect(() => { if (aperta) { setNota(''); setErrore(null) } }, [aperta])

  // Il server vuole almeno tre caratteri per un rinvio: lo si dice qui prima.
  const valida = !obbligatoria || nota.trim().length >= 3

  async function invia() {
    setInCorso(true); setErrore(null)
    try { await onConferma(nota.trim()); onChiudi() }
    catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita.') }
    finally { setInCorso(false) }
  }

  return (
    <Modale titolo={titolo} aperta={aperta} onChiudi={onChiudi}
            piede={<>
              <Bottone onClick={onChiudi}>Annulla</Bottone>
              <Bottone variante={variante} disabled={!valida || inCorso} onClick={() => void invia()}>{conferma}</Bottone>
            </>}>
      <div className="flex flex-col gap-3">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}
        <Campo etichetta={etichetta} aiuto={obbligatoria ? undefined : 'Facoltativa.'}>
          <textarea className={`${inputCls} min-h-[80px] resize-y`} rows={3} maxLength={500}
                    value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>
      </div>
    </Modale>
  )
}

/** Un'assenza registrata per un collega, dal menu della griglia. */
export function ModaleAssenzaPerConto({ persona, data, aperta, onChiudi, onFatto }: {
  persona: { id: number; nome: string; cognome: string } | null
  data: string; aperta: boolean; onChiudi: () => void; onFatto: () => void
}) {
  const [causali, setCausali] = useState<{ codice: string; etichetta: string }[]>([])
  const [causale, setCausale] = useState('')
  const [dal, setDal] = useState(data)
  const [al, setAl] = useState(data)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!aperta) return
    setDal(data); setAl(data); setErrore(null)
    void api.get<{ codice: string; etichetta: string }[]>('/assenze/causali')
      .then((c) => { setCausali(c); setCausale((x) => x || (c[0]?.codice ?? '')) })
  }, [aperta, data])

  async function registra() {
    if (!persona) return
    try {
      await api.post('/assenze', { userId: persona.id, dataInizio: dal, dataFine: al, causale })
      onFatto(); onChiudi()
    } catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Registrazione non riuscita.') }
  }

  return (
    <Modale titolo={`Assenza per ${persona ? `${persona.nome} ${persona.cognome}` : ''}`} aperta={aperta} onChiudi={onChiudi}
            piede={<><Bottone onClick={onChiudi}>Annulla</Bottone>
                     <Bottone variante="primario" onClick={() => void registra()}>Registra</Bottone></>}>
      <div className="flex flex-col gap-3">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}
        <Messaggio tono="info">La persona riceve un avviso. Nella griglia l'assenza compare come ⊗.</Messaggio>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etichetta="Dal">
            <input type="date" className={inputCls} value={dal}
                   onChange={(e) => { setDal(e.target.value); if (al < e.target.value) setAl(e.target.value) }} />
          </Campo>
          <Campo etichetta="Al">
            <input type="date" className={inputCls} value={al} min={dal} onChange={(e) => setAl(e.target.value)} />
          </Campo>
        </div>
        <Campo etichetta="Causale">
          <select className={inputCls} value={causale} onChange={(e) => setCausale(e.target.value)}>
            {causali.map((c) => <option key={c.codice} value={c.codice}>{c.etichetta}</option>)}
          </select>
        </Campo>
      </div>
    </Modale>
  )
}

export function NuovoPeriodo({ aperto, onChiudi, unitId, periodi, onCreato }: {
  aperto: boolean; onChiudi: () => void; unitId: number; periodi: Periodo[]; onCreato: (id: number) => void
}) {
  const [dataInizio, setDataInizio] = useState(oggi())
  const [dataFine, setDataFine] = useState(oggi())
  const [assegnaScrivanie, setAssegnaScrivanie] = useState(false)
  const [copiaDaId, setCopiaDaId] = useState('')
  const [errore, setErrore] = useState<string | null>(null)

  async function crea(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null)
    try {
      const r = await api.post<{ id: number }>('/periodi', {
        unitId, dataInizio, dataFine, assegnaScrivanie, copiaDaId: copiaDaId ? Number(copiaDaId) : null,
      })
      onCreato(r.id)
    } catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Creazione non riuscita.') }
  }

  return (
    <Modale titolo="Nuovo periodo" aperta={aperto} onChiudi={onChiudi}
            piede={<><Bottone onClick={onChiudi}>Annulla</Bottone>
                     <Bottone variante="primario" onClick={() => document.getElementById('form-periodo')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}>Crea</Bottone></>}>
      <form id="form-periodo" onSubmit={crea} className="flex flex-col gap-4">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etichetta="Dal">
            <input type="date" className={inputCls} value={dataInizio} required
                   onChange={(e) => { setDataInizio(e.target.value); if (dataFine < e.target.value) setDataFine(e.target.value) }} />
          </Campo>
          <Campo etichetta="Al">
            <input type="date" className={inputCls} value={dataFine} min={dataInizio} required
                   onChange={(e) => setDataFine(e.target.value)} />
          </Campo>
        </div>
        <Campo etichetta="Parti da" aiuto="Copiare un periodo pubblicato ne ricalca il ritmo, saltando le nuove assenze.">
          <select className={inputCls} value={copiaDaId} onChange={(e) => setCopiaDaId(e.target.value)}>
            <option value="">Periodo vuoto</option>
            {periodi.filter((p) => p.stato === 'pubblicato').map((p) => (
              <option key={p.id} value={p.id}>{p.dataInizio} → {p.dataFine}</option>
            ))}
          </select>
        </Campo>
        <label className="flex cursor-pointer items-start gap-2 text-base">
          <input type="checkbox" className="mt-1" checked={assegnaScrivanie} onChange={(e) => setAssegnaScrivanie(e.target.checked)} />
          <span>Assegna le scrivanie
            <span className="block text-sm text-ink-faint">Altrimenti si assegna solo la stanza.</span>
          </span>
        </label>
      </form>
    </Modale>
  )
}
