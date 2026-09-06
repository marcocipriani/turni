/**
 * Turni: «Oggi» e la griglia sono la stessa pagina.
 *
 * Si apre sui giorni — la domanda quotidiana è chi c'è mercoledì — e da lì si
 * passa alla griglia del periodo. Chi non programma la vede in sola lettura:
 * una destinazione sola, nessun bivio da capire prima di cliccare.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ErroreApi, type Griglia as DatiGriglia, type Periodo } from '../api'
import * as I from '../icone'
import { puoProgrammare, useSessione } from '../sessione'
import { Bottone, Messaggio, Pill, Scheletro, StatoVuoto } from '../ui'
import { Drawer, Toolbar, Vista } from '../Vista'
import { Giorni } from './Giorni'
import Griglia, { Legenda } from './Griglia'
import { EditorCella, type EsitoGenerazione, EsitoProposta, NuovoPeriodo, StatoPeriodo } from './periodo'

const oggiISO = () => new Date().toISOString().slice(0, 10)

/** Etichetta compatta di un periodo: le date bastano a riconoscerlo. */
const etichettaPeriodo = (p: Periodo) =>
  `${p.dataInizio.slice(8)}/${p.dataInizio.slice(5, 7)} → ${p.dataFine.slice(8)}/${p.dataFine.slice(5, 7)}` +
  (p.stato === 'pubblicato' ? '' : p.stato === 'in_approvazione' ? ' · in approvazione' : ' · bozza')

export default function Turni() {
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
  const [settimane, setSettimane] = useState(2)

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
    if (!id) { setDati(null); setSelezione(null); return }
    setErrore(null)
    void caricaGriglia(Number(id)).catch((e) => setErrore(e.message))
  }, [id, caricaGriglia])

  async function azione(fn: () => Promise<unknown>) {
    setErrore(null); setInCorso(true)
    try { await fn() } catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita.') }
    finally { setInCorso(false) }
  }

  if (!utente) return null
  if (unita == null) {
    return (
      <Vista titolo="Turni" icona={<I.Griglia size={17} />}>
        <StatoVuoto testo="Il tuo profilo non è associato a nessuna unità organizzativa. Chiedi all'amministratore di sistema di collegarti alla tua." />
      </Vista>
    )
  }

  const scrivibile = puoProgrammare(utente, unita)
  const inGriglia = Boolean(id)

  /** Il periodo su cui atterrare passando alla griglia: quello di oggi, o il più recente. */
  const periodoDiRiferimento = () => {
    const oggi = oggiISO()
    const lista = periodi ?? []
    return lista.find((p) => p.dataInizio <= oggi && p.dataFine >= oggi) ?? lista[0] ?? null
  }

  const p = dati?.periodo
  const modificabile = dati?.permessi.scrivere ?? false
  // Chi programma non riceve notifiche degli scambi: se ne accorge qui.
  const scambiate = (dati?.celle ?? []).filter((x) => x.daScambio).length
  const errori = (dati?.avvisi ?? []).filter((x) => x.gravita === 'errore')
  const attenzioni = (dati?.avvisi ?? []).filter((x) => x.gravita === 'attenzione')

  return (
    <Vista
      denso
      caricando={inCorso}
      titolo="Turni"
      icona={<I.Griglia size={17} />}
      aiuto={inGriglia && p
        ? `${p.dataInizio} → ${p.dataFine} · ${dati!.persone.length} persone`
        : 'Chi è in sede, e la programmazione per esteso'}
      meta={inGriglia && p ? <><StatoPeriodo periodo={p} /><span className="mono">v{p.versione}</span></> : undefined}
      azioni={
        <>
          {inGriglia && p && modificabile && p.stato !== 'pubblicato' && (
            <Comando titolo="Genera una proposta" disabled={inCorso} icona={<I.Bacchetta size={15} />}
                     onClick={() => void azione(async () => {
                       setEsito(await api.post<EsitoGenerazione>(`/periodi/${p.id}/genera`))
                       await caricaGriglia(p.id)
                     })}>Genera</Comando>
          )}
          {inGriglia && p && modificabile && p.stato !== 'pubblicato' && (
            <Comando titolo="Invia in approvazione" disabled={inCorso}
                     onClick={() => void azione(async () => {
                       await api.post(`/periodi/${p.id}/invia`); await caricaGriglia(p.id); await caricaPeriodi()
                     })}>Invia</Comando>
          )}
          {inGriglia && p && dati?.permessi.approvare && p.stato === 'in_approvazione' && (
            <>
              <Comando variante="distruttivo" titolo="Rimanda indietro" disabled={inCorso}
                       onClick={() => void azione(async () => {
                         const nota = prompt('Perché lo rimandi indietro?')
                         if (!nota) return
                         await api.post(`/periodi/${p.id}/respingi`, { nota }); await caricaGriglia(p.id)
                       })}>Respingi</Comando>
              <Comando variante="primario" titolo="Approva e pubblica" disabled={inCorso} icona={<I.Spunta size={15} />}
                       onClick={() => void azione(async () => {
                         await api.post(`/periodi/${p.id}/approva`); await caricaGriglia(p.id); await caricaPeriodi()
                       })}>Pubblica</Comando>
            </>
          )}
          {!inGriglia && scrivibile && (
            <Comando variante="primario" titolo="Nuovo periodo" icona={<I.Piu size={15} />}
                     onClick={() => setNuovoAperto(true)}>Nuovo</Comando>
          )}
          <Bottone variante="icona" title="Stampa" aria-label="Stampa"
                   onClick={() => navigate(inGriglia && p ? `/stampa/periodo?id=${p.id}` : '/stampa/giorno')}>
            <I.Stampa size={17} />
          </Bottone>
        </>
      }
    >
      <Toolbar>
        <div role="radiogroup" aria-label="Come guardare i turni"
             className="inline-flex overflow-hidden rounded-r2 border border-border-controllo">
          <BottoneVista attivo={!inGriglia} onClick={() => navigate('/turni')}>Giorni</BottoneVista>
          <BottoneVista
            attivo={inGriglia}
            disabled={(periodi?.length ?? 0) === 0}
            onClick={() => { const r = periodoDiRiferimento(); if (r) navigate(`/turni/${r.id}`) }}
          >Griglia</BottoneVista>
        </div>

        {inGriglia ? (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="solo-lettori-schermo">Periodo</span>
            <select
              value={id ?? ''} onChange={(e) => navigate(`/turni/${e.target.value}`)}
              className="min-h-[32px] cursor-pointer rounded-r2 border border-border-controllo bg-bg px-2 text-sm text-ink"
            >
              {(periodi ?? []).map((x) => (
                <option key={x.id} value={x.id}>{etichettaPeriodo(x)}</option>
              ))}
            </select>
          </label>
        ) : (
          <div role="radiogroup" aria-label="Quante settimane mostrare"
               className="inline-flex overflow-hidden rounded-r2 border border-border-controllo">
            {[2, 4].map((n) => (
              <BottoneVista key={n} attivo={settimane === n} onClick={() => setSettimane(n)}>
                {n} settimane
              </BottoneVista>
            ))}
          </div>
        )}

        {inGriglia && dati && (
          <>
            <span className="hidden lg:block"><Legenda /></span>
            <span className="ml-auto flex items-center gap-3 text-sm">
              {scambiate > 0 && (
                <span className="text-ink-muted" title="Giornate nate da uno scambio fra colleghi">
                  <span className="mono">{scambiate}</span> da scambi
                </span>
              )}
              {errori.length > 0 && <Pill tono="errore">{errori.length} da risolvere</Pill>}
              {attenzioni.length > 0 && <Pill tono="attesa">{attenzioni.length} segnalazioni</Pill>}
              {errori.length === 0 && attenzioni.length === 0 && <Pill tono="ok">Nessun conflitto</Pill>}
            </span>
          </>
        )}
      </Toolbar>

      {errore && <div className="px-4 py-2"><Messaggio tono="errore">{errore}</Messaggio></div>}

      {!inGriglia && <Giorni settimane={settimane} />}

      {inGriglia && !dati && !errore && <div className="p-4 md:p-6"><Scheletro righe={6} /></div>}

      {inGriglia && dati && p && (
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid min-h-0 grid-rows-[auto_1fr]">
            <div className="flex flex-col gap-2 px-4 py-2 empty:hidden">
              {p.notaApprovazione && <Messaggio tono="attenzione">Rimandato indietro: {p.notaApprovazione}</Messaggio>}
              {errori.length > 0 && (
                <Messaggio tono="errore">
                  <ul className="list-inside list-disc">{errori.slice(0, 5).map((x, i) => <li key={i}>{x.messaggio}</li>)}</ul>
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
      )}

      <NuovoPeriodo
        aperto={nuovoAperto} onChiudi={() => setNuovoAperto(false)} unitId={unita}
        periodi={periodi ?? []} onCreato={(pid) => { setNuovoAperto(false); navigate(`/turni/${pid}`) }}
      />
    </Vista>
  )
}

/** Comando dell'header: icona sempre, parola solo quando c'è larghezza. */
function Comando({ titolo, icona, children, variante = 'normale', ...resto }: {
  titolo: string; icona?: React.ReactNode; children: React.ReactNode
  variante?: 'normale' | 'primario' | 'distruttivo'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Bottone variante={variante} title={titolo} aria-label={titolo} {...resto}>
      {icona}<span className="hidden sm:inline">{children}</span>
    </Bottone>
  )
}

function BottoneVista({ attivo, children, ...resto }: {
  attivo: boolean; children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button" role="radio" aria-checked={attivo} {...resto}
      className={`min-h-[32px] cursor-pointer px-2.5 text-sm transition-colors duration-[120ms] ease-out
                  disabled:cursor-not-allowed disabled:opacity-50
                  ${attivo ? 'bg-action text-action-ink' : 'bg-bg text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      {children}
    </button>
  )
}
