import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ErroreApi, type Unita } from '../api'
import { Avviso, Bottone, Campo, classiInput, Etichetta, Riquadro, Vuoto } from '../componenti'

type UtenteRiga = {
  id: number; email: string; nome: string; cognome: string
  ruolo: 'admin' | 'dirigente' | 'dipendente'; unitId: number | null; attivo: boolean
}
type Causale = { id: number; codice: string; etichetta: string; attiva: boolean }
type Festivita = { id: number; data: string; descrizione: string; unitId: number | null }

export default function Amministrazione() {
  const [unita, setUnita] = useState<Unita[]>([])
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
    catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita') }
  }

  const nomeUnita = (id: number | null) => unita.find((u) => u.id === id)?.sigla ?? unita.find((u) => u.id === id)?.nome ?? '—'
  const annoCorrente = new Date().getFullYear()

  return (
    <>
      <div className="mb-5">
        <Avviso>
          L'amministratore di sistema gestisce unità radice, utenze e cataloghi. Non ha
          accesso a programmazioni, calendari individuali o causali di assenza.
        </Avviso>
      </div>
      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}
      {provvisoria && (
        <div className="mb-4">
          <Avviso tipo="attenzione">
            Password provvisoria generata: <code className="rounded-sm bg-white px-1.5 py-0.5 font-mono">{provvisoria}</code>.
            Comunicala di persona: l'applicazione non invia messaggi di posta. Va cambiata al primo accesso.
            <button onClick={() => setProvvisoria(null)} className="ml-3 underline">Ho preso nota</button>
          </Avviso>
        </div>
      )}

      <Riquadro titolo="Unità radice" descrizione="Unità e dirigente nascono insieme: un'unità senza chi la comanda non esiste.">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget as HTMLFormElement)
            const form = e.currentTarget as HTMLFormElement
            void prova(async () => {
              const r = await api.post<{ passwordProvvisoria: string }>('/admin/unita', {
                nome: f.get('nome'), sigla: f.get('sigla') || undefined,
                dirigente: { nome: f.get('dnome'), cognome: f.get('dcognome'), email: f.get('demail') },
              })
              setProvvisoria(r.passwordProvvisoria)
              form.reset()
            })
          }}
          className="mb-4 grid gap-3 rounded-sm border border-filo bg-white p-4 sm:grid-cols-5"
        >
          <Campo etichetta="Nome dell'unità"><input name="nome" className={classiInput} required /></Campo>
          <Campo etichetta="Sigla"><input name="sigla" className={classiInput} /></Campo>
          <Campo etichetta="Nome del dirigente"><input name="dnome" className={classiInput} required /></Campo>
          <Campo etichetta="Cognome"><input name="dcognome" className={classiInput} required /></Campo>
          <Campo etichetta="Posta"><input name="demail" type="email" className={classiInput} required /></Campo>
          <div className="sm:col-span-5"><Bottone type="submit" variante="primario">Crea unità e dirigente</Bottone></div>
        </form>

        <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
          {unita.map((u) => (
            <li key={u.id} className="px-4 py-2 text-[13px]">
              {u.nome} <span className="text-tenue">{u.sigla}</span>
              {u.parentId && <span className="ml-2 text-[11px] text-tenue">figlia di {nomeUnita(u.parentId)}</span>}
            </li>
          ))}
        </ul>
      </Riquadro>

      <Riquadro titolo="Utenti" descrizione="Censimento delle persone e reimpostazione delle credenziali.">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget as HTMLFormElement)
            const form = e.currentTarget as HTMLFormElement
            void prova(async () => {
              const r = await api.post<{ passwordProvvisoria: string }>('/admin/utenti', {
                nome: f.get('nome'), cognome: f.get('cognome'), email: f.get('email'),
                ruolo: f.get('ruolo'), unitId: Number(f.get('unitId')),
              })
              setProvvisoria(r.passwordProvvisoria)
              form.reset()
            })
          }}
          className="mb-4 grid gap-3 rounded-sm border border-filo bg-white p-4 sm:grid-cols-5"
        >
          <Campo etichetta="Nome"><input name="nome" className={classiInput} required /></Campo>
          <Campo etichetta="Cognome"><input name="cognome" className={classiInput} required /></Campo>
          <Campo etichetta="Posta"><input name="email" type="email" className={classiInput} required /></Campo>
          <Campo etichetta="Ruolo">
            <select name="ruolo" className={classiInput}>
              <option value="dipendente">Dipendente</option>
              <option value="dirigente">Dirigente</option>
            </select>
          </Campo>
          <Campo etichetta="Unità">
            <select name="unitId" className={classiInput} required defaultValue="">
              <option value="" disabled>Scegli</option>
              {unita.map((u) => <option key={u.id} value={u.id}>{u.sigla ?? u.nome}</option>)}
            </select>
          </Campo>
          <div className="sm:col-span-5"><Bottone type="submit">Censisci</Bottone></div>
        </form>

        <div className="overflow-x-auto rounded-sm border border-filo bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-filo text-left text-xs text-grigio">
                <th scope="col" className="px-4 py-2 font-medium">Persona</th>
                <th scope="col" className="px-4 py-2 font-medium">Posta</th>
                <th scope="col" className="px-4 py-2 font-medium">Ruolo</th>
                <th scope="col" className="px-4 py-2 font-medium">Unità</th>
                <th scope="col" className="px-4 py-2 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {utenti.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-1.5">{u.cognome} <span className="text-grigio">{u.nome}</span></td>
                  <td className="px-4 py-1.5 text-grigio">{u.email}</td>
                  <td className="px-4 py-1.5"><Etichetta tono={u.ruolo === 'admin' ? 'avviso' : 'neutro'}>{u.ruolo}</Etichetta></td>
                  <td className="px-4 py-1.5 text-grigio">{nomeUnita(u.unitId)}</td>
                  <td className="px-4 py-1.5">
                    <div className="flex gap-2">
                      <Bottone onClick={() => void prova(async () => {
                        const r = await api.post<{ passwordProvvisoria: string }>(`/admin/utenti/${u.id}/reset-password`)
                        setProvvisoria(r.passwordProvvisoria)
                      })}>Reset password</Bottone>
                      <Bottone variante={u.attivo ? 'pericolo' : 'normale'}
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
      </Riquadro>

      <Riquadro titolo="Causali di assenza" descrizione="Elenco chiuso. Nessun testo libero è ammesso al momento della dichiarazione.">
        <ul className="grid gap-2 rounded-sm border border-filo bg-white p-4 sm:grid-cols-3">
          {causali.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className={c.attiva ? '' : 'text-tenue line-through'}>{c.etichetta}</span>
              <button onClick={() => void prova(() => api.patch(`/admin/causali/${c.id}`, { attiva: !c.attiva }))}
                      className="text-[11px] text-az hover:underline">{c.attiva ? 'disattiva' : 'attiva'}</button>
            </li>
          ))}
        </ul>
      </Riquadro>

      <Riquadro
        titolo="Giornate non lavorative"
        descrizione="Le festività nazionali si precaricano per anno. Chiusure d'ufficio e patrono si aggiungono a mano."
        azioni={
          <Bottone onClick={() => void prova(() => api.post(`/admin/festivita/nazionali/${annoCorrente + 1}`))}>
            Precarica {annoCorrente + 1}
          </Bottone>
        }
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget as HTMLFormElement)
            const form = e.currentTarget as HTMLFormElement
            void prova(async () => {
              await api.post('/admin/festivita', {
                data: f.get('data'), descrizione: f.get('descrizione'),
                unitId: f.get('unitId') ? Number(f.get('unitId')) : null,
              })
              form.reset()
            })
          }}
          className="mb-4 grid gap-3 rounded-sm border border-filo bg-white p-4 sm:grid-cols-4"
        >
          <Campo etichetta="Data"><input name="data" type="date" className={classiInput} required /></Campo>
          <Campo etichetta="Descrizione"><input name="descrizione" className={classiInput} required placeholder="Patrono" /></Campo>
          <Campo etichetta="Solo per l'unità">
            <select name="unitId" className={classiInput} defaultValue="">
              <option value="">Tutte le unità</option>
              {unita.filter((u) => u.parentId == null).map((u) => <option key={u.id} value={u.id}>{u.sigla ?? u.nome}</option>)}
            </select>
          </Campo>
          <div className="flex items-end"><Bottone type="submit">Aggiungi</Bottone></div>
        </form>

        {festivita.length === 0 ? <Vuoto>Nessuna festività caricata.</Vuoto> : (
          <ul className="grid gap-1 rounded-sm border border-filo bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
            {festivita.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span>{f.data} <span className="text-grigio">{f.descrizione}</span></span>
                <button onClick={() => void prova(() => api.del(`/admin/festivita/${f.id}`))}
                        className="text-[11px] text-red-600 hover:underline">rimuovi</button>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>
    </>
  )
}
