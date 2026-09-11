/**
 * Turni: «Oggi» e la griglia sono la stessa pagina.
 *
 * Si apre sui giorni — la domanda quotidiana è chi c'è mercoledì — e da lì si
 * passa alla griglia del periodo. Chi non programma la vede in sola lettura:
 * una destinazione sola, nessun bivio da capire prima di cliccare.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, type Cella, type Griglia as DatiGriglia, type Periodo } from '../api'
import { type StatoBottone, useAzione } from '../azioni'
import { addDays, lunediDi, oggiISO } from '../date'
import * as I from '../icone'
import { puoProgrammare, useSessione } from '../sessione'
import { APTICO, direzioneSwipe, vibra } from '../tocco'
import { Bottone, Messaggio, Pill, Scheletro, stileBottone, StatoVuoto } from '../ui'
import { Drawer, Toolbar, Vista } from '../Vista'
import { ModaleCambiamenti } from './cambiamenti'
import { Giorni } from './Giorni'
import Griglia, { type CellaModifica, Legenda } from './Griglia'
import { MenuCella, vociMenu } from './MenuCella'
import { AvvisoNovita, quando } from './novita'
import {
  EditorCella, type EsitoGenerazione, EsitoProposta, ModaleAssenzaPerConto, ModaleNota, NuovoPeriodo,
  periodoDiRiferimento, StatoPeriodo,
} from './periodo'

const gg = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`

/** Che tratto di calendario si sta guardando: senza, le frecce spostano al buio. */
const finestra = (da: string, settimane: number) => `${gg(da)} → ${gg(addDays(da, settimane * 7 - 1))}`

/** Etichetta compatta di un periodo: le date bastano a riconoscerlo. */
const etichettaPeriodo = (p: Periodo) =>
  `${p.dataInizio.slice(8)}/${p.dataInizio.slice(5, 7)} → ${p.dataFine.slice(8)}/${p.dataFine.slice(5, 7)}` +
  (p.revisioneDi != null ? ' · revisione' : '') +
  (p.stato === 'pubblicato' ? '' : p.stato === 'in_approvazione' ? ' · in approvazione' : ' · bozza')

export default function Turni() {
  const { utente } = useSessione()
  const navigate = useNavigate()
  const { id } = useParams()
  const [query] = useSearchParams()

  const [periodi, setPeriodi] = useState<Periodo[] | null>(null)
  const [dati, setDati] = useState<DatiGriglia | null>(null)
  const [selezione, setSelezione] = useState<{ userId: number; data: string } | null>(null)
  const azione = useAzione()
  const { errore, setErrore } = azione
  const [esito, setEsito] = useState<EsitoGenerazione | null>(null)
  const [nuovoAperto, setNuovoAperto] = useState(false)
  const [cambiamentiAperti, setCambiamentiAperti] = useState(false)
  const [respingiAperto, setRespingiAperto] = useState(false)
  const [cerca, setCerca] = useState('')
  const [soloSettore, setSoloSettore] = useState(false)
  /* Modalità modifica: fuori, la griglia si legge e basta — anche per chi
     programma. Dentro, si trascina e si apre il menu delle celle. */
  const [modifica, setModifica] = useState(false)
  const [menu, setMenu] = useState<{ sel: { userId: number; data: string }; pos: { x: number; y: number } | null } | null>(null)
  const [assenzaPer, setAssenzaPer] = useState<{ userId: number; data: string } | null>(null)
  const [richiestaAperta, setRichiestaAperta] = useState(false)
  // Una settimana: è la domanda che si fa entrando — «questa settimana chi
  // c'è» — e a una sola le colonne si allargano invece di scorrere.
  const [settimane, setSettimane] = useState(1)
  /* Il raggruppamento per settore serve a due domande diverse, e ha due
     risposte diverse di partenza: nella griglia il settore è il criterio con
     cui si costruiscono i turni — il presidio si legge lì — mentre nei giorni
     si cerca una persona, e un elenco solo per cognome è più corto da
     scorrere. Due stati, così passare da una vista all'altra non ribalta la
     scelta appena fatta nell'altra. */
  const [raggruppaGriglia, setRaggruppaGriglia] = useState(true)
  const [raggruppaGiorni, setRaggruppaGiorni] = useState(false)
  const [inizio, setInizio] = useState(() => lunediDi(oggiISO()))

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

  // Tornando ai giorni la modifica si spegne; passare dall'originale alla sua
  // revisione resta dentro la griglia, e la modifica resta accesa.
  useEffect(() => { if (!id) setModifica(false) }, [id])

  const pid = dati?.periodo.id
  /** Scrive e ricarica: ogni gesto della modalità modifica passa da qui. */
  const scriviCelle = useCallback((celle: CellaModifica[]) => {
    if (pid == null) return
    void azione.esegui(async () => {
      await api.put(`/periodi/${pid}/celle`, { celle }); await caricaGriglia(pid)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, caricaGriglia])
  const apriMenu = useCallback((sel: { userId: number; data: string }, pos: { x: number; y: number } | null) =>
    setMenu({ sel, pos }), [])

  /* Chi preferisce la griglia ci atterra entrando da «Turni»; chi preme
     «Giorni» porta con sé `?vista=giorni` e resta sui giorni. */
  useEffect(() => {
    if (id || query.get('vista') || utente?.preferenze?.vistaTurni !== 'griglia' || !periodi) return
    const r = periodoDiRiferimento(periodi)
    if (r) navigate(`/turni/${r.id}`, { replace: true })
  }, [id, query, periodi, utente, navigate])
  useEffect(() => {
    if (!id) { setDati(null); setSelezione(null); return }
    setErrore(null)
    void caricaGriglia(Number(id)).catch((e) => setErrore(e.message))
  }, [id, caricaGriglia])


  /* Sfogliare col dito. Le frecce restano — sono l'unico appiglio da tastiera
     e col mouse — ma su un calendario il gesto che viene in mente è trascinare.
     Solo col dito: col mouse un trascinamento è una selezione di testo.
     `touch-action` lascia lo scorrimento verticale e la pinza, e toglie al
     browser il pan orizzontale, che qui è il nostro. */
  const partenzaTocco = useRef<{ x: number; y: number } | null>(null)
  const appenaScorso = useRef(false)

  function sposta(passi: number) {
    vibra(APTICO.spostamento)
    setInizio((d) => addDays(d, passi * settimane * 7))
  }

  function fineTocco(e: React.PointerEvent) {
    const da = partenzaTocco.current
    partenzaTocco.current = null
    if (!da) return
    const verso = direzioneSwipe(e.clientX - da.x, e.clientY - da.y)
    if (verso === 0) return
    appenaScorso.current = true
    sposta(verso)
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

  const p = dati?.periodo
  const modificabile = dati?.permessi.scrivere ?? false
  // Chi programma non riceve notifiche degli scambi: se ne accorge qui.
  const scambiate = (dati?.celle ?? []).filter((x) => x.daScambio).length
  const errori = (dati?.avvisi ?? []).filter((x) => x.gravita === 'errore')
  const attenzioni = (dati?.avvisi ?? []).filter((x) => x.gravita === 'attenzione')

  return (
    <Vista
      denso
      caricando={azione.inCorso}
      titolo="Turni"
      icona={<I.Griglia size={17} />}
      aiuto={inGriglia && p
        ? `${p.dataInizio} → ${p.dataFine} · ${dati!.persone.length} persone`
        : 'Chi è in sede, e la programmazione per esteso'}
      meta={inGriglia && p
        ? <>
            <StatoPeriodo periodo={p} />
            <span className="mono">v{p.versione}</span>
            {/* Una versione senza la sua data non dice niente: sapere che è la
                seconda serve solo se si sa da quando. */}
            {p.aggiornatoIl && (
              <span title={`Ultimo aggiornamento: ${quando(p.aggiornatoIl)}`}>
                {p.versione > 1 ? 'aggiornata' : 'pubblicata'} il {quando(p.aggiornatoIl)}
              </span>
            )}
          </>
        : undefined}
      azioni={
        <>
          {inGriglia && p && modificabile && p.stato !== 'pubblicato' && (
            <Comando titolo="Genera una proposta" stato={azione.statoDi('genera')} disabled={azione.inCorso} icona={<I.Bacchetta size={15} />}
                     onClick={() => void azione.esegui(async () => {
                       setEsito(await api.post<EsitoGenerazione>(`/periodi/${p.id}/genera`))
                       await caricaGriglia(p.id)
                     }, 'genera')}>Genera</Comando>
          )}
          {inGriglia && p && modificabile && p.stato === 'bozza' && (
            <Comando titolo={p.revisioneDi != null ? 'Richiedi approvazione' : 'Invia in approvazione'}
                     stato={azione.statoDi('invia')} disabled={azione.inCorso} icona={<I.Freccia size={15} />}
                     onClick={() => setRichiestaAperta(true)}>
              {p.revisioneDi != null ? 'Richiedi approvazione' : 'Invia'}
            </Comando>
          )}
          {inGriglia && p && dati?.permessi.approvare && p.stato === 'in_approvazione' && (
            <>
              <Comando variante="distruttivo" titolo="Rimanda indietro" stato={azione.statoDi('respingi')} disabled={azione.inCorso}
                       icona={<I.Croce size={15} />}
                       onClick={() => setRespingiAperto(true)}>Respingi</Comando>
              <Comando variante="primario" titolo="Approva e pubblica" stato={azione.statoDi('pubblica')} disabled={azione.inCorso} icona={<I.Spunta size={15} />}
                       onClick={() => void azione.esegui(async () => {
                         await api.post(`/periodi/${p.id}/approva`); await caricaGriglia(p.id); await caricaPeriodi()
                       }, 'pubblica')}>Pubblica</Comando>
            </>
          )}
          {!inGriglia && scrivibile && (
            <Comando variante="primario" titolo="Nuovo periodo" icona={<I.Piu size={15} />}
                     onClick={() => setNuovoAperto(true)}>Nuovo</Comando>
          )}
          {inGriglia && p && (
            <a href={`/api/periodi/${p.id}/export.csv`} title="Scarica il periodo in CSV"
               aria-label="Scarica il periodo in CSV" className={stileBottone('icona')}>
              <I.Scarica size={17} />
            </a>
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
          <BottoneVista attivo={!inGriglia} onClick={() => navigate('/turni?vista=giorni')}>Giorni</BottoneVista>
          <BottoneVista
            attivo={inGriglia}
            disabled={(periodi?.length ?? 0) === 0}
            onClick={() => { const r = periodoDiRiferimento(periodi ?? []); if (r) navigate(`/turni/${r.id}`) }}
          >Griglia</BottoneVista>
        </div>

        {inGriglia ? (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="solo-lettori-schermo">Periodo</span>
            <select
              value={id ?? ''} onChange={(e) => navigate(`/turni/${e.target.value}`)}
              className="min-h-[32px] cursor-pointer rounded-r2 border border-border-controllo bg-bg px-2 text-sm text-ink"
            >
              {/* Si può arrivare da un collegamento a un periodo che non sta in
                  questo elenco — il dirigente è programmato nell'unità del
                  padre, e l'avviso di una nuova programmazione porta lì. Senza
                  questa voce il menu mostrerebbe un periodo diverso da quello
                  che si sta guardando. */}
              {p && !(periodi ?? []).some((x) => x.id === p.id) && (
                <option value={p.id}>{etichettaPeriodo(p)}</option>
              )}
              {(periodi ?? []).map((x) => (
                <option key={x.id} value={x.id}>{etichettaPeriodo(x)}</option>
              ))}
            </select>
          </label>
        ) : null}

        {inGriglia && p && modificabile ? (
          <Bottone variante={modifica ? 'primario' : 'normale'} aria-pressed={modifica}
                   stato={azione.statoDi('modifica')} disabled={azione.inCorso}
                   title={modifica ? 'Esci dalla modalità modifica' : 'Modifica la griglia: trascina, o tasto destro su una cella'}
                   onClick={() => void azione.esegui(async () => {
                     if (modifica) { setModifica(false); return }
                     // Il pubblicato non si tocca: si lavora sul suo gemello, che i
                     // colleghi non vedono finché il dirigente non lo approva.
                     if (p.stato === 'pubblicato') {
                       const { id: gid } = await api.post<{ id: number }>(`/periodi/${p.id}/revisione`)
                       await caricaPeriodi()
                       navigate(`/turni/${gid}`)
                     }
                     setModifica(true)
                   }, 'modifica')}>
            <I.Matita size={15} />{modifica ? 'Fine' : 'Modifica'}
          </Bottone>
        ) : null}

        {!inGriglia && (
          <>
            <div role="radiogroup" aria-label="Quante settimane mostrare"
                 className="inline-flex overflow-hidden rounded-r2 border border-border-controllo">
              {[1, 2, 4].map((n) => (
                <BottoneVista key={n} attivo={settimane === n} onClick={() => setSettimane(n)}
                              aria-label={n === 1 ? '1 settimana' : `${n} settimane`}>
                  {/* Per esteso quando c'è spazio. Sotto i 460px i due
                      interruttori non ci starebbero sulla stessa riga: la
                      parola si abbrevia, ma non sparisce. */}
                  <span className="min-[460px]:hidden">{n} sett.</span>
                  <span className="hidden min-[460px]:inline">{n === 1 ? '1 settimana' : `${n} settimane`}</span>
                </BottoneVista>
              ))}
            </div>

            <div className="inline-flex items-center gap-1">
              <Bottone variante="icona" title="Indietro" aria-label="Settimane precedenti"
                       onClick={() => sposta(-1)}>
                <I.Freccia size={16} className="rotate-180" />
              </Bottone>
              <Bottone variante="icona" title="Avanti" aria-label="Settimane successive"
                       onClick={() => sposta(1)}>
                <I.Freccia size={16} />
              </Bottone>
              {inizio !== lunediDi(oggiISO()) && (
                <Bottone title="Torna a questa settimana"
                         onClick={() => { vibra(APTICO.spostamento); setInizio(lunediDi(oggiISO())) }}>
                  Oggi
                </Bottone>
              )}
            </div>

            <span className="text-sm text-ink-muted">{finestra(inizio, settimane)}</span>

            <input
              type="search" value={cerca} onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca una persona" aria-label="Cerca una persona"
              className="min-h-[32px] w-full rounded-r2 border border-border-controllo bg-bg px-2 text-sm text-ink
                         max-sm:min-h-[44px] sm:w-44"
            />
            {utente.sectorId != null && (
              <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted">
                <input type="checkbox" className="size-3.5 cursor-pointer" checked={soloSettore}
                       onChange={(e) => { vibra(); setSoloSettore(e.target.checked) }} />
                Solo il mio settore
              </label>
            )}
          </>
        )}

        {/* Il cognome ordina sempre, in tutte e due le viste: non è una scelta.
            L'unica scelta è se spezzare gli elenchi per settore. */}
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted">
          <input
            type="checkbox" className="size-3.5 cursor-pointer"
            checked={inGriglia ? raggruppaGriglia : raggruppaGiorni}
            onChange={(e) => { vibra(); (inGriglia ? setRaggruppaGriglia : setRaggruppaGiorni)(e.target.checked) }}
          />
          Raggruppa per settore
        </label>

        {inGriglia && dati && (
          <>
            <span className="hidden lg:block"><Legenda /></span>
            <span className="ml-auto flex items-center gap-3 text-sm">
              {/* Dalla seconda versione in poi la domanda che segue è sempre
                  «cosa è cambiato»: la risposta era già in archivio, e non la
                  guardava nessuno. Sta qui e non in testata perché la testata
                  sotto i 1024px non si vede. */}
              {p && p.versione > 1 && (
                <button type="button" onClick={() => setCambiamentiAperti(true)}
                        className="mono cursor-pointer rounded-r1 px-1 text-ink-muted underline
                                   underline-offset-2 hover:bg-surface-2 hover:text-ink">
                  Cosa è cambiato
                </button>
              )}
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

      <div className="px-4 pt-2 empty:hidden"><AvvisoNovita /></div>

      {!inGriglia && (
        <div
          style={{ touchAction: 'pan-y pinch-zoom' }}
          onPointerDown={(e) => {
            appenaScorso.current = false
            partenzaTocco.current = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : null
          }}
          onPointerUp={fineTocco}
          onPointerCancel={() => { partenzaTocco.current = null }}
          onClickCapture={(e) => {
            // Il clic arriva dopo il gesto e sullo stesso elemento: senza
            // questo, sfogliare partendo da un «chi manca» lo aprirebbe anche.
            if (!appenaScorso.current) return
            appenaScorso.current = false
            e.preventDefault(); e.stopPropagation()
          }}
        >
          <Giorni settimane={settimane} da={inizio} raggruppa={raggruppaGiorni}
                  filtro={{ testo: cerca, settore: soloSettore ? utente.sectorId : null }} />
        </div>
      )}

      {inGriglia && !dati && !errore && <div className="p-4 md:p-6"><Scheletro righe={6} /></div>}

      {inGriglia && dati && p && (
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid min-h-0 grid-rows-[auto_1fr]">
            <div className="flex flex-col gap-2 px-4 py-2 empty:hidden">
              {/* In ordine di peso: prima quello che blocca la pubblicazione,
                  poi quello che va guardato, per ultimo l'esito di una scelta. */}
              {errori.length > 0 && (
                <Messaggio tono="errore"
                           titolo={`${errori.length} ${errori.length === 1 ? 'conflitto' : 'conflitti'} da risolvere`}>
                  <ul className="list-inside list-disc">{errori.slice(0, 5).map((x, i) => <li key={i}>{x.messaggio}</li>)}</ul>
                  {errori.length > 5 && <p className="mt-0.5">e altri {errori.length - 5}.</p>}
                </Messaggio>
              )}
              {p.notaApprovazione && (
                <Messaggio tono="attenzione" titolo="Rimandato indietro">{p.notaApprovazione}</Messaggio>
              )}
              {p.revisioneDi != null && (
                <Messaggio tono="info" titolo={`Revisione della versione ${p.versione}`}>
                  I colleghi vedono ancora la versione pubblicata finché questa non è approvata.
                  {p.stato === 'bozza' && modificabile && (
                    <span className="mt-1.5 flex gap-2">
                      <Bottone variante="distruttivo" stato={azione.statoDi('scarta')}
                               onClick={() => void azione.esegui(async () => {
                                 if (!confirm('Scartare la revisione? Le modifiche fatte qui si perdono.')) return
                                 const r = await api.del<{ originale: number }>(`/periodi/${p.id}`)
                                 setModifica(false); await caricaPeriodi(); navigate(`/turni/${r.originale}`)
                               }, 'scarta')}>Scarta revisione</Bottone>
                    </span>
                  )}
                </Messaggio>
              )}
              {(() => {
                const rev = periodi?.find((x) => x.id === p.id)?.revisione
                return rev != null && (
                  <Messaggio tono="attenzione">
                    C'è una revisione aperta di questo periodo.{' '}
                    <button type="button" className="cursor-pointer underline" onClick={() => navigate(`/turni/${rev}`)}>
                      Aprila
                    </button>
                  </Messaggio>
                )
              })()}
              {attenzioni.length > 0 && (
                <Messaggio tono="attenzione"
                           titolo={`${attenzioni.length} ${attenzioni.length === 1 ? 'segnalazione' : 'segnalazioni'}`}>
                  <ul className="list-inside list-disc">{attenzioni.slice(0, 5).map((x, i) => <li key={i}>{x.messaggio}</li>)}</ul>
                  {attenzioni.length > 5 && <p className="mt-0.5">e altre {attenzioni.length - 5}.</p>}
                </Messaggio>
              )}
              {esito && <EsitoProposta esito={esito} />}
            </div>
            <Griglia dati={dati} selezione={selezione} onSeleziona={setSelezione}
                     raggruppa={raggruppaGriglia} ioId={utente.id}
                     modifica={modifica && modificabile} onCambia={scriviCelle} onMenu={apriMenu} />
          </div>

          {selezione && (
            <Drawer titolo="Cella" onChiudi={() => setSelezione(null)}>
              <EditorCella dati={dati} selezione={selezione} abilitato={modificabile && modifica}
                           onSalvato={() => void caricaGriglia(p.id)} />
            </Drawer>
          )}
        </div>
      )}

      {dati && p && menu && (() => {
        const c = dati.celle.find((x) => x.userId === menu.sel.userId && x.data === menu.sel.data)
        const chi = dati.persone.find((x) => x.id === menu.sel.userId)
        if (!c || !chi) return null
        const occupati = new Map<number, number>()
        for (const x of dati.celle) {
          if (x.data === c.data && x.stato === 'presenza' && x.roomId != null) {
            occupati.set(x.roomId, (occupati.get(x.roomId) ?? 0) + 1)
          }
        }
        const cambia = (m: Partial<CellaModifica>) => scriviCelle([{ ...comeModifica(c), ...m }])
        return (
          <MenuCella
            titolo={`${chi.cognome} ${chi.nome} · ${c.data}`} posizione={menu.pos}
            voci={vociMenu(c, dati.stanze, occupati)}
            onChiudi={() => setMenu(null)}
            onScegli={(k) => {
              setMenu(null)
              if (k.startsWith('stanza:')) cambia({ stato: 'presenza', roomId: Number(k.slice(7)), deskId: null })
              else if (k === 'remoto') cambia({ stato: 'smart', roomId: null, deskId: null })
              else if (k === 'blocca') cambia({ bloccata: true })
              else if (k === 'sblocca') cambia({ bloccata: false })
              else if (k === 'dettagli') setSelezione(menu.sel)
              else if (k === 'assenza') setAssenzaPer(menu.sel)
              else if (k === 'togli-assenza') {
                void azione.esegui(async () => { await api.del(`/assenze/${c.assenzaId}`); await caricaGriglia(p.id) })
              }
            }}
          />
        )
      })()}

      {dati && p && (
        <ModaleAssenzaPerConto
          persona={assenzaPer ? dati.persone.find((x) => x.id === assenzaPer.userId) ?? null : null}
          data={assenzaPer?.data ?? ''} aperta={assenzaPer != null}
          onChiudi={() => setAssenzaPer(null)} onFatto={() => void caricaGriglia(p.id)} />
      )}

      {p && (
        <ModaleNota
          titolo={p.revisioneDi != null ? 'Richiedi approvazione' : 'Invia in approvazione'}
          etichetta="Nota per il dirigente" obbligatoria={false} conferma={p.revisioneDi != null ? 'Richiedi' : 'Invia'}
          aperta={richiestaAperta} onChiudi={() => setRichiestaAperta(false)}
          onConferma={async (nota) => {
            await api.post(`/periodi/${p.id}/invia`, { nota: nota || undefined })
            setModifica(false); await caricaGriglia(p.id); await caricaPeriodi()
          }}
        />
      )}

      {p && (
        <ModaleNota
          titolo="Rimanda indietro" etichetta="Perché lo rimandi indietro?" obbligatoria
          conferma="Respingi" variante="distruttivo"
          aperta={respingiAperto} onChiudi={() => setRespingiAperto(false)}
          onConferma={async (nota) => {
            await api.post(`/periodi/${p.id}/respingi`, { nota })
            await caricaGriglia(p.id); await caricaPeriodi()
          }}
        />
      )}

      <NuovoPeriodo
        aperto={nuovoAperto} onChiudi={() => setNuovoAperto(false)} unitId={unita}
        periodi={periodi ?? []} onCreato={(pid) => { setNuovoAperto(false); navigate(`/turni/${pid}`) }}
      />

      {p && (
        <ModaleCambiamenti
          periodId={p.id} versioneCorrente={p.versione}
          aperta={cambiamentiAperti} onChiudi={() => setCambiamentiAperti(false)}
        />
      )}
    </Vista>
  )
}

/** Comando dell'header: icona sempre, parola solo quando c'è larghezza. */
function Comando({ titolo, icona, children, variante = 'normale', stato, ...resto }: {
  titolo: string; icona?: React.ReactNode; children: React.ReactNode
  variante?: 'normale' | 'primario' | 'distruttivo'
  stato?: StatoBottone
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Bottone variante={variante} stato={stato} title={titolo} aria-label={titolo} {...resto}>
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
      onClick={(e) => { vibra(); resto.onClick?.(e) }}
      className={`min-h-[32px] max-sm:min-h-[44px] cursor-pointer px-2.5 text-sm transition-colors duration-[120ms] ease-out
                  disabled:cursor-not-allowed disabled:opacity-50
                  ${attivo ? 'bg-action text-action-ink' : 'bg-bg text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

/** La cella com'è, nella forma che si rimanda al server: tocca poi cambiarne un pezzo. */
function comeModifica(c: Cella): CellaModifica {
  return {
    userId: c.userId, data: c.data, stato: c.stato === 'presenza' ? 'presenza' : 'smart',
    roomId: c.roomId, deskId: c.deskId, bloccata: true,
  }
}
