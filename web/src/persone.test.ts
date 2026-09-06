import { describe, expect, it } from 'vitest'
import { etichette, tintaDi } from './persone'

const p = (id: number, nome: string, cognome: string) => ({ id, nome, cognome })

describe('etichette', () => {
  it('usa la sola sigla quando non c\'è ambiguità', () => {
    const e = etichette([p(1, 'Elena', 'Pul'), p(2, 'Marco', 'Cip')])
    expect(e.get(1)).toBe('Pul')
    expect(e.get(2)).toBe('Cip')
  })

  it('aggiunge il nome alle sole sigle che collidono', () => {
    const e = etichette([p(1, 'Camilla', 'Pan'), p(2, 'Davide', 'Pan'), p(3, 'Elena', 'Pul')])
    expect(e.get(1)).toBe('Pan Camilla')
    expect(e.get(2)).toBe('Pan Davide')
    expect(e.get(3)).toBe('Pul')
  })

  it('dipende dall\'insieme visibile, non dall\'archivio', () => {
    // Da sola, Camilla resta «Pan»: non c'è nessuno da cui distinguerla.
    expect(etichette([p(1, 'Camilla', 'Pan')]).get(1)).toBe('Pan')
  })
})

describe('tintaDi', () => {
  it('rispetta la scelta della persona quando è valida', () => {
    expect(tintaDi(7, 3)).toBe(3)
    expect(tintaDi(7, 0)).toBe(0)
    expect(tintaDi(7, 99)).toBe(tintaDi(7))   // fuori scala: si torna all'impronta
    expect(tintaDi(7, null)).toBe(tintaDi(7))
  })

  it('è stabile e sta sempre nelle otto tonalità', () => {
    for (let id = 1; id <= 200; id++) {
      const t = tintaDi(id)
      expect(t).toBe(tintaDi(id))
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(8)
    }
  })

  it('usa tutte e otto le tonalità e tiene lontani gli identificativi vicini', () => {
    const venti = Array.from({ length: 20 }, (_, i) => tintaDi(i + 1))
    expect(new Set(venti).size).toBe(8)
    // Due persone consecutive non devono mai finire su grigi adiacenti.
    for (let i = 1; i < venti.length; i++) {
      expect(Math.abs(venti[i]! - venti[i - 1]!)).toBeGreaterThanOrEqual(3)
    }
  })
})
