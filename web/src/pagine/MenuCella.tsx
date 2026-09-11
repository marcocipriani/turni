/**
 * Il menu di una cella in modalità modifica. Sul desktop si apre col tasto
 * destro dove si è cliccato; sul telefono il tasto destro non esiste, e lo
 * apre il tocco, in una finestra.
 */
import { useEffect, useRef } from 'react'
import type { Cella } from '../api'
import { Modale } from '../ui'

export type Voce = { chiave: string; etichetta: string; attuale?: boolean }

/** Le voci, dalla cella e dall'occupazione del giorno. Pura, così si prova da sola. */
export function vociMenu(
  cella: Cella, stanze: { id: number; etichetta: string; capienza: number }[], occupati: Map<number, number>,
): Voce[] {
  // Un'assenza dichiarata dall'interessato non si tocca; quella registrata
  // dall'organizzazione si può solo togliere.
  if (cella.stato === 'assenza') {
    return cella.perConto && cella.assenzaId != null ? [{ chiave: 'togli-assenza', etichetta: 'Togli l\'assenza' }] : []
  }
  return [
    ...stanze.map((s) => ({
      chiave: `stanza:${s.id}`, etichetta: `${s.etichetta} · ${occupati.get(s.id) ?? 0}/${s.capienza}`,
      attuale: cella.stato === 'presenza' && cella.roomId === s.id,
    })),
    { chiave: 'remoto', etichetta: 'Da remoto', attuale: cella.stato === 'smart' },
    cella.bloccata
      ? { chiave: 'sblocca', etichetta: 'Sblocca: la generazione potrà cambiarla' }
      : { chiave: 'blocca', etichetta: 'Blocca' },
    { chiave: 'assenza', etichetta: 'Registra un\'assenza…' },
    { chiave: 'dettagli', etichetta: 'Dettagli…' },
  ]
}

export function MenuCella({ titolo, voci, posizione, onScegli, onChiudi }: {
  titolo: string
  voci: Voce[]
  /** Dove si è cliccato col tasto destro; null col tocco. */
  posizione: { x: number; y: number } | null
  onScegli: (chiave: string) => void
  onChiudi: () => void
}) {
  const rif = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!posizione) return
    rif.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const fuori = (e: MouseEvent) => { if (!rif.current?.contains(e.target as Node)) onChiudi() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi() }
    document.addEventListener('mousedown', fuori); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc) }
  }, [posizione, onChiudi])

  const elenco = (grandi: boolean) => voci.map((v) => (
    <button key={v.chiave} type="button" role="menuitem" onClick={() => onScegli(v.chiave)}
            className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-r1 px-2.5 text-left
                        text-sm hover:bg-surface-2 ${grandi ? 'min-h-[44px]' : 'min-h-[30px]'}
                        ${v.attuale ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
      {v.etichetta}{v.attuale && <span aria-hidden="true">•</span>}
    </button>
  ))

  if (!posizione) {
    return <Modale titolo={titolo} aperta onChiudi={onChiudi}><div role="menu">{elenco(true)}</div></Modale>
  }
  // Resta dentro lo schermo anche cliccando vicino al bordo.
  const x = Math.max(8, Math.min(posizione.x, window.innerWidth - 260))
  const y = Math.max(8, Math.min(posizione.y, window.innerHeight - voci.length * 30 - 48))
  return (
    <div ref={rif} role="menu" aria-label={titolo}
         className="fixed z-[400] w-[250px] rounded-r2 border border-border-controllo bg-bg p-1 shadow-overlay"
         style={{ left: x, top: y }}>
      <p className="px-2.5 py-1 text-2xs text-ink-faint">{titolo}</p>
      {elenco(false)}
    </div>
  )
}
