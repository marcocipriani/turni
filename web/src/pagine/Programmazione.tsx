import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ErroreApi, type Griglia as DatiGriglia, type Periodo } from '../api'
import * as I from '../icone'
import { puoProgrammare, useSessione } from '../sessione'
import {
  Badge, Bottone, Campo, inputCls, Messaggio, Modale, Pannello, Pill, Scheletro, StatoVuoto,
} from '../ui'
import { Drawer, Toolbar, Vista } from '../Vista'
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

  const [periodi, setPeriodi] = useState<Periodo[] | null>(null)
  const [dati, setDati] = useState<DatiGriglia | null>(null)
  const [selezione, setSelezione] = useState<{ userId: number; data: string } | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [esito, setEsito] = useState<EsitoGenerazione | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [nuovoAperto, setNuovoAperto] = useState(false)

  const unita = useMemo(() => {
    if (!utente) return null
    return utente.ruolo === 'dirigente' ? utente.unitId : utente.organizzatoreDi[0] ?? utente.unitId
  }, [utente])

  const caricaPeriodi = useCallback(async () => {
    if (unita == null) return
    setPeriodi(await api.get<Periodo[]>(`/periodi?unitId=${unita}`))
  }, [unita])

  const caricaGriglia = useCallback(async (pid: number) => {
    setEsito(null)
    setDati(await api.get<DatiGriglia>(`/periodi/${pid}/griglia`))
  }, [])

  useEffect(() => { void caricaPeriodi() }, [caricaPeriodi])
  useEffect(() => {
    if (!id) { setDati(null); return }
    void caricaGriglia(Number(id)).catch((e) => setErrore(e.message))
  }, [id, caricaGriglia])

  async function azione(fn: () => Promise<unknown>) {
    setErrore(null); setInCorso(true)
    try { await fn() } catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita.') }
    finally { setInCorso(false) }
  }

  if (!utente) return null
  if (unita == null) {
    return <Vista titolo="Turni" icona={<I.Griglia size={17} />}>
      <StatoVuoto testo="Il tuo profilo non è associato a nessuna unità organizzativa. Chiedi all'amministratore di sistema di collegarti alla tua." />
    </Vista>
  }

  const scrivibile = puoProgrammare(utente, unita)

  /* ── Elenco dei periodi ───────────────────────────────────────── */
  if (!id) {
    return (
      <Vista
        titolo="Turni" icona={<I.Griglia size={17} />} aiuto="I periodi programmati della tua unità"
        meta={periodi && <span className="mono">{periodi.length} periodi</span>}
        azioni={scrivibile && <Bottone variante="primario" onClick={() => setNuovoAperto(true)}><I.Piu size={15} />Nuovo periodo</Bottone>}
      >
        {errore && <div className="mb-4"><Messaggio tono="errore">{errore}</Messaggio></div>}

        {periodi === null ? <Scheletro righe={4} />
          : periodi.length === 0 ? (
            <StatoVuoto
              testo="Nessun periodo. Un periodo copre le date che vuoi: una settimana, un mese, quattro settimane."
              azione={scrivibile ? <Bottone variante="primario" onClick={() => setNuovoAperto(true)}>Crea il primo periodo</Bottone> : undefined}
            />
          ) : (
            <ul className="max-w-[70ch] divide-y divide-border overflow-hidden rounded-r3 border border-border bg-surface">
              {periodi.map((p) => (
                <li key={p.id}>
                  <button onClick={() => navigate(`/programmazione/${p.id}`)}
                          className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-2">
                    <span className="mono text-base text-ink">{p.dataInizio} → {p.dataFine}</span>
                    <span className="flex items-center gap-3">
                      <span className="mono text-2xs text-ink-faint">v{p.versione}</span>
                      <StatoPeriodo periodo={p} />
                      <I.Freccia size={15} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

        <NuovoPeriodo
          aperto={nuovoAperto} onChiudi={() => setNuovoAperto(false)} unitId={unita}
          periodi={periodi ?? []} onCreato={(pid) => { setNuovoAperto(false); navigate(`/programmazione/${pid}`) }}
        />
      </Vista>
    )
  }

  /* ── Griglia di un periodo ────────────────────────────────────── */
  if (!dati) return <Vista titolo="Turni" icona={<I.Griglia size={17} />} caricando><Scheletro righe={6} /></Vista>

  const p = dati.periodo
  const modificabile = dati.permessi.scrivere
  const errori = dati.avvisi.filter((a) => a.gravita === 'errore')
  const attenzioni = dati.avvisi.filter((a) => a.gravita === 'attenzione')

  return (
    <Vista
      denso caricando={inCorso}
      titolo={`${p.dataInizio} → ${p.dataFine}`}
      icona={<I.Griglia size={17} />}
      aiuto={`${dati.giorni.length} giornate · ${dati.persone.length} persone${p.assegnaScrivanie ? ' · per scrivania' : ''}`}
      meta={<><StatoPeriodo periodo={p} /><span className="mono">v{p.versione}</span></>}
      azioni={
        <>
          {modificabile && p.stato !== 'pubblicato' && (
            <Bottone disabled={inCorso} onClick={() => void azione(async () => {
              setEsito(await api.post<EsitoGenerazione>(`/periodi/${p.id}/genera`))
              await caricaGriglia(p.id)
            })}><I.Bacchetta size={15} />Genera</Bottone>
          )}
          {modificabile && p.stato !== 'pubblicato' && (
            <Bottone disabled={inCorso} onClick={() => void azione(async () => {
              await api.post(`/periodi/${p.id}/invia`); await caricaGriglia(p.id)
            })}>Invia in approvazione</Bottone>
          )}
          {dati.permessi.approvare && p.stato === 'in_approvazione' && (
            <>
              <Bottone variante="distruttivo" disabled={inCorso} onClick={() => void azione(async () => {
                const nota = prompt('Perché lo rimandi indietro?')
                if (!nota) return
                await api.post(`/periodi/${p.id}/respingi`, { nota }); await caricaGriglia(p.id)
              })}>Respingi</Bottone>
              <Bottone variante="primario" disabled={inCorso} onClick={() => void azione(async () => {
                await api.post(`/periodi/${p.id}/approva`); await caricaGriglia(p.id)
              })}><I.Spunta size={15} />Approva e pubblica</Bottone>
            </>
          )}
          <a href={`/api/periodi/${p.id}/export.csv`}
             className="inline-flex cursor-pointer items-center gap-2 rounded-r2 border border-border-strong bg-bg
                        px-3 py-1.5 text-base text-ink transition-colors duration-[120ms] hover:bg-surface-2">
            <I.Scarica size={15} />CSV
          </a>
        </>
      }
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid min-h-0 grid-rows-[auto_auto_1fr]">
          <Toolbar>
            <Legenda />
            <span className="ml-auto flex items-center gap-3 text-sm">
              {errori.length > 0 && <Pill tono="errore">{errori.length} da risolvere</Pill>}
              {attenzioni.length > 0 && <Pill tono="attesa">{attenzioni.length} segnalazioni</Pill>}
              {errori.length === 0 && attenzioni.length === 0 && <Pill tono="ok">Nessun conflitto</Pill>}
            </span>
          </Toolbar>

          <div className="flex flex-col gap-2 px-4 py-2 empty:hidden">
            {errore && <Messaggio tono="errore">{errore}</Messaggio>}
            {p.notaApprovazione && <Messaggio tono="attenzione">Rimandato indietro: {p.notaApprovazione}</Messaggio>}
            {errori.length > 0 && (
              <Messaggio tono="errore">
                <ul className="list-inside list-disc">{errori.slice(0, 5).map((a, i) => <li key={i}>{a.messaggio}</li>)}</ul>
              </Messaggio>
            )}
            {esito && <EsitoProposta esito={esito} />}
          </div>

          <Griglia dati={dati} selezione={selezione} onSeleziona={setSelezione} />
        </div>

        {selezione && (
          <Drawer titolo="Cella" onChiudi={() => setSelezione(null)}>
            <EditorCella dati={dati} selezione={selezione} abilitato={modificabile}
                         onSalvato={() => void caricaGriglia(p.id)} />
          </Drawer>
        )}
      </div>
    </Vista>
  )
}

function StatoPeriodo({ periodo }: { periodo: Periodo }) {
  if (periodo.stato === 'pubblicato') return <Pill tono="ok">Pubblicato</Pill>
  if (periodo.stato === 'in_approvazione') return <Pill tono="attesa">In approvazione</Pill>
  return <Badge>bozza</Badge>
}

function EsitoProposta({ esito }: { esito: EsitoGenerazione }) {
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

function EditorCella({ dati, selezione, abilitato, onSalvato }: {
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
    setBloccata(cella?.bloccata ?? false)
    setMotivazione(''); setErrore(null)
  }, [selezione.userId, selezione.data, cella?.stato, cella?.roomId, cella?.deskId, cella?.bloccata, dati.stanze])

  if (!persona) return null
  const pubblicato = dati.periodo.stato === 'pubblicato'
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
        <p className="text-base text-ink-faint">Non hai i permessi per modificare questa programmazione.</p>
      ) : (
        <form onSubmit={salva} className="flex flex-col gap-4">
          {errore && <Messaggio tono="errore">{errore}</Messaggio>}

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-ink-muted">Stato della giornata</legend>
            <div className="flex flex-col gap-1.5">
              {([['presenza', 'In sede'], ['smart', 'Lavoro agile']] as const).map(([v, t]) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 text-base">
                  <input type="radio" name="stato" value={v} checked={stato === v} onChange={() => setStato(v)} />
                  {t}
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
              <span className="block text-sm text-ink-faint">La generazione non la tocca più.</span>
            </span>
          </label>

          {pubblicato && (
            <Campo etichetta="Motivazione" aiuto="Il periodo è pubblicato: la modifica apre una nuova versione da riapprovare.">
              <textarea className={`${inputCls} min-h-[56px] resize-y`} rows={3} required
                        value={motivazione} onChange={(e) => setMotivazione(e.target.value)} />
            </Campo>
          )}

          <Bottone type="submit" variante="primario" className="justify-center">Salva</Bottone>
        </form>
      )}
    </div>
  )
}

function NuovoPeriodo({ aperto, onChiudi, unitId, periodi, onCreato }: {
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
