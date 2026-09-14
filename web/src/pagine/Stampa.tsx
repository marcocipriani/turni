/**
 * Quello che finisce su carta.
 *
 * Niente libreria di PDF: il foglio è HTML, il browser lo impagina e il PDF lo
 * fa il sistema operativo. Zero dipendenze da mantenere, zero lavoro sul server,
 * e funziona anche dal telefono con «Condividi → Stampa».
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, type Griglia as DatiGriglia, type Periodo } from '../api'
import { addDays, esteso, oggiISO, pezziData } from '../date'
import * as I from '../icone'
import { etichette } from '../persone'
import { puoProgrammare, useSessione } from '../sessione'
import { EtichettaStato } from '../stati'
import { Bottone, Messaggio, Scheletro } from '../ui'
import { Vista } from '../Vista'
import {
  classeSettimana, gruppiDocumento, occupazioneDocumento, type SchedaGiorno, schedeGiorno, simboloStampa,
} from './documentiTurni'
import type { DatiGiorni } from './Giorni'
import type { DatiMio } from './Mio'
import { periodoDiRiferimento } from './periodo'
import { ritornoSicuro } from './stampaRitorno'

type Cosa = 'periodo' | 'giorno' | 'mio' | 'stanze'

const ETICHETTE: Record<Cosa, string> = {
  periodo: 'Griglia del periodo',
  giorno: 'Giorno per giorno',
  mio: 'Il mio calendario',
  stanze: 'Occupazione delle stanze',
}

export default function Stampa() {
  const { cosa } = useParams()
  const [query, setQuery] = useSearchParams()
  const navigate = useNavigate()
  const { utente } = useSessione()

  const scelta = (['periodo', 'giorno', 'mio', 'stanze'].includes(cosa ?? '') ? cosa : 'giorno') as Cosa
  const unita = utente?.ruolo === 'dirigente' ? utente.unitId : utente?.organizzatoreDi[0] ?? utente?.unitId ?? null
  const programma = Boolean(utente && unita != null && puoProgrammare(utente, unita))

  // L'occupazione delle stanze è un dato di gestione, non di calendario.
  const disponibili: Cosa[] = programma
    ? ['periodo', 'giorno', 'mio', 'stanze']
    : ['periodo', 'giorno', 'mio']

  return (
    <Vista
      denso
      titolo="Stampa"
      icona={<I.Stampa size={17} />}
      aiuto="Scegli cosa mettere su carta, poi stampa o salva in PDF"
      azioni={
        <>
          {/* Non la cronologia: cambiare foglio qui dentro la allunga, e
              Indietro deve chiudere la stampa sulla vista da cui è partita. */}
          <Bottone onClick={() => navigate(ritornoSicuro(query.get('ritorno'), scelta === 'mio' ? '/mio' : '/turni'), { replace: true })}>
            Indietro
          </Bottone>
          <Bottone variante="primario" onClick={() => window.print()}>
            <I.Stampa size={15} />Stampa
          </Bottone>
        </>
      }
    >
      <div className="non-stampare flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        {disponibili.map((v) => (
          <button
            key={v} type="button" onClick={() => navigate(`/stampa/${v}?${query}`, { replace: true })}
            aria-pressed={scelta === v}
            className={`min-h-[32px] cursor-pointer rounded-full border px-3 text-sm transition-colors
                        duration-[120ms] ease-out ${scelta === v
              ? 'border-action bg-action text-action-ink'
              : 'border-border-controllo bg-bg text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
          >
            {ETICHETTE[v]}
          </button>
        ))}

        {scelta === 'periodo' && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox" checked={query.get('gruppi') !== '0'}
              onChange={(e) => {
                if (e.target.checked) query.delete('gruppi'); else query.set('gruppi', '0')
                setQuery(query, { replace: true })
              }}
              className="size-4 cursor-pointer accent-[var(--action)]"
            />
            Raggruppa per settore
          </label>
        )}

        {(scelta === 'giorno' || scelta === 'stanze') && (
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-muted">
            Dal
            <input
              type="date" value={query.get('da') ?? oggiISO()}
              onChange={(e) => { query.set('da', e.target.value); setQuery(query, { replace: true }) }}
              className="min-h-[32px] rounded-r2 border border-border-controllo bg-bg px-2 text-sm text-ink"
            />
          </label>
        )}
      </div>

      <div className="p-4 md:p-6">
        {scelta === 'periodo' && (
          <FoglioPeriodo id={Number(query.get('id')) || null} unita={unita} raggruppa={query.get('gruppi') !== '0'} />
        )}
        {scelta === 'giorno' && <FoglioGiorni da={query.get('da') ?? oggiISO()} />}
        {scelta === 'stanze' && <FoglioStanze da={query.get('da') ?? oggiISO()} />}
        {scelta === 'mio' && <FoglioMio />}
      </div>
    </Vista>
  )
}

/* ── Intestazione comune a ogni foglio ───────────────────────────── */

function Testata({ titolo, sottotitolo }: { titolo: string; sottotitolo?: string }) {
  const { utente } = useSessione()
  return (
    <header className="mb-4 flex items-end justify-between gap-4 border-b border-border-controllo pb-2">
      <div>
        <p className="mono text-2xs uppercase tracking-[0.08em] text-ink-faint">
          Turni · {utente?.unitNome ?? ''}
        </p>
        <h2 className="text-xl font-semibold tracking-[-0.01em]">{titolo}</h2>
        {sottotitolo && <p className="text-base text-ink-muted">{sottotitolo}</p>}
      </div>
      <p className="mono shrink-0 text-2xs text-ink-faint">stampato il {esteso(oggiISO())}</p>
    </header>
  )
}

/** Il formato della pagina non si può legare a una classe: si dichiara qui. */
const Orientamento = ({ orizzontale }: { orizzontale?: boolean }) => (
  <style>{`@page { size: A4 ${orizzontale ? 'landscape' : 'portrait'}; margin: 12mm; }`}</style>
)

/* ── Griglia del periodo: il foglio da bacheca ───────────────────── */

function FoglioPeriodo({ id, unita, raggruppa }: { id: number | null; unita: number | null; raggruppa: boolean }) {
  const [dati, setDati] = useState<DatiGriglia | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  /**
   * Passando qui da un'altra scheda — o da «Stampa» aperta sui giorni — l'id
   * non c'è: si stampa lo stesso periodo su cui atterra Turni, quello di oggi
   * o il più recente. Chiedere di tornare indietro e ristampare era una scusa.
   */
  useEffect(() => {
    setErrore(null)
    const griglia = (pid: number) => api.get<DatiGriglia>(`/periodi/${pid}/griglia`).then(setDati)
    const carica = async () => {
      if (id != null) return griglia(id)
      if (unita == null) throw new Error('Nessun periodo indicato. Aprine uno da Turni e ristampa.')
      const r = periodoDiRiferimento(await api.get<Periodo[]>(`/periodi?unitId=${unita}`))
      if (!r) throw new Error('Nessun periodo da stampare: non ce n\'è ancora uno per la tua unità.')
      return griglia(r.id)
    }
    void carica().catch((e) => setErrore(e.message))
  }, [id, unita])

  const nomi = useMemo(() => etichette(dati?.persone ?? []), [dati])
  // Gli stessi blocchi della griglia a video: chi confronta foglio e schermo non rifà la mappa.
  const gruppi = useMemo(() => dati ? gruppiDocumento(dati, raggruppa) : [], [dati, raggruppa])
  const occupazione = useMemo(() => occupazioneDocumento(dati ?? { celle: [] }), [dati])

  if (errore) return <Messaggio tono="errore">{errore}</Messaggio>
  if (!dati) return <Scheletro righe={6} />

  const celle = new Map(dati.celle.map((c) => [`${c.userId}|${c.data}`, c]))
  const capienza = dati.stanze.reduce((s, r) => s + r.capienza, 0)
  const piede = 'mono border border-border px-1 py-0.5 text-center text-2xs'

  return (
    <div>
      <Orientamento orizzontale />
      <Testata
        titolo={`Programmazione ${dati.periodo.dataInizio} → ${dati.periodo.dataFine}`}
        sottotitolo={`versione ${dati.periodo.versione} · ${dati.periodo.stato === 'pubblicato' ? 'pubblicata' : dati.periodo.stato}`}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border border-border px-1.5 py-1 text-left font-semibold">Persona</th>
              {dati.giorni.map((g, i) => {
                const { giorno, breve } = pezziData(g)
                return (
                  <th key={g} className={`mono border border-border px-1 py-1 text-center font-normal ${classeSettimana(g, i)}`}>
                    <span className="block text-2xs text-ink-faint">{breve}</span>{giorno}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {gruppi.map((gr) => (
              <Fragment key={gr.titolo ?? 'tutti'}>
                {gr.titolo && (
                  <tr>
                    <th colSpan={dati.giorni.length + 1}
                        className="border border-border bg-surface-2 px-1.5 py-0.5 text-left text-2xs
                                   font-semibold uppercase tracking-[0.06em]">
                      {gr.titolo}
                      <span className="ml-2 font-normal normal-case tracking-normal text-ink-faint">
                        {gr.persone.length} {gr.persone.length === 1 ? 'persona' : 'persone'}
                      </span>
                    </th>
                  </tr>
                )}
                {gr.persone.map((p) => (
                  <tr key={p.id}>
                    <td className="border border-border px-1.5 py-0.5 whitespace-nowrap">{nomi.get(p.id)}</td>
                    {dati.giorni.map((g, i) => {
                      const c = celle.get(`${p.id}|${g}`)
                      const segno = simboloStampa(c, dati.stanze)
                      return (
                        <td key={g}
                            className={`mono border border-border px-1 py-0.5 text-center text-2xs
                                        ${c?.stato === 'presenza' ? '' : 'text-ink-muted'} ${classeSettimana(g, i)}`}>
                          {segno === 'casa'
                            ? <><I.Remoto size={11} className="inline-block" /><span className="solo-lettori-schermo">Smart working</span></>
                            : c?.stato === 'presenza' ? <span className="stanza-stampa">{segno}</span> : segno}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="border border-border px-1.5 py-0.5 text-left text-sm font-semibold whitespace-nowrap">
                Postazioni occupate <span className="mono font-normal">su {capienza}</span>
              </th>
              {dati.giorni.map((g, i) => (
                <td key={g} className={`${piede} font-semibold ${classeSettimana(g, i)}`}>{occupazione.totali.get(g) ?? 0}</td>
              ))}
            </tr>
            {dati.stanze.filter((s) => s.capienza > 0).map((s) => (
              <tr key={s.id}>
                <th className="border border-border px-1.5 py-0.5 text-left text-2xs font-normal whitespace-nowrap">
                  Stanza {s.etichetta}
                </th>
                {dati.giorni.map((g, i) => (
                  <td key={g} className={`${piede} ${classeSettimana(g, i)}`}>
                    {occupazione.stanze.get(`${g}|${s.id}`) ?? 0}/{s.capienza}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      <LegendaStampa />
    </div>
  )
}

/** La legenda della carta: una croce sola, la casa, il riquadro della stanza. */
function LegendaStampa() {
  return (
    <ul className="legenda-stampa mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-muted">
      <li><span className="mono stanza-stampa">101</span> in sede, nella stanza</li>
      <li className="inline-flex items-center gap-1"><I.Remoto size={12} /> smart working</li>
      <li><span className="mono">×</span> assenza</li>
      <li><span className="mono">·</span> non programmato</li>
    </ul>
  )
}

/* ── Giorno per giorno: il foglio per la reception ───────────────── */

function FoglioGiorni({ da }: { da: string }) {
  const [dati, setDati] = useState<DatiGiorni | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    void api.get<DatiGiorni>(`/panoramica?da=${da}&a=${addDays(da, 13)}`)
      .then(setDati).catch((e) => setErrore(e.message))
  }, [da])

  if (errore) return <Messaggio tono="errore">{errore}</Messaggio>
  if (!dati) return <Scheletro righe={6} />
  const feriali = dati.giorni.filter((g) => g.feriale && !g.festivo)

  /**
   * Una card per giornata, e dentro una card per stanza, una per lo smart e una
   * per gli assenti — anche vuote, col loro zero: il foglio serve alla
   * reception, e un gruppo che manca sembra una dimenticanza. La giornata non
   * si spezza a cavallo di due pagine.
   */
  return (
    <div>
      <Orientamento />
      <Testata titolo="Chi è in sede" sottotitolo={`da ${esteso(da)}`} />

      <div className="flex flex-col gap-3">
        {feriali.map((g) => (
          <section key={g.data} className="break-inside-avoid rounded-r2 border border-border-controllo p-2.5">
            <header className="mb-2 flex items-baseline justify-between gap-2 border-b border-border pb-1
                               text-base font-semibold first-letter:uppercase">
              {esteso(g.data)}
              <span className="mono shrink-0 text-sm font-normal text-ink-muted">{g.presenti.length}/{g.capienza} in sede</span>
            </header>
            <div className="grid grid-cols-2 gap-2 min-[720px]:grid-cols-3 print:grid-cols-3">
              {schedeGiorno(g, dati.stanze, dati.settori).map((s) => <SchedaStampa key={s.chiave} scheda={s} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function SchedaStampa({ scheda }: { scheda: SchedaGiorno }) {
  return (
    <div className="break-inside-avoid rounded-r1 border border-border p-1.5 text-sm">
      <p className="flex items-baseline justify-between gap-2 border-b border-border pb-0.5 font-semibold">
        {scheda.titolo}<span className="mono font-normal text-ink-muted">{scheda.contatore}</span>
      </p>
      {scheda.persone.length === 0
        ? <p className="py-0.5 text-ink-faint">—</p>
        : (
          <ul>
            {scheda.persone.map((p) => (
              <li key={p.userId} className="flex items-baseline justify-between gap-2 py-px">
                <span className="min-w-0">
                  {p.nome}{p.settore && <span className="text-2xs text-ink-faint"> · {p.settore}</span>}
                </span>
                {p.scrivania && <span className="mono shrink-0 text-ink-muted">/{p.scrivania}</span>}
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

/* ── Occupazione delle stanze: il foglio di gestione ─────────────── */

function FoglioStanze({ da }: { da: string }) {
  const [dati, setDati] = useState<DatiGiorni | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    void api.get<DatiGiorni>(`/panoramica?da=${da}&a=${addDays(da, 27)}`)
      .then(setDati).catch((e) => setErrore(e.message))
  }, [da])

  if (errore) return <Messaggio tono="errore">{errore}</Messaggio>
  if (!dati) return <Scheletro righe={6} />
  const feriali = dati.giorni.filter((g) => g.feriale && !g.festivo)

  return (
    <div>
      <Orientamento orizzontale />
      <Testata titolo="Occupazione delle stanze" sottotitolo={`da ${esteso(da)} · ${feriali.length} giornate`} />

      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="border border-border px-1.5 py-1 text-left font-semibold">Stanza</th>
            {feriali.map((g) => {
              const { giorno, breve } = pezziData(g.data)
              return (
                <th key={g.data} className="mono border border-border px-1 py-1 text-center font-normal">
                  <span className="block text-2xs text-ink-faint">{breve}</span>{giorno}
                </th>
              )
            })}
            <th className="border border-border px-1.5 py-1 text-right font-semibold">Media</th>
          </tr>
        </thead>
        <tbody>
          {dati.stanze.map((s) => {
            const perGiorno = feriali.map((g) => g.presenti.filter((p) => p.roomId === s.id).length)
            const media = perGiorno.length
              ? Math.round((perGiorno.reduce((a, b) => a + b, 0) / perGiorno.length) * 10) / 10 : 0
            return (
              <tr key={s.id}>
                <td className="border border-border px-1.5 py-0.5 whitespace-nowrap">
                  {s.etichetta}
                  {s.soprannome && <span className="text-ink-faint"> · {s.soprannome}</span>}
                </td>
                {perGiorno.map((n, i) => (
                  <td key={i} className={`mono border border-border px-1 py-0.5 text-center
                                          ${n >= s.capienza ? 'font-semibold' : n === 0 ? 'text-ink-faint' : ''}`}>
                    {n}
                  </td>
                ))}
                <td className="mono border border-border px-1.5 py-0.5 text-right">{media}/{s.capienza}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── Il mio calendario ───────────────────────────────────────────── */

function FoglioMio() {
  const [dati, setDati] = useState<DatiMio | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const { utente } = useSessione()

  useEffect(() => {
    void api.get<DatiMio>('/mio').then(setDati).catch((e) => setErrore(e.message))
  }, [])

  const stanze = useMemo(() => new Map((dati?.stanze ?? []).map((s) => [s.id, s.etichetta])), [dati])

  if (errore) return <Messaggio tono="errore">{errore}</Messaggio>
  if (!dati) return <Scheletro righe={6} />

  return (
    <div>
      <Orientamento />
      <Testata
        titolo={`Calendario di ${utente?.nome ?? ''} ${utente?.cognome ?? ''}`}
        sottotitolo={`${dati.giorni.filter((g) => g.stato === 'presenza').length} giornate in sede`}
      />

      <table className="w-full max-w-[80ch] text-base">
        <thead>
          <tr>
            <th className="border-b border-border-controllo py-1 text-left font-semibold">Giornata</th>
            <th className="border-b border-border-controllo py-1 text-left font-semibold">Stato</th>
            <th className="border-b border-border-controllo py-1 text-left font-semibold">Dove</th>
          </tr>
        </thead>
        <tbody>
          {dati.giorni.map((g) => (
            <tr key={g.data}>
              <td className="border-b border-border py-1 first-letter:uppercase">{esteso(g.data)}</td>
              <td className="border-b border-border py-1">
                <EtichettaStato stato={g.stato} size={13} />
                {g.stato === 'assenza' && g.causale && <span className="text-ink-muted"> · {g.causale}</span>}
              </td>
              <td className="mono border-b border-border py-1">
                {g.stato === 'presenza'
                  ? `${g.roomId != null ? stanze.get(g.roomId) ?? '' : ''}${g.scrivania ? ` · scriv. ${g.scrivania}` : ''}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
