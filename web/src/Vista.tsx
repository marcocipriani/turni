import type { ReactNode } from 'react'
import { ControlliGlobali } from './navigazione'
import { BarraCarico } from './ui'

/**
 * Il contenuto dell'isola principale: header di 52px e corpo che scorre.
 * L'header porta identità e I/O della pagina; i filtri stanno nella toolbar,
 * dentro il corpo. Il confine è quello del § 5.1 della specifica.
 */
export function Vista({ titolo, icona, aiuto, meta, azioni, caricando, denso, children }: {
  titolo: string
  icona?: ReactNode
  aiuto?: string
  meta?: ReactNode
  azioni?: ReactNode
  caricando?: boolean
  /** Le viste dense (griglie) non hanno padding esterno. */
  denso?: boolean
  children: ReactNode
}) {
  return (
    <>
      <header className="non-stampare relative flex min-w-0 items-center justify-between gap-4 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {icona && (
            <span className="grid size-[30px] shrink-0 place-items-center rounded-r2 border border-border bg-surface text-ink-muted">
              {icona}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-md font-semibold tracking-[-0.01em]">{titolo}</h1>
            {aiuto && <p className="truncate text-xs text-ink-faint">{aiuto}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 max-sm:gap-1">
          {meta && <div className="hidden items-center gap-3 text-sm text-ink-faint lg:flex">{meta}</div>}
          {azioni && <div className="flex items-center gap-2 max-sm:gap-1">{azioni}</div>}
          {/* Sul telefono non c'è rail: campanella e menu utente vivono qui. */}
          <ControlliGlobali />
        </div>
        {caricando && <div className="absolute inset-x-0 bottom-0"><BarraCarico /></div>}
      </header>

      <div className={`entra min-h-0 overflow-auto ${denso ? '' : 'p-4 md:p-6'}`}>{children}</div>
    </>
  )
}

/** Manipolazione della vista: tab, filtri, conteggi. Mai import o export. */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div data-barra className="non-stampare sticky top-0 z-[200] flex flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-2">
      {children}
    </div>
  )
}

/** Dettaglio contestuale dell'elemento selezionato. */
export function Drawer({ titolo, onChiudi, children }: { titolo: string; onChiudi: () => void; children: ReactNode }) {
  return (
    <aside
      aria-label={titolo}
      className="flex min-h-0 w-[300px] shrink-0 flex-col border-l border-border bg-bg lg:w-[380px]"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">{titolo}</h2>
        <button onClick={onChiudi} aria-label="Chiudi il dettaglio"
                className="cursor-pointer rounded-r1 p-1 text-ink-faint hover:bg-surface-2 hover:text-ink">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
               strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </aside>
  )
}
