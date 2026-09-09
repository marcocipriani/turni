/**
 * Vibrazione e swipe: le due cose che il dito riceve e manda.
 *
 * Il browser qui non c'è: `navigator` e `localStorage` si mettono a mano, ed è
 * proprio quello che serve, perché i casi che rompono l'app sono quelli in cui
 * mancano davvero — iPhone senza l'API, finestra privata con lo storage
 * bloccato.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APTICO, apticoAcceso, apticoDisponibile, direzioneSwipe, impostaAptico, vibra } from '../tocco'

/** Un magazzino locale finto, con la possibilità di farlo lanciare. */
function magazzino({ rotto = false } = {}) {
  const dentro = new Map<string, string>()
  return {
    dentro,
    getItem: (k: string) => { if (rotto) throw new Error('storage bloccato'); return dentro.get(k) ?? null },
    setItem: (k: string, v: string) => { if (rotto) throw new Error('storage bloccato'); dentro.set(k, v) },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('direzione di uno swipe', () => {
  it('a sinistra manda avanti, a destra indietro', () => {
    expect(direzioneSwipe(-80, 4)).toBe(1)
    expect(direzioneSwipe(80, -4)).toBe(-1)
  })

  it('sotto soglia non è uno swipe: è un tocco storto', () => {
    expect(direzioneSwipe(-40, 0)).toBe(0)
    expect(direzioneSwipe(60, 0)).toBe(0)
    expect(direzioneSwipe(61, 0)).toBe(-1)
  })

  it('in diagonale non è uno swipe: sta scorrendo la pagina', () => {
    expect(direzioneSwipe(-80, 50)).toBe(0)
    expect(direzioneSwipe(-80, -50)).toBe(0)
  })

  it('fermo non è niente', () => {
    expect(direzioneSwipe(0, 0)).toBe(0)
  })
})

describe('vibrazione', () => {
  it('vibra quando c\'è l\'API ed è accesa', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('localStorage', magazzino())
    vibra(APTICO.conferma)
    expect(vibrate).toHaveBeenCalledWith(APTICO.conferma)
  })

  it('non fa niente dove l\'API non esiste: è il caso di iPhone', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('localStorage', magazzino())
    expect(() => vibra()).not.toThrow()
    expect(apticoDisponibile()).toBe(false)
  })

  it('tace quando la preferenza è spenta', () => {
    const vibrate = vi.fn()
    const store = magazzino()
    vi.stubGlobal('navigator', { vibrate })
    vi.stubGlobal('localStorage', store)

    impostaAptico(false)
    expect(apticoAcceso()).toBe(false)
    vibrate.mockClear()
    vibra()
    expect(vibrate).not.toHaveBeenCalled()

    impostaAptico(true)
    expect(apticoAcceso()).toBe(true)
    vibra()
    expect(vibrate).toHaveBeenCalled()
  })

  it('un feedback mancato non porta giù il comando', () => {
    // Alcuni browser rifiutano la chiamata fuori da un gesto, e lo fanno
    // lanciando: chi ha chiesto di pubblicare deve pubblicare lo stesso.
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('gesto assente') } })
    vi.stubGlobal('localStorage', magazzino())
    expect(() => vibra(APTICO.errore)).not.toThrow()
  })

  it('con lo storage bloccato la preferenza torna al valore di partenza', () => {
    // Finestra privata: `localStorage` lancia invece di rispondere. Se la
    // lettura non fosse protetta, il menu utente non si disegnerebbe.
    vi.stubGlobal('navigator', { vibrate: vi.fn() })
    vi.stubGlobal('localStorage', magazzino({ rotto: true }))
    expect(() => apticoAcceso()).not.toThrow()
    expect(apticoAcceso()).toBe(true)
    expect(() => impostaAptico(false)).not.toThrow()
  })
})
