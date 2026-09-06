import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from 'react'
import { Attenzione, Chiudi, Info, Spunta } from './icone'
import { Marchio } from './Marchio'

/* ── Bottoni ─────────────────────────────────────────────────────── */

type VarianteBottone = 'normale' | 'primario' | 'piccolo' | 'icona' | 'distruttivo'

const BASE = 'inline-flex items-center gap-2 transition-colors duration-[120ms] ease-out ' +
  'disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer'

const VARIANTI: Record<VarianteBottone, string> = {
  normale: `${BASE} rounded-r2 border border-border-strong bg-bg px-3 py-1.5 text-base text-ink hover:bg-surface-2`,
  primario: `${BASE} rounded-r2 border border-action bg-action px-3 py-1.5 text-base text-action-ink hover:bg-action-hover`,
  piccolo: `${BASE} rounded-r2 border border-border-strong bg-bg px-2 py-[3px] text-sm text-ink hover:bg-surface-2`,
  icona: `${BASE} rounded-r1 p-[5px] text-ink-faint hover:bg-surface-2 hover:text-ink`,
  distruttivo: `${BASE} rounded-r2 border border-border-strong bg-bg px-3 py-1.5 text-base text-ink hover:bg-danger-wash hover:text-danger-ink hover:border-danger`,
}

export function Bottone({ variante = 'normale', className = '', ...resto }:
  { variante?: VarianteBottone } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...resto} className={`${VARIANTI[variante]} ${className}`} />
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
         className="inline-flex overflow-hidden rounded-r2 border border-border-strong">
      {opzioni.map((o, i) => (
        <button
          key={o.v} type="button" role="radio" aria-checked={valore === o.v} title={o.titolo}
          aria-label={o.titolo} onClick={() => onCambia(o.v)}
          className={`inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-sm transition-colors
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

export const Badge = ({ children }: { children: ReactNode }) =>
  <span className="inline-flex items-center rounded-full border border-border-strong px-1.5 py-px text-2xs uppercase tracking-[0.04em] text-ink-muted">{children}</span>

export function Pill({ tono = 'neutro', children }: { tono?: 'neutro' | 'ok' | 'attesa' | 'errore'; children: ReactNode }) {
  const colore = { neutro: 'text-ink-muted', ok: 'text-ok', attesa: 'text-warn-ink', errore: 'text-danger-ink' }[tono]
  const icona = tono === 'ok' ? <Spunta size={13} /> : tono === 'errore' ? <Attenzione size={13} /> : null
  return <span className={`inline-flex items-center gap-1 rounded-full px-1.5 text-sm ${colore}`}>{icona}{children}</span>
}

export const Tag = ({ children }: { children: ReactNode }) =>
  <span className="inline-flex items-center gap-1 rounded-r1 bg-surface-2 px-1.5 py-0.5 text-sm text-ink-muted">{children}</span>

/** Lo stato non passa mai dal solo colore: pallino più etichetta, sempre. */
export function Stato({ tono, children }: { tono: 'neutro' | 'ok' | 'attesa' | 'errore'; children: ReactNode }) {
  const sfondo = { neutro: 'bg-ink-faint', ok: 'bg-ok', attesa: 'bg-warn', errore: 'bg-danger' }[tono]
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
      <span className={`size-2 shrink-0 rounded-full ${sfondo}`} aria-hidden="true" />{children}
    </span>
  )
}

/* ── Campi ───────────────────────────────────────────────────────── */

export const inputCls =
  'w-full rounded-r2 border border-border-strong bg-bg px-3 py-1.5 text-base text-ink ' +
  'placeholder:text-ink-muted outline-none focus:border-border-strong'

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

export function Ricerca({ valore, onCambia, segnaposto, scorciatoia }: {
  valore: string; onCambia: (v: string) => void; segnaposto: string; scorciatoia?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-r2 border border-border-strong bg-surface px-2.5 py-1.5
                    focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
           strokeLinecap="round" aria-hidden="true" className="shrink-0 text-ink-faint">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" />
      </svg>
      <input
        value={valore} onChange={(e) => onCambia(e.target.value)} placeholder={segnaposto} aria-label={segnaposto}
        className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-muted"
      />
      {scorciatoia && (
        <kbd className="mono rounded-r1 border border-border px-1 text-2xs text-ink-faint">{scorciatoia}</kbd>
      )}
    </div>
  )
}

/* ── Pannello ────────────────────────────────────────────────────── */

export function Pannello({ titolo, icona, azioni, piede, tonoPiede = 'neutro', children }: {
  titolo?: string; icona?: ReactNode; azioni?: ReactNode; piede?: ReactNode
  tonoPiede?: 'neutro' | 'ok' | 'attesa' | 'errore'; children: ReactNode
}) {
  const colorePiede = { neutro: 'text-ink-muted', ok: 'text-ok', attesa: 'text-warn-ink', errore: 'text-danger-ink' }[tonoPiede]
  return (
    <section className="flex flex-col gap-3 rounded-r3 border border-border bg-surface p-4">
      {(titolo || azioni) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {titolo && (
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              {icona && <span className="text-ink-muted">{icona}</span>}{titolo}
            </h3>
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

export function Messaggio({ tono = 'info', children }: { tono?: 'info' | 'errore' | 'attenzione'; children: ReactNode }) {
  const stile = {
    info: 'border-border text-ink-muted',
    errore: 'border-danger bg-danger-wash text-danger-ink',
    attenzione: 'border-border-strong text-warn-ink',
  }[tono]
  const Icona = tono === 'info' ? Info : Attenzione
  return (
    <div role={tono === 'errore' ? 'alert' : undefined}
         className={`flex items-start gap-2 rounded-r2 border px-3 py-2 text-base ${stile}`}>
      <Icona size={16} /><div className="min-w-0 flex-1">{children}</div>
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
      className="m-auto w-[calc(100vw-32px)] max-w-[720px] rounded-r4 border border-border-strong bg-bg p-0
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
