import { describe, expect, it } from 'vitest'
import {
  type Albero, type Attore, mascheraCella, puoAmministrareUnita, puoApprovare,
  puoLeggereUnita, puoProgrammare, puoVedereCausale, radice, sottoalbero,
  unitaDiProgrammazione,
} from './permissions'

//  1 Dipartimento
//  ├── 2 Ufficio X
//  │   └── 4 Servizio X1
//  └── 3 Ufficio Y
const albero: Albero = new Map([[1, null], [2, 1], [3, 1], [4, 2]])

const dirigenteDip: Attore = { id: 10, ruolo: 'dirigente', unitId: 1, organizzatoreDi: [] }
const dirigenteX: Attore = { id: 11, ruolo: 'dirigente', unitId: 2, organizzatoreDi: [] }
const dipendenteX: Attore = { id: 12, ruolo: 'dipendente', unitId: 2, organizzatoreDi: [] }
const organizzatoreX: Attore = { id: 13, ruolo: 'dipendente', unitId: 2, organizzatoreDi: [2] }
const admin: Attore = { id: 99, ruolo: 'admin', unitId: null, organizzatoreDi: [] }

describe('albero organizzativo', () => {
  it('risale alla radice', () => {
    expect(radice(albero, 4)).toBe(1)
    expect(radice(albero, 1)).toBe(1)
  })

  it('elenca il sottoalbero', () => {
    expect([...sottoalbero(albero, 2)].sort()).toEqual([2, 4])
    expect([...sottoalbero(albero, 1)].sort()).toEqual([1, 2, 3, 4])
  })

  it('programma il dirigente nell unità del padre e il dipendente nella propria', () => {
    expect(unitaDiProgrammazione(albero, 'dirigente', 2)).toBe(1)
    expect(unitaDiProgrammazione(albero, 'dirigente', 1)).toBe(1)   // la radice non ha padre
    expect(unitaDiProgrammazione(albero, 'dipendente', 2)).toBe(2)
  })
})

describe('visibilità', () => {
  it('il dirigente legge tutto il proprio sottoalbero', () => {
    for (const u of [1, 2, 3, 4]) expect(puoLeggereUnita(albero, dirigenteDip, u)).toBe(true)
  })

  it('il dirigente non legge le unità sorelle', () => {
    expect(puoLeggereUnita(albero, dirigenteX, 3)).toBe(false)
    expect(puoLeggereUnita(albero, dirigenteX, 4)).toBe(true)
    expect(puoLeggereUnita(albero, dirigenteX, 1)).toBe(true)   // vi è programmato
  })

  it('il dipendente legge solo la propria unità', () => {
    expect(puoLeggereUnita(albero, dipendenteX, 2)).toBe(true)
    expect(puoLeggereUnita(albero, dipendenteX, 1)).toBe(false)
  })

  it('l amministratore non legge alcuna programmazione', () => {
    for (const u of [1, 2, 3, 4]) expect(puoLeggereUnita(albero, admin, u)).toBe(false)
  })
})

describe('poteri di programmazione', () => {
  it('il dirigente programma e approva la propria unità', () => {
    expect(puoProgrammare(dirigenteX, 2)).toBe(true)
    expect(puoApprovare(dirigenteX, 2)).toBe(true)
    expect(puoAmministrareUnita(dirigenteX, 2)).toBe(true)
  })

  it('il delegato programma ma non approva', () => {
    expect(puoProgrammare(organizzatoreX, 2)).toBe(true)
    expect(puoApprovare(organizzatoreX, 2)).toBe(false)
    expect(puoAmministrareUnita(organizzatoreX, 2)).toBe(false)
  })

  it('un dipendente non delegato non programma', () => {
    expect(puoProgrammare(dipendenteX, 2)).toBe(false)
  })
})

describe('causali di assenza', () => {
  const interessato = { id: 12, unitId: 2 }

  it('le vede l interessato, il delegato e ogni dirigente sovraordinato', () => {
    expect(puoVedereCausale(albero, dipendenteX, interessato)).toBe(true)
    expect(puoVedereCausale(albero, organizzatoreX, interessato)).toBe(true)
    expect(puoVedereCausale(albero, dirigenteX, interessato)).toBe(true)
    expect(puoVedereCausale(albero, dirigenteDip, interessato)).toBe(true)
  })

  it('non le vede un collega né l amministratore', () => {
    const collega: Attore = { id: 20, ruolo: 'dipendente', unitId: 2, organizzatoreDi: [] }
    expect(puoVedereCausale(albero, collega, interessato)).toBe(false)
    expect(puoVedereCausale(albero, admin, interessato)).toBe(false)
  })

  it('per un collega l assenza è indistinguibile dal lavoro agile', () => {
    const collega: Attore = { id: 20, ruolo: 'dipendente', unitId: 2, organizzatoreDi: [] }
    const cella = { userId: 12, data: '2026-09-07', stato: 'assenza' as const, roomId: null, deskId: null, bloccata: false, causale: 'legge_104' }
    const vista = mascheraCella(albero, collega, cella, interessato)
    expect(vista.stato).toBe('smart')
    expect(vista.causale).toBeNull()
  })

  it('il dirigente vede assenza e causale in chiaro', () => {
    const cella = { userId: 12, data: '2026-09-07', stato: 'assenza' as const, roomId: null, deskId: null, bloccata: false, causale: 'legge_104' }
    const vista = mascheraCella(albero, dirigenteDip, cella, interessato)
    expect(vista.stato).toBe('assenza')
    expect(vista.causale).toBe('legge_104')
  })
})
