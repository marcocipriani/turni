import { describe, expect, it } from 'vitest'
import { type Collega, type GiornoMio, prossimeInsieme, rigaImmagine } from './Mio'

const g = (x: Partial<GiornoMio>): GiornoMio => ({
  data: '2026-09-11', stato: 'presenza', causale: null, periodId: 1, roomId: null,
  scrivania: null, bloccata: false, colleghi: [], ...x,
})
const stanze = new Map([[7, { etichetta: '101' }]])

describe('rigaImmagine', () => {
  it('in sede: stanza e scrivania, o da assegnare', () => {
    expect(rigaImmagine(g({ roomId: 7, scrivania: '3' }), stanze)).toEqual(['In sede', '101 · scriv. 3'])
    expect(rigaImmagine(g({}), stanze)).toEqual(['In sede', 'da assegnare'])
  })
  it('assenza con causale, remoto senza dove', () => {
    expect(rigaImmagine(g({ stato: 'assenza', causale: 'Ferie' }), stanze)).toEqual(['Assenza · Ferie', ''])
    expect(rigaImmagine(g({ stato: 'smart', roomId: 7 }), stanze)).toEqual(['Da remoto', ''])
  })
})

describe('prossimeInsieme', () => {
  const col = (userId: number): Collega =>
    ({ userId, nome: 'N', cognome: 'C', sectorId: null, roomId: null, scrivania: null })
  const giorni = [
    g({ data: '2026-09-14', colleghi: [col(5)] }),
    g({ data: '2026-09-15', colleghi: [col(6)] }),
    g({ data: '2026-09-16', colleghi: [col(5), col(6)] }),
    g({ data: '2026-09-17', stato: 'smart', colleghi: [] }),
    g({ data: '2026-09-18', colleghi: [col(5)] }),
    g({ data: '2026-09-21', colleghi: [col(5)] }),
  ]
  it('dà le prossime date insieme dopo quella indicata', () => {
    expect(prossimeInsieme(giorni, 5, '2026-09-14')).toEqual(['2026-09-16', '2026-09-18', '2026-09-21'])
  })
  it('si ferma a quante ne servono', () => {
    expect(prossimeInsieme(giorni, 5, '2026-09-13', 2)).toEqual(['2026-09-14', '2026-09-16'])
  })
  it('è vuota se non ci si incontra più', () => {
    expect(prossimeInsieme(giorni, 6, '2026-09-16')).toEqual([])
  })
})
