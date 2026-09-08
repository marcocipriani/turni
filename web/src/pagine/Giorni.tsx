/**
 * Chi c'è in sede, giornata per giornata. È la vista con cui si apre «Turni»:
 * la domanda di tutti i giorni è «chi trovo mercoledì», non «com'è fatta la
 * griglia».
 */
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import * as I from '../icone'
import { etichette } from '../persone'
import { useSessione } from '../sessione'
import { Badge, Messaggio, Pannello, Scheletro, StatoVuoto, Tag } from '../ui'
import { pezziData } from './Mio'

type Presente = {
  userId: number; nome: string; cognome: string
  unitId: number | null; sectorId: number | null
  roomId: number | null; scrivania: string | null
}
type Giorno = {
  data: string; feriale: boolean; festivo: string | null
  presenti: Presente[]; capienza: number; ioCiSono: boolean; ioAssente: boolean
}
export type DatiGiorni = {
  da: string; a: string; giorni: Giorno[]
  stanze: { id: number; etichetta: string; piano: string | null; capienza: number }[]
  persone: { id: number; nome: string; cognome: string }[]
  periodiPubblicati: number
}

const oggiISO = () => new Date().toISOString().slice(0, 10)

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Il lunedì della settimana di una data. Le finestre partono di lunedì: due
 * settimane che cominciano di mercoledì non si confrontano con niente, e le
 * frecce avanti e indietro finirebbero per scavalcare mezze settimane.
 */
export function lunediDi(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  // getUTCDay(): 0 è domenica. Il lunedì della sua settimana sta sei giorni prima.
  return addDays(iso, -((d.getUTCDay() + 6) % 7))
}

export function Giorni({ settimane, da, onCaricato }: {
  settimane: number
  /** Primo giorno da mostrare. Chi chiama decide dove si è, così le frecce funzionano. */
  da: string
  onCaricato?: (d: DatiGiorni | null) => void
}) {
  const { utente } = useSessione()
  const [dati, setDati] = useState<DatiGiorni | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    const a = addDays(da, settimane * 7 - 1)
    void api.get<DatiGiorni>(`/panoramica?da=${da}&a=${a}`)
      .then((d) => { setDati(d); onCaricato?.(d) })
      .catch((e) => setErrore(e.message))
    // onCaricato è un riferimento nuovo a ogni render del padre: tenerlo fra le
    // dipendenze rifarebbe la richiesta a ogni battito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settimane, da])

  const feriali = useMemo(() => (dati?.giorni ?? []).filter((g) => g.feriale && !g.festivo), [dati])
  const stanzaPerId = useMemo(() => new Map((dati?.stanze ?? []).map((s) => [s.id, s])), [dati])
  const nomi = useMemo(() => etichette(dati?.persone ?? []), [dati])

  if (errore) return <div className="p-4 md:p-6"><Messaggio tono="errore">{errore}</Messaggio></div>
  if (!dati) return <div className="p-4 md:p-6"><Scheletro righe={6} /></div>

  if (dati.periodiPubblicati === 0) {
    return (
      <div className="p-4 md:p-6">
        <StatoVuoto testo="Non c'è ancora nessuna programmazione pubblicata. Appena il dirigente ne approva una, qui vedrai chi è in sede giorno per giorno." />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <section id="giorni" className="flex flex-col gap-2">
        <h2 className="mono text-2xs uppercase tracking-[0.06em] text-ink-faint">Prossimi giorni</h2>
        {/* Regione che scorre: senza fuoco propria non si raggiunge da tastiera. */}
        <div tabIndex={0} role="region" aria-label="Giornate, in orizzontale"
             className="overflow-x-auto rounded-r3 border border-border bg-surface">
          <div className="flex min-w-max">
            {feriali.map((g) => (
              <ColonnaGiorno
                key={g.data} giorno={g} oggi={g.data === oggiISO()}
                ioId={utente?.id ?? -1} stanzaPerId={stanzaPerId} nomi={nomi}
              />
            ))}
          </div>
        </div>
        <p className="text-sm text-ink-faint">
          Chi non compare in una giornata è fuori sede. Le assenze non sono distinguibili dal lavoro agile.
        </p>
      </section>

      <section id="stanze" className="flex flex-col gap-2">
        <h2 className="mono text-2xs uppercase tracking-[0.06em] text-ink-faint">Occupazione delle stanze</h2>
        <Pannello>
          <div className="flex flex-col gap-2">
            {dati.stanze.map((s) => {
              const usate = feriali.reduce((n, g) => n + g.presenti.filter((p) => p.roomId === s.id).length, 0)
              const disponibili = s.capienza * feriali.length
              const quota = disponibili ? usate / disponibili : 0
              return (
                <div key={s.id} className="grid grid-cols-[minmax(90px,180px)_1fr_64px] items-center gap-3">
                  <span className="truncate text-base">{s.etichetta}</span>
                  <div className="h-4 overflow-hidden rounded-r1 bg-surface-2">
                    <div className="h-full rounded-r1 bg-focus" style={{ width: `${Math.round(quota * 100)}%` }} />
                  </div>
                  <span className="mono text-right text-sm text-ink-muted">{usate}/{disponibili}</span>
                </div>
              )
            })}
            {dati.stanze.length === 0 && (
              <p className="text-base text-ink-faint">Nessuna stanza con scrivanie attive.</p>
            )}
          </div>
        </Pannello>
      </section>
    </div>
  )
}

/** Una colonna per giornata: intestazione, occupazione, chi c'è. */
function ColonnaGiorno({ giorno, oggi, ioId, stanzaPerId, nomi }: {
  giorno: Giorno
  oggi: boolean
  ioId: number
  stanzaPerId: Map<number, { etichetta: string }>
  nomi: Map<number, string>
}) {
  const { giorno: g, mese, breve, lunedi } = pezziData(giorno.data)

  return (
    <div
      className={`flex w-[152px] shrink-0 flex-col border-r border-border last:border-r-0 sm:w-[176px]
                  ${lunedi ? 'border-l-2 border-l-border-strong first:border-l-0' : ''}
                  ${oggi ? 'bg-bg' : ''}`}
      style={oggi ? { boxShadow: 'inset 2px 0 0 var(--ink)' } : undefined}
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm text-ink-muted">{breve}</span>
          <span className="mono text-md font-semibold text-ink">{g}</span>
          <span className="text-xs text-ink-faint">{mese}</span>
        </div>
        {oggi && <Badge>oggi</Badge>}
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-focus"
               style={{ width: `${giorno.capienza ? Math.min(100, (giorno.presenti.length / giorno.capienza) * 100) : 0}%` }} />
        </div>
        <span className="mono text-2xs text-ink-faint">{giorno.presenti.length}/{giorno.capienza}</span>
        <span className="solo-lettori-schermo">
          {giorno.presenti.length} presenti su {giorno.capienza} postazioni
        </span>
      </div>

      <ul className="flex min-h-[120px] flex-col gap-px p-1.5">
        {giorno.presenti.map((p) => (
          <li key={p.userId}
              className={`flex items-baseline justify-between gap-1.5 rounded-r1 px-1.5 py-1 text-sm
                          ${p.userId === ioId ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-muted'}`}>
            <span className="truncate">
              {nomi.get(p.userId) ?? p.cognome}
              {p.userId === ioId && <span className="solo-lettori-schermo"> (sei tu)</span>}
            </span>
            {p.roomId != null && (
              <span className="mono shrink-0 text-2xs text-ink-faint">
                {stanzaPerId.get(p.roomId)?.etichetta.split('·')[0]?.trim() ?? ''}
                {p.scrivania ? `/${p.scrivania}` : ''}
              </span>
            )}
          </li>
        ))}
        {giorno.presenti.length === 0 && (
          <li className="px-1.5 py-2 text-sm text-ink-faint">Nessuno in sede.</li>
        )}
      </ul>

      {giorno.ioAssente && (
        <div className="border-t border-border px-2 py-1.5">
          <Tag><I.Assenza size={12} /> tua assenza</Tag>
        </div>
      )}
    </div>
  )
}
