import { Fragment, memo, useMemo, useRef, useState } from 'react'
import type { Cella, Griglia as DatiGriglia, Persona } from '../api'

const GIORNI_BREVI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

function pezziData(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const gs = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  return { giorno: d, meseNome: MESI[m - 1]!, breve: GIORNI_BREVI[gs]!, lunedi: gs === 0 }
}

/** Il contratto di accessibilità della griglia: ogni cella si legge da sola. */
export function descriviCella(p: Persona, iso: string, c: Cella | undefined, stanza: string | null, scrivania: string | null) {
  const { giorno, meseNome, breve } = pezziData(iso)
  const quando = `${breve} ${giorno} ${meseNome}`
  const chi = `${p.cognome} ${p.nome}`
  if (!c) return `${chi}, ${quando}, non programmato`
  if (c.stato === 'assenza') return `${chi}, ${quando}, assenza dichiarata${c.causale ? `, causale ${c.causale}` : ''}`
  if (c.stato === 'smart') return `${chi}, ${quando}, lavoro agile`
  const dove = [stanza && `stanza ${stanza}`, scrivania && `scrivania ${scrivania}`].filter(Boolean).join(', ')
  return `${chi}, ${quando}, presenza${dove ? `, ${dove}` : ''}${c.bloccata ? ', cella bloccata' : ''}`
}

type Selezione = { userId: number; data: string } | null

export default function Griglia({ dati, onSeleziona, selezione }: {
  dati: DatiGriglia
  selezione: Selezione
  onSeleziona: (s: Selezione) => void
}) {
  const [fuoco, setFuoco] = useState({ riga: 0, colonna: 0 })
  const tabella = useRef<HTMLTableElement>(null)

  const indice = useMemo(() => {
    const m = new Map<string, Cella>()
    for (const c of dati.celle) m.set(`${c.userId}|${c.data}`, c)
    return m
  }, [dati.celle])

  const stanzaBreve = useMemo(
    () => new Map(dati.stanze.map((s) => [s.id, s.etichetta.split('·')[0]!.trim()])), [dati.stanze])
  const scrivaniaNumero = useMemo(
    () => new Map(dati.stanze.flatMap((s) => s.scrivanie.map((d) => [d.id, d.numero] as const))), [dati.stanze])

  const gruppi = useMemo(() => {
    const out: { settore: string | null; sectorId: number | null; presidio: boolean; persone: Persona[] }[] = []
    for (const s of dati.settori) {
      const persone = dati.persone.filter((p) => p.sectorId === s.id)
      if (persone.length) out.push({ settore: s.nome, sectorId: s.id, presidio: s.richiedePresidio, persone })
    }
    const orfani = dati.persone.filter((p) => p.sectorId == null || !dati.settori.some((s) => s.id === p.sectorId))
    if (orfani.length) out.push({ settore: null, sectorId: null, presidio: false, persone: orfani })
    return out
  }, [dati.persone, dati.settori])

  const righe = useMemo(() => gruppi.flatMap((g) => g.persone), [gruppi])
  const capienza = dati.stanze.reduce((s, r) => s + r.capienza, 0)

  const occupazione = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of dati.celle) if (c.stato === 'presenza') m.set(c.data, (m.get(c.data) ?? 0) + 1)
    return m
  }, [dati.celle])

  function muovi(dr: number, dc: number) {
    const riga = Math.max(0, Math.min(righe.length - 1, fuoco.riga + dr))
    const colonna = Math.max(0, Math.min(dati.giorni.length - 1, fuoco.colonna + dc))
    setFuoco({ riga, colonna })
    const persona = righe[riga], giorno = dati.giorni[colonna]
    if (persona && giorno) {
      onSeleziona({ userId: persona.id, data: giorno })
      requestAnimationFrame(() => {
        tabella.current?.querySelector<HTMLButtonElement>(`[data-cella="${persona.id}|${giorno}"]`)?.focus()
      })
    }
  }

  function tasti(e: React.KeyboardEvent) {
    const mosse: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    }
    const m = mosse[e.key]
    if (m) { e.preventDefault(); muovi(m[0], m[1]); return }
    if (e.key === 'Home') { e.preventDefault(); muovi(0, -dati.giorni.length) }
    if (e.key === 'End') { e.preventDefault(); muovi(0, dati.giorni.length) }
  }

  return (
    <div className="min-h-0 overflow-auto">
      <table ref={tabella} className="border-separate border-spacing-0" onKeyDown={tasti}>
        <caption className="solo-lettori-schermo">
          Programmazione dal {dati.periodo.dataInizio} al {dati.periodo.dataFine}.
          Persone in riga, giornate lavorative in colonna. Muoviti con le frecce direzionali.
        </caption>

        <thead>
          <tr>
            <th scope="col"
                className="sticky left-0 top-0 z-[3] min-w-[196px] border-b border-r border-border bg-surface
                           px-2.5 py-1.5 text-left text-xs font-semibold text-ink-muted">
              Persona
            </th>
            {dati.giorni.map((g) => {
              const { giorno, breve, lunedi } = pezziData(g)
              return (
                <th key={g} scope="col"
                    className={`sticky top-0 z-[2] w-[52px] border-b border-r border-border bg-surface px-1 py-1.5
                                text-center text-xs font-semibold text-ink-muted
                                ${lunedi ? 'border-l-2 border-l-border-strong' : ''}`}>
                  <span className="block text-2xs font-normal text-ink-faint">{breve}</span>
                  <span className="mono block">{giorno}</span>
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {gruppi.map((gr) => (
            <Fragment key={`gruppo-${gr.sectorId ?? 'nessuno'}`}>
              <tr>
                <th scope="colgroup" colSpan={dati.giorni.length + 1}
                    className="sticky left-0 border-y border-border bg-surface-2 px-2.5 py-1 text-left">
                  <span className="mono text-2xs uppercase tracking-[0.06em] text-ink-muted">
                    {gr.settore ?? 'Senza settore'}
                  </span>
                  <span className="ml-2 text-2xs text-ink-faint">
                    {gr.persone.length} {gr.persone.length === 1 ? 'persona' : 'persone'}
                    {gr.presidio && ' · presidio quotidiano'}
                    {gr.settore === null && ' · non copre presidi'}
                  </span>
                </th>
              </tr>

              {gr.persone.map((p) => {
                const rigaIndice = righe.indexOf(p)
                return (
                  <RigaPersona
                    key={p.id} persona={p} giorni={dati.giorni} indice={indice}
                    stanzaBreve={stanzaBreve} scrivaniaNumero={scrivaniaNumero}
                    selezione={selezione} rigaIndice={rigaIndice} fuoco={fuoco}
                    onSeleziona={onSeleziona} onFuoco={setFuoco}
                  />
                )
              })}
            </Fragment>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <th scope="row"
                className="sticky bottom-0 left-0 z-[3] border-r border-t border-border-strong bg-surface px-2.5 py-1.5
                           text-left text-xs font-normal text-ink-muted">
              Postazioni occupate <span className="mono text-ink-faint">su {capienza}</span>
            </th>
            {dati.giorni.map((g) => {
              const n = occupazione.get(g) ?? 0
              return (
                <td key={g}
                    className={`sticky bottom-0 z-[1] border-r border-t border-border-strong bg-surface px-1 py-1.5
                                text-center text-ink-muted`}>
                  <span className="mono text-xs" aria-hidden="true">{n}</span>
                  <span className="solo-lettori-schermo">{`${n} di ${capienza} postazioni occupate il ${g}`}</span>
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Memoizzata: con 500 persone la selezione di una cella non ridisegna tutto. */
const RigaPersona = memo(function RigaPersona({
  persona: p, giorni, indice, stanzaBreve, scrivaniaNumero, selezione, rigaIndice, fuoco, onSeleziona, onFuoco,
}: {
  persona: Persona
  giorni: string[]
  indice: Map<string, Cella>
  stanzaBreve: Map<number, string>
  scrivaniaNumero: Map<number, string>
  selezione: Selezione
  rigaIndice: number
  fuoco: { riga: number; colonna: number }
  onSeleziona: (s: Selezione) => void
  onFuoco: (f: { riga: number; colonna: number }) => void
}) {
  const dispari = rigaIndice % 2 === 1
  return (
    <tr className="h-[30px]">
      <th scope="row"
          className={`sticky left-0 z-[1] h-[30px] border-b border-r border-border px-2.5 text-left text-[12.5px]
                      font-normal ${dispari ? 'bg-[color-mix(in_oklch,var(--surface)_50%,var(--bg))]' : 'bg-bg'}`}>
        <span className="block max-w-[178px] truncate">
          {p.cognome} <span className="text-ink-muted">{p.nome}</span>
          {p.ruolo === 'dirigente' && <span className="ml-1 text-2xs text-ink-faint">dirig.</span>}
        </span>
      </th>

      {giorni.map((g, ci) => {
        const c = indice.get(`${p.id}|${g}`)
        const stanza = c?.roomId != null ? stanzaBreve.get(c.roomId) ?? null : null
        const scrivania = c?.deskId != null ? scrivaniaNumero.get(c.deskId) ?? null : null
        const scelta = selezione?.userId === p.id && selezione.data === g
        const { lunedi } = pezziData(g)

        const testo =
          c?.stato === 'presenza' ? 'font-semibold text-ink'
          : c?.stato === 'assenza' ? 'text-ink-faint'
          : 'text-ink-faint/60'

        return (
          <td key={g}
              className={`h-[30px] border-b border-r border-border p-0
                          ${lunedi ? 'border-l-2 border-l-border-strong' : ''}
                          ${dispari ? 'bg-[color-mix(in_oklch,var(--surface)_50%,var(--bg))]' : 'bg-bg'}`}
              style={scelta ? { boxShadow: 'inset 2px 0 0 var(--ink)' } : undefined}>
            <button
              type="button"
              data-cella={`${p.id}|${g}`}
              tabIndex={rigaIndice === fuoco.riga && ci === fuoco.colonna ? 0 : -1}
              onFocus={() => onFuoco({ riga: rigaIndice, colonna: ci })}
              onClick={() => onSeleziona({ userId: p.id, data: g })}
              aria-pressed={scelta}
              className={`h-[30px] w-full cursor-pointer px-1 text-center text-[12.5px] leading-none
                          transition-colors duration-[120ms] ease-out hover:bg-surface-2 ${testo}`}
            >
              <span className="mono" aria-hidden="true">
                {c?.stato === 'presenza' ? (scrivania ? `${stanza}/${scrivania}` : stanza ?? '•')
                  : c?.stato === 'assenza' ? '×' : '–'}
              </span>
              {c?.bloccata && <span className="ml-0.5 text-ink-faint" aria-hidden="true">▪</span>}
              <span className="solo-lettori-schermo">{descriviCella(p, g, c, stanza, scrivania)}</span>
            </button>
          </td>
        )
      })}
    </tr>
  )
})

export function Legenda() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-faint">
      <li><span className="mono mr-1.5 font-semibold text-ink">101/3</span>presenza: stanza e scrivania</li>
      <li><span className="mono mr-1.5">–</span>lavoro agile</li>
      <li><span className="mono mr-1.5">×</span>assenza dichiarata</li>
      <li><span className="mr-1.5 text-ink-faint">▪</span>cella bloccata: la generazione non la tocca</li>
    </ul>
  )
}
