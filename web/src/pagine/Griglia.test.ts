import { describe, expect, it } from 'vitest'
import type { Cella, Persona } from '../api'
import { descriviCella } from './Griglia'

const p: Persona = { id: 1, nome: 'Elena', cognome: 'Marchetti', ruolo: 'dipendente', unitId: 2, sectorId: 1, comeDirigenteDi: null }
const cella = (over: Partial<Cella>): Cella => ({
  userId: 1, data: '2026-09-07', stato: 'smart', roomId: null, deskId: null, bloccata: false, causale: null, ...over,
})

// Ogni cella della griglia deve essere leggibile da uno screen reader senza
// dipendere dal colore né dalla posizione: questo è quel contratto.
describe('etichetta testuale della cella', () => {
  it('descrive la presenza con stanza e scrivania', () => {
    expect(descriviCella(p, '2026-09-07', cella({ stato: 'presenza', roomId: 3, deskId: 9 }), '101', '4'))
      .toBe('Marchetti Elena, lun 7 settembre, in sede, stanza 101, scrivania 4')
  })

  it('dice chi ha registrato un\'assenza per conto', () => {
    expect(descriviCella(p, '2026-09-07', cella({ stato: 'assenza', perConto: true }), null, null))
      .toBe('Marchetti Elena, lun 7 settembre, assenza registrata dall\'organizzazione')
  })

  it('segnala una cella bloccata', () => {
    expect(descriviCella(p, '2026-09-07', cella({ stato: 'presenza', roomId: 3, bloccata: true }), '101', null))
      .toContain('cella bloccata')
  })

  it('descrive il lavoro da remoto senza alcun riferimento allo spazio', () => {
    expect(descriviCella(p, '2026-09-08', cella({}), null, null))
      .toBe('Marchetti Elena, mar 8 settembre, da remoto')
  })

  it('riporta la causale solo quando è stata fornita', () => {
    expect(descriviCella(p, '2026-09-09', cella({ stato: 'assenza', causale: 'ferie' }), null, null))
      .toBe('Marchetti Elena, mer 9 settembre, assenza dichiarata, causale ferie')
    expect(descriviCella(p, '2026-09-09', cella({ stato: 'assenza' }), null, null))
      .toBe('Marchetti Elena, mer 9 settembre, assenza dichiarata')
  })
})
