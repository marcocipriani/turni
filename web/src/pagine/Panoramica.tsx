import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import * as I from '../icone'
import { useSessione } from '../sessione'
import { Badge, Bottone, Messaggio, Pannello, Scheletro, Segmented, StatoVuoto, Tag } from '../ui'
import { Toolbar, Vista } from '../Vista'

type Presente = {
  userId: number; nome: string; cognome: string
  unitId: number | null; sectorId: number | null
  roomId: number | null; scrivania: string | null
}
type Giorno = {
  data: string; feriale: boolean; festivo: string | null
  presenti: Presente[]; capienza: number; ioCiSono: boolean; ioAssente: boolean
}
type Dati = {
  da: string; a: string; giorni: Giorno[]
  stanze: { id: number; etichetta: string; piano: string | null; capienza: number }[]
  settori: { id: number; nome: string; unitId: number }[]
  unita: { id: number; nome: string; sigla: string | null }[]
  persone: { id: number; nome: string; cognome: string }[]
  periodiPubblicati: number
}

const GIORNI_BREVI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const oggiISO = () => new Date().toISOString().slice(0, 10)

function pezzi(iso: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const gs = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  return { g: d, mese: MESI[m - 1]!, breve: GIORNI_BREVI[gs]!, lunedi: gs === 0 }
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function Panoramica() {
  const { utente } = useSessione()
  const [settimane, setSettimane] = useState<'2' | '4'>('2')
  const [dati, setDati] = useState<Dati | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [caricando, setCaricando] = useState(true)

  useEffect(() => {
    setCaricando(true)
    const da = oggiISO()
    const a = addDays(da, Number(settimane) * 7 - 1)
    void api.get<Dati>(`/panoramica?da=${da}&a=${a}`)
      .then(setDati)
      .catch((e) => setErrore(e.message))
      .finally(() => setCaricando(false))
  }, [settimane])

  const feriali = useMemo(() => (dati?.giorni ?? []).filter((g) => g.feriale && !g.festivo), [dati])
  const stanzaPerId = useMemo(() => new Map((dati?.stanze ?? []).map((s) => [s.id, s])), [dati])

  const totalePresenze = feriali.reduce((n, g) => n + g.presenti.length, 0)
  const capienza = dati?.stanze.reduce((n, s) => n + s.capienza, 0) ?? 0
  const postiTotali = capienza * feriali.length
  const occupazione = postiTotali > 0 ? Math.round((totalePresenze / postiTotali) * 100) : 0

  return (
    <Vista
      titolo="Panoramica"
      icona={<I.Panoramica size={17} />}
      aiuto="Chi è in sede, giorno per giorno"
      caricando={caricando}
      meta={dati && (
        <>
          <span className="mono">{capienza} postazioni</span>
          <span aria-hidden="true">·</span>
          <span className="mono">{occupazione}% occupate</span>
        </>
      )}
      azioni={<Bottone variante="piccolo" onClick={() => location.reload()}>Aggiorna</Bottone>}
    >
      <Toolbar>
        <Segmented
          etichetta="Quante settimane mostrare" valore={settimane} onCambia={setSettimane}
          opzioni={[{ v: '2', testo: '2 settimane', titolo: 'Due settimane' }, { v: '4', testo: '4 settimane', titolo: 'Quattro settimane' }]}
        />
        <span className="ml-auto text-sm text-ink-faint">
          <span className="mono">{feriali.length}</span> giornate lavorative
        </span>
      </Toolbar>

      <div className="flex flex-col gap-6 p-6">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}

        {caricando && !dati && <Scheletro righe={6} />}

        {dati && dati.periodiPubblicati === 0 && (
          <StatoVuoto
            testo="Non c'è ancora nessuna programmazione pubblicata. Appena il dirigente ne approva una, qui vedrai chi è in sede giorno per giorno."
            azione={<Link to="/programmazione"><Bottone variante="primario">Vai ai turni</Bottone></Link>}
          />
        )}

        {dati && dati.periodiPubblicati > 0 && (
          <>
            <section id="giorni" className="flex flex-col gap-2">
              <h2 className="mono text-2xs uppercase tracking-[0.06em] text-ink-faint">Prossimi giorni</h2>
              <div className="overflow-x-auto rounded-r3 border border-border bg-surface">
                <div className="flex min-w-max">
                  {feriali.map((g) => (
                    <ColonnaGiorno
                      key={g.data} giorno={g} oggi={g.data === oggiISO()}
                      ioId={utente?.id ?? -1} stanzaPerId={stanzaPerId}
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
                      <div key={s.id} className="grid grid-cols-[minmax(120px,180px)_1fr_64px] items-center gap-3">
                        <span className="truncate text-base">{s.etichetta}</span>
                        <div className="h-4 overflow-hidden rounded-r1 bg-surface-2">
                          <div className="h-full rounded-r1 bg-focus" style={{ width: `${Math.round(quota * 100)}%` }} />
                        </div>
                        <span className="mono text-right text-sm text-ink-muted">
                          {usate}/{disponibili}
                        </span>
                      </div>
                    )
                  })}
                  {dati.stanze.length === 0 && (
                    <p className="text-base text-ink-faint">Nessuna stanza con scrivanie attive.</p>
                  )}
                </div>
              </Pannello>
            </section>
          </>
        )}
      </div>
    </Vista>
  )
}

/** Una colonna per giornata: intestazione, occupazione, chi c'è. */
function ColonnaGiorno({ giorno, oggi, ioId, stanzaPerId }: {
  giorno: Giorno
  oggi: boolean
  ioId: number
  stanzaPerId: Map<number, { etichetta: string }>
}) {
  const { g, mese, breve, lunedi } = pezzi(giorno.data)

  return (
    <div
      className={`flex w-[176px] shrink-0 flex-col border-r border-border last:border-r-0
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
        <span className="mono text-2xs text-ink-faint">
          {giorno.presenti.length}/{giorno.capienza}
        </span>
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
              {p.cognome} {p.nome.slice(0, 1)}.
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
