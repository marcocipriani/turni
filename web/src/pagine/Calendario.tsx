import { useEffect, useState } from 'react'
import { api, type Periodo } from '../api'
import { Etichetta, Riquadro, Vuoto } from '../componenti'
import { classiInput } from '../componenti'
import { useSessione } from '../sessione'

type Giornata = { data: string; stato: 'presenza' | 'smart' | 'assenza'; stanza: string | null; scrivania: string | null; causale: string | null }
type Presente = { userId: number; nome: string; cognome: string; stanza: string | null; scrivania: string | null }

const formatta = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('it-IT', {
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
    const r = await api.get<{ presenti: Presente[] }>(`/periodi/${p.id}/giornata/${data}`)
    setPresenti(r.presenti)
  }

  const inSede = (giornate ?? []).filter((g) => g.stato === 'presenza')

  return (
    <>
      <Riquadro
        titolo="Le mie giornate in sede"
        descrizione="Dalle programmazioni pubblicate della tua unità."
      >
        {giornate === null ? <p className="text-[13px] text-tenue">Caricamento…</p>
          : inSede.length === 0 ? <Vuoto>Nessuna giornata in sede programmata.</Vuoto>
          : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {inSede.map((g) => (
                <li key={g.data} className="rounded-sm border border-filo bg-white px-4 py-3">
                  <p className="text-[13px] font-medium capitalize">{formatta(g.data)}</p>
                  <p className="mt-1 text-[12px] text-grigio">
                    {g.stanza ?? 'stanza da assegnare'}{g.scrivania && ` · scrivania ${g.scrivania}`}
                  </p>
                  <button onClick={() => void mostraGiorno(g.data)} className="mt-2 text-[12px] text-az hover:underline">
                    Chi c'è quel giorno
                  </button>
                </li>
              ))}
            </ul>
          )}
      </Riquadro>

      <Riquadro titolo="Chi è in sede" descrizione="Scegli una giornata per vedere l'elenco dei presenti e le stanze.">
        <div className="mb-3 max-w-xs">
          <input type="date" className={classiInput} value={giorno} onChange={(e) => void mostraGiorno(e.target.value)} />
        </div>
        {giorno && (presenti === null ? <p className="text-[13px] text-tenue">Caricamento…</p>
          : presenti.length === 0 ? <Vuoto>Nessuna programmazione pubblicata per {formatta(giorno)}.</Vuoto>
          : (
            <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
              {presenti.map((p) => (
                <li key={p.userId} className="flex items-center justify-between px-4 py-2 text-[13px]">
                  <span>{p.cognome} <span className="text-grigio">{p.nome}</span></span>
                  <Etichetta>{p.stanza ?? '—'}{p.scrivania && ` · scrivania ${p.scrivania}`}</Etichetta>
                </li>
              ))}
            </ul>
          ))}
      </Riquadro>

      {giornate && giornate.some((g) => g.stato === 'assenza') && (
        <Riquadro titolo="Assenze che ricadono su giornate programmate"
                  descrizione="Il calendario pubblicato non cambia da solo: chi programma è stato avvisato.">
          <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
            {giornate.filter((g) => g.stato === 'assenza').map((g) => (
              <li key={g.data} className="px-4 py-2 text-[13px]">
                <span className="capitalize">{formatta(g.data)}</span>
                {g.causale && <span className="ml-2 text-tenue">· {g.causale}</span>}
              </li>
            ))}
          </ul>
        </Riquadro>
      )}
    </>
  )
}
