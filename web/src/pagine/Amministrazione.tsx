import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ErroreApi, type Unita } from '../api'
import * as I from '../icone'
import { Badge, Bottone, Campo, inputCls, Messaggio, Pannello, Scheletro } from '../ui'
import { Vista } from '../Vista'

type UtenteRiga = {
  id: number; email: string; nome: string; cognome: string
  ruolo: 'admin' | 'dirigente' | 'dipendente'; unitId: number | null; attivo: boolean
}
type Causale = { id: number; codice: string; etichetta: string; attiva: boolean }
type Festivita = { id: number; data: string; descrizione: string; unitId: number | null }

export default function Amministrazione() {
  const [unita, setUnita] = useState<Unita[] | null>(null)
  const [utenti, setUtenti] = useState<UtenteRiga[]>([])
  const [causali, setCausali] = useState<Causale[]>([])
  const [festivita, setFestivita] = useState<Festivita[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [provvisoria, setProvvisoria] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    const [u, us, c, f] = await Promise.all([
      api.get<Unita[]>('/admin/unita'), api.get<UtenteRiga[]>('/admin/utenti'),
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

  const nomeUnita = (id: number | null) => {
    const u = (unita ?? []).find((x) => x.id === id)
    return u ? u.sigla ?? u.nome : '—'
  }
  const anno = new Date().getFullYear()

  if (!unita) return <Vista titolo="Sistema" icona={<I.Amministrazione size={17} />} caricando><Scheletro righe={5} /></Vista>

  return (
    <Vista
      titolo="Sistema" icona={<I.Amministrazione size={17} />}
      aiuto="Unità radice, utenze e cataloghi"
      meta={<><span className="mono">{unita.length} unità</span><span aria-hidden="true">·</span><span className="mono">{utenti.length} utenti</span></>}
    >
      <div className="flex max-w-[1100px] flex-col gap-6">
        <Messaggio>
          L'amministratore di sistema gestisce contenitori e credenziali. Non ha accesso a
          programmazioni, calendari individuali o causali di assenza.
        </Messaggio>
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}
        {provvisoria && (
          <Messaggio tono="attenzione">
            Password provvisoria: <code className="mono rounded-r1 bg-surface-2 px-1.5 py-0.5">{provvisoria}</code>.
            Comunicala di persona — Turni non manda messaggi di posta. Va cambiata al primo accesso.
            <button onClick={() => setProvvisoria(null)} className="ml-3 cursor-pointer underline">Ho preso nota</button>
          </Messaggio>
        )}

        <section id="unita">
          <Pannello titolo="Unità radice" icona={<I.Organizzazione size={18} />}
                    piede="Unità e dirigente nascono insieme: un'unità senza chi la comanda non esiste.">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                void prova(async () => {
                  const r = await api.post<{ passwordProvvisoria: string }>('/admin/unita', {
                    nome: f.get('nome'), sigla: f.get('sigla') || undefined,
                    dirigente: { nome: f.get('dnome'), cognome: f.get('dcognome'), email: f.get('demail') },
                  })
                  setProvvisoria(r.passwordProvvisoria); form.reset()
                })
              }}
              className="grid gap-3 sm:grid-cols-5"
            >
              <Campo etichetta="Nome dell'unità"><input name="nome" className={inputCls} required /></Campo>
              <Campo etichetta="Sigla"><input name="sigla" className={inputCls} /></Campo>
              <Campo etichetta="Nome del dirigente"><input name="dnome" className={inputCls} required /></Campo>
              <Campo etichetta="Cognome"><input name="dcognome" className={inputCls} required /></Campo>
              <Campo etichetta="Posta"><input name="demail" type="email" className={inputCls} required /></Campo>
              <div className="sm:col-span-5"><Bottone type="submit" variante="primario">Crea unità e dirigente</Bottone></div>
            </form>

            <ul className="divide-y divide-border overflow-hidden rounded-r2 border border-border bg-bg">
              {unita.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-base">
                  <span>{u.nome} {u.sigla && <span className="mono ml-1 text-sm text-ink-faint">{u.sigla}</span>}</span>
                  {u.parentId && <span className="text-sm text-ink-faint">figlia di {nomeUnita(u.parentId)}</span>}
                </li>
              ))}
            </ul>
          </Pannello>
        </section>

        <section id="utenti">
          <Pannello titolo="Utenti" icona={<I.Persona size={18} />}>
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                void prova(async () => {
                  const r = await api.post<{ passwordProvvisoria: string }>('/admin/utenti', {
                    nome: f.get('nome'), cognome: f.get('cognome'), email: f.get('email'),
                    ruolo: f.get('ruolo'), unitId: Number(f.get('unitId')),
                  })
                  setProvvisoria(r.passwordProvvisoria); form.reset()
                })
              }}
              className="grid gap-3 sm:grid-cols-5"
            >
              <Campo etichetta="Nome"><input name="nome" className={inputCls} required /></Campo>
              <Campo etichetta="Cognome"><input name="cognome" className={inputCls} required /></Campo>
              <Campo etichetta="Posta"><input name="email" type="email" className={inputCls} required /></Campo>
              <Campo etichetta="Ruolo">
                <select name="ruolo" className={inputCls}>
                  <option value="dipendente">Dipendente</option>
                  <option value="dirigente">Dirigente</option>
                </select>
              </Campo>
              <Campo etichetta="Unità">
                <select name="unitId" className={inputCls} required defaultValue="">
                  <option value="" disabled>Scegli</option>
                  {unita.map((u) => <option key={u.id} value={u.id}>{u.sigla ?? u.nome}</option>)}
                </select>
              </Campo>
              <div className="sm:col-span-5"><Bottone type="submit">Censisci</Bottone></div>
            </form>

            <div className="overflow-x-auto rounded-r2 border border-border bg-bg">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    {['Persona', 'Posta', 'Ruolo', 'Unità', 'Azioni'].map((t) => (
                      <th key={t} scope="col"
                          className="border-b border-border bg-surface px-2.5 py-1.5 text-left text-xs font-semibold text-ink-muted">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {utenti.map((u, i) => (
                    <tr key={u.id} className={i % 2 ? 'bg-[color-mix(in_oklch,var(--surface)_50%,var(--bg))]' : ''}>
                      <td className="border-b border-border px-2.5 py-1.5 text-[12.5px]">
                        {u.cognome} <span className="text-ink-muted">{u.nome}</span>
                        {!u.attivo && <span className="ml-2 text-2xs text-ink-faint">disattivato</span>}
                      </td>
                      <td className="mono border-b border-border px-2.5 py-1.5 text-[12.5px] text-ink-muted">{u.email}</td>
                      <td className="border-b border-border px-2.5 py-1.5"><Badge>{u.ruolo}</Badge></td>
                      <td className="border-b border-border px-2.5 py-1.5 text-[12.5px] text-ink-muted">{nomeUnita(u.unitId)}</td>
                      <td className="border-b border-border px-2.5 py-1.5">
                        <div className="flex gap-2">
                          <Bottone variante="piccolo" onClick={() => void prova(async () => {
                            const r = await api.post<{ passwordProvvisoria: string }>(`/admin/utenti/${u.id}/reset-password`)
                            setProvvisoria(r.passwordProvvisoria)
                          })}>Reset password</Bottone>
                          <Bottone variante="piccolo"
                                   onClick={() => void prova(() => api.post(`/admin/utenti/${u.id}/attivo`, { attivo: !u.attivo }))}>
                            {u.attivo ? 'Disattiva' : 'Riattiva'}
                          </Bottone>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Pannello>
        </section>

        <section id="causali">
          <Pannello titolo="Causali di assenza" icona={<I.Assenza size={18} />}
                    piede="Elenco chiuso: al momento della dichiarazione non è ammesso testo libero.">
            <ul className="grid gap-1.5 sm:grid-cols-3">
              {causali.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-r2 border border-border bg-bg px-2.5 py-1.5">
                  <span className={`text-base ${c.attiva ? '' : 'text-ink-faint line-through'}`}>{c.etichetta}</span>
                  <button onClick={() => void prova(() => api.patch(`/admin/causali/${c.id}`, { attiva: !c.attiva }))}
                          className="cursor-pointer text-sm text-ink-faint underline-offset-2 hover:text-ink hover:underline">
                    {c.attiva ? 'disattiva' : 'attiva'}
                  </button>
                </li>
              ))}
            </ul>
          </Pannello>
        </section>

        <section id="festivita">
          <Pannello titolo="Giornate non lavorative" icona={<I.Calendario size={18} />}
                    azioni={<Bottone variante="piccolo" onClick={() => void prova(() => api.post(`/admin/festivita/nazionali/${anno + 1}`))}>
                      Precarica {anno + 1}
                    </Bottone>}
                    piede="Le festività nazionali si precaricano per anno. Chiusure d'ufficio e patrono si aggiungono a mano.">
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
              <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {festivita.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 text-base">
                    <span><span className="mono text-sm">{f.data}</span> <span className="text-ink-muted">{f.descrizione}</span></span>
                    <button onClick={() => void prova(() => api.del(`/admin/festivita/${f.id}`))}
                            className="cursor-pointer text-sm text-ink-faint hover:text-danger-ink">rimuovi</button>
                  </li>
                ))}
              </ul>
            )}
          </Pannello>
        </section>
      </div>
    </Vista>
  )
}
