import { describe, expect, it } from 'vitest'
import { type GiornataPropria, righeCalendario } from './esportazione'

const stanze = new Map([[5, { etichetta: '1028', soprannome: 'Stanza del Protocollo' }]])
const scrivanie = new Map([[10, '4']])
const g = (data: string, stato: 'presenza' | 'smart', roomId: number | null = null,
  deskId: number | null = null): GiornataPropria => ({ data, stato, roomId, deskId })

describe('righe del calendario personale', () => {
  it('scrive stanza, soprannome e scrivania di una giornata in sede', () => {
    expect(righeCalendario([g('2026-09-10', 'presenza', 5, 10)], new Map(), stanze, scrivanie))
      .toEqual([['2026-09-10', 'In sede', '1028', 'Stanza del Protocollo', '4', '']])
  })

  it('di una giornata da remoto non inventa un posto', () => {
    expect(righeCalendario([g('2026-09-09', 'smart')], new Map(), stanze, scrivanie))
      .toEqual([['2026-09-09', 'Da remoto', '', '', '', '']])
  })

  it('l\'assenza vince sulla cella e si porta via il posto assegnato', () => {
    expect(righeCalendario(
      [g('2026-09-10', 'presenza', 5, 10)], new Map([['2026-09-10', 'ferie']]), stanze, scrivanie))
      .toEqual([['2026-09-10', 'Assenza', '', '', '', 'ferie']])
  })

  it('tiene le assenze fuori da ogni programmazione: esistono lo stesso', () => {
    const righe = righeCalendario(
      [g('2026-09-10', 'presenza', 5)], new Map([['2026-12-24', 'ferie']]), stanze, scrivanie)
    expect(righe).toHaveLength(2)
    expect(righe[1]).toEqual(['2026-12-24', 'Assenza', '', '', '', 'ferie'])
  })

  it('mette le giornate in ordine di data', () => {
    const righe = righeCalendario(
      [g('2026-09-11', 'smart'), g('2026-09-09', 'smart')], new Map(), stanze, scrivanie)
    expect(righe.map((r) => r[0])).toEqual(['2026-09-09', '2026-09-11'])
  })

  it('non nomina nessun collega: il file parla di una persona sola', () => {
    const righe = righeCalendario([g('2026-09-10', 'presenza', 5, 10)], new Map(), stanze, scrivanie)
    // Sei colonne, e nessuna è un nome altrui.
    expect(righe.every((r) => r.length === 6)).toBe(true)
  })
})
