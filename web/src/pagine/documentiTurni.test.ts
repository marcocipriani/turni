import { describe, expect, it } from 'vitest'
import type { Cella, Griglia, Persona } from '../api'
import {
  classeSettimana, elencoStanze, gruppiDocumento, occupazioneDocumento, schedeGiorno, simboloStampa,
} from './documentiTurni'
import type { Giorno, Stanza } from './Giorni'

const persona = (id: number, cognome: string, sectorId: number | null): Persona =>
  ({ id, nome: 'X', cognome, ruolo: 'dipendente', unitId: 1, sectorId, comeDirigenteDi: null })
const cella = (userId: number, data: string, over: Partial<Cella>): Cella =>
  ({ userId, data, stato: 'smart', roomId: null, deskId: null, bloccata: false, causale: null, ...over })
const stanzaVista = (id: number, etichetta: string, capienza: number) =>
  ({ id, etichetta, soprannome: null, piano: null, sede: null, riservataA: null, attiva: true, capienza, scrivanie: [] })

export const griglia: Griglia = {
  periodo: {
    id: 7, unitId: 1, dataInizio: '2026-09-14', dataFine: '2026-09-21', stato: 'pubblicato', versione: 1,
    assegnaScrivanie: false, smartMinSettimana: null, smartMaxSettimana: null, notaApprovazione: null,
    pubblicatoIl: null, aggiornatoIl: null, revisioneDi: null, notaRichiesta: null,
  },
  giorni: ['2026-09-14', '2026-09-15', '2026-09-21'],
  persone: [persona(1, 'Rossi', 2), persona(2, 'Verdi', 1), persona(3, 'Bianchi', 2)],
  settori: [
    { id: 1, unitId: 1, nome: 'Segreteria', richiedePresidio: false, ordine: 1 },
    { id: 2, unitId: 1, nome: 'Statistica', richiedePresidio: false, ordine: 2 },
  ],
  stanze: [stanzaVista(4, '1028', 2), stanzaVista(5, '3016', 3)],
  celle: [
    cella(1, '2026-09-14', { stato: 'presenza', roomId: 5 }),
    cella(2, '2026-09-14', { stato: 'presenza', roomId: 4 }),
    cella(3, '2026-09-14', { stato: 'assenza', perConto: true }),
    cella(1, '2026-09-21', { stato: 'smart' }),
  ],
  permessi: { scrivere: false, approvare: false }, avvisi: [],
}

describe('simboli della stampa', () => {
  it('una sola croce per le due assenze, casa per lo smart, numero per la stanza', () => {
    expect(simboloStampa({ stato: 'smart' })).toBe('casa')
    expect(simboloStampa({ stato: 'assenza', perConto: false })).toBe('×')
    expect(simboloStampa({ stato: 'assenza', perConto: true })).toBe('×')
    expect(simboloStampa({ stato: 'presenza', roomId: 5 }, griglia.stanze)).toBe('3016')
    expect(simboloStampa(undefined)).toBe('·')
  })
})

describe('matrice del documento', () => {
  it('conta le postazioni per giorno e per stanza', () => {
    const o = occupazioneDocumento(griglia)
    expect(o.totali.get('2026-09-14')).toBe(2)
    expect(o.stanze.get('2026-09-14|5')).toBe(1)
    expect(o.totali.get('2026-09-21')).toBeUndefined()
    expect(o.persone.get(1)).toBe(1)
    expect(o.persone.get(3)).toBeUndefined()
  })
  it('elenca le stanze con posti e media sulle giornate programmate', () => {
    expect(elencoStanze(griglia)).toEqual(['1028 · 2 posti · media 0,5/2', '3016 · 3 posti · media 0,5/3'])
  })
  it('raggruppa per settore nell\'ordine dei settori, o lascia un elenco solo', () => {
    expect(gruppiDocumento(griglia, true).map(g => g.titolo)).toEqual(['Segreteria', 'Statistica'])
    expect(gruppiDocumento(griglia, false)).toEqual([{ titolo: null, persone: griglia.persone }])
  })
  it('marca il lunedì che apre una settimana, non la prima colonna', () => {
    expect(classeSettimana('2026-09-14', 5)).toBe('inizio-settimana')
    expect(classeSettimana('2026-09-14', 0)).toBe('')
    expect(classeSettimana('2026-09-15', 6)).toBe('')
  })
})

describe('card della giornata', () => {
  const stanze: Stanza[] = [
    { id: 1, etichetta: '1028', soprannome: null, piano: null, capienza: 2 },
    { id: 2, etichetta: '1032', soprannome: null, piano: null, capienza: 2 },
    { id: 3, etichetta: '3016', soprannome: null, piano: null, capienza: 3 },
  ]
  const chi = (userId: number, cognome: string) =>
    ({ userId, nome: 'N', cognome, unitId: 1, sectorId: 1 })
  const giorno: Giorno = {
    data: '2026-09-14', feriale: true, festivo: null, capienza: 7, ioCiSono: false, ioAssente: false,
    presenti: [{ ...chi(1, 'Rossi'), roomId: 1, scrivania: '2' }, { ...chi(2, 'Neri'), roomId: 3, scrivania: null }],
    remoti: [chi(3, 'A'), chi(4, 'B'), chi(5, 'C'), chi(6, 'D')],
    assenti: [chi(7, 'E'), chi(8, 'F')],
  }

  it('ogni stanza, anche vuota, poi Smart working e Assenti', () => {
    const schede = schedeGiorno(giorno, stanze, [{ id: 1, nome: 'Segreteria' }])
    expect(schede.map(s => [s.titolo, s.contatore])).toEqual([
      ['1028', '1/2'], ['1032', '0/2'], ['3016', '1/3'],
      ['Smart working', '4'], ['Assenti', '2'],
    ])
    expect(schede[1]!.persone).toEqual([])
    expect(schede[0]!.persone).toEqual([{ userId: 1, nome: 'Rossi N', settore: 'Segreteria', scrivania: '2' }])
  })

  it('chi è in sede senza stanza non sparisce', () => {
    const g = { ...giorno, presenti: [{ ...chi(9, 'Gialli'), roomId: null, scrivania: null }] }
    expect(schedeGiorno(g, stanze, []).map(s => s.titolo)).toContain('Senza stanza')
  })
})
