import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { api, type Persona, type Settore, type StanzaVista, type Unita } from '../api'
import { useAzione, useNuovi } from '../azioni'
import * as I from '../icone'
import { useSessione } from '../sessione'
import { Badge, Bottone, Campo, inputCls, Messaggio, Pannello, Scheletro, Tag } from '../ui'
import { Vista } from '../Vista'

type Delegato = { userId: number; nome: string; cognome: string }
type Dettaglio = Unita & {
  figlie: Unita[]; dirigente: { id: number; nome: string; cognome: string } | null; radiceId: number
}

export default function Organizzazione() {
  const { utente } = useSessione()
  const unitId = utente?.unitId ?? null

  const [unita, setUnita] = useState<Dettaglio | null>(null)
  const [persone, setPersone] = useState<Persona[]>([])
  const [settori, setSettori] = useState<Settore[]>([])
  const [delegati, setDelegati] = useState<Delegato[]>([])
  const [stanze, setStanze] = useState<StanzaVista[]>([])
  const [modifica, setModifica] = useState<number | null>(null)
  const azione = useAzione()
  const { errore, setErrore } = azione

  const ricarica = useCallback(async () => {
    if (unitId == null) return
    const [u, p, s, o, st] = await Promise.all([
      api.get<Dettaglio>(`/org/unita/${unitId}`),
      api.get<Persona[]>(`/org/unita/${unitId}/persone`),
      api.get<Settore[]>(`/org/unita/${unitId}/settori`),
      api.get<Delegato[]>(`/org/unita/${unitId}/organizzatori`),
      api.get<StanzaVista[]>(`/org/unita/${unitId}/stanze`),
    ])
    setUnita(u); setPersone(p); setSettori(s); setDelegati(o); setStanze(st)
  }, [unitId])

  useEffect(() => { void ricarica().catch((e) => setErrore(String(e.message))) }, [ricarica])

  /**
   * Vero se l'operazione è andata: chi apre un editor lo chiude solo allora.
   * La chiave, dove c'è, dice quale bottone deve mostrare l'esito.
   */
  const prova = (fn: () => Promise<unknown>, chiave?: string): Promise<boolean> =>
    azione.esegui(async () => { await fn(); await ricarica() }, chiave)

  // Quello che è appena nato si illumina per un attimo: in una pagina fitta di
  // elenchi dice dov'è finita la cosa che si è appena creata.
  const settoriNuovi = useNuovi(settori.map((s) => s.id))
  const stanzeNuove = useNuovi(stanze.map((s) => s.id))

  // La stanza si riserva a chi è in forza all'unità che la possiede: è la
  // stessa regola che il server fa rispettare, qui solo per non proporre nomi
  // che verrebbero rifiutati.
  const riservabili = persone.filter((p) => p.unitId === unitId)
  const nomeDi = (id: number) => {
    const p = riservabili.find((x) => x.id === id)
    return p ? `${p.cognome} ${p.nome}` : 'una persona non più in forza'
  }

  if (unitId == null || !unita) {
    return <Vista titolo="Struttura" icona={<I.Organizzazione size={17} />} caricando><Scheletro righe={5} /></Vista>
  }
  return (
    <Vista
      titolo={unita.nome} icona={<I.Organizzazione size={17} />}
      aiuto={unita.sigla ?? undefined}
      meta={<>
        <span className="mono">{persone.length} persone</span>
        <span aria-hidden="true">·</span>
        <span className="mono">{unita.figlie.length} unità figlie</span>
      </>}
    >
      <div className="flex max-w-[980px] flex-col gap-6">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}

        <section id="limiti">
          <Pannello titolo="Limiti di lavoro agile" icona={<I.Calendario size={18} />}
                    piede="Vuoto significa nessun limite. Ogni nuovo periodo eredita questi valori e ne conserva una copia.">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                const leggi = (k: string) => { const v = f.get(k) as string; return v === '' ? null : Number(v) }
                void prova(() => api.patch(`/org/unita/${unitId}/limiti`, {
                  smartMinSettimana: leggi('min'), smartMaxSettimana: leggi('max'),
                }), 'limiti')
              }}
              className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Campo etichetta="Minimo di giornate in agile a settimana">
                <input name="min" type="number" min={0} max={5} className={inputCls} defaultValue={unita.smartMinSettimana ?? ''} />
              </Campo>
              <Campo etichetta="Massimo di giornate in agile a settimana">
                <input name="max" type="number" min={0} max={5} className={inputCls} defaultValue={unita.smartMaxSettimana ?? ''} />
              </Campo>
              <Bottone type="submit" variante="primario" stato={azione.statoDi('limiti')}>Salva</Bottone>
            </form>
          </Pannello>
        </section>

        <section id="scambio">
          <Pannello titolo="Scambio dei turni" icona={<I.Scambio size={18} />}
                    piede="Lo scambio non passa da nessuna approvazione: vale l'accordo fra due persone, entro i vincoli di presidio, postazioni e lavoro agile. Le giornate scambiate restano bloccate in griglia.">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                void prova(() => api.patch(`/org/unita/${unitId}/scambio`, {
                  scambioAttivo: f.get('attivo') === 'on',
                  scambioOraLimite: String(f.get('ora') || '10:00'),
                }), 'scambio')
              }}
              className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <label className="flex cursor-pointer items-start gap-2 text-base">
                <input name="attivo" type="checkbox" className="mt-1" defaultChecked={unita.scambioAttivo} />
                <span>Consenti lo scambio fra colleghi
                  <span className="block text-sm text-ink-faint">Attivo salvo diversa scelta.</span>
                </span>
              </label>
              <Campo etichetta="Ultima ora utile per la giornata di oggi"
                     aiuto="Dopo quest'ora la giornata in corso non si tocca più.">
                <input name="ora" type="time" className={inputCls} defaultValue={unita.scambioOraLimite} />
              </Campo>
              <Bottone type="submit" variante="primario" stato={azione.statoDi('scambio')}>Salva</Bottone>
            </form>
          </Pannello>
        </section>

        <section id="settori">
          <Pannello titolo="Settori" icona={<I.Organizzazione size={18} />}
                    piede="Un settore con presidio richiede almeno una presenza in ogni giornata lavorativa.">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                void prova(() => api.post(`/org/unita/${unitId}/settori`, {
                  nome: f.get('nome'), richiedePresidio: f.get('presidio') === 'on', ordine: settori.length,
                }), 'settore')
                form.reset()
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[220px] flex-1"><Campo etichetta="Nuovo settore"><input name="nome" className={inputCls} required /></Campo></div>
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-base">
                <input type="checkbox" name="presidio" /> Richiede presidio
              </label>
              <div className="pb-0.5"><Bottone type="submit" stato={azione.statoDi('settore')}>Aggiungi</Bottone></div>
            </form>

            {settori.length === 0 ? <p className="text-base text-ink-faint">Nessun settore.</p> : (
              <ul className="divide-y divide-border overflow-hidden rounded-r2 border border-border bg-bg">
                {settori.map((s) => {
                  const quante = persone.filter((p) => p.sectorId === s.id).length
                  return (
                    <li key={s.id}
                        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2
                                    ${settoriNuovi.has(s.id) ? 'entra appena' : ''}`}>
                      <span className="text-base">
                        {s.nome}
                        <span className="mono ml-2 text-sm text-ink-faint">{quante}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {s.richiedePresidio && <Badge>presidio</Badge>}
                        <Bottone variante="piccolo" title={`Rinomina ${s.nome}`}
                                 onClick={() => {
                                   const nome = prompt('Nuovo nome del settore', s.nome)?.trim()
                                   if (nome && nome !== s.nome) void prova(() => api.patch(`/org/settori/${s.id}`, { nome }))
                                 }}>
                          <I.Matita size={13} />Rinomina
                        </Bottone>
                        <Bottone variante="piccolo"
                                 onClick={() => void prova(() => api.patch(`/org/settori/${s.id}`, { richiedePresidio: !s.richiedePresidio }))}>
                          {s.richiedePresidio ? 'Togli presidio' : 'Imponi presidio'}
                        </Bottone>
                        <Bottone variante="distruttivo" className="px-2 py-[3px] text-sm"
                                 title={`Elimina ${s.nome}`}
                                 onClick={() => {
                                   // Le persone non si perdono: restano senza settore, e il
                                   // server lo fa da sé. Ma vale la pena dirlo prima.
                                   const avviso = quante
                                     ? `Elimini «${s.nome}»? ${quante} ${quante === 1 ? 'persona resta' : 'persone restano'} senza settore.`
                                     : `Elimini «${s.nome}»?`
                                   if (confirm(avviso)) void prova(() => api.del(`/org/settori/${s.id}`))
                                 }}>
                          <I.Cestino size={13} />Elimina
                        </Bottone>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Pannello>
        </section>

        <section id="persone">
          <Pannello titolo="Persone e settori" icona={<I.Persona size={18} />}
                    piede="Chi non ha settore è programmabile, ma non copre nessun presidio.">
            <ul className="divide-y divide-border overflow-hidden rounded-r2 border border-border bg-bg">
              {persone.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-1.5">
                  <span className="text-base">
                    {p.cognome} <span className="text-ink-muted">{p.nome}</span>
                    {p.ruolo === 'dirigente' && <span className="ml-2 text-2xs text-ink-faint">dirigente di unità figlia</span>}
                  </span>
                  {p.ruolo === 'dipendente' && (
                    <select className={`${inputCls} max-w-[240px] py-1`} aria-label={`Settore di ${p.cognome} ${p.nome}`}
                            value={p.sectorId ?? ''}
                            onChange={(e) => void prova(() => api.post(`/org/unita/${unitId}/assegna-settore`, {
                              userId: p.id, sectorId: e.target.value ? Number(e.target.value) : null,
                            }))}>
                      <option value="">Senza settore</option>
                      {settori.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </Pannello>
        </section>

        <section id="organizzatori">
          <Pannello titolo="Organizzatori" icona={<I.Bacchetta size={18} />}
                    piede="Programmi comunque tu, di diritto. La delega serve ad affiancarti.">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <Campo etichetta="Delega un dipendente">
                  <select id="nuovoDelegato" className={inputCls} defaultValue="">
                    <option value="" disabled>Scegli una persona</option>
                    {persone.filter((p) => p.ruolo === 'dipendente' && !delegati.some((d) => d.userId === p.id))
                      .map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>)}
                  </select>
                </Campo>
              </div>
              <div className="pb-0.5">
                <Bottone onClick={() => {
                  const el = document.getElementById('nuovoDelegato') as HTMLSelectElement | null
                  if (el?.value) void prova(() => api.post(`/org/unita/${unitId}/organizzatori`, { userId: Number(el.value) }))
                }}>Nomina</Bottone>
              </div>
            </div>

            {delegati.length === 0 ? <p className="text-base text-ink-faint">Nessun organizzatore delegato.</p> : (
              <ul className="divide-y divide-border overflow-hidden rounded-r2 border border-border bg-bg">
                {delegati.map((d) => (
                  <li key={d.userId} className="flex items-center justify-between px-3 py-2 text-base">
                    <span>{d.cognome} <span className="text-ink-muted">{d.nome}</span></span>
                    <Bottone variante="piccolo"
                             onClick={() => void prova(() => api.del(`/org/unita/${unitId}/organizzatori/${d.userId}`))}>Revoca</Bottone>
                  </li>
                ))}
              </ul>
            )}
          </Pannello>
        </section>

        <section id="stanze">
          <Pannello titolo="Stanze e scrivanie" icona={<I.Stanza size={18} />}
                    piede="La capienza di una stanza è il numero di scrivanie attive. Una stanza usata da una programmazione non si elimina: si disattiva, e lo storico resta leggibile.">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const form = e.currentTarget
                const f = new FormData(form)
                void prova(() => api.post('/org/stanze', {
                  unitId, etichetta: f.get('etichetta'),
                  soprannome: f.get('soprannome') || undefined, piano: f.get('piano') || undefined,
                  riservataA: f.get('riservataA') ? Number(f.get('riservataA')) : null,
                  scrivanie: Number(f.get('scrivanie')),
                }), 'stanza')
                form.reset()
              }}
              className="grid items-end gap-3 sm:grid-cols-[.7fr_1fr_1fr_1fr_100px_auto]"
            >
              <Campo etichetta="Codice"><input name="etichetta" className={inputCls} required placeholder="101" /></Campo>
              <Campo etichetta="Soprannome"><input name="soprannome" className={inputCls} placeholder="Sala nord" /></Campo>
              <Campo etichetta="Piano"><input name="piano" className={inputCls} placeholder="Primo piano" /></Campo>
              <Campo etichetta="Riservata a" aiuto="Fuori dalla capienza condivisa">
                <select name="riservataA" className={inputCls} defaultValue="">
                  <option value="">Nessuno: stanza condivisa</option>
                  {riservabili.map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>)}
                </select>
              </Campo>
              <Campo etichetta="Scrivanie"><input name="scrivanie" type="number" min={1} max={200} defaultValue={4} className={inputCls} required /></Campo>
              <Bottone type="submit" variante="primario" stato={azione.statoDi('stanza')}>Crea</Bottone>
            </form>

            {stanze.length === 0 ? <p className="text-base text-ink-faint">Nessuna stanza.</p> : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {stanze.map((s) => (
                  <li key={s.id}
                      className={`rounded-r2 border border-border bg-bg p-3 ${s.attiva ? '' : 'opacity-60'}
                                  ${stanzeNuove.has(s.id) ? 'entra appena' : ''}`}>
                    {modifica === s.id ? (
                      <FormaStanza stanza={s} riservabili={riservabili} onChiudi={() => setModifica(null)}
                                   onSalva={(dati) => void prova(() => api.patch(`/org/stanze/${s.id}`, dati))
                                     .then((ok) => { if (ok) setModifica(null) })} />
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-base font-medium">
                            {s.etichetta}
                            {s.soprannome && <span className="ml-1.5 font-normal text-ink-muted">{s.soprannome}</span>}
                            {!s.attiva && <Badge>disattivata</Badge>}
                          </p>
                          <p className="mono text-sm text-ink-faint">
                            {s.piano ?? 'piano non indicato'} · capienza {s.capienza}
                          </p>
                          {s.riservataA != null && (
                            <p className="text-sm text-ink-muted">
                              riservata a {nomeDi(s.riservataA)} · fuori dalla capienza condivisa
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Bottone variante="icona" title={`Modifica la stanza ${s.etichetta}`}
                                   aria-label={`Modifica la stanza ${s.etichetta}`}
                                   onClick={() => setModifica(s.id)}><I.Matita size={15} /></Bottone>
                          <Bottone variante="icona"
                                   title={s.attiva ? 'Disattiva: esce dai conti, lo storico resta' : 'Riattiva'}
                                   aria-label={s.attiva ? `Disattiva la stanza ${s.etichetta}` : `Riattiva la stanza ${s.etichetta}`}
                                   onClick={() => void prova(() => api.patch(`/org/stanze/${s.id}`, { attiva: !s.attiva }))}>
                            <I.Presa size={15} />
                          </Bottone>
                          <Bottone variante="icona" title={`Elimina la stanza ${s.etichetta}`}
                                   aria-label={`Elimina la stanza ${s.etichetta}`}
                                   onClick={() => {
                                     if (confirm(`Elimini la stanza «${s.etichetta}» e le sue ${s.scrivanie.length} scrivanie?`)) {
                                       void prova(() => api.del(`/org/stanze/${s.id}`))
                                     }
                                   }}><I.Cestino size={15} /></Bottone>
                        </div>
                      </div>
                    )}
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {s.scrivanie.map((d) => (
                        <li key={d.id}>
                          <button
                            onClick={() => void prova(() => api.patch(`/org/scrivanie/${d.id}`, { attiva: !d.attiva }))}
                            aria-label={`Scrivania ${d.numero}, ${d.attiva ? 'attiva' : 'disattivata'}`}
                            className={`mono cursor-pointer rounded-r1 border px-2 py-0.5 text-sm disabled:cursor-default
                              ${d.attiva ? 'border-border-controllo bg-surface-2 text-ink' : 'border-border text-ink-faint line-through'}`}
                          >{d.numero}</button>
                        </li>
                      ))}
                      <li>
                        <Bottone variante="piccolo"
                                 onClick={() => void prova(() => api.post(`/org/stanze/${s.id}/scrivanie`, { numero: String(s.scrivanie.length + 1) }))}>
                          <I.Piu size={13} />scrivania
                        </Bottone>
                      </li>
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Pannello>
        </section>

        <section id="figlie">
          <Pannello titolo="Unità figlie" icona={<I.Organizzazione size={18} />}
                    piede="Il dirigente di un'unità figlia viene programmato qui, al posto di tutta la sua unità.">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                void prova(() => api.post('/org/unita', {
                  parentId: unitId, nome: f.get('nome'), sigla: f.get('sigla') || undefined,
                  dirigenteUserId: Number(f.get('dirigente')),
                }))
              }}
              className="grid items-end gap-3 sm:grid-cols-[1.4fr_.6fr_1.2fr_auto]"
            >
              <Campo etichetta="Nome"><input name="nome" className={inputCls} required /></Campo>
              <Campo etichetta="Sigla"><input name="sigla" className={inputCls} /></Campo>
              <Campo etichetta="Chi la comanda">
                <select name="dirigente" className={inputCls} required defaultValue="">
                  <option value="" disabled>Scegli</option>
                  {persone.filter((p) => p.ruolo === 'dipendente').map((p) => (
                    <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>
                  ))}
                </select>
              </Campo>
              <Bottone type="submit">Crea</Bottone>
            </form>

            {unita.figlie.length === 0 ? <p className="text-base text-ink-faint">Nessuna unità figlia.</p> : (
              <ul className="divide-y divide-border overflow-hidden rounded-r2 border border-border bg-bg">
                {unita.figlie.map((f) => (
                  <li key={f.id} className="flex items-center justify-between px-3 py-2 text-base">
                    {f.nome} {f.sigla && <Tag>{f.sigla}</Tag>}
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

/**
 * Modifica di una stanza, in loco dentro la sua scheda: nessuna modale per tre
 * campi di testo, e le scrivanie restano visibili sotto mentre si scrive.
 */
function FormaStanza({ stanza, riservabili, onSalva, onChiudi }: {
  stanza: StanzaVista
  riservabili: Persona[]
  onSalva: (dati: {
    etichetta: string; soprannome: string | null; piano: string | null; riservataA: number | null
  }) => void
  onChiudi: () => void
}) {
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        onSalva({
          etichetta: String(f.get('etichetta') ?? '').trim(),
          soprannome: String(f.get('soprannome') ?? '').trim() || null,
          piano: String(f.get('piano') ?? '').trim() || null,
          riservataA: f.get('riservataA') ? Number(f.get('riservataA')) : null,
        })
      }}
      className="flex flex-col gap-2"
    >
      <div className="grid gap-2 sm:grid-cols-[.7fr_1fr]">
        <Campo etichetta="Codice">
          <input name="etichetta" className={inputCls} required maxLength={60} defaultValue={stanza.etichetta} />
        </Campo>
        <Campo etichetta="Soprannome">
          <input name="soprannome" className={inputCls} maxLength={60} defaultValue={stanza.soprannome ?? ''} />
        </Campo>
      </div>
      <Campo etichetta="Piano">
        <input name="piano" className={inputCls} maxLength={40} defaultValue={stanza.piano ?? ''} />
      </Campo>
      <Campo etichetta="Riservata a" aiuto="Una stanza riservata esce dalla capienza da distribuire.">
        <select name="riservataA" className={inputCls} defaultValue={stanza.riservataA ?? ''}>
          <option value="">Nessuno: stanza condivisa</option>
          {riservabili.map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>)}
        </select>
      </Campo>
      <div className="flex gap-2">
        <Bottone type="submit" variante="primario">Salva</Bottone>
        <Bottone onClick={onChiudi}>Annulla</Bottone>
      </div>
    </form>
  )
}
