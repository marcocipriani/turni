/**
 * Scambio di turni fra colleghi, lato interfaccia.
 *
 * Le proposte in corso stanno in cima a «Mio», righe come tutte le altre. La
 * scelta di chi e quando arriva dal server già filtrata: qui non si valida
 * niente, perché una regola scritta due volte è una regola che prima o poi
 * diverge.
 */
import { useEffect, useState } from 'react'
import { api, ErroreApi } from '../api'
import { pezziData } from '../date'
import * as I from '../icone'
import { Avatar, etichette } from '../persone'
import { APTICO, vibra } from '../tocco'
import { Bottone, Messaggio, Modale, Scheletro, Tag } from '../ui'

export type Proposta = {
  id: number
  tipo: 'offro' | 'chiedo' | 'permuta'
  stato: 'proposto' | 'accettato' | 'rifiutato' | 'ritirato'
  dataProponente: string
  dataDestinatario: string
  messaggio: string | null
  ioPropongo: boolean
  controparte: { id: number; nome: string; cognome: string } | null
}
type Elenco = { inArrivo: Proposta[]; inUscita: Proposta[]; conclusi: Proposta[] }

type Candidato = {
  userId: number; nome: string; cognome: string
  giornate: { data: string; tipo: 'offro' | 'chiedo' | 'permuta' }[]
}

const quando = (iso: string) => {
  const { giorno, mese, breve } = pezziData(iso)
  return `${breve} ${giorno} ${mese}`
}

/** Una frase sola che dice cosa succede se si accetta. */
export function descriviProposta(p: Proposta, chi: string) {
  if (p.tipo === 'offro') {
    return p.ioPropongo
      ? `Cedi a ${chi} la tua giornata in sede di ${quando(p.dataProponente)}.`
      : `${chi} ti cede la giornata in sede di ${quando(p.dataProponente)}.`
  }
  if (p.tipo === 'chiedo') {
    return p.ioPropongo
      ? `Chiedi a ${chi} la sua giornata in sede di ${quando(p.dataDestinatario)}.`
      : `${chi} ti chiede la tua giornata in sede di ${quando(p.dataDestinatario)}.`
  }
  return p.ioPropongo
    ? `Permuti la tua giornata di ${quando(p.dataProponente)} con quella di ${chi} di ${quando(p.dataDestinatario)}.`
    : `${chi} propone di permutare la tua giornata di ${quando(p.dataDestinatario)} con la sua di ${quando(p.dataProponente)}.`
}

/* ── Proposte in corso ───────────────────────────────────────────── */

export function Scambi({ elenco, onCambiato }: { elenco: Elenco; onCambiato: () => void }) {
  const [inCorso, setInCorso] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const aperte = [...elenco.inArrivo, ...elenco.inUscita]
  if (aperte.length === 0) return null

  async function agisci(id: number, fn: () => Promise<unknown>) {
    setErrore(null); setInCorso(id)
    try { await fn(); vibra(APTICO.conferma); onCambiato() }
    catch (e) {
      vibra(APTICO.errore)
      setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita.')
    }
    finally { setInCorso(null) }
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Scambi in corso">
      <h2 className="mono text-2xs uppercase tracking-[0.06em] text-ink-faint">Scambi in corso</h2>
      {errore && <Messaggio tono="errore">{errore}</Messaggio>}

      <ul className="divide-y divide-border overflow-hidden rounded-r3 border border-border bg-surface">
        {aperte.map((p) => {
          const chi = p.controparte ? `${p.controparte.nome} ${p.controparte.cognome}` : 'Un collega'
          return (
            <li key={p.id} className="flex min-h-[52px] flex-wrap items-center gap-3 px-3 py-2 md:px-4">
              {p.controparte && <Avatar persona={{ ...p.controparte, id: p.controparte.id }} />}
              <div className="min-w-0 flex-1">
                <p className="text-base">{descriviProposta(p, chi)}</p>
                {p.messaggio && <p className="text-sm text-ink-faint">«{p.messaggio}»</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {p.ioPropongo ? (
                  <>
                    <Tag>in attesa</Tag>
                    <Bottone variante="piccolo" disabled={inCorso === p.id}
                             onClick={() => void agisci(p.id, () => api.del(`/scambi/${p.id}`))}>
                      Ritira
                    </Bottone>
                  </>
                ) : (
                  <>
                    <Bottone variante="piccolo" disabled={inCorso === p.id}
                             onClick={() => void agisci(p.id, () => api.post(`/scambi/${p.id}/rifiuta`))}>
                      Rifiuta
                    </Bottone>
                    <Bottone variante="primario" disabled={inCorso === p.id}
                             onClick={() => void agisci(p.id, () => api.post(`/scambi/${p.id}/accetta`))}>
                      Accetta
                    </Bottone>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ── Proporre uno scambio ────────────────────────────────────────── */

export function ModaleScambio({ data, aperta, onChiudi, onFatto }: {
  data: string | null
  aperta: boolean
  onChiudi: () => void
  onFatto: () => void
}) {
  const [candidati, setCandidati] = useState<Candidato[] | null>(null)
  const [scambio, setScambio] = useState<{ attivo: boolean; oraLimite: string } | null>(null)
  const [scelto, setScelto] = useState<number | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    if (!aperta || !data) return
    setCandidati(null); setScelto(null); setErrore(null)
    void api.get<{ candidati: Candidato[]; scambio: { attivo: boolean; oraLimite: string } | null }>(
      `/scambi/possibili?data=${data}`)
      .then((r) => { setCandidati(r.candidati); setScambio(r.scambio) })
      .catch((e) => setErrore(e.message))
  }, [aperta, data])

  const nomi = etichette((candidati ?? []).map((c) => ({ id: c.userId, nome: c.nome, cognome: c.cognome })))

  async function proponi(c: Candidato, g: { data: string; tipo: 'offro' | 'chiedo' | 'permuta' }) {
    if (!data) return
    setErrore(null); setInCorso(true)
    try {
      await api.post('/scambi', {
        tipo: g.tipo,
        destinatarioId: c.userId,
        dataProponente: g.tipo === 'chiedo' ? g.data : data,
        dataDestinatario: g.data,
      })
      vibra(APTICO.conferma)
      onFatto(); onChiudi()
    } catch (e) {
      vibra(APTICO.errore)
      setErrore(e instanceof ErroreApi ? e.message : 'Proposta non riuscita.')
    } finally { setInCorso(false) }
  }

  return (
    <Modale
      titolo={data ? `Scambia ${quando(data)}` : 'Scambia'}
      aperta={aperta} onChiudi={onChiudi}
      piede={<Bottone onClick={onChiudi}>Chiudi</Bottone>}
    >
      <div className="flex flex-col gap-3">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}

        {scambio && !scambio.attivo && (
          <Messaggio tono="attenzione">Lo scambio dei turni non è attivo in questa unità.</Messaggio>
        )}

        {candidati === null && !errore && <Scheletro righe={4} />}

        {candidati?.length === 0 && (
          <p className="text-base text-ink-faint">
            Nessuno con cui scambiare questa giornata. Può dipendere dalle postazioni,
            dal presidio dei settori o da scambi già in corso.
          </p>
        )}

        {candidati && candidati.length > 0 && (
          <>
            <p className="text-sm text-ink-faint">
              Scegli la persona, poi la giornata. La proposta parte subito e resta
              in attesa finché non viene accettata: puoi ritirarla quando vuoi.
            </p>
            <ul className="divide-y divide-border overflow-hidden rounded-r3 border border-border bg-surface">
              {candidati.map((c) => {
                const aperto = scelto === c.userId
                return (
                  <li key={c.userId}>
                    <button
                      type="button" onClick={() => setScelto(aperto ? null : c.userId)}
                      aria-expanded={aperto}
                      className="flex min-h-[48px] w-full cursor-pointer items-center gap-3 px-3 text-left hover:bg-surface-2"
                    >
                      <Avatar persona={{ id: c.userId, nome: c.nome, cognome: c.cognome }} />
                      <span className="min-w-0 flex-1 truncate text-base">{nomi.get(c.userId)}</span>
                      <span className="mono text-2xs text-ink-faint">
                        {c.giornate.length} {c.giornate.length === 1 ? 'giornata' : 'giornate'}
                      </span>
                      <span className={`text-ink-faint transition-transform duration-[120ms] ease-out ${aperto ? 'rotate-90' : ''}`}>
                        <I.Freccia size={14} />
                      </span>
                    </button>

                    {aperto && (
                      <div className="entra flex flex-wrap gap-1.5 border-t border-border bg-bg px-3 py-2.5">
                        {c.giornate.map((g) => (
                          <button
                            key={`${g.data}-${g.tipo}`} type="button" disabled={inCorso}
                            onClick={() => void proponi(c, g)}
                            title={g.tipo === 'permuta'
                              ? `Permuta con la sua giornata di ${quando(g.data)}`
                              : g.tipo === 'offro' ? 'Cedi la tua giornata' : 'Chiedi la sua giornata'}
                            className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-r2
                                       border border-border-controllo bg-bg px-2.5 text-sm text-ink
                                       hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <I.Scambio size={14} />
                            {quando(g.data)}
                            {g.tipo === 'permuta' && <span className="text-2xs text-ink-faint">permuta</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </Modale>
  )
}
