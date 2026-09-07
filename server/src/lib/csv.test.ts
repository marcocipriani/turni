import { describe, expect, it } from 'vitest'
import { EMAIL, ISO, leggiCsv, lungo, si } from './csv'

describe('leggiCsv', () => {
  it('toglie la firma UTF-8 di Excel dalla prima colonna', () => {
    expect(leggiCsv('\ufeffnome;eta\nAnna;30\n')[0]).toEqual({ nome: 'Anna', eta: '30' })
  })

  it('accetta una riga più corta dell\u2019intestazione, non una più lunga', () => {
    expect(leggiCsv('a;b;c\n1;2\n')[0]).toEqual({ a: '1', b: '2', c: '' })
    expect(() => leggiCsv('a;b\n1;2;3\n')).toThrow(/colonne contro le/)
  })

  it('rifiuta un\u2019intestazione che ripete una colonna', () => {
    // Con due «settore» il secondo vincerebbe in silenzio, e metà del file
    // finirebbe in archivio diversa da come si legge nel foglio.
    expect(() => leggiCsv('settore;settore\nA;B\n')).toThrow(/ripete una colonna/)
  })

  it('rifiuta un\u2019intestazione con una colonna senza nome', () => {
    expect(() => leggiCsv('a;;c\n1;2;3\n')).toThrow(/senza nome/)
  })

  it('non lascia passare caratteri di controllo', () => {
    // Tabulazioni e byte di controllo arrivano dai gestionali di provenienza:
    // in una cella non significano niente, e passerebbero intatti in ogni
    // esportazione successiva.
    const r = leggiCsv('nome;posta\nAnna\u0009Rossi;\u0007anna@x.it \n')[0]!
    expect(r.nome).toBe('Anna Rossi')
    expect(r.posta).toBe('anna@x.it')
  })

  it('si ferma davanti a un file troppo lungo', () => {
    expect(() => leggiCsv('a;b\n' + '1;2\n'.repeat(5001))).toThrow(/il massimo è 5000/)
  })

  it('vuole almeno una riga oltre all\u2019intestazione', () => {
    expect(() => leggiCsv('a;b\n')).toThrow(/oltre all/)
  })
})

describe('conversioni', () => {
  it('riconosce i modi in cui si scrive sì in un foglio', () => {
    for (const v of ['si', 'sì', 'X', 'true', '1', 'VERO']) expect(si(v)).toBe(true)
    for (const v of ['no', '', '0', undefined]) expect(si(v)).toBe(false)
  })

  it('riconosce una data ISO e un indirizzo plausibile', () => {
    expect(ISO.test('2026-12-24')).toBe(true)
    expect(ISO.test('24/12/2026')).toBe(false)
    for (const v of ['anna.ros@comune.it', 'a@b.co']) expect(EMAIL.test(v)).toBe(true)
    for (const v of ['anna', 'anna@', '@comune.it', 'anna ros@comune.it', 'a@b']) {
      expect(EMAIL.test(v)).toBe(false)
    }
  })

  it('dice quale colonna non ci sta', () => {
    expect(lungo('abc', 5, 'nome')).toBeNull()
    expect(lungo('abcdef', 5, 'nome')).toMatch(/«nome» supera i 5/)
  })
})
