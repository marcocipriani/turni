import { describe, expect, it } from 'vitest'
import type { Cella, Persona } from '../api'
import { descriviCella, scambio } from './Griglia'

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

describe('scambio trascinando', () => {
  const a = cella({ userId: 1, data: '2026-09-14', stato: 'presenza', roomId: 3, deskId: 9 })
  const b = cella({ userId: 2, data: '2026-09-14', stato: 'smart' })

  it('in verticale scambia le giornate di due persone, e le blocca', () => {
    expect(scambio(a, b)).toEqual([
      { userId: 1, data: '2026-09-14', stato: 'smart', roomId: null, deskId: null, bloccata: true },
      { userId: 2, data: '2026-09-14', stato: 'presenza', roomId: 3, deskId: 9, bloccata: true },
    ])
  })
  it('in orizzontale sposta lo smart della stessa persona, senza portarsi dietro la scrivania', () => {
    const c = cella({ userId: 1, data: '2026-09-16', stato: 'smart' })
    expect(scambio(a, c)).toEqual([
      { userId: 1, data: '2026-09-14', stato: 'smart', roomId: null, deskId: null, bloccata: true },
      { userId: 1, data: '2026-09-16', stato: 'presenza', roomId: 3, deskId: null, bloccata: true },
    ])
  })
  it('non tocca le assenze né incrocia persone e giorni diversi', () => {
    expect(scambio(a, cella({ userId: 2, data: '2026-09-14', stato: 'assenza' }))).toBeNull()
    expect(scambio(a, cella({ userId: 2, data: '2026-09-15', stato: 'smart' }))).toBeNull()
    expect(scambio(a, a)).toBeNull()
  })
})
