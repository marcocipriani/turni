import { describe, expect, it } from 'vitest'
import { type Anagrafica, type CellaGiorno, dividiGiornata } from './giornata'

const persone = new Map<number, Anagrafica>([
  [1, { id: 1, nome: 'Elena', cognome: 'Rossi', unitId: 2, sectorId: 1 }],
  [2, { id: 2, nome: 'Luca', cognome: 'Bianchi', unitId: 2, sectorId: 1 }],
  [3, { id: 3, nome: 'Ugo', cognome: 'Alberti', unitId: 2, sectorId: 2 }],
])
const scrivanie = new Map([[10, '4']])
const cella = (userId: number, stato: 'presenza' | 'smart', roomId: number | null = null,
  deskId: number | null = null): CellaGiorno => ({ userId, stato, roomId, deskId })

const G = '2026-09-07'

describe('divisione della giornata', () => {
  it('separa sede e remoto, e riporta stanza e scrivania di chi c\'è', () => {
    const { presenti, remoti, assenti } = dividiGiornata(
      G, [cella(1, 'presenza', 5, 10), cella(2, 'smart')], persone, new Set(), scrivanie)
    expect(presenti).toEqual([{
      userId: 1, nome: 'Elena', cognome: 'Rossi', unitId: 2, sectorId: 1, roomId: 5, scrivania: '4',
    }])
    expect(remoti.map((x) => x.cognome)).toEqual(['Bianchi'])
    expect(assenti).toEqual([])
  })

  // È la regola che tiene in piedi tutta la riservatezza della pagina.
  it('l\'assenza dichiarata vince sulla cella, anche se la cella dice «in sede»', () => {
    const { presenti, assenti } = dividiGiornata(
      G, [cella(1, 'presenza', 5)], persone, new Set([`1|${G}`]), scrivanie)
    expect(presenti).toEqual([])
    expect(assenti.map((x) => x.cognome)).toEqual(['Rossi'])
  })

  it('chi guarda senza titolo vede l\'assente fra i remoti, non fra gli assenti', () => {
    // Stessa giornata, stesse celle: cambia solo l'insieme delle assenze che
    // chi chiama ha avuto il permesso di caricare.
    const celle = [cella(1, 'smart'), cella(2, 'presenza', 5)]
    const conTitolo = dividiGiornata(G, celle, persone, new Set([`1|${G}`]), scrivanie)
    const senzaTitolo = dividiGiornata(G, celle, persone, new Set(), scrivanie)

    expect(conTitolo.assenti.map((x) => x.cognome)).toEqual(['Rossi'])
    expect(conTitolo.remoti).toEqual([])
    expect(senzaTitolo.assenti).toEqual([])
    expect(senzaTitolo.remoti.map((x) => x.cognome)).toEqual(['Rossi'])
    // In tutti e due i casi la somma è la stessa: nessuno sparisce, e nessuno
    // può dedurre un'assenza da un conto che non torna.
    const totale = (r: ReturnType<typeof dividiGiornata>) =>
      r.presenti.length + r.remoti.length + r.assenti.length
    expect(totale(conTitolo)).toBe(totale(senzaTitolo))
  })

  it('ignora le celle di chi non è più in forza', () => {
    const r = dividiGiornata(G, [cella(99, 'presenza', 5)], persone, new Set(), scrivanie)
    expect(r.presenti).toEqual([])
  })

  it('mette ogni elenco in ordine di cognome', () => {
    const r = dividiGiornata(
      G, [cella(1, 'smart'), cella(3, 'smart'), cella(2, 'smart')], persone, new Set(), scrivanie)
    expect(r.remoti.map((x) => x.cognome)).toEqual(['Alberti', 'Bianchi', 'Rossi'])
  })

  it('accetta indifferentemente un insieme o la mappa delle causali', () => {
    const mappa = new Map([[`1|${G}`, 'ferie']])
    expect(dividiGiornata(G, [cella(1, 'smart')], persone, mappa, scrivanie).assenti).toHaveLength(1)
  })

  it('non lascia uscire la causale: negli elenchi ci sono solo anagrafiche', () => {
    const r = dividiGiornata(G, [cella(1, 'smart')], persone, new Map([[`1|${G}`, 'ferie']]), scrivanie)
    expect(JSON.stringify(r)).not.toContain('ferie')
  })
})
