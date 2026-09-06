import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import * as I from '../icone'
import { Avatar, etichette, FilaAvatar } from '../persone'
import { Bottone, Messaggio, Scheletro, StatoVuoto, Tag } from '../ui'
import { Toolbar, Vista } from '../Vista'
import { ModaleScambio, type Proposta, Scambi } from './Scambio'

export type Collega = {
  userId: number; nome: string; cognome: string
  roomId: number | null; scrivania: string | null
}
export type GiornoMio = {
  data: string
  stato: 'presenza' | 'smart' | 'assenza'
  causale: string | null
  periodId: number | null
  roomId: number | null
  scrivania: string | null
  bloccata: boolean
  colleghi: Collega[]
}
export type DatiMio = {
  da: string; a?: string
  giorni: GiornoMio[]
  stanze: { id: number; etichetta: string; piano: string | null; capienza: number }[]
  scambio: { attivo: boolean; oraLimite: string } | null
}

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

export function pezziData(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const gs = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  return { giorno: d, mese: MESI[m - 1]!, breve: GIORNI[gs]!, lunedi: gs === 0 }
}

const oggiISO = () => new Date().toISOString().slice(0, 10)

/** «101 · Sala nord» → «101». Il codice basta a trovarla. */
export const codiceStanza = (etichetta: string) => etichetta.split('·')[0]!.trim()

/* ── Filtri: interruttori indipendenti, non una scelta esclusiva ──── */

type Filtro = 'presenza' | 'smart' | 'assenza'
const NOMI: Record<Filtro, string> = { presenza: 'Sede', smart: 'Agile', assenza: 'Assenze' }

function Filtri({ attivi, onCambia, conteggi }: {
  attivi: Set<Filtro>
  onCambia: (f: Filtro) => void
  conteggi: Record<Filtro, number>
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Cosa mostrare">
      {(Object.keys(NOMI) as Filtro[]).map((f) => {
        const on = attivi.has(f)
        return (
          <button
            key={f} type="button" onClick={() => onCambia(f)} aria-pressed={on}
            className={`inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-full border px-2.5
                        text-sm transition-colors duration-[120ms] ease-out ${on
              ? 'border-action bg-action text-action-ink'
              : 'border-border-strong bg-bg text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
          >
            {NOMI[f]}
            <span className="mono text-2xs opacity-70">{conteggi[f]}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Pagina ───────────────────────────────────────────────────────── */

type ElencoScambi = { inArrivo: Proposta[]; inUscita: Proposta[]; conclusi: Proposta[] }

export default function Mio() {
  const [dati, setDati] = useState<DatiMio | null>(null)
  const [scambi, setScambi] = useState<ElencoScambi | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [attivi, setAttivi] = useState<Set<Filtro>>(new Set<Filtro>(['presenza']))
  const [aperto, setAperto] = useState<string | null>(null)
  const [daScambiare, setDaScambiare] = useState<string | null>(null)

  const carica = useCallback(() => {
    void api.get<DatiMio>('/mio').then(setDati).catch((e) => setErrore(e.message))
    void api.get<ElencoScambi>('/scambi').then(setScambi).catch(() => {})
  }, [])

  useEffect(carica, [carica])

  const conteggi = useMemo(() => {
    const c: Record<Filtro, number> = { presenza: 0, smart: 0, assenza: 0 }
    for (const g of dati?.giorni ?? []) c[g.stato]++
    return c
  }, [dati])

  const visibili = (dati?.giorni ?? []).filter((g) => attivi.has(g.stato))
  const stanzaPerId = useMemo(
    () => new Map((dati?.stanze ?? []).map((s) => [s.id, s.etichetta])), [dati])

  function alterna(f: Filtro) {
    setAttivi((v) => {
      const n = new Set(v)
      // Almeno un filtro deve restare acceso: una lista vuota per errore di
      // manovra sembra un'app rotta, non un filtro applicato.
      if (n.has(f)) { if (n.size > 1) n.delete(f) } else n.add(f)
      return n
    })
  }

  return (
    <Vista
      titolo="Mio"
      icona={<I.Calendario size={17} />}
      aiuto="Le tue giornate, da oggi in avanti"
      caricando={!dati && !errore}
      meta={dati && <span className="mono">{conteggi.presenza} giornate in sede</span>}
    >
      <Toolbar>
        <Filtri attivi={attivi} onCambia={alterna} conteggi={conteggi} />
      </Toolbar>

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}

        {scambi && <Scambi elenco={scambi} onCambiato={carica} />}

        {!dati && !errore && <Scheletro righe={6} />}

        {dati && dati.giorni.length === 0 && (
          <StatoVuoto testo="Non c'è ancora niente in calendario. Le tue giornate compaiono qui appena una programmazione viene pubblicata, e le assenze appena le dichiari." />
        )}

        {dati && dati.giorni.length > 0 && visibili.length === 0 && (
          <p className="py-8 text-center text-base text-ink-faint">
            Nessuna giornata con questi filtri.
          </p>
        )}

        {visibili.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-r3 border border-border bg-surface">
            {visibili.map((g) => (
              <Riga
                key={g.data} g={g} stanze={stanzaPerId}
                scambiabile={Boolean(dati?.scambio?.attivo) && g.data >= oggiISO() && g.stato !== 'assenza'}
                onScambia={() => setDaScambiare(g.data)}
                aperto={aperto === g.data}
                onApri={() => setAperto((v) => v === g.data ? null : g.data)}
              />
            ))}
          </ul>
        )}
      </div>

      <ModaleScambio
        data={daScambiare} aperta={daScambiare != null}
        onChiudi={() => setDaScambiare(null)} onFatto={carica}
      />
    </Vista>
  )
}

/* ── Riga: una giornata. Nessuna card: la cronologia è una lista sola ── */

function Riga({ g, stanze, aperto, onApri, scambiabile, onScambia }: {
  g: GiornoMio; stanze: Map<number, string>
  aperto: boolean; onApri: () => void
  scambiabile: boolean; onScambia: () => void
}) {
  const stanza = g.roomId != null ? stanze.get(g.roomId) ?? null : null
  const { giorno, mese, breve } = pezziData(g.data)
  const oggi = g.data === oggiISO()
  const espandibile = g.colleghi.length > 0
  const nomi = useMemo(
    () => etichette(g.colleghi.map((c) => ({ id: c.userId, nome: c.nome, cognome: c.cognome }))),
    [g.colleghi])

  return (
    <li className={oggi ? 'shadow-[inset_2px_0_0_var(--ink)]' : ''}>
      {/* Sul telefono i volti vanno a capo: schiacciati sulla stessa riga
          rubavano spazio alla stanza, che è l'informazione che serve. */}
      <div className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 md:flex-nowrap md:px-4">
        <div className="w-[52px] shrink-0">
          <p className="mono text-md font-semibold leading-none">{giorno}</p>
          <p className="text-2xs uppercase tracking-[0.04em] text-ink-faint">{breve} {mese}</p>
        </div>

        <div className="min-w-0 flex-1">
          {g.stato === 'presenza' && (
            <p className="mono truncate text-base">
              {stanza ? codiceStanza(stanza) : 'da assegnare'}
              {g.scrivania && <span className="text-ink-muted"> · scriv. {g.scrivania}</span>}
              {stanza && <span className="hidden text-ink-faint lg:inline"> · {stanza.split('·').slice(1).join('·').trim()}</span>}
            </p>
          )}
          {g.stato === 'smart' && <p className="text-base text-ink-muted">Lavoro agile</p>}
          {g.stato === 'assenza' && (
            <p className="flex flex-wrap items-center gap-2 text-base text-ink-muted">
              Assente {g.causale && <Tag>{g.causale}</Tag>}
            </p>
          )}
          {oggi && <p className="text-2xs uppercase tracking-[0.04em] text-ink-faint">oggi</p>}
        </div>

        {scambiabile && (
          <Bottone variante="icona" title="Scambia questa giornata"
                   aria-label={`Scambia la giornata del ${g.data}`} onClick={onScambia}>
            <I.Scambio size={17} />
          </Bottone>
        )}

        {espandibile && (
          <button
            type="button" onClick={onApri} aria-expanded={aperto}
            className="order-last flex min-h-[36px] w-full cursor-pointer items-center gap-2 rounded-r2 px-1.5
                       hover:bg-surface-2 md:order-none md:w-auto"
            aria-label={aperto ? 'Nascondi chi c\'è' : `Mostra chi c'è: ${g.colleghi.length} persone`}
          >
            <FilaAvatar persone={g.colleghi.map((c) => ({ id: c.userId, nome: c.nome, cognome: c.cognome }))} />
            <span className={`ml-auto text-ink-faint transition-transform duration-[120ms] ease-out ${aperto ? 'rotate-90' : ''}`}>
              <I.Freccia size={14} />
            </span>
          </button>
        )}
      </div>

      {aperto && (
        <ul className="entra border-t border-border bg-bg px-3 py-2 md:px-4">
          {g.colleghi.map((c) => (
            <li key={c.userId} className="flex min-h-[34px] items-center gap-2.5">
              <Avatar persona={{ id: c.userId, nome: c.nome, cognome: c.cognome }} misura="piccolo" />
              <span className="min-w-0 flex-1 truncate text-base">{nomi.get(c.userId)}</span>
              <span className="mono shrink-0 text-sm text-ink-faint">
                {c.roomId != null ? codiceStanza(stanze.get(c.roomId) ?? '') || '—' : '—'}
                {c.scrivania && `/${c.scrivania}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
