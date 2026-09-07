import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ErroreApi } from '../api'
import * as I from '../icone'
import { Bottone, Campo, Copiabile, inputCls, Messaggio, Pannello, Scheletro } from '../ui'
import { Vista } from '../Vista'
import Dati from './Dati'
import Organigramma, { type UnitaOrg } from './Organigramma'
import Utenti, { type Credenziale, type UtenteRiga } from './Utenti'

type Causale = { id: number; codice: string; etichetta: string; attiva: boolean }
type Festivita = { id: number; data: string; descrizione: string; unitId: number | null }

const GIORNO = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
const inItaliano = (iso: string) => GIORNO.format(new Date(`${iso}T00:00:00`))

/** L'avviso sui limiti del ruolo si legge una volta: chi l'ha capito lo chiude. */
const CHIAVE_AVVISO = 'turni.avviso.admin'
const avvisoDaMostrare = () => {
  try { return localStorage.getItem(CHIAVE_AVVISO) !== 'letto' } catch { return true }
}

export default function Amministrazione() {
  const [unita, setUnita] = useState<UnitaOrg[] | null>(null)
  const [utenti, setUtenti] = useState<UtenteRiga[]>([])
  const [causali, setCausali] = useState<Causale[]>([])
  const [festivita, setFestivita] = useState<Festivita[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [credenziali, setCredenziali] = useState<Credenziale[]>([])
  const [padre, setPadre] = useState<number | null>(null)
  const [avviso, setAvviso] = useState(avvisoDaMostrare)
  const [causaleInModifica, setCausaleInModifica] = useState<number | null>(null)

  const ricarica = useCallback(async () => {
    const [u, us, c, f] = await Promise.all([
      api.get<UnitaOrg[]>('/admin/unita'), api.get<UtenteRiga[]>('/admin/utenti'),
      api.get<Causale[]>('/admin/causali'), api.get<Festivita[]>('/admin/festivita'),
    ])
    setUnita(u); setUtenti(us); setCausali(c); setFestivita(f)
  }, [])

  useEffect(() => { void ricarica().catch((e) => setErrore(String(e.message))) }, [ricarica])

  async function prova(fn: () => Promise<unknown>) {
    setErrore(null)
    try { await fn(); await ricarica() }
    catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita.') }
  }

  function chiudiAvviso() {
    setAvviso(false)
    try { localStorage.setItem(CHIAVE_AVVISO, 'letto') } catch { /* niente memoria, pazienza */ }
  }

  const nomeUnita = (id: number | null) => {
    const u = (unita ?? []).find((x) => x.id === id)
    return u ? u.sigla ?? u.nome : '—'
  }
  const anno = new Date().getFullYear()

  if (!unita) return <Vista titolo="Sistema" icona={<I.Amministrazione size={17} />} caricando><Scheletro righe={5} /></Vista>

  return (
    <Vista
      titolo="Sistema" icona={<I.Amministrazione size={17} />}
      aiuto="Organigramma, utenze e cataloghi"
      meta={<><span className="mono">{unita.length} unità</span><span aria-hidden="true">·</span><span className="mono">{utenti.length} utenti</span></>}
    >
      <div className="flex max-w-[1280px] flex-col gap-6">
        {avviso && (
          <Messaggio>
            <div className="flex items-start justify-between gap-3">
              <span>
                L'amministratore di sistema gestisce contenitori e credenziali. Non ha accesso a
                programmazioni, calendari individuali o causali di assenza.
              </span>
              <Bottone variante="icona" onClick={chiudiAvviso} aria-label="Nascondi l'avviso" title="Ho capito">
                <I.Chiudi size={15} />
              </Bottone>
            </div>
          </Messaggio>
        )}
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}
        {credenziali.length > 0 && (
          <Messaggio tono="attenzione">
            <p>
              {credenziali.length === 1 ? 'Password provvisoria' : `${credenziali.length} password provvisorie`}.
              Comunicale di persona — Turni non manda messaggi di posta. Vanno cambiate al primo accesso,
              e da qui non si rileggono più.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {credenziali.map((c, i) => (
                // Due persone possono chiamarsi uguale: la chiave è la posizione.
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[14ch] text-ink">{c.chi}</span>
                  <Copiabile testo={c.password} etichetta="Copia la password" />
                </li>
              ))}
            </ul>
            <button onClick={() => setCredenziali([])} className="mt-2 cursor-pointer underline">Ho preso nota</button>
          </Messaggio>
        )}

        <section id="unita">
          <Pannello titolo="Organigramma" icona={<I.Organizzazione size={18} />}
                    piede="Unità e dirigente nascono insieme: un'unità senza chi la comanda non esiste.">
            <Organigramma
              unita={unita}
              azioni={{
                onSposta: (id, parentId) => void prova(() => api.patch(`/admin/unita/${id}`, { parentId })),
                onRinomina: (id, dati) => void prova(() => api.patch(`/admin/unita/${id}`, dati)),
                onElimina: (u) => {
                  if (confirm(`Eliminare l'unità «${u.nome}»? Si può solo se non contiene più niente.`)) {
                    void prova(() => api.del(`/admin/unita/${u.id}`))
                  }
                },
                onNuovaFiglia: (parentId) => {
                  setPadre(parentId)
                  document.getElementById('nuova-unita')?.focus()
                },
              }}
            />

            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                void prova(async () => {
                  const r = await api.post<{ passwordProvvisoria: string }>('/admin/unita', {
                    nome: f.get('nome'), sigla: f.get('sigla') || undefined, parentId: padre,
                    dirigente: { nome: f.get('dnome'), cognome: f.get('dcognome'), email: f.get('demail') },
                  })
                  setCredenziali([{ chi: `${f.get('dcognome')} ${f.get('dnome')}`, password: r.passwordProvvisoria }])
                  form.reset(); setPadre(null)
                })
              }}
              className="grid gap-3 border-t border-border pt-4 sm:grid-cols-6"
            >
              <Campo etichetta="Nome dell'unità"><input id="nuova-unita" name="nome" className={inputCls} required /></Campo>
              <Campo etichetta="Sigla"><input name="sigla" className={inputCls} /></Campo>
              <Campo etichetta="Sotto">
                <select className={inputCls} value={padre ?? ''}
                        onChange={(e) => setPadre(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— livello più alto —</option>
                  {unita.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Campo>
              <Campo etichetta="Nome del dirigente"><input name="dnome" className={inputCls} required /></Campo>
              <Campo etichetta="Cognome" aiuto="Ne restano le prime tre lettere">
                <input name="dcognome" className={inputCls} required />
              </Campo>
              <Campo etichetta="Posta"><input name="demail" type="email" className={inputCls} required /></Campo>
              <div className="sm:col-span-6"><Bottone type="submit" variante="primario">Crea unità e dirigente</Bottone></div>
            </form>
          </Pannello>
        </section>

        <section id="utenti">
          <Utenti utenti={utenti} unita={unita} nomeUnita={nomeUnita} prova={prova} onCredenziali={setCredenziali} />
        </section>

        {/* Due pannelli stretti stanno accanto quando c'è larghezza: sotto,
            tornano in colonna come tutto il resto. */}
        <div className="grid items-start gap-6 xl:grid-cols-2">
        <section id="causali">
          <Pannello titolo="Causali di assenza" icona={<I.Assenza size={18} />}
                    piede="Elenco chiuso: al momento della dichiarazione non è ammesso testo libero.">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                void prova(async () => {
                  await api.post('/admin/causali', { etichetta: f.get('etichetta') })
                  form.reset()
                })
              }}
              className="flex flex-wrap items-end gap-2"
            >
              <Campo etichetta="Nuova causale">
                <input name="etichetta" className={inputCls} required minLength={2} placeholder="Permesso elettorale" />
              </Campo>
              <Bottone type="submit">Aggiungi</Bottone>
            </form>

            <ul className="grid gap-1.5 sm:grid-cols-2">
              {causali.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-r2 border border-border bg-bg px-2.5 py-1.5">
                  {causaleInModifica === c.id ? (
                    <form
                      className="flex w-full items-center gap-2"
                      onSubmit={(e: FormEvent<HTMLFormElement>) => {
                        e.preventDefault()
                        const f = new FormData(e.currentTarget)
                        void prova(async () => {
                          await api.patch(`/admin/causali/${c.id}`, { etichetta: f.get('etichetta') })
                          setCausaleInModifica(null)
                        })
                      }}
                    >
                      <input name="etichetta" defaultValue={c.etichetta} className={inputCls} required minLength={2}
                             aria-label={`Nuovo nome per ${c.etichetta}`} autoFocus />
                      <Bottone type="submit" variante="piccolo">Salva</Bottone>
                      <Bottone variante="piccolo" onClick={() => setCausaleInModifica(null)}>Annulla</Bottone>
                    </form>
                  ) : (
                    <>
                      <span className={`min-w-0 flex-1 truncate text-base ${c.attiva ? '' : 'text-ink-faint line-through'}`}>
                        {c.etichetta}
                      </span>
                      <Bottone variante="icona" onClick={() => setCausaleInModifica(c.id)}
                               aria-label={`Rinomina ${c.etichetta}`} title="Rinomina"><I.Matita size={14} /></Bottone>
                      <button onClick={() => void prova(() => api.patch(`/admin/causali/${c.id}`, { attiva: !c.attiva }))}
                              className="cursor-pointer text-sm text-ink-faint underline-offset-2 hover:text-ink hover:underline">
                        {c.attiva ? 'disattiva' : 'attiva'}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Pannello>
        </section>

        <section id="festivita">
          <Pannello titolo="Giornate non lavorative" icona={<I.Calendario size={18} />}
                    azioni={
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e: FormEvent<HTMLFormElement>) => {
                          e.preventDefault()
                          const a = new FormData(e.currentTarget).get('anno')
                          void prova(() => api.post(`/admin/festivita/nazionali/${a}`))
                        }}
                      >
                        <select name="anno" className={inputCls} defaultValue={anno + 1} aria-label="Anno da precaricare">
                          {[anno, anno + 1, anno + 2].map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <Bottone type="submit" variante="piccolo">Precarica</Bottone>
                      </form>
                    }
                    piede="Le festività nazionali si precaricano per anno, saltando quelle già in archivio. Chiusure d'ufficio e patrono si aggiungono a mano.">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                void prova(async () => {
                  await api.post('/admin/festivita', {
                    data: f.get('data'), descrizione: f.get('descrizione'),
                    unitId: f.get('unitId') ? Number(f.get('unitId')) : null,
                  })
                  form.reset()
                })
              }}
              className="grid items-end gap-3 sm:grid-cols-[1fr_1.4fr_1fr_auto]"
            >
              <Campo etichetta="Data"><input name="data" type="date" className={inputCls} required /></Campo>
              <Campo etichetta="Descrizione"><input name="descrizione" className={inputCls} required placeholder="Patrono" /></Campo>
              <Campo etichetta="Solo per l'unità">
                <select name="unitId" className={inputCls} defaultValue="">
                  <option value="">Tutte</option>
                  {unita.filter((u) => u.parentId == null).map((u) => <option key={u.id} value={u.id}>{u.sigla ?? u.nome}</option>)}
                </select>
              </Campo>
              <Bottone type="submit">Aggiungi</Bottone>
            </form>

            {festivita.length === 0 ? <p className="text-base text-ink-faint">Nessuna festività caricata.</p> : (
              // Un archivio di più anni fa una lista lunghissima: si scorre
              // dentro il suo riquadro invece di allungare la pagina.
              <ul className="max-h-[420px] divide-y divide-border overflow-y-auto rounded-r2 border border-border bg-bg"
                  tabIndex={0} aria-label="Giornate non lavorative in archivio">
                {festivita.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-base">
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      <span className="tabular-nums text-ink-muted">{inItaliano(f.data)}</span>
                      <span>{f.descrizione}</span>
                      {f.unitId && <span className="text-sm text-ink-faint">solo {nomeUnita(f.unitId)}</span>}
                    </span>
                    <button onClick={() => void prova(() => api.del(`/admin/festivita/${f.id}`))}
                            className="shrink-0 cursor-pointer text-sm text-ink-faint hover:text-danger-ink">rimuovi</button>
                  </li>
                ))}
              </ul>
            )}
          </Pannello>
        </section>
        </div>

        <section id="dati">
          <Dati onFatto={ricarica} onCredenziali={setCredenziali} />
        </section>
      </div>
    </Vista>
  )
}
