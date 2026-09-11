import { type FormEvent, useEffect, useState } from 'react'
import { api } from '../api'
import { useAzione, useNuovi } from '../azioni'
import * as I from '../icone'
import { useSessione } from '../sessione'
import { STATI, type Stato } from '../stati'
import { Bottone, Campo, inputCls, Messaggio, Pannello, Scheletro, Tag } from '../ui'
import { Vista } from '../Vista'

type Causale = { id: number; codice: string; etichetta: string }
type Assenza = { id: number; dataInizio: string; dataFine: string; causale: string; registrataDa: number | null }
type Regola = { id: number; giornoSettimana: number; causale: string; validoDa: string; validoA: string | null }
type Preferenze = {
  giorniPreferiti: number[] | null; giorniDaEvitare: number[] | null; nota: string | null
  promemoriaSera: boolean
  vistaTurni: 'giorni' | 'griglia'
  filtriMio: Stato[]
}

const GIORNI = [[1, 'lunedì'], [2, 'martedì'], [3, 'mercoledì'], [4, 'giovedì'], [5, 'venerdì']] as const
const oggi = () => new Date().toISOString().slice(0, 10)

export default function Assenze() {
  const { ricarica: ricaricaSessione } = useSessione()
  const [causali, setCausali] = useState<Causale[]>([])
  const [dati, setDati] = useState<{ assenze: Assenza[]; regole: Regola[] } | null>(null)
  const [pref, setPref] = useState<Preferenze | null>(null)
  /* Un'azione per pannello: la spunta compare sul bottone che si è premuto, e
     l'errore resta accanto al modulo che l'ha causato invece di andare in cima
     alla pagina, lontano da dove si sta guardando. */
  const assenze = useAzione()
  const regole = useAzione()
  const preferenze = useAzione()

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

  const etichetta = (c: string) => causali.find((x) => x.codice === c)?.etichetta ?? c

  // Le righe appena comparse si illuminano un istante: in un elenco lungo dice
  // quale è nata adesso senza dover rileggere le date.
  const assenzeNuove = useNuovi((dati?.assenze ?? []).map((a) => a.id))
  const regoleNuove = useNuovi((dati?.regole ?? []).map((r) => r.id))

  return (
    <Vista titolo="Assenze e preferenze" icona={<I.Assenza size={17} />}
           aiuto="La causale la vedi tu, chi programma e il tuo dirigente. Mai i colleghi.">
      <div className="flex max-w-[860px] flex-col gap-6">

        <section id="dichiara">
          <Pannello titolo="Dichiara un'assenza" icona={<I.Assenza size={18} />}
                    piede="Puoi dichiararla in qualsiasi momento, anche su una giornata già pubblicata: il calendario non cambia da solo, ma chi programma viene avvisato.">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                void assenze.esegui(async () => {
                  await api.post('/assenze', { dataInizio, dataFine, causale })
                  await ricarica()
                })
              }}
              className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]"
            >
              <Campo etichetta="Dal">
                <input type="date" className={inputCls} value={dataInizio} required
                       onChange={(e) => { setDataInizio(e.target.value); if (dataFine < e.target.value) setDataFine(e.target.value) }} />
              </Campo>
              <Campo etichetta="Al">
                <input type="date" className={inputCls} value={dataFine} min={dataInizio} required
                       onChange={(e) => setDataFine(e.target.value)} />
              </Campo>
              <Campo etichetta="Causale">
                <select className={inputCls} value={causale} onChange={(e) => setCausale(e.target.value)}>
                  {causali.map((c) => <option key={c.id} value={c.codice}>{c.etichetta}</option>)}
                </select>
              </Campo>
              <Bottone type="submit" variante="primario" stato={assenze.stato}>Dichiara</Bottone>
            </form>

            {assenze.errore && <Messaggio tono="errore">{assenze.errore}</Messaggio>}

            {!dati ? <Scheletro righe={2} />
              : dati.assenze.length === 0 ? <p className="text-base text-ink-faint">Nessuna assenza dichiarata.</p>
              : (
                <ul className="divide-y divide-border overflow-hidden rounded-r2 border border-border bg-bg">
                  {dati.assenze.map((a) => (
                    <li key={a.id}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-base
                                    ${assenzeNuove.has(a.id) ? 'entra appena' : ''}`}>
                      <span className="mono">
                        {a.dataInizio}{a.dataFine !== a.dataInizio && ` → ${a.dataFine}`}
                        <span className="ml-2 font-sans text-sm text-ink-muted">{etichetta(a.causale)}</span>
                        {/* Non l'hai scritta tu: lo si dice, e la puoi togliere come le altre. */}
                        {a.registrataDa != null && <span className="ml-2"><Tag>registrata dall'organizzazione</Tag></span>}
                      </span>
                      <Bottone variante="piccolo" stato={assenze.statoDi(a.id)}
                               onClick={() => void assenze.esegui(async () => {
                                 await api.del(`/assenze/${a.id}`); await ricarica()
                               }, a.id)}>Revoca</Bottone>
                    </li>
                  ))}
                </ul>
              )}
          </Pannello>
        </section>

        <section id="ricorrenti">
          <Pannello titolo="Indisponibilità ricorrenti" icona={<I.Calendario size={18} />}>
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                void regole.esegui(async () => {
                  await api.post('/assenze/regole', {
                    giornoSettimana: giornoRegola, causale: causaleRegola, validoDa: oggi(), validoA: null,
                  })
                  await ricarica()
                })
              }}
              className="grid items-end gap-3 sm:grid-cols-[1fr_1.4fr_auto]"
            >
              <Campo etichetta="Ogni">
                <select className={inputCls} value={giornoRegola} onChange={(e) => setGiornoRegola(Number(e.target.value))}>
                  {GIORNI.map(([n, t]) => <option key={n} value={n}>{t}</option>)}
                </select>
              </Campo>
              <Campo etichetta="Causale">
                <select className={inputCls} value={causaleRegola} onChange={(e) => setCausaleRegola(e.target.value)}>
                  {causali.map((c) => <option key={c.id} value={c.codice}>{c.etichetta}</option>)}
                </select>
              </Campo>
              <Bottone type="submit" stato={regole.stato}>Aggiungi</Bottone>
            </form>

            {regole.errore && <Messaggio tono="errore">{regole.errore}</Messaggio>}

            {dati && dati.regole.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-r2 border border-border bg-bg">
                {dati.regole.map((r) => (
                  <li key={r.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2 text-base
                                  ${regoleNuove.has(r.id) ? 'entra appena' : ''}`}>
                    <span>Ogni {GIORNI.find(([n]) => n === r.giornoSettimana)?.[1]}
                      <span className="ml-2 text-sm text-ink-muted">{etichetta(r.causale)}</span>
                      <span className="mono ml-2 text-sm text-ink-faint">dal {r.validoDa}</span>
                    </span>
                    <Bottone variante="piccolo" stato={regole.statoDi(r.id)}
                             onClick={() => void regole.esegui(async () => {
                               await api.del(`/assenze/regole/${r.id}`); await ricarica()
                             }, r.id)}>Rimuovi</Bottone>
                  </li>
                ))}
              </ul>
            )}
          </Pannello>
        </section>

        <section id="preferenze">
          <Pannello titolo="Preferenze" icona={<I.Persona size={18} />}
                    piede="Non vincolano la programmazione: la generazione le premia quando può.">
            {pref && (
              <form onSubmit={(e: FormEvent<HTMLFormElement>) => {
                      e.preventDefault()
                      void preferenze.esegui(async () => {
                        // Anche la sessione: Turni e Mio leggono lì da dove partire.
                        await api.put('/assenze/preferenze', pref); await ricarica(); await ricaricaSessione()
                      })
                    }}
                    className="flex flex-col gap-4">
                {(['giorniPreferiti', 'giorniDaEvitare'] as const).map((campo) => (
                  <fieldset key={campo}>
                    <legend className="mb-1.5 text-xs font-medium text-ink-muted">
                      {campo === 'giorniPreferiti' ? 'Giorni preferiti in sede' : 'Giorni da evitare'}
                    </legend>
                    <div className="flex flex-wrap gap-3">
                      {GIORNI.map(([n, t]) => (
                        <label key={n} className="flex cursor-pointer items-center gap-1.5 text-base">
                          <input type="checkbox" checked={(pref[campo] ?? []).includes(n)}
                                 onChange={(e) => setPref({
                                   ...pref,
                                   [campo]: e.target.checked
                                     ? [...(pref[campo] ?? []), n]
                                     : (pref[campo] ?? []).filter((x) => x !== n),
                                 })} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <fieldset>
                  <legend className="mb-1.5 text-xs font-medium text-ink-muted">Turni si apre su</legend>
                  <div className="flex flex-wrap gap-3">
                    {([['giorni', 'Giorni'], ['griglia', 'Griglia']] as const).map(([v, t]) => (
                      <label key={v} className="flex cursor-pointer items-center gap-1.5 text-base">
                        <input type="radio" name="vistaTurni" checked={pref.vistaTurni === v}
                               onChange={() => setPref({ ...pref, vistaTurni: v })} />
                        {t}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-1.5 text-xs font-medium text-ink-muted">In Mio, all'apertura mostra</legend>
                  <div className="flex flex-wrap gap-3">
                    {(Object.keys(STATI) as Stato[]).map((s) => {
                      const on = pref.filtriMio.includes(s)
                      return (
                        <label key={s} className="flex cursor-pointer items-center gap-1.5 text-base">
                          {/* Almeno una: una lista vuota all'apertura sembra un guasto. */}
                          <input type="checkbox" checked={on} disabled={on && pref.filtriMio.length === 1}
                                 onChange={(e) => setPref({
                                   ...pref,
                                   filtriMio: e.target.checked
                                     ? [...pref.filtriMio, s] : pref.filtriMio.filter((x) => x !== s),
                                 })} />
                          {STATI[s].plurale}
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
                <label className="flex cursor-pointer items-start gap-2 text-base">
                  <input type="checkbox" className="mt-1" checked={pref.promemoriaSera}
                         onChange={(e) => setPref({ ...pref, promemoriaSera: e.target.checked })} />
                  <span>
                    Promemoria la sera prima
                    <span className="block text-sm text-ink-faint">
                      Alle 18 del giorno prima di una giornata in sede, con stanza e scrivania.
                      {/* Il promemoria arriva comunque nella campanella: il push è un di più. */}
                      {typeof Notification !== 'undefined' && Notification.permission !== 'granted'
                        && ' Su questo dispositivo le notifiche push non sono attive: lo troverai nella campanella.'}
                    </span>
                  </span>
                </label>
                <Campo etichetta="Nota per chi programma">
                  <textarea className={`${inputCls} min-h-[56px] resize-y`} rows={2} value={pref.nota ?? ''}
                            onChange={(e) => setPref({ ...pref, nota: e.target.value })} />
                </Campo>
                <Bottone type="submit" variante="primario" stato={preferenze.stato}
                         className="self-start">Salva</Bottone>
                {preferenze.errore && <Messaggio tono="errore">{preferenze.errore}</Messaggio>}
              </form>
            )}
          </Pannello>
        </section>
      </div>
    </Vista>
  )
}
