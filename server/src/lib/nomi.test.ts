import { describe, expect, it } from 'vitest'
import { dividiNome, indirizzoDa } from './nomi'

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

describe('indirizzoDa', () => {
  it('costruisce iniziale del nome, punto, cognome', () => {
    expect(indirizzoDa('Elena', 'Marchetti', 'turni.test')).toBe('e.marchetti@turni.test')
    expect(indirizzoDa('Tommaso', 'Della Valle', 'turni.test')).toBe('t.dellavalle@turni.test')
  })

  it('toglie accenti e apostrofi, che in un indirizzo non stanno', () => {
    expect(indirizzoDa('Niccolò', "D'Angelo", 'x.it')).toBe('n.dangelo@x.it')
  })

  it('prende solo la prima lettera dei nomi doppi', () => {
    expect(indirizzoDa('Maria Luisa', 'Rossi', 'x.it')).toBe('m.rossi@x.it')
  })
})
