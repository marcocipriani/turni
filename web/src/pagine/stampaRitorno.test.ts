import { describe, expect, it } from 'vitest'
import { ritornoSicuro, urlStampa } from './stampaRitorno'

describe('ritorno dalla stampa', () => {
  it('porta con sé la vista esatta di partenza', () => {
    expect(urlStampa('periodo', '/turni/7', { id: '7' })).toBe('/stampa/periodo?id=7&ritorno=%2Fturni%2F7')
    expect(urlStampa('mio', '/mio')).toBe('/stampa/mio?ritorno=%2Fmio')
  })

  it('accetta solo percorsi interni', () => {
    expect(ritornoSicuro('/turni?vista=mese&mese=2026-09', '/turni')).toBe('/turni?vista=mese&mese=2026-09')
    expect(ritornoSicuro('https://example.com', '/turni')).toBe('/turni')
    expect(ritornoSicuro('//example.com', '/turni')).toBe('/turni')
    expect(ritornoSicuro('/\\example.com', '/turni')).toBe('/turni')
    expect(ritornoSicuro(null, '/mio')).toBe('/mio')
  })
})
