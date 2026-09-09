import { describe, expect, it } from 'vitest'
import {
  type Chi, didascalieSettore, fraseStanze, ordinaPersone, perStanza, type Presente, type Stanza,
  type StanzaRiservata,
} from './Giorni'

const chi = (userId: number, cognome: string, nome: string, sectorId: number | null): Chi =>
  ({ userId, nome, cognome, unitId: 1, sectorId })

const settori = new Map([[1, 'Contabilità'], [2, 'Segreteria']])

describe('ordine delle persone nella giornata', () => {
  const gente = [
    chi(1, 'Rossi', 'Anna', 2),
    chi(2, 'Bianchi', 'Luca', null),
    chi(3, 'Rossi', 'Elena', 1),
    chi(4, 'Alberti', 'Ugo', 2),
  ]

  it('per cognome mette in fila tutti, e il nome decide i pari merito', () => {
    expect(ordinaPersone(gente, 'cognome', settori).map((p) => `${p.cognome} ${p.nome}`))
      .toEqual(['Alberti Ugo', 'Bianchi Luca', 'Rossi Anna', 'Rossi Elena'])
  })

  it('per settore raggruppa in ordine alfabetico di settore, e dentro per cognome', () => {
    expect(ordinaPersone(gente, 'settore', settori).map((p) => p.cognome))
      .toEqual(['Rossi', 'Alberti', 'Rossi', 'Bianchi'])
    // Contabilità (Rossi Elena) → Segreteria (Alberti, Rossi Anna) → senza settore.
    expect(ordinaPersone(gente, 'settore', settori)[0]!.nome).toBe('Elena')
  })

  it('lascia in fondo chi non ha settore, invece di trattarlo come un settore senza nome', () => {
    expect(ordinaPersone(gente, 'settore', settori).at(-1)!.cognome).toBe('Bianchi')
  })

  it('non tocca l\'elenco ricevuto', () => {
    const originale = [...gente]
    ordinaPersone(gente, 'settore', settori)
    expect(gente).toEqual(originale)
  })
})

describe('suddivisione della giornata per stanza', () => {
  const stanze: Stanza[] = [
    { id: 10, etichetta: '101', soprannome: 'Sala nord', piano: 'Primo', capienza: 3 },
    { id: 11, etichetta: '102', soprannome: null, piano: 'Primo', capienza: 2 },
    { id: 12, etichetta: '103', soprannome: null, piano: 'Primo', capienza: 4 },
  ]
  const presente = (userId: number, cognome: string, roomId: number | null): Presente =>
    ({ ...chi(userId, cognome, 'X', null), roomId, scrivania: null })

  const presenti = [
    presente(1, 'Rossi', 10),
    presente(2, 'Bianchi', 11),
    presente(3, 'Verdi', null),
    // Stanza non più fra quelle attive: chi ci sedeva non deve sparire dal foglio.
    presente(4, 'Neri', 99),
  ]

  it('elenca solo le stanze che hanno qualcuno, nell\'ordine in cui sono censite', () => {
    const { gruppi } = perStanza(presenti, stanze)
    expect(gruppi.map((g) => g.stanza.etichetta)).toEqual(['101', '102'])
    expect(gruppi[0]!.dentro.map((p) => p.cognome)).toEqual(['Rossi'])
  })

  it('raccoglie senza stanza sia chi non ne ha una sia chi ne ha una sconosciuta', () => {
    expect(perStanza(presenti, stanze).senza.map((p) => p.cognome)).toEqual(['Verdi', 'Neri'])
  })

  it('conta le stanze libere invece di elencarle riga per riga', () => {
    expect(perStanza(presenti, stanze).libere.map((s) => s.etichetta)).toEqual(['103'])
  })

  it('con nessuno in sede sono libere tutte', () => {
    expect(perStanza([], stanze).libere).toHaveLength(3)
    expect(perStanza([], stanze).gruppi).toHaveLength(0)
  })
})

describe('avviso: le stanze dette a parole', () => {
  const stanza = (etichetta: string, soprannome: string | null, piano: string | null, capienza: number): Stanza =>
    ({ id: etichetta.length, etichetta, soprannome, piano, capienza })

  it('scrive la frase dell\'ufficio vero, com\'è in archivio', () => {
    const frasi = fraseStanze(
      [
        stanza('1028', 'Stanza del Protocollo', 'Primo piano', 5),
        stanza('1032', null, 'Primo piano', 2),
      ],
      [{
        ...stanza('2087', null, 'Secondo piano', 1),
        persona: { id: 3, nome: 'Sonia', cognome: 'Sanzo', ruolo: 'dirigente' },
      }],
    )
    expect(frasi[0]).toBe(
      'Le due stanze disponibili sono al primo piano: la Stanza del Protocollo (1028, cinque postazioni)'
      + ' e la stanza 1032 (due postazioni).')
    expect(frasi[1]).toBe('Dirigente Sonia Sanzo — stanza 2087.')
  })

  it('nomina il piano di ciascun gruppo quando i piani sono più di uno', () => {
    const frasi = fraseStanze([
      stanza('1048', null, 'Primo piano', 3),
      stanza('A003', null, 'Piano terra', 1),
    ])
    expect(frasi[0]).toBe(
      'Le due stanze disponibili sono: al primo piano la stanza 1048 (tre postazioni);'
      + ' al piano terra la stanza A003 (una postazione).')
  })

  it('accorda il singolare, sulle stanze come sulle postazioni', () => {
    expect(fraseStanze([stanza('12', null, 'Primo piano', 1)])[0])
      .toBe('L\'unica stanza disponibile è al primo piano: la stanza 12 (una postazione).')
  })

  it('tace del tutto quando non c\'è niente da dire', () => {
    expect(fraseStanze([], [])).toEqual([])
  })

  it('non inventa un nome per una stanza riservata a chi non è più in forza', () => {
    const orfana: StanzaRiservata = { ...stanza('2087', null, null, 1), persona: null }
    expect(fraseStanze([], [orfana])).toEqual(['Stanza riservata — stanza 2087.'])
  })
})

describe('didascalie di settore in un elenco raggruppato', () => {
  const settori = new Map([[1, 'Contabilità'], [2, 'Segreteria']])
  const gente = (...ids: (number | null)[]) => ids.map((sectorId) => ({ sectorId }))

  it('intesta la prima riga e ogni cambio di settore', () => {
    expect(didascalieSettore(gente(1, 1, 2, 2), settori))
      .toEqual(['Contabilità', null, 'Segreteria', null])
  })

  it('non ripete la didascalia su due righe senza settore di fila', () => {
    // Il confronto deve avvenire fra valori, `null` compreso: con un confronto
    // che tratta `null` come «nessun precedente» ogni riga si prenderebbe la
    // propria intestazione, e l\'elenco diventerebbe una scala di titoli.
    expect(didascalieSettore(gente(null, null, null), settori))
      .toEqual(['Senza settore', null, null])
  })

  it('riconosce il rientro in un settore già visto come un cambio', () => {
    expect(didascalieSettore(gente(1, null, 1), settori))
      .toEqual(['Contabilità', 'Senza settore', 'Contabilità'])
  })

  it('senza raggruppamento non intesta niente', () => {
    expect(didascalieSettore(gente(1, 2), undefined)).toEqual([null, null])
  })

  it('chiama «Senza settore» anche un settore che non esiste più', () => {
    expect(didascalieSettore(gente(99), settori)).toEqual(['Senza settore'])
  })
})
