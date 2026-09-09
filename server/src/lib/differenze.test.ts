import { describe, expect, it } from 'vitest'
import { celleIstantanea, type CellaVersione, confronta } from './differenze'

const c = (userId: number, data: string, stato: 'presenza' | 'smart', roomId: number | null = null):
  CellaVersione => ({ userId, data, stato, roomId })

describe('confronto fra due versioni', () => {
  it('tace su ciò che non è cambiato', () => {
    const celle = [c(1, '2026-09-07', 'presenza', 3), c(2, '2026-09-07', 'smart')]
    expect(confronta(celle, celle)).toEqual([])
  })

  it('segnala il passaggio da sede a remoto e viceversa', () => {
    const cambi = confronta([c(1, '2026-09-07', 'presenza', 3)], [c(1, '2026-09-07', 'smart')])
    expect(cambi).toEqual([{
      userId: 1, data: '2026-09-07', prima: 'presenza', dopo: 'smart', stanzaPrima: 3, stanzaDopo: null,
    }])
  })

  it('segnala lo spostamento di stanza, che è una modifica per chi la subisce', () => {
    const cambi = confronta([c(1, '2026-09-07', 'presenza', 3)], [c(1, '2026-09-07', 'presenza', 4)])
    expect(cambi).toHaveLength(1)
    expect(cambi[0]).toMatchObject({ prima: 'presenza', dopo: 'presenza', stanzaPrima: 3, stanzaDopo: 4 })
  })

  it('non conta due volte lo stesso cambiamento quando cade la stanza con lo stato', () => {
    // Chi passa da «stanza 3» a «da remoto» ha perso la stanza per forza: è un
    // cambiamento solo, e va raccontato una volta.
    expect(confronta([c(1, '2026-09-07', 'presenza', 3)], [c(1, '2026-09-07', 'smart')])).toHaveLength(1)
  })

  it('regge una giornata che compare o sparisce', () => {
    expect(confronta([], [c(1, '2026-09-07', 'presenza', 3)])[0])
      .toMatchObject({ prima: null, dopo: 'presenza', stanzaPrima: null, stanzaDopo: 3 })
    expect(confronta([c(1, '2026-09-07', 'presenza', 3)], [])[0])
      .toMatchObject({ prima: 'presenza', dopo: null, stanzaPrima: 3, stanzaDopo: null })
  })

  it('mette in fila per data e poi per persona', () => {
    const prima = [c(2, '2026-09-08', 'presenza'), c(1, '2026-09-08', 'presenza'), c(3, '2026-09-07', 'presenza')]
    const cambi = confronta(prima, [])
    expect(cambi.map((x) => `${x.data}/${x.userId}`))
      .toEqual(['2026-09-07/3', '2026-09-08/1', '2026-09-08/2'])
  })

  it('non può far uscire una causale: le istantanee non ne contengono', () => {
    // Il tipo lo impedisce, ma la regola vale la pena di restare scritta: se un
    // giorno «assenza» entrasse in `assignment`, questo test fallirebbe a
    // compilare e obbligherebbe a decidere come mascherarla.
    const stati = confronta([c(1, '2026-09-07', 'presenza')], [c(1, '2026-09-07', 'smart')])
      .flatMap((x) => [x.prima, x.dopo])
    expect(stati.every((s) => s === null || s === 'presenza' || s === 'smart')).toBe(true)
  })
})

// MariaDB tiene il JSON come testo e il driver lo riconsegna stringa. Prima che
// questo esistesse, il confronto girava sui caratteri della stringa e non se ne
// lamentava: ogni revisione risultava «tutti toccati», e li avvisava tutti.
describe('lettura di un\'istantanea', () => {
  const celle = [c(1, '2026-09-07', 'presenza', 3)]

  it('accetta un array già decodificato, come lo dà MySQL 8', () => {
    expect(celleIstantanea(celle)).toEqual(celle)
  })

  it('decodifica la stringa che dà MariaDB', () => {
    expect(celleIstantanea(JSON.stringify(celle))).toEqual(celle)
  })

  it('davanti a un\'istantanea illeggibile non impedisce la pubblicazione', () => {
    // Nel dubbio si perde il confronto e si avvisano tutti: meglio un avviso
    // di troppo che una revisione che non parte.
    expect(celleIstantanea('non è json')).toEqual([])
    expect(celleIstantanea('{"non":"un array"}')).toEqual([])
    expect(celleIstantanea(null)).toEqual([])
    expect(celleIstantanea(undefined)).toEqual([])
    expect(celleIstantanea('')).toEqual([])
  })

  it('il confronto regge una stringa da un capo e un array dall\'altro', () => {
    expect(confronta(celleIstantanea(JSON.stringify(celle)), celle)).toEqual([])
  })
})
