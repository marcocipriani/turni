import { useEffect, useMemo, useState } from 'react'
import { api, type Griglia as DatiGriglia, type Periodo } from '../api'
import { addDays } from '../date'
import { Messaggio, Scheletro, StatoVuoto } from '../ui'
import Griglia, { Legenda } from './Griglia'

export function spostaMese(mese: string, passi: number) {
  const data = new Date(`${mese}-01T00:00:00Z`)
  data.setUTCMonth(data.getUTCMonth() + passi)
  return data.toISOString().slice(0, 7)
}

export const limitiMese = (mese: string) => ({
  da: `${mese}-01`, a: addDays(`${spostaMese(mese, 1)}-01`, -1),
})

/** Le celle arrivano dalle griglie autorizzate: non si ricostruiscono le assenze. */
export function componiMese(griglie: DatiGriglia[], mese: string): DatiGriglia | null {
  const { da, a } = limitiMese(mese)
  const pubblicate = griglie.filter(g => g.periodo.stato === 'pubblicato'
    && g.periodo.revisioneDi == null && g.periodo.dataInizio <= a && g.periodo.dataFine >= da)
  const base = pubblicate[0]
  if (!base) return null
  const giorni: string[] = []
  for (let d = da; d <= a; d = addDays(d, 1)) giorni.push(d)
  return {
    ...base,
    // Solo dati di presentazione: questo identificativo non viene mai scritto.
    periodo: { ...base.periodo, id: 0, dataInizio: da, dataFine: a },
    giorni,
    celle: pubblicate.flatMap(g => g.celle).filter(c => c.data >= da && c.data <= a),
    permessi: { scrivere: false, approvare: false }, avvisi: [],
  }
}

export function Mese({ mese, periodi, raggruppa, ioId, onApriPeriodo, onCaricato }: {
  mese: string; periodi: Periodo[] | null; raggruppa: boolean; ioId: number
  onApriPeriodo: (id: number) => void
  /** Il mese composto, o null mentre si carica: serve alle esportazioni. */
  onCaricato?: (dati: DatiGriglia | null) => void
}) {
  const [griglie, setGriglie] = useState<DatiGriglia[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  useEffect(() => {
    let attivo = true
    setGriglie(null); setErrore(null)
    if (!periodi) return
    const { da, a } = limitiMese(mese)
    const pubblicati = periodi.filter(p => p.stato === 'pubblicato' && p.revisioneDi == null
      && p.dataInizio <= a && p.dataFine >= da)
    void Promise.all(pubblicati.map(p => api.get<DatiGriglia>(`/periodi/${p.id}/griglia`)))
      .then(g => { if (attivo) setGriglie(g) })
      .catch(e => { if (attivo) setErrore(e.message) })
    return () => { attivo = false }
  }, [mese, periodi])
  const dati = useMemo(() => componiMese(griglie ?? [], mese), [griglie, mese])
  // onCaricato fuori dalle dipendenze: è un riferimento nuovo a ogni render del padre.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onCaricato?.(griglie ? dati : null), [griglie, dati])
  if (errore) return <div className="p-4"><Messaggio tono="errore">{errore}</Messaggio></div>
  if (!griglie) return <div className="p-4"><Scheletro righe={6} /></div>
  if (!dati) return <StatoVuoto testo="Nessuna programmazione pubblicata in questo mese." />
  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto]">
      <p className="px-4 py-1 text-xs text-ink-faint">Solo turni pubblicati. Seleziona una cella per aprire il periodo.</p>
      <Griglia dati={dati} selezione={null} raggruppa={raggruppa} ioId={ioId}
               onSeleziona={s => {
                 const p = s && griglie.find(g => g.celle.some(c => c.userId === s.userId && c.data === s.data))?.periodo
                 if (p) onApriPeriodo(p.id)
               }} />
      <div className="border-t border-border px-4 py-2"><Legenda assegnaScrivanie={dati.periodo.assegnaScrivanie} /></div>
    </div>
  )
}
