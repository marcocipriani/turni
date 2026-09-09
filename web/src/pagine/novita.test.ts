import { describe, expect, it } from 'vitest'
import { descriviPeriodo, type Novita } from './novita'

const periodo = (over: Partial<Novita> = {}): Novita => ({
  id: 1, dataInizio: '2026-09-07', dataFine: '2026-10-02', versione: 1,
  pubblicatoIl: '2026-09-05T08:30:00.000Z', aggiornatoIl: '2026-09-05T08:30:00.000Z',
  nuova: true, ...over,
})

// Le date del periodo sono giornate di calendario e si leggono in UTC: quelle
// non ballano. L'istante di pubblicazione invece è un momento, e si mostra
// nell'ora di chi guarda — per questo qui se ne prova la forma, non l'ora.
describe('come si presenta un periodo', () => {
  it('alla prima pubblicazione dice le date e da quando vale', () => {
    expect(descriviPeriodo(periodo()))
      .toMatch(/^7 settembre → 2 ottobre · pubblicata il \d{1,2} settembre alle \d{2}:\d{2}$/)
  })

  it('tace la versione finché è la prima: «v1» non distingue niente', () => {
    expect(descriviPeriodo(periodo())).not.toContain('versione')
  })

  it('dalla seconda dice versione e data dell\'ultimo aggiornamento', () => {
    expect(descriviPeriodo(periodo({ versione: 2, aggiornatoIl: '2026-09-09T14:05:00.000Z' })))
      .toMatch(/^7 settembre → 2 ottobre · versione 2, aggiornata il \d{1,2} settembre alle \d{2}:\d{2}$/)
  })

  it('regge un periodo senza date di pubblicazione, invece di scrivere «null»', () => {
    expect(descriviPeriodo(periodo({ pubblicatoIl: null, aggiornatoIl: null })))
      .toBe('7 settembre → 2 ottobre')
    expect(descriviPeriodo(periodo({ versione: 3, aggiornatoIl: null })))
      .toBe('7 settembre → 2 ottobre · versione 3')
  })
})
