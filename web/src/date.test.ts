import { describe, expect, it } from 'vitest'
import { addDays, descriviSettimana, lunediDi, pezziData, settimanaIso } from './date'

describe('giornate di calendario', () => {
  it('somma giorni scavalcando i mesi e gli anni', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    // Il 2028 è bisestile: senza il 29 la data sbaglierebbe di un giorno.
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('riporta al lunedì, e su un lunedì non si muove', () => {
    expect(lunediDi('2026-09-09')).toBe('2026-09-07')
    expect(lunediDi('2026-09-07')).toBe('2026-09-07')
    // La domenica appartiene alla settimana che la precede, non a quella dopo.
    expect(lunediDi('2026-09-13')).toBe('2026-09-07')
  })

  it('legge la data in UTC, non nel fuso di chi guarda', () => {
    expect(pezziData('2026-09-07')).toMatchObject({ giorno: 7, breve: 'lun', lunedi: true })
    expect(pezziData('2026-09-13')).toMatchObject({ breve: 'dom', lunedi: false })
  })
})

// La regola ISO — la settimana appartiene all'anno del suo giovedì — conta
// soltanto a cavallo del capodanno. È lì che va provata.
describe('numero di settimana ISO', () => {
  it('conta le settimane dentro l\'anno', () => {
    expect(settimanaIso('2026-09-07')).toBe(37)
    expect(settimanaIso('2026-09-13')).toBe(37)
  })

  it('assegna il capodanno alla settimana del suo giovedì', () => {
    // Il 2026 comincia di giovedì: il 1º gennaio è già settimana 1, e quella
    // settimana comincia il 29 dicembre dell'anno prima.
    expect(settimanaIso('2026-01-01')).toBe(1)
    expect(settimanaIso('2025-12-29')).toBe(1)
    // Il 2027 comincia di venerdì: il 1º gennaio è ancora la 53ª del 2026.
    expect(settimanaIso('2027-01-01')).toBe(53)
    expect(settimanaIso('2024-12-30')).toBe(1)
  })
})

describe('didascalia della settimana', () => {
  it('nomina il mese una volta sola quando la settimana non lo scavalca', () => {
    expect(descriviSettimana('2026-09-09')).toBe('Settimana 37 · 7 – 13 settembre')
  })

  it('nomina tutti e due i mesi quando la settimana passa da uno all\'altro', () => {
    expect(descriviSettimana('2026-10-02')).toBe('Settimana 40 · 28 settembre – 4 ottobre')
  })

  it('regge il salto d\'anno', () => {
    expect(descriviSettimana('2027-01-01')).toBe('Settimana 53 · 28 dicembre – 3 gennaio')
  })
})
