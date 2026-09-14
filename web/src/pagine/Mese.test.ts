import { describe, expect, it } from 'vitest'
import type { Griglia } from '../api'
import { componiMese, limitiMese, spostaMese } from './Mese'

const griglia = (id: number, da: string, a: string, stato: 'pubblicato' | 'bozza' = 'pubblicato'): Griglia => ({
  periodo: {
    id, unitId: 1, dataInizio: da, dataFine: a, stato, versione: 1, assegnaScrivanie: false,
    smartMinSettimana: null, smartMaxSettimana: null, notaApprovazione: null,
    pubblicatoIl: null, aggiornatoIl: null, revisioneDi: null, notaRichiesta: null,
  },
  giorni: [da, a], persone: [], settori: [], stanze: [],
  celle: [da, a].map(data => ({ userId: 1, data, stato: 'smart', roomId: null, deskId: null, bloccata: false, causale: null })),
  permessi: { scrivere: true, approvare: true }, avvisi: [],
})

describe('mese solare della programmazione', () => {
  it('unisce i periodi pubblicati e taglia ottobre senza inventare turni nei giorni scoperti', () => {
    const mese = componiMese([
      griglia(1, '2026-09-07', '2026-09-11'),
      griglia(2, '2026-09-14', '2026-10-02'),
      griglia(3, '2026-09-01', '2026-09-30', 'bozza'),
    ], '2026-09')!
    expect(mese.giorni).toHaveLength(30)
    expect(mese.giorni[0]).toBe('2026-09-01')
    expect(mese.giorni.at(-1)).toBe('2026-09-30')
    expect(mese.celle.map(c => c.data)).toEqual(['2026-09-07', '2026-09-11', '2026-09-14'])
    expect(mese.permessi).toEqual({ scrivere: false, approvare: false })
    expect(componiMese([griglia(1, '2026-09-07', '2026-09-11')], '2026-10')).toBeNull()
  })

  it('rispetta febbraio bisestile e il cambio di anno', () => {
    expect(limitiMese('2028-02')).toEqual({ da: '2028-02-01', a: '2028-02-29' })
    expect(limitiMese('2027-02').a).toBe('2027-02-28')
    expect(spostaMese('2026-12', 1)).toBe('2027-01')
    expect(spostaMese('2027-01', -1)).toBe('2026-12')
  })
})
