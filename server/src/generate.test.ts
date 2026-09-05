import { describe, expect, it } from 'vitest'
import { generate, type GenerateInput, type Persona } from './generate'
import { easterSunday, italianHolidays, weekKey, workingDays } from './lib/dates'

function persona(id: number, cognome: string, sectorId: number | null = null): Persona {
  return { userId: id, cognome, sectorId, giorniPreferiti: [], giorniDaEvitare: [] }
}

/** Due settimane piene di settembre 2026: lun 7 → ven 18. */
const GIORNI = workingDays('2026-09-07', '2026-09-18', new Set())

function base(over: Partial<GenerateInput> = {}): GenerateInput {
  return {
    giorni: GIORNI,
    persone: [persona(1, 'Bianchi'), persona(2, 'Rossi'), persona(3, 'Verdi'), persona(4, 'Neri')],
    stanze: [{ roomId: 10, capienza: 2 }],
    bloccate: [],
    indisponibili: new Set(),
    regole: new Map(),
    presidioSettori: [],
    smartMinSettimana: null,
    smartMaxSettimana: null,
    ...over,
  }
}

describe('calendario', () => {
  it('calcola la Pasqua su anni noti', () => {
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
    expect(easterSunday(2030)).toBe('2030-04-21')
  })

  it('include la Pasquetta fra le festività italiane', () => {
    const date = italianHolidays(2026).map((h) => h.data)
    expect(date).toContain('2026-04-06')
    expect(date).toContain('2026-12-25')
    expect(date).toHaveLength(11)
  })

  it('esclude weekend e festività dalle giornate lavorative', () => {
    // 24 giovedì, 25 festivo, 26 sabato, 27 domenica, 28 lunedì
    const gg = workingDays('2026-12-24', '2026-12-28', new Set(['2026-12-25', '2026-12-26']))
    expect(gg).toEqual(['2026-12-24', '2026-12-28'])
  })
})

describe('generazione', () => {
  it('è deterministica: stesso ingresso, stessa uscita', () => {
    const a = generate(base())
    const b = generate(base())
    expect(a.assegnazioni).toEqual(b.assegnazioni)
    expect(a.quote).toEqual(b.quote)
  })

  it('la somma delle quote è esattamente il numero di posti-giorno disponibili', () => {
    const r = generate(base())
    expect(r.quote.reduce((s, q) => s + q.quota, 0)).toBe(2 * GIORNI.length)
  })

  it('non supera mai la capienza delle stanze', () => {
    const r = generate(base())
    const perGiorno = new Map<string, number>()
    for (const a of r.assegnazioni) {
      if (a.stato !== 'presenza') continue
      perGiorno.set(a.data, (perGiorno.get(a.data) ?? 0) + 1)
    }
    for (const n of perGiorno.values()) expect(n).toBeLessThanOrEqual(2)
  })

  it('assegna una stanza a ogni presenza e nessuna stanza al lavoro agile', () => {
    const r = generate(base())
    for (const a of r.assegnazioni) {
      if (a.stato === 'presenza') expect(a.roomId).toBe(10)
      else expect(a.roomId).toBeNull()
    }
  })

  it('non modifica mai una cella bloccata', () => {
    const r = generate(base({
      bloccate: [
        { userId: 3, data: '2026-09-07', stato: 'presenza', roomId: 10 },
        { userId: 1, data: '2026-09-08', stato: 'smart', roomId: null },
      ],
    }))
    const cella = (u: number, d: string) => r.assegnazioni.find((a) => a.userId === u && a.data === d)!
    expect(cella(3, '2026-09-07').stato).toBe('presenza')
    expect(cella(1, '2026-09-08').stato).toBe('smart')
  })

  it('non programma mai una presenza su una giornata di assenza dichiarata', () => {
    const indisponibili = new Set(GIORNI.map((d) => `2|${d}`))
    const r = generate(base({ indisponibili }))
    expect(r.assegnazioni.filter((a) => a.userId === 2 && a.stato === 'presenza')).toHaveLength(0)
    // Chi non ha giornate disponibili riceve quota zero: non è sotto quota, non ne ha una.
    expect(r.quote.find((q) => q.userId === 2)?.quota).toBe(0)
  })

  it('rispetta il minimo settimanale di lavoro agile', () => {
    const r = generate(base({ stanze: [{ roomId: 10, capienza: 4 }], smartMinSettimana: 3 }))
    const perSettimana = new Map<string, number>()
    for (const a of r.assegnazioni) {
      if (a.stato !== 'presenza') continue
      const k = `${a.userId}|${weekKey(a.data)}`
      perSettimana.set(k, (perSettimana.get(k) ?? 0) + 1)
    }
    for (const n of perSettimana.values()) expect(n).toBeLessThanOrEqual(2)
  })

  it('copre ogni giornata il settore soggetto a presidio', () => {
    const persone = [persona(1, 'Bianchi', 100), persona(2, 'Rossi', 200), persona(3, 'Verdi', 200), persona(4, 'Neri', 200)]
    const r = generate(base({ persone, presidioSettori: [100] }))
    expect(r.presidiScoperti).toHaveLength(0)
  })

  it('non usa una persona senza settore per coprire un presidio', () => {
    const persone = [persona(1, 'Bianchi', null), persona(2, 'Rossi', null)]
    const r = generate(base({ persone, presidioSettori: [100], stanze: [{ roomId: 10, capienza: 1 }] }))
    expect(r.presidiScoperti).toHaveLength(GIORNI.length)
  })

  it('distribuisce le presenze sul periodo invece di addensarle in testa', () => {
    const r = generate(base())
    const prima = r.assegnazioni.filter((a) => a.stato === 'presenza' && a.data <= '2026-09-11').length
    const dopo = r.assegnazioni.filter((a) => a.stato === 'presenza' && a.data > '2026-09-11').length
    expect(Math.abs(prima - dopo)).toBeLessThanOrEqual(2)
  })
})
