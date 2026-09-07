import { type DragEvent, useState } from 'react'
import type { Unita } from '../api'
import * as I from '../icone'
import { Bottone, Campo, inputCls, Segmented } from '../ui'

type Nodo = Unita & { figlie: Nodo[] }

/** L'elenco piatto che arriva dall'API diventa la gerarchia che si vede. */
export function albero(unita: Unita[]): Nodo[] {
  const nodi = new Map(unita.map((u) => [u.id, { ...u, figlie: [] as Nodo[] }]))
  const cima: Nodo[] = []
  for (const n of nodi.values()) {
    const padre = n.parentId == null ? undefined : nodi.get(n.parentId)
    // Un padre che non è nell'elenco (o non esiste più) non deve far sparire la figlia.
    if (padre) padre.figlie.push(n)
    else cima.push(n)
  }
  const ordina = (l: Nodo[]) => {
    l.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
    for (const n of l) ordina(n.figlie)
  }
  ordina(cima)
  return cima
}

/** Sé stessa e le discendenti: nessuna unità può finire sotto una di queste. */
export function conDiscendenti(unita: Unita[], id: number): Set<number> {
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

type Azioni = {
  onSposta: (id: number, parentId: number | null) => void
  onRinomina: (id: number, dati: { nome: string; sigla: string | null }) => void
  onElimina: (u: Unita) => void
  onNuovaFiglia: (parentId: number) => void
}

/* ── Riga condivisa dalle due viste ──────────────────────────────── */

function Comandi({ u, azioni, inModifica }: { u: Unita; azioni: Azioni; inModifica: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Bottone variante="icona" onClick={() => azioni.onNuovaFiglia(u.id)}
               aria-label={`Aggiungi un'unità sotto ${u.nome}`} title="Aggiungi unità figlia">
        <I.Piu size={15} />
      </Bottone>
      <Bottone variante="icona" onClick={inModifica} aria-label={`Rinomina ${u.nome}`} title="Rinomina">
        <I.Matita size={15} />
      </Bottone>
      <Bottone variante="icona" onClick={() => azioni.onElimina(u)}
               aria-label={`Elimina ${u.nome}`} title="Elimina">
        <I.Cestino size={15} />
      </Bottone>
    </div>
  )
}

function FormNome({ u, azioni, chiudi }: { u: Unita; azioni: Azioni; chiudi: () => void }) {
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

export default function Organigramma({ unita, azioni }: { unita: Unita[]; azioni: Azioni }) {
  const [vista, setVista] = useState<'albero' | 'elenco'>('albero')
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
  const sopraCls = (id: number | 'radice') =>
    sopra === id && accetta(id) ? 'border-action bg-surface-2' : 'border-transparent'

  const Riga = ({ n }: { n: Nodo }) => (
    <div
      draggable={modifica !== n.id}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setPreso(n.id) }}
      onDragEnd={() => { setPreso(null); setSopra(null) }}
      onDragOver={(e) => { if (!accetta(n.id)) return; e.preventDefault(); e.stopPropagation(); setSopra(n.id) }}
      onDragLeave={() => setSopra((s) => (s === n.id ? null : s))}
      onDrop={(e) => lascia(e, n.id)}
      className={`flex items-center gap-2 rounded-r2 border bg-bg px-2 py-1.5
                  ${sopraCls(n.id)} ${preso === n.id ? 'opacity-50' : ''}`}
    >
      <span className="cursor-grab text-ink-faint" aria-hidden="true"><I.Presa size={15} /></span>
      {modifica === n.id ? <FormNome u={n} azioni={azioni} chiudi={() => setModifica(null)} /> : (
        <>
          <span className="min-w-0 flex-1 truncate text-base">
            {n.nome}
            {n.sigla && <span className="mono ml-1.5 text-sm text-ink-faint">{n.sigla}</span>}
          </span>
          <Comandi u={n} azioni={azioni} inModifica={() => setModifica(n.id)} />
        </>
      )}
    </div>
  )

  const Rami = ({ l }: { l: Nodo[] }) => (
    <ul className="flex flex-col gap-1">
      {l.map((n) => (
        <li key={n.id}>
          <Riga n={n} />
          {n.figlie.length > 0 && (
            <div className="ml-3 border-l border-border pl-3 pt-1"><Rami l={n.figlie} /></div>
          )}
        </li>
      ))}
    </ul>
  )

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
          <Rami l={nodi} />
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
                {['Unità', 'Sigla', 'Sotto', 'Azioni'].map((t) => (
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
                  <td className="border-b border-border px-2.5 py-1.5 text-[12.5px]" style={{ paddingLeft: 10 + livello * 18 }}>
                    {livello > 0 && <span className="mr-1 text-ink-faint" aria-hidden="true">└</span>}
                    {modifica === n.id
                      ? <FormNome u={n} azioni={azioni} chiudi={() => setModifica(null)} />
                      : n.nome}
                  </td>
                  <td className="mono border-b border-border px-2.5 py-1.5 text-[12.5px] text-ink-muted">{n.sigla ?? '—'}</td>
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
