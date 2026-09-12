import { describe, expect, it } from 'vitest'
import { daAvvisare, seraItaliana, testoPromemoria } from './promemoria'

const cella = (userId: number) => ({ userId, roomId: 1, deskId: null })

describe('promemoria della sera', () => {
  it('invia alle 18 italiane in estate e inverno, saltando l’altro lancio UTC', () => {
    expect(seraItaliana(new Date('2026-09-14T16:00:00Z')).invia).toBe(true)
    expect(seraItaliana(new Date('2026-09-14T17:00:00Z')).invia).toBe(false)
    expect(seraItaliana(new Date('2026-12-14T16:00:00Z')).invia).toBe(false)
    expect(seraItaliana(new Date('2026-12-14T17:00:00Z')).invia).toBe(true)
    expect(seraItaliana(new Date('2026-12-14T23:30:00Z')).oggi).toBe('2026-12-15')
  })
  const base = { data: '2026-09-15', attivi: new Set([1, 2, 3]), assenti: new Map(), giaAvvisati: new Set<number>() }

  it('avvisa solo chi ha acceso il promemoria', () => {
    expect(daAvvisare([cella(1), cella(4)], base).map((c) => c.userId)).toEqual([1])
  })
  it('salta chi domani ha un\'assenza', () => {
    const o = { ...base, assenti: new Map([['2|2026-09-15', 'ferie']]) }
    expect(daAvvisare([cella(1), cella(2)], o).map((c) => c.userId)).toEqual([1])
  })
  it('non avvisa due volte nello stesso giorno', () => {
    const o = { ...base, giaAvvisati: new Set([3]) }
    expect(daAvvisare([cella(1), cella(3)], o).map((c) => c.userId)).toEqual([1])
  })
  it('scrive stanza e scrivania quando ci sono', () => {
    expect(testoPromemoria('101', '3')).toBe('Domani in sede · 101/3')
    expect(testoPromemoria('101', null)).toBe('Domani in sede · 101')
    expect(testoPromemoria(null, null)).toBe('Domani in sede')
  })
})
