import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api, ErroreApi, type Persona, type Settore, type StanzaVista, type Unita } from '../api'
import { Avviso, Bottone, Campo, classiInput, Etichetta, Riquadro, Vuoto } from '../componenti'
import { useSessione } from '../sessione'

type Delegato = { userId: number; nome: string; cognome: string }
type DettaglioUnita = Unita & { figlie: Unita[]; dirigente: { id: number; nome: string; cognome: string } | null; radiceId: number }

export default function Organizzazione() {
  const { utente } = useSessione()
  const unitId = utente?.unitId ?? null

  const [unita, setUnita] = useState<DettaglioUnita | null>(null)
  const [persone, setPersone] = useState<Persona[]>([])
  const [settori, setSettori] = useState<Settore[]>([])
  const [delegati, setDelegati] = useState<Delegato[]>([])
  const [stanze, setStanze] = useState<StanzaVista[]>([])
  const [errore, setErrore] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    if (unitId == null) return
    const [u, p, s, o, st] = await Promise.all([
      api.get<DettaglioUnita>(`/org/unita/${unitId}`),
      api.get<Persona[]>(`/org/unita/${unitId}/persone`),
      api.get<Settore[]>(`/org/unita/${unitId}/settori`),
      api.get<Delegato[]>(`/org/unita/${unitId}/organizzatori`),
      api.get<StanzaVista[]>(`/org/unita/${unitId}/stanze`),
    ])
    setUnita(u); setPersone(p); setSettori(s); setDelegati(o); setStanze(st)
  }, [unitId])

  useEffect(() => { void ricarica().catch((e) => setErrore(String(e.message))) }, [ricarica])

  async function prova(fn: () => Promise<unknown>) {
    setErrore(null)
    try { await fn(); await ricarica() }
    catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita') }
  }

  if (unitId == null || !unita) return <Vuoto>Caricamento…</Vuoto>
  const proprietariaStanze = unita.radiceId === unita.id

  return (
    <>
      {errore && <div className="mb-4"><Avviso tipo="errore">{errore}</Avviso></div>}

      <Riquadro titolo={unita.nome} descrizione={`${unita.sigla ?? ''} · ${persone.length} persone programmate · ${unita.figlie.length} unità figlie`}>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget as HTMLFormElement)
            const leggi = (k: string) => { const v = f.get(k) as string; return v === '' ? null : Number(v) }
            void prova(() => api.patch(`/org/unita/${unitId}/limiti`, {
              smartMinSettimana: leggi('min'), smartMaxSettimana: leggi('max'),
            }))
          }}
          className="grid gap-3 rounded-sm border border-filo bg-white p-4 sm:grid-cols-3"
        >
          <Campo etichetta="Minimo di giornate in agile a settimana" aiuto="Vuoto = nessun limite">
            <input name="min" type="number" min={0} max={5} className={classiInput} defaultValue={unita.smartMinSettimana ?? ''} />
          </Campo>
          <Campo etichetta="Massimo di giornate in agile a settimana" aiuto="Vuoto = nessun limite">
            <input name="max" type="number" min={0} max={5} className={classiInput} defaultValue={unita.smartMaxSettimana ?? ''} />
          </Campo>
          <div className="flex items-end"><Bottone type="submit" variante="primario">Salva i limiti</Bottone></div>
        </form>
      </Riquadro>

      <Riquadro
        titolo="Settori"
        descrizione="Un settore raggruppa le righe della griglia e può richiedere almeno una presenza al giorno."
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget as HTMLFormElement)
            void prova(() => api.post(`/org/unita/${unitId}/settori`, {
              nome: f.get('nome'), richiedePresidio: f.get('presidio') === 'on', ordine: settori.length,
            }))
            ;(e.currentTarget as HTMLFormElement).reset()
          }}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-filo bg-white p-4"
        >
          <div className="min-w-[220px] flex-1"><Campo etichetta="Nuovo settore"><input name="nome" className={classiInput} required /></Campo></div>
          <label className="flex items-center gap-2 pb-1.5 text-[13px]"><input type="checkbox" name="presidio" /> Richiede presidio</label>
          <Bottone type="submit">Aggiungi</Bottone>
        </form>

        {settori.length === 0 ? <Vuoto>Nessun settore.</Vuoto> : (
          <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
            {settori.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-[13px]">
                  {s.nome}
                  <span className="ml-2 text-tenue">{persone.filter((p) => p.sectorId === s.id).length} persone</span>
                </span>
                <div className="flex items-center gap-2">
                  {s.richiedePresidio && <Etichetta tono="attesa">presidio</Etichetta>}
                  <Bottone onClick={() => void prova(() => api.patch(`/org/settori/${s.id}`, { richiedePresidio: !s.richiedePresidio }))}>
                    {s.richiedePresidio ? 'Togli presidio' : 'Imponi presidio'}
                  </Bottone>
                  <Bottone variante="pericolo" onClick={() => void prova(() => api.del(`/org/settori/${s.id}`))}>Elimina</Bottone>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <Riquadro titolo="Persone e settori" descrizione="Chi non ha settore è programmabile ma non copre alcun presidio.">
        <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
          {persone.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
              <span className="text-[13px]">
                {p.cognome} <span className="text-grigio">{p.nome}</span>
                {p.ruolo === 'dirigente' && <span className="ml-2 text-[11px] text-tenue">dirigente di unità figlia</span>}
              </span>
              {p.ruolo === 'dipendente' && (
                <select
                  className={`${classiInput} max-w-[240px]`}
                  aria-label={`Settore di ${p.cognome} ${p.nome}`}
                  value={p.sectorId ?? ''}
                  onChange={(e) => void prova(() => api.post(`/org/unita/${unitId}/assegna-settore`, {
                    userId: p.id, sectorId: e.target.value ? Number(e.target.value) : null,
                  }))}
                >
                  <option value="">Senza settore</option>
                  {settori.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              )}
            </li>
          ))}
        </ul>
      </Riquadro>

      <Riquadro titolo="Organizzatori" descrizione="Programmi comunque tu di diritto: la delega serve ad affiancarti.">
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-sm border border-filo bg-white p-4">
          <div className="min-w-[240px] flex-1">
            <Campo etichetta="Delega un dipendente">
              <select id="nuovoDelegato" className={classiInput} defaultValue="">
                <option value="" disabled>Scegli una persona</option>
                {persone.filter((p) => p.ruolo === 'dipendente' && !delegati.some((d) => d.userId === p.id))
                  .map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>)}
              </select>
            </Campo>
          </div>
          <Bottone onClick={() => {
            const el = document.getElementById('nuovoDelegato') as HTMLSelectElement | null
            if (el?.value) void prova(() => api.post(`/org/unita/${unitId}/organizzatori`, { userId: Number(el.value) }))
          }}>Nomina</Bottone>
        </div>

        {delegati.length === 0 ? <Vuoto>Nessun organizzatore delegato.</Vuoto> : (
          <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
            {delegati.map((d) => (
              <li key={d.userId} className="flex items-center justify-between px-4 py-2 text-[13px]">
                <span>{d.cognome} <span className="text-grigio">{d.nome}</span></span>
                <Bottone variante="pericolo" onClick={() => void prova(() => api.del(`/org/unita/${unitId}/organizzatori/${d.userId}`))}>
                  Revoca
                </Bottone>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <Riquadro
        titolo="Stanze e scrivanie"
        descrizione={proprietariaStanze
          ? 'La capienza di una stanza è il numero di scrivanie attive.'
          : 'Le stanze appartengono all\'unità radice: le gestisce il suo dirigente.'}
      >
        {proprietariaStanze && (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget as HTMLFormElement)
              void prova(() => api.post('/org/stanze', {
                unitId, etichetta: f.get('etichetta'), piano: f.get('piano') || undefined,
                scrivanie: Number(f.get('scrivanie')),
              }))
              ;(e.currentTarget as HTMLFormElement).reset()
            }}
            className="mb-4 grid gap-3 rounded-sm border border-filo bg-white p-4 sm:grid-cols-4"
          >
            <Campo etichetta="Etichetta"><input name="etichetta" className={classiInput} required placeholder="101" /></Campo>
            <Campo etichetta="Piano"><input name="piano" className={classiInput} placeholder="Primo piano" /></Campo>
            <Campo etichetta="Scrivanie"><input name="scrivanie" type="number" min={1} max={200} defaultValue={4} className={classiInput} required /></Campo>
            <div className="flex items-end"><Bottone type="submit" variante="primario">Crea la stanza</Bottone></div>
          </form>
        )}

        {stanze.length === 0 ? <Vuoto>Nessuna stanza.</Vuoto> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {stanze.map((s) => (
              <li key={s.id} className="rounded-sm border border-filo bg-white p-4">
                <p className="text-[13px] font-medium">{s.etichetta}</p>
                <p className="text-[11px] text-tenue">{s.piano ?? 'piano non indicato'} · capienza {s.capienza}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {s.scrivanie.map((d) => (
                    <li key={d.id}>
                      <button
                        onClick={() => proprietariaStanze && void prova(() => api.patch(`/org/scrivanie/${d.id}`, { attiva: !d.attiva }))}
                        aria-label={`Scrivania ${d.numero}, ${d.attiva ? 'attiva' : 'disattivata'}`}
                        className={`rounded-sm border px-2 py-1 text-[11px] ${d.attiva ? 'border-az/40 bg-blue-50 text-az-scuro' : 'border-filo bg-slate-50 text-tenue line-through'}`}
                      >
                        {d.numero}
                      </button>
                    </li>
                  ))}
                  {proprietariaStanze && (
                    <li>
                      <Bottone onClick={() => void prova(() => api.post(`/org/stanze/${s.id}/scrivanie`, {
                        numero: String(s.scrivanie.length + 1),
                      }))}>+ scrivania</Bottone>
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Riquadro>

      <Riquadro titolo="Unità figlie" descrizione="Il dirigente di un'unità figlia è programmato in questa unità, al posto della sua.">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget as HTMLFormElement)
            void prova(() => api.post('/org/unita', {
              parentId: unitId, nome: f.get('nome'), sigla: f.get('sigla') || undefined,
              dirigenteUserId: Number(f.get('dirigente')),
            }))
          }}
          className="mb-4 grid gap-3 rounded-sm border border-filo bg-white p-4 sm:grid-cols-4"
        >
          <Campo etichetta="Nome"><input name="nome" className={classiInput} required /></Campo>
          <Campo etichetta="Sigla"><input name="sigla" className={classiInput} /></Campo>
          <Campo etichetta="Chi la comanda" aiuto="Diventa dirigente e passa nella nuova unità">
            <select name="dirigente" className={classiInput} required defaultValue="">
              <option value="" disabled>Scegli</option>
              {persone.filter((p) => p.ruolo === 'dipendente').map((p) => (
                <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>
              ))}
            </select>
          </Campo>
          <div className="flex items-end"><Bottone type="submit">Crea l'unità</Bottone></div>
        </form>

        {unita.figlie.length === 0 ? <Vuoto>Nessuna unità figlia.</Vuoto> : (
          <ul className="divide-y divide-filo rounded-sm border border-filo bg-white">
            {unita.figlie.map((f) => (
              <li key={f.id} className="px-4 py-2 text-[13px]">{f.nome} <span className="text-tenue">{f.sigla}</span></li>
            ))}
          </ul>
        )}
      </Riquadro>
    </>
  )
}
