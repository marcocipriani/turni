import type { ReactNode } from 'react'

export function Riquadro({ titolo, azioni, children, descrizione }: {
  titolo: string; descrizione?: string; azioni?: ReactNode; children: ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-filo pb-2">
        <div>
          <h2 className="text-[15px] font-normal">{titolo}</h2>
          {descrizione && <p className="mt-0.5 text-xs text-tenue">{descrizione}</p>}
        </div>
        {azioni && <div className="flex flex-wrap gap-2">{azioni}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Bottone({ children, variante = 'normale', ...resto }: {
  children: ReactNode; variante?: 'normale' | 'primario' | 'pericolo'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const stile = {
    normale: 'border-filo bg-white text-az hover:border-az hover:bg-blue-50/60',
    primario: 'border-az bg-az text-white hover:bg-az-scuro',
    pericolo: 'border-red-200 bg-white text-red-700 hover:border-red-500',
  }[variante]
  return (
    <button
      {...resto}
      className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[13px]
        transition disabled:cursor-not-allowed disabled:opacity-45 ${stile} ${resto.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Etichetta({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'ok' | 'attesa' | 'avviso' }) {
  const stile = {
    neutro: 'bg-slate-100 text-grigio',
    ok: 'bg-emerald-50 text-emerald-800',
    attesa: 'bg-ambra-fondo text-ambra',
    avviso: 'bg-red-50 text-red-700',
  }[tono]
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-[11px] font-medium ${stile}`}>{children}</span>
}

export function Avviso({ tipo = 'info', children }: { tipo?: 'info' | 'errore' | 'attenzione'; children: ReactNode }) {
  const stile = {
    info: 'border-az/30 bg-blue-50/50 text-inchiostro',
    errore: 'border-red-300 bg-red-50 text-red-800',
    attenzione: 'border-ambra/40 bg-ambra-fondo text-ambra',
  }[tipo]
  return <div role={tipo === 'errore' ? 'alert' : undefined} className={`rounded-sm border px-3 py-2 text-[13px] ${stile}`}>{children}</div>
}

export function Campo({ etichetta, aiuto, children }: { etichetta: string; aiuto?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-grigio">{etichetta}</span>
      {children}
      {aiuto && <span className="mt-1 block text-[11px] text-tenue">{aiuto}</span>}
    </label>
  )
}

export const classiInput =
  'w-full rounded-sm border border-filo bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-az'

export function Vuoto({ children }: { children: ReactNode }) {
  return <p className="rounded-sm border border-dashed border-filo bg-white px-4 py-6 text-center text-[13px] text-tenue">{children}</p>
}
