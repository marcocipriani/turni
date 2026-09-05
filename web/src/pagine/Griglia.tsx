import { Fragment, useMemo, useRef, useState } from 'react'
import type { Cella, Griglia as DatiGriglia, Persona } from '../api'

const GIORNI_BREVI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

function pezziData(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  const gs = (dt.getUTCDay() + 6) % 7
  return { giorno: d, meseNome: MESI[m - 1]!, breve: GIORNI_BREVI[gs]!, indiceSettimana: gs }
}

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
  const [colonnaFuoco, setColonnaFuoco] = useState(0)
  const [rigaFuoco, setRigaFuoco] = useState(0)
  const tabella = useRef<HTMLTableElement>(null)

  const indice = useMemo(() => {
    const m = new Map<string, Cella>()
    for (const c of dati.celle) m.set(`${c.userId}|${c.data}`, c)
    return m
  }, [dati.celle])

  const stanzaBreve = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of dati.stanze) m.set(s.id, s.etichetta.split('·')[0]!.trim())
    return m
  }, [dati.stanze])

  const scrivaniaNumero = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of dati.stanze) for (const d of s.scrivanie) m.set(d.id, d.numero)
    return m
  }, [dati.stanze])

  // Le persone si raggruppano per settore, chi non ne ha in coda.
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
    const r = Math.max(0, Math.min(righe.length - 1, rigaFuoco + dr))
    const c = Math.max(0, Math.min(dati.giorni.length - 1, colonnaFuoco + dc))
    setRigaFuoco(r); setColonnaFuoco(c)
    const persona = righe[r], giorno = dati.giorni[c]
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
    if (e.key === 'Home') { e.preventDefault(); setColonnaFuoco(0); muovi(0, -dati.giorni.length) }
    if (e.key === 'End') { e.preventDefault(); muovi(0, dati.giorni.length) }
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-filo bg-white">
      <table ref={tabella} className="w-full border-separate border-spacing-0 text-[12px]" onKeyDown={tasti}>
        <caption className="sr-only">
          Programmazione dal {dati.periodo.dataInizio} al {dati.periodo.dataFine}.
          Persone in riga, giornate lavorative in colonna. Muoviti con le frecce direzionali.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-20 min-w-[210px] bg-white px-2 py-1.5 text-left font-medium text-grigio">
              Persona
            </th>
            {dati.giorni.map((g) => {
              const { giorno, breve, indiceSettimana } = pezziData(g)
              return (
                <th key={g} scope="col"
                    className={`bg-white px-1 py-1.5 text-center font-normal text-tenue ${indiceSettimana === 0 ? 'border-l-2 border-slate-300' : ''}`}>
                  <span className="block text-[10px]">{breve}</span>
                  <span className="block text-[12px] text-grigio">{giorno}</span>
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
                    className="sticky left-0 border-y border-filo bg-slate-50 px-2 py-1 text-left text-[12px] font-medium text-az">
                  {gr.settore ?? 'Senza settore'}
                  <span className="ml-2 font-normal text-tenue">
                    {gr.persone.length} {gr.persone.length === 1 ? 'persona' : 'persone'}
                    {gr.presidio && ' · presidio quotidiano richiesto'}
                    {gr.settore === null && ' · non concorre ad alcun presidio'}
                  </span>
                </th>
              </tr>

              {gr.persone.map((p) => {
                const rigaIndice = righe.indexOf(p)
                return (
                  <tr key={p.id}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-slate-100 bg-white px-2 py-1 text-left font-normal">
                      {p.cognome} <span className="text-grigio">{p.nome}</span>
                      {p.ruolo === 'dirigente' && <span className="ml-1 text-[10px] text-tenue">· dirigente</span>}
                    </th>

                    {dati.giorni.map((g, ci) => {
                      const c = indice.get(`${p.id}|${g}`)
                      const stanza = c?.roomId != null ? stanzaBreve.get(c.roomId) ?? null : null
                      const scrivania = c?.deskId != null ? scrivaniaNumero.get(c.deskId) ?? null : null
                      const scelta = selezione?.userId === p.id && selezione.data === g
                      const primaDellaSettimana = pezziData(g).indiceSettimana === 0

                      const sfondo =
                        c?.stato === 'presenza' ? 'bg-blue-50 text-az-scuro font-semibold'
                        : c?.stato === 'assenza' ? 'bg-slate-50 text-slate-400'
                        : 'text-slate-300'

                      return (
                        <td key={g} className={`border-b border-slate-100 p-0 ${primaDellaSettimana ? 'border-l-2 border-l-slate-300' : ''}`}>
                          <button
                            type="button"
                            data-cella={`${p.id}|${g}`}
                            tabIndex={rigaIndice === rigaFuoco && ci === colonnaFuoco ? 0 : -1}
                            onFocus={() => { setRigaFuoco(rigaIndice); setColonnaFuoco(ci) }}
                            onClick={() => onSeleziona({ userId: p.id, data: g })}
                            aria-pressed={scelta}
                            className={`h-7 w-full px-1 text-[10.5px] tracking-wide ${sfondo}
                              ${scelta ? 'ring-2 ring-inset ring-az' : ''}`}
                          >
                            <span aria-hidden="true">
                              {c?.stato === 'presenza' ? (scrivania ? `${stanza}/${scrivania}` : stanza ?? 'sede')
                                : c?.stato === 'assenza' ? '✕' : '–'}
                              {c?.bloccata && <span className="ml-0.5 text-ambra">▪</span>}
                            </span>
                            <span className="sr-only">{descriviCella(p, g, c, stanza, scrivania)}</span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <th scope="row" className="sticky left-0 border-t-2 border-az bg-slate-50 px-2 py-1.5 text-left font-normal text-grigio">
              Postazioni occupate <span className="text-tenue">su {capienza}</span>
            </th>
            {dati.giorni.map((g) => {
              const n = occupazione.get(g) ?? 0
              const sotto = n < capienza
              return (
                <td key={g} className={`border-t-2 border-az px-1 py-1.5 text-center ${sotto ? 'bg-ambra-fondo text-ambra' : 'bg-slate-50 text-grigio'}`}>
                  <span aria-hidden="true">{n}</span>
                  <span className="sr-only">{`${n} di ${capienza} postazioni occupate il ${g}`}</span>
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function Legenda() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-grigio">
      <li><span className="mr-1.5 inline-block rounded-sm bg-blue-50 px-1.5 font-semibold text-az-scuro">101</span>
        presenza in sede, con stanza ed eventuale scrivania</li>
      <li><span className="mr-1.5 text-slate-300">–</span> lavoro agile</li>
      <li><span className="mr-1.5 text-slate-400">✕</span> assenza dichiarata</li>
      <li><span className="mr-1.5 text-ambra">▪</span> cella bloccata: la generazione non la tocca</li>
    </ul>
  )
}
