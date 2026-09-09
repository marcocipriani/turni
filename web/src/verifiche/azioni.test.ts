/**
 * Le due decisioni dentro le azioni: che faccia fa il bottone, e quale riga è
 * nata adesso. Sono funzioni pure apposta — la parte con gli hook è impalcatura
 * di React, questa è la logica che si può sbagliare.
 */
import { describe, expect, it } from 'vitest'
import { nuoviId, statoBottone, statoPerChiave } from '../azioni'

describe('faccia del bottone', () => {
  it('mentre lavora dice che sta lavorando', () => {
    expect(statoBottone(true, false)).toBe('attesa')
  })

  it('finito, dice fatto', () => {
    expect(statoBottone(false, true)).toBe('fatto')
  })

  it('a riposo non dice niente', () => {
    expect(statoBottone(false, false)).toBe('fermo')
  })

  it('l\'attesa batte la spunta: due azioni di fila non mostrano il vecchio esito', () => {
    // Ripremendo prima che la spunta svanisca, si riparte dall'attesa.
    expect(statoBottone(true, true)).toBe('attesa')
  })
})

describe('più bottoni, una sola azione', () => {
  it('reagisce solo quello premuto', () => {
    expect(statoPerChiave(7, 7, true, false)).toBe('attesa')
    expect(statoPerChiave(7, 8, true, false)).toBe('fermo')
  })

  it('senza nessuna chiave attiva nessuno si muove', () => {
    expect(statoPerChiave(null, 7, true, false)).toBe('fermo')
  })

  it('la spunta resta su quello giusto', () => {
    expect(statoPerChiave('a', 'a', false, true)).toBe('fatto')
    expect(statoPerChiave('a', 'b', false, true)).toBe('fermo')
  })
})

describe('righe appena nate', () => {
  it('al primo caricamento non è nato niente: c\'era già tutto', () => {
    // Senza questo, aprendo la pagina si illuminerebbe l'elenco intero.
    expect(nuoviId(null, [1, 2, 3]).size).toBe(0)
  })

  it('trova quella comparsa', () => {
    expect([...nuoviId([1, 2], [1, 2, 3])]).toEqual([3])
  })

  it('non conta come nuovo quello che è solo cambiato di posto', () => {
    expect(nuoviId([1, 2, 3], [3, 1, 2]).size).toBe(0)
  })

  it('una cancellazione non fa nascere niente', () => {
    expect(nuoviId([1, 2, 3], [1, 3]).size).toBe(0)
  })

  it('regge più nascite insieme', () => {
    expect([...nuoviId([1], [1, 2, 3])]).toEqual([2, 3])
  })

  it('funziona anche con chiavi che non sono numeri', () => {
    expect([...nuoviId(['a'], ['a', 'b'])]).toEqual(['b'])
  })
})
