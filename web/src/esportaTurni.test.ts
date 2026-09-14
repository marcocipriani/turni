import { describe, expect, it } from 'vitest'
import { csvDaGiorni, csvDaGriglia, layoutPngGiorni, layoutPngGriglia } from './esportaTurni'
import { griglia } from './pagine/documentiTurni.test'
import type { DatiGiorni } from './pagine/Giorni'

const chi = (userId: number, cognome: string, nome: string, sectorId: number | null) =>
  ({ userId, nome, cognome, unitId: 1, sectorId })

const giorni: DatiGiorni = {
  da: '2026-09-14', a: '2026-09-20', periodiPubblicati: 1,
  stanze: [
    { id: 1, etichetta: '1028', soprannome: null, piano: null, capienza: 2 },
    { id: 2, etichetta: '1032', soprannome: null, piano: null, capienza: 2 },
    { id: 3, etichetta: '3016', soprannome: null, piano: null, capienza: 3 },
  ],
  stanzeRiservate: [],
  settori: [{ id: 1, nome: 'Segreteria' }, { id: 2, nome: 'Statistica' }],
  persone: [],
  giorni: [
    {
      data: '2026-09-14', feriale: true, festivo: null, capienza: 7, ioCiSono: false, ioAssente: false,
      presenti: [{ ...chi(1, 'Rossi', 'Anna', 1), roomId: 3, scrivania: '2' }],
      remoti: [chi(2, 'Verdi', 'Luca', 2), chi(3, 'Dell"Acqua', 'Gigi; jr', null)],
      assenti: [chi(4, 'Neri', 'Ada', 1)],
    },
    {
      data: '2026-09-19', feriale: false, festivo: null, capienza: 7, ioCiSono: false, ioAssente: false,
      presenti: [{ ...chi(1, 'Rossi', 'Anna', 1), roomId: 3, scrivania: null }], remoti: [], assenti: [],
    },
  ],
}

describe('CSV delle viste', () => {
  it('Settimana: una riga per persona nelle sole giornate programmate', () => {
    const csv = csvDaGiorni(giorni)
    expect(csv.split('\r\n')[0]).toBe('data;persona;settore;stato;stanza;scrivania')
    expect(csv).toContain('2026-09-14;Rossi Anna;Segreteria;presenza;3016;2')
    expect(csv).toContain('2026-09-14;Verdi Luca;Statistica;smart;;')
    expect(csv).toContain('2026-09-14;Neri Ada;Segreteria;assenza;;')
    expect(csv).not.toContain('2026-09-19')
  })

  it('protegge punti e virgola, virgolette e a capo', () => {
    expect(csvDaGiorni(giorni)).toContain('2026-09-14;"Dell""Acqua Gigi; jr";;smart;;')
  })

  it('Mese e Griglia: le celle che esistono, non i giorni scoperti', () => {
    const csv = csvDaGriglia(griglia)
    expect(csv).toContain('2026-09-14;Rossi X;Statistica;presenza;3016;')
    expect(csv).toContain('2026-09-14;Bianchi X;Statistica;assenza;;')
    expect(csv).toContain('2026-09-21;Rossi X;Statistica;smart;;')
    expect(csv).not.toContain('2026-09-15')
  })
})

describe('impaginazione dei PNG', () => {
  it('Settimana: le card della stampa giorno per giorno, solo feriali', () => {
    const l = layoutPngGiorni(giorni)
    expect(l.giorni).toHaveLength(1)
    expect(l.giorni[0]!.schede).toHaveLength(5)
  })

  it('Griglia: gruppi, settimane, occupazione e legenda', () => {
    const l = layoutPngGriglia(griglia, true)
    expect(l.righe.filter((r) => r.tipo === 'gruppo').map((r) => r.titolo)).toEqual(['Segreteria', 'Statistica'])
    expect(l.colonne.map((c) => c.inizioSettimana)).toEqual([false, false, true])
    expect(l.righe.at(-1)?.tipo).toBe('occupazione-stanza')
    expect(l.legenda).toEqual(['stanza = in sede', '⌂ = smart working', '× = assenza'])
  })
})
