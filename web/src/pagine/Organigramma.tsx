import { type DragEvent, useState } from 'react'
import type { Unita } from '../api'
import * as I from '../icone'
import { Bottone, Campo, inputCls, Segmented } from '../ui'

/** L'unità come la vede l'amministratore: con chi la comanda e quanta gente ci lavora. */
export type UnitaOrg = Unita & {
  dirigente: { nome: string; cognome: string } | null
  persone: number
}

type Nodo = UnitaOrg & { figlie: Nodo[]; totale: number }

/**
 * L'elenco piatto che arriva dall'API diventa la gerarchia che si vede.
 * `totale` è la gente di tutto il ramo: su un'unità superiore conta anche chi
 * sta nelle unità sottostanti, che è il numero che interessa a chi guarda.
 */
export function albero(unita: UnitaOrg[]): Nodo[] {
  const nodi = new Map(unita.map((u) => [u.id, { ...u, figlie: [] as Nodo[], totale: u.persone }]))
  const cima: Nodo[] = []
  for (const n of nodi.values()) {
    const padre = n.parentId == null ? undefined : nodi.get(n.parentId)
    // Un padre che non è nell'elenco (o non esiste più) non deve far sparire la figlia.
    if (padre) padre.figlie.push(n)
    else cima.push(n)
  }
  const sistema = (l: Nodo[]): number => {
    l.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
    let somma = 0
    for (const n of l) { n.totale = n.persone + sistema(n.figlie); somma += n.totale }
    return somma
  }
  sistema(cima)
  return cima
}

/** Sé stessa e le discendenti: nessuna unità può finire sotto una di queste. */
export function conDiscendenti(unita: UnitaOrg[], id: number): Set<number> {
  const dentro = new Set([id])
  let cresce = true
  while (cresce) {
    cresce = false
    for (const u of unita) {
      if (u.parentId != null && dentro.has(u.parentId) && !dentro.has(u.id)) { dentro.add(u.id); cresce = true }
    }
  }
  return dentro
}

const appiattisci = (nodi: Nodo[], livello = 0): { n: Nodo; livello: number }[] =>
  nodi.flatMap((n) => [{ n, livello }, ...appiattisci(n.figlie, livello + 1)])

const capo = (n: Nodo) => (n.dirigente ? `${n.dirigente.cognome} ${n.dirigente.nome}` : 'senza dirigente')

type Azioni = {
  onSposta: (id: number, parentId: number | null) => void
  onRinomina: (id: number, dati: { nome: string; sigla: string | null }) => void
  onElimina: (u: UnitaOrg) => void
  onNuovaFiglia: (parentId: number) => void
}

/* ── Pezzi condivisi dalle due viste ─────────────────────────────── */

function Comandi({ u, azioni, inModifica }: { u: UnitaOrg; azioni: Azioni; inModifica: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Bottone variante="icona" onClick={() => azioni.onNuovaFiglia(u.id)}
               aria-label={`Aggiungi un'unità sotto ${u.nome}`} title="Aggiungi unità figlia">
        <I.Piu size={14} />
      </Bottone>
      <Bottone variante="icona" onClick={inModifica} aria-label={`Rinomina ${u.nome}`} title="Rinomina">
        <I.Matita size={14} />
      </Bottone>
      <Bottone variante="icona" onClick={() => azioni.onElimina(u)}
               aria-label={`Elimina ${u.nome}`} title="Elimina">
        <I.Cestino size={14} />
      </Bottone>
    </div>
  )
}

function FormNome({ u, azioni, chiudi }: { u: UnitaOrg; azioni: Azioni; chiudi: () => void }) {
  return (
    <form
      className="flex flex-1 flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        azioni.onRinomina(u.id, { nome: String(f.get('nome')), sigla: String(f.get('sigla')) || null })
        chiudi()
      }}
    >
      <Campo etichetta="Nome"><input name="nome" defaultValue={u.nome} className={inputCls} required minLength={2} autoFocus /></Campo>
      <Campo etichetta="Sigla"><input name="sigla" defaultValue={u.sigla ?? ''} className={inputCls} /></Campo>
      <Bottone type="submit" variante="piccolo">Salva</Bottone>
      <Bottone variante="piccolo" onClick={chiudi}>Annulla</Bottone>
    </form>
  )
}

/* ── Organigramma ────────────────────────────────────────────────── */

export default function Organigramma({ unita, azioni }: { unita: UnitaOrg[]; azioni: Azioni }) {
  // Un organigramma largo non entra in un telefono: lì si parte dall'elenco.
  const [vista, setVista] = useState<'albero' | 'elenco'>(
    () => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'elenco' : 'albero'))
  const [modifica, setModifica] = useState<number | null>(null)
  const [preso, setPreso] = useState<number | null>(null)
  const [sopra, setSopra] = useState<number | 'radice' | null>(null)

  const nodi = albero(unita)
  const vietati = preso == null ? new Set<number>() : conDiscendenti(unita, preso)
  const accetta = (id: number | 'radice') =>
    preso != null && (id === 'radice' ? unita.find((u) => u.id === preso)?.parentId != null : !vietati.has(id))

  function lascia(e: DragEvent, id: number | 'radice') {
    e.preventDefault(); e.stopPropagation()
    if (preso != null && accetta(id)) azioni.onSposta(preso, id === 'radice' ? null : id)
    setPreso(null); setSopra(null)
  }
  const sopraCls = (id: number) =>
    sopra === id && accetta(id) ? 'border-action bg-surface-2' : 'border-border bg-bg'

  const conta = (n: Nodo) =>
    n.totale === n.persone
      ? `${n.totale} ${n.totale === 1 ? 'persona' : 'persone'}`
      : `${n.totale} persone in tutto il ramo, ${n.persone} in questa unità`

  /** Il blocco è piccolo di proposito: in un organigramma conta la forma, non il dettaglio. */
  const Blocco = ({ n, figlia }: { n: Nodo; figlia: boolean }) => (
    <div
      draggable={modifica !== n.id}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setPreso(n.id) }}
      onDragEnd={() => { setPreso(null); setSopra(null) }}
      onDragOver={(e) => { if (!accetta(n.id)) return; e.preventDefault(); e.stopPropagation(); setSopra(n.id) }}
      onDragLeave={() => setSopra((s) => (s === n.id ? null : s))}
      onDrop={(e) => lascia(e, n.id)}
      title={modifica === n.id ? undefined : `${n.nome} — trascina per spostarla`}
      className={`relative mx-auto flex flex-col items-center gap-0.5 rounded-r2 border px-2 py-1.5 text-center
                  ${figlia ? 'orga-freccia' : ''} ${modifica === n.id ? 'w-[250px]' : 'w-[168px] cursor-grab'}
                  ${sopraCls(n.id)} ${preso === n.id ? 'opacity-50' : ''}`}
    >
      {modifica === n.id ? <FormNome u={n} azioni={azioni} chiudi={() => setModifica(null)} /> : (
        <>
          <span className="mono w-full truncate text-sm font-semibold">{n.sigla ?? n.nome}</span>
          {n.sigla && <span className="w-full truncate text-2xs text-ink-muted">{n.nome}</span>}
          <span className={`w-full truncate text-2xs ${n.dirigente ? 'text-ink-muted' : 'text-ink-faint italic'}`}>
            {capo(n)}
          </span>
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 text-2xs text-ink-muted"
                title={conta(n)}>
            <I.Persona size={11} />{n.totale}
          </span>
          <Comandi u={n} azioni={azioni} inModifica={() => setModifica(n.id)} />
        </>
      )}
    </div>
  )

  const Rami = ({ l, cima = false }: { l: Nodo[]; cima?: boolean }) => (
    <ul className={cima ? 'orga-cima' : ''}>
      {l.map((n) => (
        <li key={n.id}>
          <Blocco n={n} figlia={!cima} />
          {n.figlie.length > 0 && <Rami l={n.figlie} />}
        </li>
      ))}
    </ul>
  )

  const cella = 'border-b border-border px-2.5 py-1.5 text-[12.5px]'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          etichetta="Come mostrare l'organigramma" valore={vista} onCambia={setVista}
          opzioni={[
            { v: 'albero', testo: 'Albero', icona: <I.Albero size={14} />, titolo: 'Albero, si trascina' },
            { v: 'elenco', testo: 'Elenco', icona: <I.Elenco size={14} />, titolo: 'Elenco con unità superiore' },
          ]}
        />
        <p className="text-sm text-ink-faint">
          {vista === 'albero'
            ? 'Trascina un’unità sopra un’altra per spostarla.'
            : 'La colonna «Sotto» sposta l’unità senza trascinarla.'}
        </p>
      </div>

      {unita.length === 0 ? <p className="text-base text-ink-faint">Nessuna unità: creane una qui sotto.</p>
        : vista === 'albero' ? (
        <>
          <div className="overflow-x-auto rounded-r2" tabIndex={0} role="group" aria-label="Organigramma, scorrevole">
            <div className="orga min-w-max px-2 py-1"><Rami l={nodi} cima /></div>
          </div>
          <div
            onDragOver={(e) => { if (!accetta('radice')) return; e.preventDefault(); setSopra('radice') }}
            onDragLeave={() => setSopra((s) => (s === 'radice' ? null : s))}
            onDrop={(e) => lascia(e, 'radice')}
            className={`rounded-r2 border border-dashed px-3 py-2 text-sm text-ink-faint
                        ${sopra === 'radice' && accetta('radice') ? 'border-action bg-surface-2' : 'border-border'}`}
          >
            Lascia qui per portare l’unità al livello più alto.
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-r2 border border-border bg-bg">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {['Unità', 'Sigla', 'Dirigente', 'Persone', 'Sotto', 'Azioni'].map((t) => (
                  <th key={t} scope="col"
                      className="border-b border-border bg-surface px-2.5 py-1.5 text-left text-xs font-semibold text-ink-muted">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appiattisci(nodi).map(({ n, livello }) => (
                <tr key={n.id}>
                  <td className={cella} style={{ paddingLeft: 10 + livello * 18 }}>
                    {livello > 0 && <span className="mr-1 text-ink-faint" aria-hidden="true">└</span>}
                    {modifica === n.id
                      ? <FormNome u={n} azioni={azioni} chiudi={() => setModifica(null)} />
                      : n.nome}
                  </td>
                  <td className={`mono ${cella} text-ink-muted`}>{n.sigla ?? '—'}</td>
                  <td className={`${cella} ${n.dirigente ? 'text-ink-muted' : 'text-ink-faint italic'}`}>{capo(n)}</td>
                  <td className={`${cella} tabular-nums text-ink-muted`} title={conta(n)}>{n.totale}</td>
                  <td className="border-b border-border px-2.5 py-1.5">
                    <select
                      className={inputCls} value={n.parentId ?? ''}
                      aria-label={`Unità superiore di ${n.nome}`}
                      onChange={(e) => azioni.onSposta(n.id, e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">— livello più alto —</option>
                      {unita.filter((u) => !conDiscendenti(unita, n.id).has(u.id))
                        .map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                  </td>
                  <td className="border-b border-border px-2.5 py-1.5">
                    <Comandi u={n} azioni={azioni} inModifica={() => setModifica(n.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
