import { type FormEvent, useEffect, useState } from 'react'
import { api, ErroreApi } from '../api'
import { Avviso, Bottone, Campo, classiInput, Riquadro, Vuoto } from '../componenti'

type Causale = { id: number; codice: string; etichetta: string }
type Assenza = { id: number; dataInizio: string; dataFine: string; causale: string }
type Regola = { id: number; giornoSettimana: number; causale: string; validoDa: string; validoA: string | null }
type Preferenze = { giorniPreferiti: number[] | null; giorniDaEvitare: number[] | null; nota: string | null }

const GIORNI = [[1, 'lunedì'], [2, 'martedì'], [3, 'mercoledì'], [4, 'giovedì'], [5, 'venerdì']] as const
const oggi = () => new Date().toISOString().slice(0, 10)

export default function Assenze() {
  const [causali, setCausali] = useState<Causale[]>([])
  const [dati, setDati] = useState<{ assenze: Assenza[]; regole: Regola[] } | null>(null)
  const [pref, setPref] = useState<Preferenze | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  const [dataInizio, setDataInizio] = useState(oggi())
  const [dataFine, setDataFine] = useState(oggi())
  const [causale, setCausale] = useState('')

  const [giornoRegola, setGiornoRegola] = useState(1)
  const [causaleRegola, setCausaleRegola] = useState('')

  async function ricarica() {
    setDati(await api.get('/assenze/mie'))
    setPref(await api.get<Preferenze>('/assenze/preferenze'))
  }

  useEffect(() => {
    void api.get<Causale[]>('/assenze/causali').then((c) => {
      setCausali(c); setCausale(c[0]?.codice ?? ''); setCausaleRegola(c[0]?.codice ?? '')
    })
    void ricarica()
  }, [])

  const etichettaCausale = (c: string) => causali.find((x) => x.codice === c)?.etichetta ?? c

  async function prova(fn: () => Promise<unknown>) {
    setErrore(null)
    try { await fn(); await ricarica() }
    catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita') }
  }

  return (
    <>
      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}

      <Riquadro
        titolo="Dichiara un'assenza"
        descrizione="Un giorno solo o un intervallo. La causale è visibile a te, a chi programma e al tuo dirigente: mai ai colleghi."
      >
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); void prova(() => api.post('/assenze', { dataInizio, dataFine, causale })) }}
          className="grid gap-3 rounded-sm border border-filo bg-white p-4 sm:grid-cols-4"
        >
          <Campo etichetta="Dal">
            <input type="date" className={classiInput} value={dataInizio}
                   onChange={(e) => { setDataInizio(e.target.value); if (dataFine < e.target.value) setDataFine(e.target.value) }} required />
          </Campo>
          <Campo etichetta="Al">
            <input type="date" className={classiInput} value={dataFine} min={dataInizio}
                   onChange={(e) => setDataFine(e.target.value)} required />
          </Campo>
          <Campo etichetta="Causale">
            <select className={classiInput} value={causale} onChange={(e) => setCausale(e.target.value)}>
              {causali.map((c) => <option key={c.id} value={c.codice}>{c.etichetta}</option>)}
            </select>
          </Campo>
          <div className="flex items-end"><Bottone type="submit" variante="primario">Dichiara</Bottone></div>
        </form>

        <div className="mt-4">
          {!dati ? <p className="text-[13px] text-tenue">Caricamento…</p>
            : dati.assenze.length === 0 ? <Vuoto>Nessuna assenza dichiarata.</Vuoto>
            : (
              <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
                {dati.assenze.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2 text-[13px]">
                    <span>
                      {a.dataInizio}{a.dataFine !== a.dataInizio && ` → ${a.dataFine}`}
                      <span className="ml-2 text-tenue">· {etichettaCausale(a.causale)}</span>
                    </span>
                    <Bottone variante="pericolo" onClick={() => void prova(() => api.del(`/assenze/${a.id}`))}>Revoca</Bottone>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </Riquadro>

      <Riquadro titolo="Indisponibilità ricorrenti" descrizione="Un giorno della settimana in cui non puoi essere in sede.">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            void prova(() => api.post('/assenze/regole', {
              giornoSettimana: giornoRegola, causale: causaleRegola, validoDa: oggi(), validoA: null,
            }))
          }}
          className="grid gap-3 rounded-sm border border-filo bg-white p-4 sm:grid-cols-3"
        >
          <Campo etichetta="Giorno">
            <select className={classiInput} value={giornoRegola} onChange={(e) => setGiornoRegola(Number(e.target.value))}>
              {GIORNI.map(([n, t]) => <option key={n} value={n}>{t}</option>)}
            </select>
          </Campo>
          <Campo etichetta="Causale">
            <select className={classiInput} value={causaleRegola} onChange={(e) => setCausaleRegola(e.target.value)}>
              {causali.map((c) => <option key={c.id} value={c.codice}>{c.etichetta}</option>)}
            </select>
          </Campo>
          <div className="flex items-end"><Bottone type="submit">Aggiungi</Bottone></div>
        </form>

        <div className="mt-4">
          {dati && dati.regole.length > 0 && (
            <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
              {dati.regole.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2 text-[13px]">
                  <span>Ogni {GIORNI.find(([n]) => n === r.giornoSettimana)?.[1]}
                    <span className="ml-2 text-tenue">· {etichettaCausale(r.causale)} · dal {r.validoDa}</span>
                  </span>
                  <Bottone variante="pericolo" onClick={() => void prova(() => api.del(`/assenze/regole/${r.id}`))}>Rimuovi</Bottone>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Riquadro>

      <Riquadro titolo="Preferenze" descrizione="Non vincolano la programmazione: la generazione le premia quando può.">
        {pref && (
          <form
            onSubmit={(e: FormEvent) => { e.preventDefault(); void prova(() => api.put('/assenze/preferenze', pref)) }}
            className="space-y-4 rounded-sm border border-filo bg-white p-4"
          >
            {(['giorniPreferiti', 'giorniDaEvitare'] as const).map((campo) => (
              <fieldset key={campo}>
                <legend className="mb-1 text-xs font-medium text-grigio">
                  {campo === 'giorniPreferiti' ? 'Giorni preferiti in sede' : 'Giorni da evitare'}
                </legend>
                <div className="flex flex-wrap gap-4">
                  {GIORNI.map(([n, t]) => (
                    <label key={n} className="inline-flex items-center gap-1.5 text-[13px]">
                      <input
                        type="checkbox"
                        checked={(pref[campo] ?? []).includes(n)}
                        onChange={(e) => setPref({
                          ...pref,
                          [campo]: e.target.checked
                            ? [...(pref[campo] ?? []), n]
                            : (pref[campo] ?? []).filter((x) => x !== n),
                        })}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <Campo etichetta="Nota per chi programma">
              <textarea className={classiInput} rows={2} value={pref.nota ?? ''}
                        onChange={(e) => setPref({ ...pref, nota: e.target.value })} />
            </Campo>
            <Bottone type="submit" variante="primario">Salva le preferenze</Bottone>
          </form>
        )}
      </Riquadro>
    </>
  )
}
