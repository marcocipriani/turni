import { describe, expect, it } from 'vitest'
import { sforamenti } from './capienza'

const stanze = [{ roomId: 1, capienza: 2, etichetta: '1028' }, { roomId: 2, capienza: 3, etichetta: '3016' }]
const c = (data: string, roomId: number | null, stato = 'presenza') => ({ data, roomId, stato })

describe('capienza per stanza', () => {
  it('segnala la stanza sforata nel giorno in cui succede', () => {
    const celle = [c('2026-09-14', 1), c('2026-09-14', 1), c('2026-09-14', 1), c('2026-09-14', 2)]
    expect(sforamenti(celle, stanze, ['2026-09-14'])).toEqual([
      { data: '2026-09-14', etichetta: '1028', presenti: 3, capienza: 2 },
    ])
  })
  it('stanza piena non è sforata; il lavoro da remoto non conta', () => {
    const celle = [c('2026-09-14', 1), c('2026-09-14', 1), c('2026-09-14', null, 'smart')]
    expect(sforamenti(celle, stanze, ['2026-09-14'])).toEqual([])
  })
})
