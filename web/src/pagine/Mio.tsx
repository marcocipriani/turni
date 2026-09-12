import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getConEta } from '../api'
import { descriviSettimana, esteso, lunediDi, oggiISO, pezziData } from '../date'
import * as I from '../icone'
import { Avatar, FilaAvatar, perEsteso } from '../persone'
import { useSessione } from '../sessione'
import { SegnoStato, STATI, type Stato } from '../stati'
import { vibra } from '../tocco'
import { Bottone, Chip, Messaggio, Scheletro, stileBottone, StatoVuoto, Tag } from '../ui'
import { Toolbar, Vista } from '../Vista'
import { AvvisoNovita, quando } from './novita'
import { ModaleScambio, type Proposta, Scambi } from './Scambio'

export type Collega = {
  userId: number; nome: string; cognome: string; sectorId: number | null
  roomId: number | null; scrivania: string | null
}
export type GiornoMio = {
  data: string
  stato: Stato
  causale: string | null
  periodId: number | null
  roomId: number | null
  scrivania: string | null
  bloccata: boolean
  colleghi: Collega[]
}
export type DatiMio = {
  da: string; a?: string
  giorni: GiornoMio[]
  stanze: { id: number; etichetta: string; soprannome: string | null; piano: string | null; capienza: number }[]
  /** Il proprio settore: decide quali colleghi si vedono senza espandere. */
  settore: { id: number; nome: string } | null
  /** Tutti i settori dell'unità, per dire con che gruppo lavora un collega. */
  settori: { id: number; nome: string }[]
  scambio: { attivo: boolean; oraLimite: string } | null
}

/**
 * Le prossime giornate in cui si è in sede con un collega. I colleghi di
 * `/mio` sono quelli in sede nei giorni in cui ci sono anch'io: basta
 * cercarlo fra loro, senza altre richieste.
 */
export function prossimeInsieme(giorni: GiornoMio[], userId: number, dopo: string, quante = 3): string[] {
  return giorni
    .filter((g) => g.data > dopo && g.colleghi.some((c) => c.userId === userId))
    .slice(0, quante)
    .map((g) => g.data)
}

/* ── Filtri: interruttori indipendenti, non una scelta esclusiva ──── */

type Filtro = Stato

function Filtri({ attivi, onCambia, conteggi }: {
  attivi: Set<Filtro>
  onCambia: (f: Filtro) => void
  conteggi: Record<Filtro, number>
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Cosa mostrare">
      {(Object.keys(STATI) as Filtro[]).map((f) => {
        const on = attivi.has(f)
        const Icona = STATI[f].icona
        return (
          <button
            key={f} type="button" onClick={() => { vibra(); onCambia(f) }} aria-pressed={on}
            /* `whitespace-nowrap`: «In sede» e «Da remoto» sono due parole, e
               dentro una pillola stretta andavano a capo spezzandosi in mezzo. */
            className={`inline-flex min-h-[32px] max-sm:min-h-[44px] cursor-pointer items-center gap-1.5 whitespace-nowrap
                        rounded-full border px-2.5 text-sm transition-colors duration-[120ms] ease-out ${on
              ? 'border-action bg-action text-action-ink'
              : 'border-border-controllo bg-bg text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
          >
            <Icona size={14} />{STATI[f].plurale}
            <span className="mono text-2xs">{conteggi[f]}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Pagina ───────────────────────────────────────────────────────── */

type ElencoScambi = { inArrivo: Proposta[]; inUscita: Proposta[]; conclusi: Proposta[] }

export default function Mio() {
  const navigate = useNavigate()
  const { utente } = useSessione()
  const [dati, setDati] = useState<DatiMio | null>(null)
  const [scambi, setScambi] = useState<ElencoScambi | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [copiaDel, setCopiaDel] = useState<Date | null>(null)
  // Si parte dalle chip scelte nelle preferenze; di lì in poi decide chi guarda.
  const [attivi, setAttivi] = useState<Set<Filtro>>(
    () => new Set<Filtro>(utente?.preferenze?.filtriMio ?? ['presenza']))
  const [aperto, setAperto] = useState<string | null>(null)
  const [daScambiare, setDaScambiare] = useState<string | null>(null)

  const carica = useCallback(() => {
    void getConEta<DatiMio>('/mio')
      .then(({ dati, copiaDel }) => { setDati(dati); setCopiaDel(copiaDel) })
      .catch((e) => setErrore(e.message))
    // Gli scambi non si conservano offline: senza rete non se ne può fare
    // nessuno, e mostrarne di vecchi inviterebbe a rispondere a una proposta
    // che magari è già chiusa.
    void api.get<ElencoScambi>('/scambi').then(setScambi).catch(() => setScambi(null))
  }, [])

  useEffect(carica, [carica])

  const conteggi = useMemo(() => {
    const c: Record<Filtro, number> = { presenza: 0, smart: 0, assenza: 0 }
    for (const g of dati?.giorni ?? []) c[g.stato]++
    return c
  }, [dati])

  const visibili = (dati?.giorni ?? []).filter((g) => attivi.has(g.stato))
  const stanzaPerId = useMemo(
    () => new Map((dati?.stanze ?? []).map((s) => [s.id, s])), [dati])
  const nomiSettore = useMemo(
    () => new Map((dati?.settori ?? []).map((s) => [s.id, s.nome])), [dati])

  function alterna(f: Filtro) {
    setAttivi((v) => {
      const n = new Set(v)
      // Almeno un filtro deve restare acceso: una lista vuota per errore di
      // manovra sembra un'app rotta, non un filtro applicato.
      if (n.has(f)) { if (n.size > 1) n.delete(f) } else n.add(f)
      return n
    })
  }

  return (
    <Vista
      denso
      titolo="Mio"
      icona={<I.Calendario size={17} />}
      aiuto="Le tue giornate, da oggi in avanti"
      caricando={!dati && !errore}
      meta={dati && <span className="mono">{conteggi.presenza} giornate in sede</span>}
      azioni={
        <>
          {/* Lo scarico è un link, non un bottone: è una risorsa che il browser
              va a prendere, e il tasto destro deve funzionarci sopra. */}
          <a href="/api/mio/export.csv" title="Scarica il tuo calendario in CSV"
             aria-label="Scarica il tuo calendario in CSV" className={stileBottone('icona')}>
            <I.Scarica size={17} />
          </a>
          {/* L'immagine è quella che si vede: con i filtri accesi, solo quelle
              giornate. È il formato che si manda in chat o si tiene in galleria. */}
          <Bottone variante="icona" title="Scarica come immagine (PNG)" aria-label="Scarica come immagine (PNG)"
                   disabled={visibili.length === 0}
                   onClick={() => void immagine(visibili, stanzaPerId, utente ? perEsteso(utente) : '')
                     .catch((e) => setErrore(e.message))}>
            <I.Immagine size={17} />
          </Bottone>
          <Bottone variante="icona" title="Stampa il tuo calendario" aria-label="Stampa il tuo calendario"
                   onClick={() => navigate('/stampa/mio')}>
            <I.Stampa size={17} />
          </Bottone>
        </>
      }
    >
      <Toolbar>
        <Filtri attivi={attivi} onCambia={alterna} conteggi={conteggi} />
      </Toolbar>

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}

        {/* Senza rete la pagina si apre lo stesso, con l'ultima risposta
            riuscita. Dirlo non è un dettaglio: una giornata può essere stata
            scambiata da allora, e chi legge deve sapere fin dove fidarsi. */}
        {copiaDel && (
          <Messaggio tono="attenzione" titolo="Senza rete">
            Stai vedendo i dati conservati sul telefono, aggiornati al {quando(copiaDel.toISOString())}.
            Riappena torna la rete si aggiornano da soli.
          </Messaggio>
        )}

        {/* È la pagina su cui si atterra: se una programmazione è uscita
            mentre non guardavi, lo sai qui, non aprendo la campanella. */}
        <AvvisoNovita />

        {scambi && <Scambi elenco={scambi} onCambiato={carica} />}

        {!dati && !errore && <Scheletro righe={6} />}

        {dati && dati.giorni.length === 0 && (
          <StatoVuoto testo="Non c'è ancora niente in calendario. Le tue giornate compaiono qui appena una programmazione viene pubblicata, e le assenze appena le dichiari." />
        )}

        {dati && dati.giorni.length > 0 && visibili.length === 0 && (
          <p className="py-8 text-center text-base text-ink-faint">
            Nessuna giornata con questi filtri.
          </p>
        )}

        {visibili.length > 0 && (
          /* `key` sui filtri: l'elenco si rimonta e rifà la sua dissolvenza.
             Costa un rimontaggio di qualche decina di righe — se un giorno le
             giornate diventassero centinaia, questa è la riga da togliere. */
          <ul key={[...attivi].sort().join()}
              className="entra overflow-hidden rounded-r3 border border-border bg-surface">
            {visibili.map((g, i) => {
              // Le settimane restano separate anche quando un filtro toglie di
              // mezzo delle giornate: il salto si vede dal lunedì, non dal
              // numero di righe che sono sopravvissute.
              const nuovaSettimana = i === 0 || lunediDi(g.data) !== lunediDi(visibili[i - 1]!.data)
              return (
                <Fragment key={g.data}>
                  {nuovaSettimana && (
                    <li className="mono border-t-2 border-border-strong bg-surface-2 px-3 py-1
                                   text-2xs uppercase tracking-[0.06em] text-ink-faint first:border-t-0 md:px-4">
                      {descriviSettimana(g.data)}
                    </li>
                  )}
                  <Riga
                    g={g} giorni={dati?.giorni ?? []} stanze={stanzaPerId} mioSettore={dati?.settore ?? null}
                    settori={nomiSettore} primaDellaSettimana={nuovaSettimana}
                    scambiabile={Boolean(dati?.scambio?.attivo) && g.data >= oggiISO() && g.stato !== 'assenza'}
                    onScambia={() => setDaScambiare(g.data)}
                    aperto={aperto === g.data}
                    onApri={() => setAperto((v) => v === g.data ? null : g.data)}
                  />
                </Fragment>
              )
            })}
          </ul>
        )}
      </div>

      <ModaleScambio
        data={daScambiare} aperta={daScambiare != null}
        onChiudi={() => setDaScambiare(null)} onFatto={carica}
      />
    </Vista>
  )
}

/* ── Riga: una giornata. Nessuna card: la cronologia è una lista sola ── */

function Riga({ g, giorni, stanze, mioSettore, settori, primaDellaSettimana, aperto, onApri, scambiabile, onScambia }: {
  g: GiornoMio; giorni: GiornoMio[]; stanze: Map<number, { etichetta: string; soprannome: string | null }>
  mioSettore: { id: number; nome: string } | null
  settori: Map<number, string>
  /** Segue la didascalia di settimana, che porta già il suo taglio marcato. */
  primaDellaSettimana: boolean
  aperto: boolean; onApri: () => void
  scambiabile: boolean; onScambia: () => void
}) {
  const stanza = g.roomId != null ? stanze.get(g.roomId) ?? null : null
  const { giorno, mese, breve } = pezziData(g.data)
  const oggi = g.data === oggiISO()

  /* Chi lavora con me viene prima di chi lavora nello stesso edificio: la
     giornata la si guarda per sapere con chi la si passa. Senza un settore
     proprio la distinzione non esiste, e i colleghi restano un elenco solo. */
  const { miei, altri } = useMemo(() => {
    if (mioSettore == null) return { miei: [] as Collega[], altri: g.colleghi }
    return {
      miei: g.colleghi.filter((c) => c.sectorId === mioSettore.id),
      altri: g.colleghi.filter((c) => c.sectorId !== mioSettore.id),
    }
  }, [g.colleghi, mioSettore])

  const espandibile = g.colleghi.length > 0
  /* Gli avatar davanti sono quelli con cui si lavora. Se nel mio settore quel
     giorno ci sono solo io, non c'è nessun volto da anticipare: mettere quelli
     degli altri fingerebbe una vicinanza che non c'è, e allungare la fila a
     tutta l'unità la renderebbe illeggibile. Resta il segno che apre. */
  const soloIoDelSettore = mioSettore != null && miei.length === 0
  const anteprima = mioSettore != null ? miei : g.colleghi
  const stile = STATI[g.stato]

  return (
    <li className={`${primaDellaSettimana ? '' : 'border-t border-border'} ${stile.fondo}
                    ${oggi ? 'shadow-[inset_2px_0_0_var(--ink)]' : ''}`}>
      {/* Sul telefono i volti vanno a capo: schiacciati sulla stessa riga
          rubavano spazio alla stanza, che è l'informazione che serve. */}
      <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 md:flex-nowrap md:px-4">
        <div className="w-[52px] shrink-0">
          <p className={`mono text-md font-semibold leading-none ${stile.inchiostro}`}>{giorno}</p>
          <p className="text-2xs uppercase tracking-[0.04em] text-ink-faint">{breve} {mese}</p>
        </div>

        {/* Il segno dello stato in colonna propria: scorrendo l'elenco le tre
            giornate si distinguono prima di leggere una sola parola. */}
        <span className="shrink-0"><SegnoStato stato={g.stato} size={17} /></span>

        <div className="min-w-0 flex-1">
          {g.stato === 'presenza' && (
            <p className="mono truncate text-base">
              {stanza ? stanza.etichetta : 'da assegnare'}
              {g.scrivania && <span className="text-ink-muted"> · scriv. {g.scrivania}</span>}
              {/* La stanza può non avere un soprannome: senza questo controllo
                  resterebbe un punto separatore che non separa niente. */}
              {stanza?.soprannome && <span className="hidden text-ink-faint lg:inline"> · {stanza.soprannome}</span>}
            </p>
          )}
          {g.stato === 'smart' && <p className="text-base text-ink-muted">{STATI.smart.etichetta}</p>}
          {g.stato === 'assenza' && (
            <p className="flex flex-wrap items-center gap-2 text-base text-ink-faint">
              {STATI.assenza.etichetta} {g.causale && <Tag>{g.causale}</Tag>}
            </p>
          )}
          {oggi && <p className="text-2xs uppercase tracking-[0.04em] text-ink-faint">oggi</p>}
        </div>

        {scambiabile && (
          <Bottone variante="icona" title="Scambia questa giornata"
                   aria-label={`Scambia la giornata del ${g.data}`} onClick={onScambia}>
            <I.Scambio size={17} />
          </Bottone>
        )}

        {espandibile && (
          <button
            type="button" onClick={onApri} aria-expanded={aperto}
            className="order-last flex min-h-[36px] w-full cursor-pointer items-center gap-2 rounded-r2 px-1.5
                       hover:bg-surface-2 md:order-none md:w-auto"
            aria-label={aperto
              ? 'Nascondi chi c\'è'
              : miei.length > 0
                ? `Mostra chi c'è: ${miei.length} del tuo settore, ${altri.length} in tutto il resto`
                : soloIoDelSettore
                  ? `Nel tuo settore quel giorno ci sei solo tu. Mostra gli altri ${altri.length} in sede`
                  : `Mostra chi c'è: ${altri.length} persone`}
          >
            {soloIoDelSettore
              ? <span className="inline-flex items-center gap-1.5 text-ink-faint">
                  <I.Persone size={17} />
                  <span className="mono text-2xs">{altri.length}</span>
                </span>
              : <FilaAvatar persone={anteprima.map((c) => ({ id: c.userId, nome: c.nome, cognome: c.cognome }))} />}
            {/* Il resto si conta, non si mostra: allungare la fila
                annacquerebbe i volti che contano. */}
            {miei.length > 0 && altri.length > 0 && (
              <span className="mono shrink-0 text-2xs text-ink-faint">+{altri.length}</span>
            )}
            <span className={`ml-auto text-ink-faint transition-transform duration-[120ms] ease-out ${aperto ? 'rotate-90' : ''}`}>
              <I.Freccia size={14} />
            </span>
          </button>
        )}
      </div>

      {aperto && (
        <div className="entra border-t border-border bg-bg px-3 py-2 md:px-4">
          {miei.length > 0 && (
            <Colleghi titolo={mioSettore?.nome ?? 'Il tuo settore'} gente={miei} stanze={stanze} settori={settori}
                      giorni={giorni} data={g.data} />
          )}
          {altri.length > 0 && (
            <Colleghi titolo={miei.length > 0 || soloIoDelSettore ? 'Altri in sede' : 'In sede'}
                      gente={altri} stanze={stanze} settori={settori} giorni={giorni} data={g.data} />
          )}
        </div>
      )}
    </li>
  )
}

function Colleghi({ titolo, gente, stanze, settori, giorni, data }: {
  titolo: string
  giorni: GiornoMio[]
  /** La giornata aperta: le prossime insieme si contano da qui. */
  data: string
  gente: Collega[]
  stanze: Map<number, { etichetta: string; soprannome: string | null }>
  settori: Map<number, string>
}) {
  return (
    <>
      <p className="mono px-0.5 pb-0.5 pt-1 text-2xs uppercase tracking-[0.06em] text-ink-faint first:pt-0">
        {titolo} <span className="mono">{gente.length}</span>
      </p>
      <ul>
        {gente.map((c) => (
          <li key={c.userId} className="flex min-h-[34px] flex-wrap items-center gap-x-2.5 gap-y-1 py-0.5">
            <Avatar persona={{ id: c.userId, nome: c.nome, cognome: c.cognome }} misura="piccolo" />
            {/* Qui il nome si scrive per intero: il pannello è aperto apposta,
                e un cognome secco non basta a riconoscere chi non si frequenta. */}
            <span className="min-w-0 flex-1 truncate text-base">
              {perEsteso({ id: c.userId, nome: c.nome, cognome: c.cognome })}
            </span>
            {c.sectorId != null && settori.has(c.sectorId) && <Chip>{settori.get(c.sectorId)}</Chip>}
            <span className="mono shrink-0 text-sm text-ink-faint">
              {c.roomId != null ? stanze.get(c.roomId)?.etichetta ?? '—' : '—'}
              {c.scrivania && `/${c.scrivania}`}
            </span>
            <ProssimeInsieme date={prossimeInsieme(giorni, c.userId, data)} />
          </li>
        ))}
      </ul>
    </>
  )
}

/* ── Il calendario come immagine ──────────────────────────────────── */

/**
 * «In sede · 101 · scriv. 3», «Assenza · Ferie»: la riga dell'immagine a
 * parole, uguale al foglio di stampa. Pura, così la si prova senza canvas.
 */
export function rigaImmagine(g: GiornoMio, stanze: Map<number, { etichetta: string }>): [string, string] {
  const stato = STATI[g.stato].etichetta + (g.stato === 'assenza' && g.causale ? ` · ${g.causale}` : '')
  if (g.stato !== 'presenza') return [stato, '']
  const stanza = g.roomId != null ? stanze.get(g.roomId)?.etichetta : undefined
  return [stato, `${stanza ?? 'da assegnare'}${g.scrivania ? ` · scriv. ${g.scrivania}` : ''}`]
}

/**
 * Disegnata a mano su un canvas: niente libreria che fotografa il DOM per
 * un elenco di righe. Sul telefono passa dal foglio di condivisione — «Salva
 * immagine» o dritta in chat —, altrove si scarica.
 */
async function immagine(giorni: GiornoMio[], stanze: Map<number, { etichetta: string }>, chi: string) {
  // ponytail: tavolozza chiara fissa, non il tema — un'immagine inoltrata si
  // legge su sfondi che non conosciamo. Leggere i token se servisse lo scuro.
  const C = { fondo: '#ffffff', ink: '#16181d', muted: '#5b606b', faint: '#8a8f99', bordo: '#e4e6ea', fascia: '#f3f4f6' }
  const SANS = 'Inter, system-ui, sans-serif', MONO = "'JetBrains Mono', ui-monospace, monospace"
  await Promise.all([`400 14px ${SANS}`, `600 14px ${SANS}`, `400 14px ${MONO}`].map((f) => document.fonts.load(f)))

  const L = 640, M = 28, TESTA = 92, RIGA = 38, SETT = 28
  const settimane = giorni.filter((g, i) => i === 0 || lunediDi(g.data) !== lunediDi(giorni[i - 1]!.data)).length
  const H = TESTA + settimane * SETT + giorni.length * RIGA + M
  const k = 2
  const canvas = document.createElement('canvas')
  canvas.width = L * k; canvas.height = H * k
  const x = canvas.getContext('2d')!
  x.scale(k, k)
  x.fillStyle = C.fondo; x.fillRect(0, 0, L, H)
  x.textBaseline = 'middle'

  const testo = (t: string, px: number, py: number, font: string, colore: string, destra = false) => {
    x.font = font; x.fillStyle = colore; x.textAlign = destra ? 'right' : 'left'; x.fillText(t, px, py)
  }

  testo('TURNI', M, 30, `400 11px ${MONO}`, C.faint)
  testo(`Calendario di ${chi}`, M, 54, `600 20px ${SANS}`, C.ink)
  testo(`al ${esteso(oggiISO())}`, L - M, 30, `400 11px ${MONO}`, C.faint, true)

  let y = TESTA
  const oggi = oggiISO()
  giorni.forEach((g, i) => {
    if (i === 0 || lunediDi(g.data) !== lunediDi(giorni[i - 1]!.data)) {
      x.fillStyle = C.fascia; x.fillRect(0, y, L, SETT)
      testo(descriviSettimana(g.data).toUpperCase(), M, y + SETT / 2, `400 10.5px ${MONO}`, C.faint)
      y += SETT
    }
    const { giorno, mese, breve } = pezziData(g.data)
    const [stato, dove] = rigaImmagine(g, stanze)
    if (g.data === oggi) { x.fillStyle = C.ink; x.fillRect(0, y, 3, RIGA) }
    testo(String(giorno), M, y + RIGA / 2, `600 16px ${MONO}`, g.stato === 'assenza' ? C.faint : C.ink)
    testo(`${breve} ${mese}`, M + 30, y + RIGA / 2, `400 12px ${SANS}`, C.faint)
    testo(stato, M + 110, y + RIGA / 2, `${g.stato === 'presenza' ? 600 : 400} 14px ${SANS}`,
          g.stato === 'presenza' ? C.ink : g.stato === 'smart' ? C.muted : C.faint)
    if (dove) testo(dove, L - M, y + RIGA / 2, `400 13px ${MONO}`, C.muted, true)
    y += RIGA
    x.fillStyle = C.bordo; x.fillRect(0, y - 1, L, 1)
  })

  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
  if (!blob) throw new Error('Non sono riuscito a creare l\'immagine.')
  const file = new File([blob], `turni-${oggi}.png`, { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    // Chiudere il foglio di condivisione non è un errore.
    await navigator.share({ files: [file] }).catch((e) => { if (e?.name !== 'AbortError') throw e })
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file); a.download = file.name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** «anche 16, 18 set»: quando si torna a lavorare nella stessa sede. */
function ProssimeInsieme({ date }: { date: string[] }) {
  if (date.length === 0) return null
  const pezzi = date.map(pezziData)
  // Il mese si scrive una volta sola quando è lo stesso per tutte.
  const unMese = pezzi.every((x) => x.mese === pezzi[0]!.mese)
  const testo = unMese
    ? `${pezzi.map((x) => x.giorno).join(', ')} ${pezzi[0]!.mese}`
    : pezzi.map((x) => `${x.giorno} ${x.mese}`).join(', ')
  return <span className="w-full pl-[34px] text-2xs text-ink-faint">di nuovo insieme {testo}</span>
}
