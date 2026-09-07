import { describe, expect, it } from 'vitest'
import { albero, conDiscendenti, type UnitaOrg } from './Organigramma'

const u = (id: number, nome: string, parentId: number | null = null, persone = 0): UnitaOrg => ({
  id, parentId, nome, sigla: null, smartMinSettimana: null, smartMaxSettimana: null,
  scambioAttivo: true, scambioOraLimite: '10:00', persone, dirigente: null,
})

// Radice ─ Servizi ─ Protocollo
//        └ Contabilità
const rete = [u(1, 'Radice', null, 2), u(2, 'Servizi', 1, 3), u(3, 'Protocollo', 2, 4), u(4, 'Contabilità', 1, 5)]

describe('albero', () => {
  it('annida le figlie e le ordina per nome', () => {
    const cima = albero(rete)
    expect(cima.map((n) => n.nome)).toEqual(['Radice'])
    expect(cima[0]!.figlie.map((n) => n.nome)).toEqual(['Contabilità', 'Servizi'])
    expect(cima[0]!.figlie[1]!.figlie.map((n) => n.nome)).toEqual(['Protocollo'])
  })

  it('somma nel totale anche le persone delle unità sottostanti', () => {
    const radice = albero(rete)[0]!
    expect(radice.totale).toBe(14)
    expect(radice.figlie[1]!.totale).toBe(7)   // Servizi 3 + Protocollo 4
    expect(radice.figlie[0]!.totale).toBe(5)   // Contabilità, senza figlie
  })

  it('non perde un’unità il cui padre non è nell’elenco visibile', () => {
    expect(albero([u(3, 'Protocollo', 2)]).map((n) => n.nome)).toEqual(['Protocollo'])
  })
})

describe('conDiscendenti', () => {
  it('raccoglie sé stessa e tutta la discendenza', () => {
    expect(conDiscendenti(rete, 1)).toEqual(new Set([1, 2, 3, 4]))
    expect(conDiscendenti(rete, 2)).toEqual(new Set([2, 3]))
    expect(conDiscendenti(rete, 3)).toEqual(new Set([3]))
  })
})
