import { type ButtonHTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import type { StatoBottone } from './azioni'
import { Attenzione, Chiudi, Copia, Freccia, Info, Spunta } from './icone'
import { Marchio } from './Marchio'
import { vibra } from './tocco'

/* ── Bottoni ─────────────────────────────────────────────────────── */

type VarianteBottone = 'normale' | 'primario' | 'piccolo' | 'icona' | 'distruttivo'

const BASE = 'inline-flex items-center gap-2 transition-colors duration-[120ms] ease-out ' +
  'disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer'

/* Sul telefono il bersaglio cresce fino a 44px in altezza, la misura del
   polpastrello. Solo in altezza: nell'header della vista possono starci otto
   comandi, e allargarli tutti li spingerebbe fuori da uno schermo da 390px.
   Da 640px in su non cambia niente, perché lì il puntatore è una punta. */
const TOCCO = 'max-sm:min-h-[44px]'

const VARIANTI: Record<VarianteBottone, string> = {
  normale: `${BASE} ${TOCCO} rounded-r2 border border-border-controllo bg-bg px-3 py-1.5 text-base text-ink hover:bg-surface-2`,
  primario: `${BASE} ${TOCCO} rounded-r2 border border-action bg-action px-3 py-1.5 text-base text-action-ink hover:bg-action-hover`,
  piccolo: `${BASE} max-sm:min-h-[36px] rounded-r2 border border-border-controllo bg-bg px-2 py-[3px] text-sm text-ink hover:bg-surface-2`,
  icona: `${BASE} max-sm:size-11 max-sm:justify-center rounded-r1 p-[5px] text-ink-faint hover:bg-surface-2 hover:text-ink`,
  distruttivo: `${BASE} ${TOCCO} rounded-r2 border border-border-controllo bg-bg px-3 py-1.5 text-base text-ink hover:bg-danger-wash hover:text-danger-ink hover:border-danger`,
}

/** Le stesse classi, per quando il comando non è un bottone ma un link o una
 *  etichetta: uno scarico è un link, e cambiargli forma confonderebbe. */
export const stileBottone = (variante: VarianteBottone = 'normale') => VARIANTI[variante]

export function Bottone({ variante = 'normale', stato = 'fermo', className = '', children, ...resto }:
  { variante?: VarianteBottone
    /** L'esito dell'azione che il bottone comanda: lo dà `useAzione`. */
    stato?: StatoBottone } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-busy={stato === 'attesa' || undefined} {...resto}
            className={`${VARIANTI[variante]} ${stato === 'fermo' ? '' : 'relative'} ${className}`}>
      {/* L'etichetta non se ne va: si dissolve dov'è, e l'indicatore le si
          sovrappone. Così il bottone non cambia larghezza mentre lavora, e
          quello che c'era scritto resta al suo posto quando torna. */}
      <span className={`inline-flex items-center gap-2 transition-opacity duration-[120ms] ease-out
                        ${stato === 'fermo' ? '' : 'opacity-0'}`}>
        {children}
      </span>
      {stato !== 'fermo' && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
          {stato === 'attesa' ? <span className="girandola" /> : <Spunta size={15} />}
        </span>
      )}
    </button>
  )
}

/* ── Segmented: unico controllo dove l'inchiostro pieno indica selezione ── */

export function Segmented<T extends string>({ valore, opzioni, onCambia, etichetta }: {
  valore: T
  opzioni: { v: T; testo?: string; icona?: ReactNode; titolo: string }[]
  onCambia: (v: T) => void
  etichetta: string
}) {
  return (
    <div role="radiogroup" aria-label={etichetta}
         className="inline-flex overflow-hidden rounded-r2 border border-border-controllo">
      {opzioni.map((o, i) => (
        <button
          key={o.v} type="button" role="radio" aria-checked={valore === o.v} title={o.titolo}
          aria-label={o.titolo} onClick={() => { vibra(); onCambia(o.v) }}
          className={`inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-sm transition-colors
            max-sm:min-h-[44px] max-sm:px-4
            duration-[120ms] ease-out ${i > 0 ? 'border-l border-border' : ''}
            ${valore === o.v ? 'bg-action text-action-ink' : 'bg-bg text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
        >
          {o.icona}{o.testo}
        </button>
      ))}
    </div>
  )
}

/* ── Chip · Badge · Pill · Tag ───────────────────────────────────── */

export const Chip = ({ children }: { children: ReactNode }) =>
  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-sm text-ink-muted">{children}</span>

/**
 * Tre gradini di riempimento, non tre colori: la croma qui resta riservata
 * agli stati, e un ruolo non è uno stato. Il salto di luminosità fra i gradini
 * è abbastanza netto da leggersi in un colpo d'occhio, anche in stampa.
 */
export function Badge({ tono = 'neutro', children }: { tono?: 'neutro' | 'medio' | 'forte'; children: ReactNode }) {
  const stile = {
    neutro: 'bg-surface-2 text-ink-muted',
    medio: 'bg-ink-faint text-bg',
    forte: 'bg-ink text-bg',
  }[tono]
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-px text-2xs uppercase tracking-[0.04em] ${stile}`}>
      {children}
    </span>
  )
}

export function Pill({ tono = 'neutro', children }: { tono?: 'neutro' | 'ok' | 'attesa' | 'errore'; children: ReactNode }) {
  const colore = { neutro: 'text-ink-muted', ok: 'text-ok-ink', attesa: 'text-warn-ink', errore: 'text-danger-ink' }[tono]
  const icona = tono === 'ok' ? <Spunta size={13} /> : tono === 'errore' ? <Attenzione size={13} /> : null
  return <span className={`inline-flex items-center gap-1 rounded-full px-1.5 text-sm ${colore}`}>{icona}{children}</span>
}

export const Tag = ({ children }: { children: ReactNode }) =>
  <span className="inline-flex items-center gap-1 rounded-r1 bg-surface-2 px-1.5 py-0.5 text-sm text-ink-muted">{children}</span>

/** Lo stato non passa mai dal solo colore: pallino più etichetta, sempre. */
export function Stato({ tono, children }: { tono: 'neutro' | 'ok' | 'attesa' | 'errore'; children: ReactNode }) {
  const sfondo = { neutro: 'bg-ink-faint', ok: 'bg-ok', attesa: 'bg-warn-ink', errore: 'bg-danger' }[tono]
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
      <span className={`size-2 shrink-0 rounded-full ${sfondo}`} aria-hidden="true" />{children}
    </span>
  )
}

/**
 * Testo da portare altrove — una password appena generata, per esempio.
 * La copia può fallire (contesto non sicuro, permesso negato): in quel caso il
 * testo resta selezionabile a mano e il bottone lo dice.
 */
export function Copiabile({ testo, etichetta = 'Copia' }: { testo: string; etichetta?: string }) {
  const [esito, setEsito] = useState<'fermo' | 'fatto' | 'no'>('fermo')

  async function copia() {
    try {
      await navigator.clipboard.writeText(testo)
      setEsito('fatto')
    } catch {
      setEsito('no')
    }
    setTimeout(() => setEsito('fermo'), 2500)
  }

  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <code className="mono select-all rounded-r1 bg-surface-2 px-1.5 py-0.5">{testo}</code>
      <Bottone variante="icona" onClick={() => void copia()} aria-label={`${etichetta} negli appunti`} title={etichetta}>
        {esito === 'fatto' ? <Spunta size={15} /> : <Copia size={15} />}
      </Bottone>
      <span role="status" className="text-sm text-ink-faint">
        {esito === 'fatto' ? 'copiata' : esito === 'no' ? 'copia non riuscita, selezionala a mano' : ''}
      </span>
    </span>
  )
}

/* ── Campi ───────────────────────────────────────────────────────── */

export const inputCls =
  'w-full rounded-r2 border border-border-controllo bg-bg px-3 py-1.5 text-base text-ink ' +
  'placeholder:text-ink-muted outline-none focus:border-border-controllo'

export function Campo({ etichetta, aiuto, errore, children }: {
  etichetta: string; aiuto?: string; errore?: string; children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{etichetta}</span>
      {children}
      {aiuto && !errore && <span className="mt-1 block text-sm text-ink-faint">{aiuto}</span>}
      {errore && <span role="alert" className="mt-1 block text-sm text-danger-ink">{errore}</span>}
    </label>
  )
}

/* ── Pannello ────────────────────────────────────────────────────── */

export function Pannello({ titolo, icona, azioni, piede, tonoPiede = 'neutro', children }: {
  titolo?: string; icona?: ReactNode; azioni?: ReactNode; piede?: ReactNode
  tonoPiede?: 'neutro' | 'ok' | 'attesa' | 'errore'; children: ReactNode
}) {
  const colorePiede = { neutro: 'text-ink-muted', ok: 'text-ok-ink', attesa: 'text-warn-ink', errore: 'text-danger-ink' }[tonoPiede]
  return (
    <section className="flex flex-col gap-3 rounded-r3 border border-border bg-surface p-4">
      {(titolo || azioni) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {titolo && (
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              {icona && <span className="text-ink-muted">{icona}</span>}{titolo}
            </h2>
          )}
          {azioni && <div className="flex flex-wrap items-center gap-2">{azioni}</div>}
        </div>
      )}
      {children}
      {piede && <p className={`text-sm ${colorePiede}`}>{piede}</p>}
    </section>
  )
}

/* ── Messaggi ────────────────────────────────────────────────────── */

/**
 * Tre gradini di importanza, e ognuno si comporta come merita.
 *
 *   errore      il più forte: non si scarta, si richiude. Un conflitto resta un
 *               conflitto anche quando dà fastidio guardarlo, e la riga di
 *               sintesi non se ne va dalla pagina.
 *   attenzione  si scarta: è una segnalazione, non un blocco.
 *   info        nessun colore, nessun comando: è una nota, non uno stato.
 *
 * La gerarchia si legge prima del testo — filetto pieno a sinistra e fondo
 * lavato sui due gradini alti, niente sul terzo — e non è affidata alla sola
 * croma: cambiano icona, spessore del bordo e comando disponibile.
 */
const MESSAGGI = {
  info: { cornice: 'border-border border-l-border-strong text-ink-muted', sintesi: 'Nota' },
  attenzione: { cornice: 'border-warn border-l-warn bg-warn-wash text-warn-ink', sintesi: 'Attenzione' },
  errore: { cornice: 'border-danger border-l-danger bg-danger-wash text-danger-ink', sintesi: 'Da risolvere' },
} as const

export function Messaggio({ tono = 'info', titolo, chiudibile, children }: {
  tono?: 'info' | 'errore' | 'attenzione'
  /** La riga che resta visibile quando un errore viene richiuso. */
  titolo?: string
  /** Forza il comando di scarto: l'avviso giallo ce l'ha già di suo. */
  chiudibile?: boolean
  children: ReactNode
}) {
  // ponytail: lo scarto vive quanto la pagina. Un avviso rimosso torna al
  // prossimo caricamento, ed è quel che serve: è un «l'ho letto», non una
  // preferenza. Se un giorno dovrà sopravvivere al ricarico, la chiave sta qui.
  const [scartato, setScartato] = useState(false)
  const [aperto, setAperto] = useState(true)
  const id = useId()

  if (scartato) return null

  const s = MESSAGGI[tono]
  const Icona = tono === 'info' ? Info : Attenzione
  const intestazione = titolo ?? (aperto ? null : s.sintesi)
  const comando = 'shrink-0 cursor-pointer rounded-r1 p-0.5 opacity-70 transition-opacity ' +
    'duration-[120ms] ease-out hover:opacity-100'

  return (
    <div role={tono === 'errore' ? 'alert' : undefined}
         className={`flex items-start gap-2 rounded-r2 border border-l-[3px] px-3 py-2 text-base
                     ${tono === 'errore' ? 'entra-errore' : 'entra'} ${s.cornice}`}>
      <Icona size={16} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {intestazione && <p className="font-semibold">{intestazione}</p>}
        <div id={id} hidden={!aperto} className={intestazione ? 'mt-0.5' : undefined}>{children}</div>
      </div>

      {tono === 'errore' && (
        <button type="button" className={comando} onClick={() => setAperto((x) => !x)}
                aria-expanded={aperto} aria-controls={id}
                title={aperto ? 'Comprimi' : 'Espandi'}
                aria-label={aperto ? 'Comprimi il messaggio' : 'Espandi il messaggio'}>
          <Freccia size={15} className={aperto ? '-rotate-90' : 'rotate-90'} />
        </button>
      )}
      {(chiudibile ?? tono === 'attenzione') && (
        <button type="button" className={comando} onClick={() => setScartato(true)}
                title="Scarta" aria-label="Scarta il messaggio">
          <Chiudi size={15} />
        </button>
      )}
    </div>
  )
}

/* ── Stati di caricamento e vuoto ────────────────────────────────── */

export const BarraCarico = () => <div className="barra-carico bg-surface-2" role="status" aria-label="Caricamento" />

export function Scheletro({ righe = 3 }: { righe?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Caricamento">
      {Array.from({ length: righe }, (_, i) => (
        <div key={i} className="scheletro h-3" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  )
}

/** L'unico punto della superficie densa in cui il marchio può comparire. */
export function StatoVuoto({ testo, azione }: { testo: string; azione?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <Marchio size={72} />
      <p className="max-w-[46ch] text-base text-ink-faint">{testo}</p>
      {azione}
    </div>
  )
}

/* ── Modale ──────────────────────────────────────────────────────── */

export function Modale({ titolo, aperta, onChiudi, piede, children }: {
  titolo: string; aperta: boolean; onChiudi: () => void; piede?: ReactNode; children: ReactNode
}) {
  const rif = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = rif.current
    if (!d) return
    if (aperta && !d.open) d.showModal()
    if (!aperta && d.open) d.close()
  }, [aperta])

  return (
    <dialog
      ref={rif} onClose={onChiudi} onCancel={onChiudi}
      className="m-auto w-[calc(100vw-32px)] max-w-[720px] rounded-r4 border border-border-controllo bg-bg p-0
                 text-ink shadow-overlay backdrop:bg-[oklch(0_0_0/.5)] backdrop:backdrop-blur-[2px]"
    >
      <header className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-md font-semibold tracking-[-0.01em]">{titolo}</h2>
        <Bottone variante="icona" onClick={onChiudi} aria-label="Chiudi"><Chiudi size={16} /></Bottone>
      </header>
      <div className="p-4">{children}</div>
      {piede && <footer className="flex justify-end gap-2 border-t border-border p-4">{piede}</footer>}
    </dialog>
  )
}
