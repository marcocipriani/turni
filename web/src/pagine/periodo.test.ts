import { describe, expect, it } from 'vitest'
import type { Periodo } from '../api'
import { addDays, oggiISO } from '../date'
import { periodoDiRiferimento } from './periodo'

const p = (id: number, dataInizio: string, dataFine: string): Periodo => ({
  id, unitId: 1, dataInizio, dataFine, stato: 'pubblicato', versione: 1, assegnaScrivanie: false,
  smartMinSettimana: null, smartMaxSettimana: null, notaApprovazione: null,
  pubblicatoIl: null, aggiornatoIl: null, revisioneDi: null, notaRichiesta: null,
})

// L'elenco arriva dal server ordinato per data di inizio decrescente.
const oggi = oggiISO()
const futuro = p(3, addDays(oggi, 30), addDays(oggi, 60))
const corrente = p(2, addDays(oggi, -3), addDays(oggi, 10))
const passato = p(1, addDays(oggi, -60), addDays(oggi, -30))

// Su questo periodo atterrano sia la griglia sia la stampa quando nessuno
// ne indica uno: se cambia, cambiano insieme.
describe('periodo di riferimento', () => {
  it('preferisce quello che contiene oggi', () => {
    expect(periodoDiRiferimento([futuro, corrente, passato])?.id).toBe(2)
  })

  it('senza uno corrente prende il più recente, cioè il primo dell’elenco', () => {
    expect(periodoDiRiferimento([futuro, passato])?.id).toBe(3)
  })

  it('su un elenco vuoto non inventa niente', () => {
    expect(periodoDiRiferimento([])).toBeNull()
  })
})
