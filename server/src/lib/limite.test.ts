import { beforeEach, describe, expect, it } from 'vitest'
import { attesaResidua, azzera, tentativoFallito, tentativoRiuscito } from './limite'

describe('freno ai tentativi di accesso', () => {
  beforeEach(azzera)

  it('lascia passare i primi tentativi', () => {
    for (let i = 0; i < 7; i++) tentativoFallito('a')
    expect(attesaResidua('a')).toBe(0)
  })

  it('blocca dall\'ottavo, e allunga a ogni tentativo in più', () => {
    for (let i = 0; i < 8; i++) tentativoFallito('a')
    const primo = attesaResidua('a')
    expect(primo).toBeGreaterThan(0)
    tentativoFallito('a')
    expect(attesaResidua('a')).toBeGreaterThan(primo)
  })

  it('non blocca oltre un\'ora', () => {
    for (let i = 0; i < 40; i++) tentativoFallito('a')
    expect(attesaResidua('a')).toBeLessThanOrEqual(3600)
  })

  it('un accesso riuscito azzera il conto', () => {
    for (let i = 0; i < 10; i++) tentativoFallito('a')
    tentativoRiuscito('a')
    expect(attesaResidua('a')).toBe(0)
  })

  it('conta ogni chiave per conto suo', () => {
    for (let i = 0; i < 10; i++) tentativoFallito('a')
    expect(attesaResidua('b')).toBe(0)
  })

  it('dimentica i tentativi fuori dalla finestra', () => {
    const ora = Date.now()
    for (let i = 0; i < 7; i++) tentativoFallito('a', ora)
    // Oltre i quindici minuti il conteggio riparte da capo.
    tentativoFallito('a', ora + 16 * 60_000)
    expect(attesaResidua('a', ora + 16 * 60_000)).toBe(0)
  })
})
