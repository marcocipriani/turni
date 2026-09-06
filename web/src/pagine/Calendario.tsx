import { useEffect, useState } from 'react'
import { api, type Periodo } from '../api'
import * as I from '../icone'
import { useSessione } from '../sessione'
import { Bottone, inputCls, Scheletro, StatoVuoto, Tag } from '../ui'
import { Vista } from '../Vista'

type Giornata = {
  data: string; stato: 'presenza' | 'smart' | 'assenza'
  stanza: string | null; scrivania: string | null; causale: string | null
}
type Presente = { userId: number; nome: string; cognome: string; stanza: string | null; scrivania: string | null }

const formatta = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('it-IT', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
})

export default function Calendario() {
  const { utente } = useSessione()
  const [giornate, setGiornate] = useState<Giornata[] | null>(null)
  const [periodi, setPeriodi] = useState<Periodo[]>([])
  const [giorno, setGiorno] = useState('')
  const [presenti, setPresenti] = useState<Presente[] | null>(null)

  const unitId = utente?.ruolo === 'dirigente' ? utente.unitId : utente?.organizzatoreDi[0] ?? utente?.unitId ?? null

  useEffect(() => {
    void api.get<{ giornate: Giornata[] }>('/periodi/mio-calendario').then((r) => setGiornate(r.giornate))
    if (unitId != null) void api.get<Periodo[]>(`/periodi?unitId=${unitId}`).then(setPeriodi).catch(() => {})
  }, [unitId])

  async function mostraGiorno(data: string) {
    setGiorno(data); setPresenti(null)
    const p = periodi.find((x) => x.stato === 'pubblicato' && x.dataInizio <= data && x.dataFine >= data)
    if (!p) return setPresenti([])
    setPresenti((await api.get<{ presenti: Presente[] }>(`/periodi/${p.id}/giornata/${data}`)).presenti)
  }

  const inSede = (giornate ?? []).filter((g) => g.stato === 'presenza')
  const assenzeProgrammate = (giornate ?? []).filter((g) => g.stato === 'assenza')

  return (
    <Vista
      titolo="Il mio calendario" icona={<I.Calendario size={17} />}
      aiuto="Dalle programmazioni pubblicate della tua unità"
      meta={giornate && <span className="mono">{inSede.length} giornate in sede</span>}
    >
      <div className="flex flex-col gap-8">
        <section id="mie" className="flex flex-col gap-3">
          <h2 className="mono text-2xs uppercase tracking-[0.06em] text-ink-faint">Le mie giornate in sede</h2>
          {giornate === null ? <Scheletro righe={3} />
            : inSede.length === 0 ? <StatoVuoto testo="Nessuna giornata in sede programmata. Compare qui appena una programmazione viene pubblicata." />
            : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {inSede.map((g) => (
                  <li key={g.data} className="flex items-center justify-between gap-3 rounded-r3 border border-border bg-surface px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium capitalize">{formatta(g.data)}</p>
                      <p className="mono mt-0.5 text-sm text-ink-muted">
                        {g.stanza ?? 'stanza da assegnare'}{g.scrivania && ` · scrivania ${g.scrivania}`}
                      </p>
                    </div>
                    <Bottone variante="piccolo" onClick={() => void mostraGiorno(g.data)}>Chi c'è</Bottone>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section id="chi" className="flex flex-col gap-3">
          <h2 className="mono text-2xs uppercase tracking-[0.06em] text-ink-faint">Chi è in sede</h2>
          <div className="max-w-[220px]">
            <input type="date" className={inputCls} value={giorno} aria-label="Scegli una giornata"
                   onChange={(e) => void mostraGiorno(e.target.value)} />
          </div>
          {giorno && (presenti === null ? <Scheletro righe={3} />
            : presenti.length === 0
              ? <p className="text-base text-ink-faint">Nessuna programmazione pubblicata per {formatta(giorno)}.</p>
              : (
                <ul className="max-w-[70ch] divide-y divide-border overflow-hidden rounded-r3 border border-border bg-surface">
                  {presenti.map((p) => (
                    <li key={p.userId} className="flex items-center justify-between gap-3 px-4 py-2 text-base">
                      <span>{p.cognome} <span className="text-ink-muted">{p.nome}</span></span>
                      <Tag>{p.stanza ?? '—'}{p.scrivania && ` · ${p.scrivania}`}</Tag>
                    </li>
                  ))}
                </ul>
              ))}
        </section>

        {assenzeProgrammate.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="mono text-2xs uppercase tracking-[0.06em] text-ink-faint">
              Tue assenze su giornate già programmate
            </h2>
            <p className="max-w-[70ch] text-base text-ink-muted">
              Il calendario pubblicato non cambia da solo. Chi programma è stato avvisato.
            </p>
            <ul className="max-w-[70ch] divide-y divide-border overflow-hidden rounded-r3 border border-border bg-surface">
              {assenzeProgrammate.map((g) => (
                <li key={g.data} className="flex items-center justify-between px-4 py-2 text-base">
                  <span className="capitalize">{formatta(g.data)}</span>
                  {g.causale && <Tag>{g.causale}</Tag>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Vista>
  )
}
