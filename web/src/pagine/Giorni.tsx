/**
 * Chi c'è in sede, giornata per giornata. È la vista con cui si apre «Turni»:
 * la domanda di tutti i giorni è «chi trovo mercoledì», non «com'è fatta la
 * griglia».
 *
 * La giornata si legge dall'alto: prima dove si siede chi viene, stanza per
 * stanza con la sua capienza accanto; poi chi lavora da remoto; per ultimo, e
 * richiuso, chi manca. L'occupazione è un dato della giornata, non del periodo:
 * «48 su 50 in tre settimane» non dice a nessuno se domani c'è posto.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { addDays, oggiISO, pezziData } from '../date'
import * as I from '../icone'
import { Avatar } from '../persone'
import { useSessione } from '../sessione'
import { Badge, Messaggio, Scheletro, StatoVuoto, Tag } from '../ui'

export type Chi = {
  userId: number; nome: string; cognome: string
  unitId: number | null; sectorId: number | null
}
export type Presente = Chi & { roomId: number | null; scrivania: string | null }
export type Stanza = {
  id: number; etichetta: string; soprannome: string | null; piano: string | null; capienza: number
}
type Giorno = {
  data: string; feriale: boolean; festivo: string | null
  presenti: Presente[]; remoti: Chi[]; assenti: Chi[]
  capienza: number; ioCiSono: boolean; ioAssente: boolean
}
/** Ufficio di una persona sola: non è capienza condivisa, è un indirizzo. */
export type StanzaRiservata = Stanza & {
  persona: { id: number; nome: string; cognome: string; ruolo: string } | null
}
export type DatiGiorni = {
  da: string; a: string; giorni: Giorno[]
  stanze: Stanza[]
  stanzeRiservate: StanzaRiservata[]
  settori: { id: number; nome: string }[]
  persone: { id: number; nome: string; cognome: string }[]
  periodiPubblicati: number
}

/**
 * Come si legge un elenco di persone.
 *
 * Il cognome ordina sempre: è così che si cerca un nome, e non è una
 * preferenza da esporre. Il raggruppamento per settore è l'unica scelta che
 * cambia davvero la lettura, e resta un interruttore.
 */
export type Ordine = 'cognome' | 'settore'

/* ── Dove si siede, detto a parole ───────────────────────────────────
   Un prospetto dice quante postazioni ci sono; non dice dov'è la stanza né
   come la chiamano le persone. Questa è la frase che qualcuno scriverebbe a
   mano in cima alla bacheca, scritta però dall'archivio: cambia una scrivania
   o si aggiunge una stanza, e la frase è già aggiornata al ricarico. */

/** Numeri a parole, al femminile: sono sempre stanze e postazioni. */
const PAROLE = [
  'nessuna', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci',
  'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto',
  'diciannove', 'venti',
]
const aParole = (n: number) => PAROLE[n] ?? String(n)

/** «A», «A e B», «A, B e C»: la virgola separa, la congiunzione chiude. */
const elenco = (voci: string[]) =>
  voci.length <= 1 ? voci[0] ?? '' : `${voci.slice(0, -1).join(', ')} e ${voci.at(-1)}`

const postazioni = (n: number) => `${aParole(n)} ${n === 1 ? 'postazione' : 'postazioni'}`

/** Il soprannome, quando c'è, è già il nome della stanza: non si dice due volte. */
const descriviStanza = (s: Stanza) => s.soprannome
  ? `la ${s.soprannome} (${s.etichetta}, ${postazioni(s.capienza)})`
  : `la stanza ${s.etichetta} (${postazioni(s.capienza)})`

/** «Primo piano» → «al primo piano»: la maiuscola sta a inizio frase, non qui. */
const alPiano = (piano: string) => `al ${piano.slice(0, 1).toLowerCase()}${piano.slice(1)}`

/**
 * Le frasi dell'avviso: una per le stanze condivise, una per ogni ufficio
 * riservato. Funzione pura, così la si prova senza montare niente.
 */
export function fraseStanze(stanze: Stanza[], riservate: StanzaRiservata[] = []): string[] {
  const frasi: string[] = []

  if (stanze.length > 0) {
    const n = stanze.length
    const piani = [...new Set(stanze.map((s) => s.piano ?? ''))]
    const quante = n === 1 ? 'L\'unica stanza disponibile è' : `Le ${aParole(n)} stanze disponibili sono`

    if (piani.length === 1 && piani[0]) {
      frasi.push(`${quante} ${alPiano(piani[0])}: ${elenco(stanze.map(descriviStanza))}.`)
    } else if (piani.length === 1) {
      frasi.push(`${quante}: ${elenco(stanze.map(descriviStanza))}.`)
    } else {
      // Più piani: il piano guida il raggruppamento, perché è il primo dato
      // che serve a chi deve arrivarci.
      const parti = piani.map((piano) => {
        const dentro = elenco(stanze.filter((s) => (s.piano ?? '') === piano).map(descriviStanza))
        return piano ? `${alPiano(piano)} ${dentro}` : `senza piano indicato ${dentro}`
      })
      frasi.push(`${quante}: ${parti.join('; ')}.`)
    }
  }

  for (const s of riservate) {
    const chi = s.persona
    const nome = chi
      ? `${chi.ruolo === 'dirigente' ? 'Dirigente ' : ''}${chi.nome} ${chi.cognome}`
      : 'Stanza riservata'
    const dove = s.soprannome ? `${s.soprannome} (${s.etichetta})` : `stanza ${s.etichetta}`
    frasi.push(`${nome} — ${dove}.`)
  }

  return frasi
}

/**
 * L'ordine di lettura di un elenco di persone.
 *
 * Per cognome è l'ordine dell'elenco: si cerca un nome e lo si trova. Per
 * settore le persone arrivano a blocchi, e chi guarda «con chi lavoro oggi» li
 * legge insieme. Dentro il settore si torna al cognome: due criteri annidati,
 * non due elenchi diversi.
 */
export function ordinaPersone<T extends Chi>(
  gente: T[], ordine: Ordine, settori: Map<number, string>,
): T[] {
  const perCognome = (a: T, b: T) =>
    a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it')
  if (ordine === 'cognome') return [...gente].sort(perCognome)

  // Chi non ha settore va in fondo: è l'unico blocco senza un nome con cui
  // ordinarsi, e in mezzo agli altri sembrerebbe un settore che si chiama «».
  const nome = (p: T) => (p.sectorId != null ? settori.get(p.sectorId) ?? '' : '')
  return [...gente].sort((a, b) => {
    const x = nome(a), y = nome(b)
    if (x === y) return perCognome(a, b)
    if (!x) return 1
    if (!y) return -1
    return x.localeCompare(y, 'it')
  })
}

/**
 * I presenti divisi per stanza. Le stanze restano nell'ordine in cui sono
 * censite — quello che chi lavora lì ha in testa — e quelle vuote si contano
 * invece di elencarsi: in una colonna stretta dieci righe a zero coprirebbero
 * le tre che contano.
 */
export function perStanza(presenti: Presente[], stanze: Stanza[]) {
  const note = new Set(stanze.map((s) => s.id))
  return {
    gruppi: stanze
      .map((s) => ({ stanza: s, dentro: presenti.filter((p) => p.roomId === s.id) }))
      .filter((g) => g.dentro.length > 0),
    senza: presenti.filter((p) => p.roomId == null || !note.has(p.roomId)),
    libere: stanze.filter((s) => !presenti.some((p) => p.roomId === s.id)),
  }
}

/**
 * Dove mettere una didascalia di settore in un elenco già ordinato per
 * settore: sulla prima riga, e a ogni cambio. Restituisce una voce per
 * persona, `null` dove la didascalia non va messa.
 *
 * Il confronto è fra valori, `null` compreso: chi non ha settore forma un
 * blocco come gli altri, e due righe senza settore di fila non si prendono una
 * didascalia a testa.
 */
export function didascalieSettore(
  gente: { sectorId: number | null }[], settori?: Map<number, string>,
): (string | null)[] {
  if (!settori) return gente.map(() => null)
  return gente.map((p, i) => {
    if (i > 0 && p.sectorId === gente[i - 1]!.sectorId) return null
    return p.sectorId != null ? settori.get(p.sectorId) ?? 'Senza settore' : 'Senza settore'
  })
}

export function Giorni({ settimane, da, raggruppa = false, onCaricato }: {
  settimane: number
  /** Primo giorno da mostrare. Chi chiama decide dove si è, così le frecce funzionano. */
  da: string
  /** Spezza gli elenchi per settore. Spento: un elenco solo, per cognome. */
  raggruppa?: boolean
  onCaricato?: (d: DatiGiorni | null) => void
}) {
  const { utente } = useSessione()
  const [dati, setDati] = useState<DatiGiorni | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    const a = addDays(da, settimane * 7 - 1)
    void api.get<DatiGiorni>(`/panoramica?da=${da}&a=${a}`)
      .then((d) => { setDati(d); onCaricato?.(d) })
      .catch((e) => setErrore(e.message))
    // onCaricato è un riferimento nuovo a ogni render del padre: tenerlo fra le
    // dipendenze rifarebbe la richiesta a ogni battito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settimane, da])

  const feriali = useMemo(() => (dati?.giorni ?? []).filter((g) => g.feriale && !g.festivo), [dati])
  const settori = useMemo(() => new Map((dati?.settori ?? []).map((s) => [s.id, s.nome])), [dati])
  const radice = useRef<HTMLDivElement>(null)

  /* Sul telefono le giornate si impilano, e di venerdì oggi è in fondo:
     si parte da lì. Il lunedì no — oggi è già in cima, sotto l'avviso delle
     stanze. La barra dei filtri è appiccicata in alto e alta quanto vanno a
     capo i suoi controlli: si misura, così la giornata non ci finisce sotto. */
  useEffect(() => {
    if (!matchMedia('(max-width: 639.98px)').matches) return
    const oggi = oggiISO()
    const i = feriali.findIndex((g) => g.data >= oggi)
    if (i <= 0) return
    const el = radice.current?.querySelector<HTMLElement>(`[data-giorno="${feriali[i]!.data}"]`)
    if (!el) return
    const barra = document.querySelector<HTMLElement>('[data-barra]')?.offsetHeight ?? 0
    el.style.scrollMarginTop = `${barra + 8}px`
    el.scrollIntoView({ block: 'start' })
  }, [feriali])

  if (errore) return <div className="p-4 md:p-6"><Messaggio tono="errore">{errore}</Messaggio></div>
  if (!dati) return <div className="p-4 md:p-6"><Scheletro righe={6} /></div>

  if (dati.periodiPubblicati === 0) {
    return (
      <div className="p-4 md:p-6">
        <StatoVuoto testo="Non c'è ancora nessuna programmazione pubblicata. Appena il dirigente ne approva una, qui vedrai chi è in sede giorno per giorno." />
      </div>
    )
  }

  /* Una settimana sola sta in cinque colonne, e la card si restringe fino a
     dove arrivano: niente scorrimento, niente larghezza minima da rispettare.
     Oltre la settimana le colonne tornano fisse e la regione scorre.
     Sul telefono le giornate si impilano sempre: lo spazio lì è verticale. */
  const unaSettimana = settimane === 1

  // Fra Natale e Capodanno una settimana può non avere nessuna giornata
  // lavorativa: senza questo, resta una card grigia vuota che sembra un guasto.
  if (feriali.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4 md:p-6">
        <AvvisoStanze stanze={dati.stanze} riservate={dati.stanzeRiservate ?? []} />
        <p className="rounded-r3 border border-border bg-surface px-4 py-8 text-center text-base text-ink-faint">
          Nessuna giornata lavorativa in questo tratto di calendario: festività, o un fine settimana intero.
        </p>
      </div>
    )
  }

  return (
    <div ref={radice} className="flex flex-col gap-3 p-4 md:p-6">
      <AvvisoStanze stanze={dati.stanze} riservate={dati.stanzeRiservate ?? []} />

      <section id="giorni" className="flex flex-col gap-2">
        <h2 className="mono text-2xs uppercase tracking-[0.06em] text-ink-faint">Prossimi giorni</h2>
        {/* Regione che scorre: senza fuoco propria non si raggiunge da tastiera. */}
        <div
          tabIndex={unaSettimana ? undefined : 0}
          role={unaSettimana ? undefined : 'region'}
          aria-label={unaSettimana ? undefined : 'Giornate, in orizzontale'}
          className={`rounded-r3 border border-border bg-surface ${unaSettimana ? '' : 'overflow-x-auto'}`}
        >
          <div className={unaSettimana
            ? 'grid grid-cols-1 sm:auto-cols-fr sm:grid-flow-col'
            : 'flex flex-col sm:min-w-max sm:flex-row'}>
            {feriali.map((g, i) => (
              <ColonnaGiorno
                key={g.data} giorno={g} oggi={g.data === oggiISO()} primo={i === 0}
                fissa={!unaSettimana}
                ioId={utente?.id ?? -1} mioSettore={utente?.sectorId ?? null}
                stanze={dati.stanze} settori={settori} raggruppa={raggruppa}
              />
            ))}
          </div>
        </div>
        <p className="text-sm text-ink-faint">
          Chi non compare in nessuno dei tre elenchi non è programmato in quella giornata. Le assenze
          restano visibili solo a chi ha titolo a vederle.
        </p>
      </section>
    </div>
  )
}

/** Una giornata: intestazione, occupazione, chi c'è e dove, chi non c'è. */
function ColonnaGiorno({ giorno, oggi, primo, fissa, ioId, mioSettore, stanze, settori, raggruppa }: {
  giorno: Giorno
  oggi: boolean
  primo: boolean
  /** Colonna di larghezza fissa: serve quando le giornate scorrono in orizzontale. */
  fissa: boolean
  ioId: number
  mioSettore: number | null
  stanze: Stanza[]
  settori: Map<number, string>
  raggruppa: boolean
}) {
  const { giorno: g, mese, breve, lunedi } = pezziData(giorno.data)
  const ordina = <T extends Chi>(gente: T[]) => ordinaPersone(gente, raggruppa ? 'settore' : 'cognome', settori)
  const { gruppi, senza, libere } = perStanza(giorno.presenti, stanze)

  /* Il bordo separa le settimane e nient'altro: fra due giorni della stessa
     settimana non c'è niente da dividere, ci pensa l'intestazione. In verticale
     il taglio passa sopra, in orizzontale a sinistra. */
  const settimana = lunedi && !primo
    ? 'border-t-2 border-t-border-strong sm:border-t-0 sm:border-l-2 sm:border-l-border-strong'
    : ''

  return (
    <section
      aria-label={`${breve} ${g} ${mese}`}
      data-giorno={giorno.data}
      className={`flex min-w-0 flex-col ${fissa ? 'sm:w-[188px] sm:shrink-0' : ''} ${settimana}
                  ${oggi ? 'bg-bg' : ''}`}
      style={oggi ? { boxShadow: 'inset 0 2px 0 var(--ink)' } : undefined}
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm text-ink-muted">{breve}</span>
          <span className="mono text-md font-semibold text-ink">{g}</span>
          <span className="text-xs text-ink-faint">{mese}</span>
        </div>
        {oggi && <Badge>oggi</Badge>}
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-full origin-left rounded-full bg-focus transition-transform duration-[180ms] ease-out"
               style={{ transform: `scaleX(${giorno.capienza ? Math.min(1, giorno.presenti.length / giorno.capienza) : 0})` }} />
        </div>
        <span className="mono text-2xs text-ink-faint">{giorno.presenti.length}/{giorno.capienza}</span>
        <span className="solo-lettori-schermo">
          {giorno.presenti.length} presenti su {giorno.capienza} postazioni
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-2">
        <div className="flex flex-col gap-2">
          <Titolo><I.Sede size={12} />In sede</Titolo>
          {gruppi.length === 0 && senza.length === 0 && (
            <p className="px-1.5 text-sm text-ink-faint">Nessuno in sede.</p>
          )}
          {gruppi.map(({ stanza, dentro }) => (
            <div key={stanza.id}>
              <p className="flex items-baseline justify-between gap-1.5 px-1.5">
                <span className="min-w-0 truncate text-sm font-semibold text-ink">
                  {stanza.etichetta}
                  {stanza.soprannome && (
                    <span className="ml-1 font-normal text-ink-faint">{stanza.soprannome}</span>
                  )}
                </span>
                <span className="mono shrink-0 text-2xs text-ink-faint">
                  {dentro.length}/{stanza.capienza}
                </span>
              </p>
              <Elenco gente={ordina(dentro)} ioId={ioId} mioSettore={mioSettore} scrivanie
                      settori={raggruppa ? settori : undefined} />
            </div>
          ))}
          {senza.length > 0 && (
            <div>
              <p className="px-1.5 text-sm font-semibold text-ink-muted">Senza stanza</p>
              <Elenco gente={ordina(senza)} ioId={ioId} mioSettore={mioSettore}
                      settori={raggruppa ? settori : undefined} />
            </div>
          )}
          {libere.length > 0 && (
            <p className="px-1.5 text-2xs text-ink-faint"
               title={`Libere: ${libere.map((s) => s.etichetta).join(', ')}`}>
              {libere.length === 1 ? '1 stanza libera' : `${libere.length} stanze libere`}
            </p>
          )}
        </div>

        {giorno.remoti.length > 0 && (
          // Chi è in sede e chi non c'è sono due domande diverse: il filetto
          // dice dove finisce l'una e comincia l'altra, senza fare da bordo
          // fra le giornate — quello resta il segno della settimana.
          <div className="border-t border-border pt-2">
            <Titolo><I.Remoto size={12} />Da remoto <span className="mono font-normal">{giorno.remoti.length}</span></Titolo>
            <Elenco gente={ordina(giorno.remoti)} ioId={ioId} mioSettore={mioSettore}
                    settori={raggruppa ? settori : undefined} />
          </div>
        )}

        {giorno.assenti.length > 0 && (
          // Richiuso di suo: chi manca è l'informazione meno urgente della
          // giornata, e il dettaglio nativo la apre senza una riga di stato.
          <details className="group border-t border-border pt-2">
            <summary className="mono cursor-pointer list-none px-1.5 [&::-webkit-details-marker]:hidden text-2xs uppercase tracking-[0.06em] text-ink-faint hover:text-ink">
              <I.Freccia size={11} className="mr-1 inline-block transition-transform duration-[120ms] group-open:rotate-90" />
              <I.Croce size={11} className="mr-1 inline-block" />
              Assenze <span className="mono">{giorno.assenti.length}</span>
            </summary>
            {/* Solo il contenuto si dissolve: l'altezza cambia di colpo, ed è
                voluto — animare un'altezza fa rifare il layout a ogni
                fotogramma, e qui di giornate ce ne sono cinque per volta. */}
            <div className="entra">
              <Elenco gente={ordina(giorno.assenti)} ioId={ioId} mioSettore={mioSettore}
                      settori={raggruppa ? settori : undefined} />
            </div>
          </details>
        )}

        {giorno.ioAssente && (
          <div className="mt-auto pt-1"><Tag><I.Assenza size={12} /> tua assenza</Tag></div>
        )}
      </div>
    </section>
  )
}

const Titolo = ({ children }: { children: React.ReactNode }) => (
  <p className="mono flex items-center gap-1 px-1.5 text-2xs uppercase tracking-[0.06em] text-ink-faint">{children}</p>
)

function Elenco({ gente, ioId, mioSettore, scrivanie, settori }: {
  gente: (Chi & { scrivania?: string | null })[]
  ioId: number
  /** Chi ne fa parte porta il volto: sono le persone con cui si lavora. */
  mioSettore: number | null
  scrivanie?: boolean
  /** Presente solo quando si raggruppa: fa comparire le didascalie di settore. */
  settori?: Map<number, string>
}) {
  const didascalie = didascalieSettore(gente, settori)
  return (
    <ul className="flex flex-col gap-px">
      {gente.map((p, i) => {
        const io = p.userId === ioId
        const settore = didascalie[i] ?? null
        return (
          <Fragment key={p.userId}>
          {settore && (
            <li className="px-1.5 pt-1 text-2xs uppercase tracking-[0.04em] text-ink-faint">{settore}</li>
          )}
          <li
              // Il proprio nome si riconosce senza cercarlo: riempimento, peso e
              // un filetto a sinistra, cioè tre segnali e non solo il colore.
              className={`flex items-center justify-between gap-1.5 rounded-r1 px-1.5 py-1 text-sm
                          ${io ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-muted'}`}
              style={io ? { boxShadow: 'inset 2px 0 0 var(--ink)' } : undefined}>
            <span className="flex min-w-0 items-center gap-1.5">
              {!io && mioSettore != null && p.sectorId === mioSettore && (
                <Avatar persona={{ id: p.userId, nome: p.nome, cognome: p.cognome }} misura="piccolo" />
              )}
              {/* Cognome e nome: l'elenco è ordinato per cognome, e il nome
                  serve a riconoscere chi non si frequenta. */}
              <span className="truncate">
                {p.cognome} {p.nome}
                {io && <span className="solo-lettori-schermo"> (sei tu)</span>}
              </span>
            </span>
            {scrivanie && p.scrivania && (
              <span className="mono shrink-0 text-2xs text-ink-faint">/{p.scrivania}</span>
            )}
          </li>
          </Fragment>
        )
      })}
    </ul>
  )
}

/**
 * L'avviso in cima: dove sono le stanze, come si chiamano, quanti posti hanno.
 * Nessuno lo scrive e nessuno deve ricordarsi di aggiornarlo — è l'archivio
 * messo in italiano, e segue le stanze a ogni modifica.
 */
export function AvvisoStanze({ stanze, riservate }: { stanze: Stanza[]; riservate: StanzaRiservata[] }) {
  const frasi = fraseStanze(stanze, riservate)
  if (frasi.length === 0) return null
  return (
    <Messaggio tono="info" chiudibile>
      {frasi.map((f, i) => <p key={i} className={i > 0 ? 'mt-0.5' : undefined}>{f}</p>)}
    </Messaggio>
  )
}
