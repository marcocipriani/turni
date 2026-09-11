import { describe, expect, it } from 'vitest'
import { type GiornoMio, rigaImmagine } from './Mio'

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
