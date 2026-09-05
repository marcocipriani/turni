import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ErroreApi, type Griglia as DatiGriglia, type Periodo } from '../api'
import { Avviso, Bottone, Campo, classiInput, Etichetta, Riquadro, Vuoto } from '../componenti'
import { puoProgrammare, useSessione } from '../sessione'
import Griglia, { Legenda } from './Griglia'

type EsitoGenerazione = {
  quote: { userId: number; quota: number; assegnate: number }[]
  sottoQuota: { userId: number; mancanti: number; motivo: string; persona: string }[]
  presidiScoperti: { sectorId: number; data: string; settore: string }[]
}

const oggi = () => new Date().toISOString().slice(0, 10)

export default function Programmazione() {
  const { utente } = useSessione()
  const navigate = useNavigate()
  const { id } = useParams()
  const unitId = utente?.unitId ?? null

  const [periodi, setPeriodi] = useState<Periodo[] | null>(null)
  const [dati, setDati] = useState<DatiGriglia | null>(null)
  const [selezione, setSelezione] = useState<{ userId: number; data: string } | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [esito, setEsito] = useState<EsitoGenerazione | null>(null)
  const [inCorso, setInCorso] = useState(false)

  // Il dirigente vede la propria unità; l'organizzatore quella in cui è delegato.
  const unitaGriglia = useMemo(() => {
    if (!utente) return null
    if (utente.ruolo === 'dirigente') return utente.unitId
    return utente.organizzatoreDi[0] ?? utente.unitId
  }, [utente])

  const caricaPeriodi = useCallback(async () => {
    if (unitaGriglia == null) return
    setPeriodi(await api.get<Periodo[]>(`/periodi?unitId=${unitaGriglia}`))
  }, [unitaGriglia])

  const caricaGriglia = useCallback(async (pid: number) => {
    setEsito(null)
    setDati(await api.get<DatiGriglia>(`/periodi/${pid}/griglia`))
  }, [])

  useEffect(() => { void caricaPeriodi() }, [caricaPeriodi])
  useEffect(() => { if (id) void caricaGriglia(Number(id)).catch((e) => setErrore(String(e.message))) }, [id, caricaGriglia])

  async function azione(fn: () => Promise<unknown>) {
    setErrore(null); setInCorso(true)
    try { await fn() } catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita') }
    finally { setInCorso(false) }
  }

  if (!utente) return null
  if (unitaGriglia == null) return <Vuoto>Nessuna unità organizzativa associata al tuo profilo.</Vuoto>

  /* ── Elenco dei periodi ───────────────────────────────────────── */
  if (!id) {
    const scrivibile = puoProgrammare(utente, unitaGriglia)
    return (
      <>
        {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
        {scrivibile && <NuovoPeriodo unitId={unitaGriglia} periodi={periodi ?? []} onCreato={(pid) => navigate(`/programmazione/${pid}`)} />}

        <Riquadro titolo="Periodi" descrizione="Ogni periodo copre un intervallo di date e non si sovrappone agli altri.">
          {periodi === null ? <p className="text-[13px] text-tenue">Caricamento…</p>
            : periodi.length === 0 ? <Vuoto>Nessun periodo. {scrivibile ? 'Creane uno qui sopra.' : ''}</Vuoto>
            : (
              <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
                {periodi.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <button onClick={() => navigate(`/programmazione/${p.id}`)} className="text-[13px] text-az hover:underline">
                        {p.dataInizio} → {p.dataFine}
                      </button>
                      <span className="ml-3 text-[11px] text-tenue">versione {p.versione}</span>
                    </div>
                    <StatoPeriodo periodo={p} />
                  </li>
                ))}
              </ul>
            )}
        </Riquadro>
      </>
    )
  }

  /* ── Griglia di un periodo ────────────────────────────────────── */
  if (!dati) return <p className="text-[13px] text-tenue">Caricamento della griglia…</p>

  const p = dati.periodo
  const scrivibile = dati.permessi.scrivere && p.stato !== 'pubblicato'
  const errori = dati.avvisi.filter((a) => a.gravita === 'errore')
  const attenzioni = dati.avvisi.filter((a) => a.gravita === 'attenzione')

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <button onClick={() => navigate('/programmazione')} className="text-[12px] text-az hover:underline">← Tutti i periodi</button>
          <h1 className="mt-1 text-xl font-light">{p.dataInizio} → {p.dataFine}</h1>
          <p className="mt-0.5 text-[11px] text-tenue">
            versione {p.versione} · {dati.giorni.length} giornate lavorative · {dati.persone.length} persone
            {p.assegnaScrivanie && ' · assegnazione per scrivania'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatoPeriodo periodo={p} />
          {scrivibile && (
            <Bottone disabled={inCorso} onClick={() => void azione(async () => {
              setEsito(await api.post<EsitoGenerazione>(`/periodi/${p.id}/genera`))
              await caricaGriglia(p.id)
            })}>Genera proposta</Bottone>
          )}
          {scrivibile && dati.permessi.scrivere && (
            <Bottone disabled={inCorso} onClick={() => void azione(async () => {
              await api.post(`/periodi/${p.id}/invia`); await caricaGriglia(p.id)
            })}>Invia in approvazione</Bottone>
          )}
          {dati.permessi.approvare && p.stato === 'in_approvazione' && (
            <>
              <Bottone variante="primario" disabled={inCorso} onClick={() => void azione(async () => {
                const r = await api.post<{ destinatari: number }>(`/periodi/${p.id}/approva`)
                await caricaGriglia(p.id)
                setErrore(null)
                alert(`Pubblicato. Notificate ${r.destinatari} persone.`)
              })}>Approva e pubblica</Bottone>
              <Bottone variante="pericolo" disabled={inCorso} onClick={() => void azione(async () => {
                const nota = prompt('Motivo del rinvio all\'organizzatore:')
                if (!nota) return
                await api.post(`/periodi/${p.id}/respingi`, { nota }); await caricaGriglia(p.id)
              })}>Respingi</Bottone>
            </>
          )}
          <a href={`/api/periodi/${p.id}/export.csv`}
             className="inline-flex items-center rounded-sm border border-filo bg-white px-3 py-1.5 text-[13px] text-az hover:border-az">
            Scarica CSV
          </a>
        </div>
      </div>

      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {p.notaApprovazione && <div className="mb-4"><Avviso tipo="attenzione">Rinviato dal dirigente: {p.notaApprovazione}</Avviso></div>}

      {errori.length > 0 && (
        <div className="mb-3">
          <Avviso tipo="errore">
            <p className="font-medium">{errori.length} {errori.length === 1 ? 'errore' : 'errori'} da risolvere</p>
            <ul className="mt-1 list-inside list-disc">{errori.slice(0, 6).map((a, i) => <li key={i}>{a.messaggio}</li>)}</ul>
          </Avviso>
        </div>
      )}
      {attenzioni.length > 0 && (
        <details className="mb-3 rounded-sm border border-ambra/40 bg-ambra-fondo px-3 py-2 text-[13px] text-ambra">
          <summary className="cursor-pointer">{attenzioni.length} segnalazioni non bloccanti</summary>
          <ul className="mt-1 list-inside list-disc">{attenzioni.slice(0, 20).map((a, i) => <li key={i}>{a.messaggio}</li>)}</ul>
        </details>
      )}
      {esito && <EsitoProposta esito={esito} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_290px]">
        <div>
          <Griglia dati={dati} selezione={selezione} onSeleziona={setSelezione} />
          <Legenda />
          <p className="mt-2 text-[11px] text-tenue">
            Muoviti fra le celle con le frecce direzionali; Inizio e Fine portano al primo e all'ultimo giorno.
          </p>
        </div>
        <EditorCella dati={dati} selezione={selezione} abilitato={dati.permessi.scrivere}
                     onSalvato={() => void caricaGriglia(p.id)} />
      </div>
    </>
  )
}

function StatoPeriodo({ periodo }: { periodo: Periodo }) {
  if (periodo.stato === 'pubblicato') return <Etichetta tono="ok">Pubblicato</Etichetta>
  if (periodo.stato === 'in_approvazione') return <Etichetta tono="attesa">In approvazione</Etichetta>
  return <Etichetta>Bozza</Etichetta>
}

function EsitoProposta({ esito }: { esito: EsitoGenerazione }) {
  return (
    <div className="mb-4 rounded-sm border border-filo bg-white px-4 py-3 text-[13px]">
      <p className="font-medium">Proposta generata</p>
      <p className="mt-1 text-grigio">
        Quote assegnate a {esito.quote.length} persone.
        {esito.sottoQuota.length === 0 ? ' Nessuno è rimasto sotto la propria quota.'
          : ` ${esito.sottoQuota.length} sotto quota: ${esito.sottoQuota.map((s) => `${s.persona} (−${s.mancanti})`).join(', ')}.`}
      </p>
      {esito.presidiScoperti.length > 0 && (
        <p className="mt-1 text-ambra">
          Presidio scoperto in {esito.presidiScoperti.length} giornate:{' '}
          {[...new Set(esito.presidiScoperti.map((x) => x.settore))].join(', ')}.
        </p>
      )}
    </div>
  )
}

function EditorCella({ dati, selezione, abilitato, onSalvato }: {
  dati: DatiGriglia
  selezione: { userId: number; data: string } | null
  abilitato: boolean
  onSalvato: () => void
}) {
  const cella = selezione ? dati.celle.find((c) => c.userId === selezione.userId && c.data === selezione.data) : undefined
  const persona = selezione ? dati.persone.find((p) => p.id === selezione.userId) : undefined
  const [stato, setStato] = useState<'presenza' | 'smart'>('smart')
  const [roomId, setRoomId] = useState<number | null>(null)
  const [deskId, setDeskId] = useState<number | null>(null)
  const [bloccata, setBloccata] = useState(false)
  const [motivazione, setMotivazione] = useState('')
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!cella) return
    setStato(cella.stato === 'presenza' ? 'presenza' : 'smart')
    setRoomId(cella.roomId ?? dati.stanze[0]?.id ?? null)
    setDeskId(cella.deskId)
    setBloccata(cella.bloccata)
    setMotivazione('')
    setErrore(null)
  }, [cella?.userId, cella?.data, cella?.stato, cella?.roomId, cella?.deskId, cella?.bloccata, dati.stanze])

  if (!selezione || !persona) {
    return (
      <aside className="h-fit rounded-sm border border-filo bg-white p-4 text-[13px] text-tenue">
        Seleziona una cella della griglia per vederne il dettaglio.
      </aside>
    )
  }

  const pubblicato = dati.periodo.stato === 'pubblicato'
  const stanza = dati.stanze.find((s) => s.id === roomId)

  async function salva(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    try {
      await api.put(`/periodi/${dati.periodo.id}/cella`, {
        userId: selezione!.userId, data: selezione!.data, stato,
        roomId: stato === 'presenza' ? roomId : null,
        deskId: stato === 'presenza' && dati.periodo.assegnaScrivanie ? deskId : null,
        bloccata,
        motivazione: motivazione.trim() || undefined,
      })
      onSalvato()
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Salvataggio non riuscito')
    }
  }

  return (
    <aside className="h-fit rounded-sm border border-filo bg-white p-4">
      <h2 className="text-[13px] font-medium">{persona.cognome} {persona.nome}</h2>
      <p className="text-[11px] text-tenue">{selezione.data}</p>

      {cella?.stato === 'assenza' && (
        <div className="mt-3"><Avviso tipo="attenzione">
          Assenza dichiarata{cella.causale ? ` · ${cella.causale}` : ''}. La cella non è programmabile finché l'assenza resta.
        </Avviso></div>
      )}

      {!abilitato ? (
        <p className="mt-3 text-[12px] text-tenue">Non hai i permessi per modificare questa programmazione.</p>
      ) : (
        <form onSubmit={salva} className="mt-4 space-y-3">
          {errore && <Avviso tipo="errore">{errore}</Avviso>}

          <fieldset>
            <legend className="mb-1 text-xs font-medium text-grigio">Stato della giornata</legend>
            {(['presenza', 'smart'] as const).map((v) => (
              <label key={v} className="mr-4 inline-flex items-center gap-1.5 text-[13px]">
                <input type="radio" name="stato" value={v} checked={stato === v} onChange={() => setStato(v)} />
                {v === 'presenza' ? 'In sede' : 'Lavoro agile'}
              </label>
            ))}
          </fieldset>

          {stato === 'presenza' && (
            <>
              <Campo etichetta="Stanza">
                <select className={classiInput} value={roomId ?? ''} onChange={(e) => { setRoomId(Number(e.target.value)); setDeskId(null) }}>
                  {dati.stanze.map((s) => <option key={s.id} value={s.id}>{s.etichetta} · {s.capienza} postazioni</option>)}
                </select>
              </Campo>
              {dati.periodo.assegnaScrivanie && (
                <Campo etichetta="Scrivania">
                  <select className={classiInput} value={deskId ?? ''} onChange={(e) => setDeskId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Nessuna scrivania assegnata</option>
                    {(stanza?.scrivanie ?? []).map((d) => <option key={d.id} value={d.id}>Scrivania {d.numero}</option>)}
                  </select>
                </Campo>
              )}
            </>
          )}

          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={bloccata} onChange={(e) => setBloccata(e.target.checked)} />
            Blocca la cella
          </label>
          <p className="-mt-2 text-[11px] text-tenue">Una cella bloccata non viene toccata dalla generazione.</p>

          {pubblicato && (
            <Campo etichetta="Motivazione" aiuto="Obbligatoria: il periodo è pubblicato e la modifica apre una nuova versione.">
              <textarea className={classiInput} rows={3} value={motivazione} onChange={(e) => setMotivazione(e.target.value)} required />
            </Campo>
          )}

          <Bottone type="submit" variante="primario" className="w-full justify-center">Salva la cella</Bottone>
        </form>
      )}
    </aside>
  )
}

function NuovoPeriodo({ unitId, periodi, onCreato }: {
  unitId: number; periodi: Periodo[]; onCreato: (id: number) => void
}) {
  const [dataInizio, setDataInizio] = useState(oggi())
  const [dataFine, setDataFine] = useState(oggi())
  const [assegnaScrivanie, setAssegnaScrivanie] = useState(false)
  const [copiaDaId, setCopiaDaId] = useState<string>('')
  const [errore, setErrore] = useState<string | null>(null)

  async function crea(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    try {
      const r = await api.post<{ id: number }>('/periodi', {
        unitId, dataInizio, dataFine, assegnaScrivanie,
        copiaDaId: copiaDaId ? Number(copiaDaId) : null,
      })
      onCreato(r.id)
    } catch (e) {
      setErrore(e instanceof ErroreApi ? e.message : 'Creazione non riuscita')
    }
  }

  return (
    <Riquadro titolo="Nuovo periodo" descrizione="Le date sono libere: una settimana, un mese, quattro settimane.">
      <form onSubmit={crea} className="rounded-sm border border-filo bg-white p-4">
        {errore && <div className="mb-3"><Avviso tipo="errore">{errore}</Avviso></div>}
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo etichetta="Dal">
            <input type="date" className={classiInput} value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} required />
          </Campo>
          <Campo etichetta="Al">
            <input type="date" className={classiInput} value={dataFine} onChange={(e) => setDataFine(e.target.value)} required />
          </Campo>
          <Campo etichetta="Copia da">
            <select className={classiInput} value={copiaDaId} onChange={(e) => setCopiaDaId(e.target.value)}>
              <option value="">Periodo vuoto</option>
              {periodi.filter((p) => p.stato === 'pubblicato').map((p) => (
                <option key={p.id} value={p.id}>{p.dataInizio} → {p.dataFine}</option>
              ))}
            </select>
          </Campo>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-1.5 text-[13px]">
              <input type="checkbox" checked={assegnaScrivanie} onChange={(e) => setAssegnaScrivanie(e.target.checked)} />
              Assegna le scrivanie
            </label>
          </div>
        </div>
        <Bottone type="submit" variante="primario" className="mt-3">Crea il periodo</Bottone>
      </form>
    </Riquadro>
  )
}
