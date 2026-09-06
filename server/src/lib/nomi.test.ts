import { describe, expect, it } from 'vitest'
import { dividiNome, siglaCognome } from './nomi'

describe('dividiNome', () => {
  it('tiene la particella attaccata al cognome', () => {
    expect(dividiNome('Della Valle Tommaso')).toEqual({ cognome: 'Della Valle', nome: 'Tommaso' })
    expect(dividiNome('Lo Bianco Valerio')).toEqual({ cognome: 'Lo Bianco', nome: 'Valerio' })
    expect(dividiNome('De Angelis Irene')).toEqual({ cognome: 'De Angelis', nome: 'Irene' })
  })

  it('divide al primo spazio quando non c\'è particella', () => {
    expect(dividiNome('Marchetti Elena')).toEqual({ cognome: 'Marchetti', nome: 'Elena' })
    expect(dividiNome('Fabbri Marco')).toEqual({ cognome: 'Fabbri', nome: 'Marco' })
  })

  it('lascia sempre almeno una parola al nome', () => {
    // Due sole parole, la prima è una particella: il nome vincerebbe la gara,
    // ma resterebbe il cognome vuoto. Il nome cede.
    expect(dividiNome('Di Marco')).toEqual({ cognome: 'Di', nome: 'Marco' })
  })

  it('regge nomi doppi e spazi in eccesso', () => {
    expect(dividiNome('  Rossi   Maria Luisa ')).toEqual({ cognome: 'Rossi', nome: 'Maria Luisa' })
  })

  it('rifiuta una stringa che non è un nome completo', () => {
    expect(() => dividiNome('Rossi')).toThrow(/Nome incompleto/)
    expect(() => dividiNome('   ')).toThrow(/Nome incompleto/)
  })
})

describe('siglaCognome', () => {
  it('toglie spazi e apostrofi, poi tronca a tre', () => {
    expect(siglaCognome('Della Valle')).toBe('Del')
    expect(siglaCognome('De Angelis')).toBe('DeA')
    expect(siglaCognome('Marchetti')).toBe('Mar')
    expect(siglaCognome("D'Angelo")).toBe('DAn')
  })

  it('non allunga un cognome più corto di tre', () => {
    expect(siglaCognome('Po')).toBe('Po')
  })
})
