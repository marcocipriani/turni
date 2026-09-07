import { describe, expect, it } from 'vitest'
import type { Unita } from '../api'
import { albero, conDiscendenti } from './Organigramma'

const u = (id: number, nome: string, parentId: number | null = null): Unita => ({
  id, parentId, nome, sigla: null, smartMinSettimana: null, smartMaxSettimana: null,
  scambioAttivo: true, scambioOraLimite: '10:00',
})

// Radice ─ Servizi ─ Protocollo
//        └ Contabilità
const rete = [u(1, 'Radice'), u(2, 'Servizi', 1), u(3, 'Protocollo', 2), u(4, 'Contabilità', 1)]

describe('albero', () => {
  it('annida le figlie e le ordina per nome', () => {
    const cima = albero(rete)
    expect(cima.map((n) => n.nome)).toEqual(['Radice'])
    expect(cima[0]!.figlie.map((n) => n.nome)).toEqual(['Contabilità', 'Servizi'])
    expect(cima[0]!.figlie[1]!.figlie.map((n) => n.nome)).toEqual(['Protocollo'])
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
