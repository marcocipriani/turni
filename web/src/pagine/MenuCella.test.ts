import { describe, expect, it } from 'vitest'
import type { Cella } from '../api'
import { vociMenu } from './MenuCella'

const cella = (over: Partial<Cella>): Cella => ({
  userId: 1, data: '2026-09-14', stato: 'smart', roomId: null, deskId: null, bloccata: false, causale: null, ...over,
})
const stanze = [{ id: 3, etichetta: '1028', capienza: 2 }, { id: 4, etichetta: '3016', capienza: 3 }]

describe('voci del menu di cella', () => {
  it('su una giornata normale offre stanze con occupazione, remoto, lucchetto, assenza e dettagli', () => {
    const v = vociMenu(cella({ stato: 'presenza', roomId: 3, bloccata: true }), stanze, new Map([[3, 2], [4, 0]]))
    expect(v.map((x) => x.chiave)).toEqual(['stanza:3', 'stanza:4', 'remoto', 'sblocca', 'assenza', 'dettagli'])
    expect(v[0]).toMatchObject({ etichetta: '1028 · 2/2', attuale: true })
    expect(v[1]).toMatchObject({ etichetta: '3016 · 0/3', attuale: false })
  })
  it('su una cella libera offre di bloccarla', () => {
    expect(vociMenu(cella({}), stanze, new Map()).map((x) => x.chiave)).toContain('blocca')
  })
  it('su un\'assenza registrata dall\'organizzazione offre solo di toglierla', () => {
    expect(vociMenu(cella({ stato: 'assenza', perConto: true, assenzaId: 7 }), stanze, new Map()).map((x) => x.chiave))
      .toEqual(['togli-assenza'])
  })
  it('su un\'assenza dichiarata dal collega non offre niente', () => {
    expect(vociMenu(cella({ stato: 'assenza' }), stanze, new Map())).toEqual([])
  })
})
