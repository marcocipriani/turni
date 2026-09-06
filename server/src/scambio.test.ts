import { describe, expect, it } from 'vitest'
import { weekKey } from './lib/dates'
import { chiave, type Contesto, effetti, possibili, validaScambio } from './scambio'

/* Lunedì 7 → venerdì 11 settembre 2026, cinque giornate lavorative. */
const GIORNATE = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']

/**
 * Tre persone, due settori. Anna e Bruno in Segreteria (che presidia),
 * Carla in Statistica. Il 10 la Segreteria è presidiata dal solo Bruno: è la
 * giornata su cui si verifica che il presidio regga.
 */
function contesto(parziale: Partial<Contesto> = {}): Contesto {
  const stati = new Map<string, 'presenza' | 'smart'>()
  const inSede: Record<number, string[]> = {
    1: ['2026-09-07', '2026-09-09'],
    2: ['2026-09-08', '2026-09-10'],
    3: ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-11'],
  }
  for (const u of [1, 2, 3]) {
    for (const g of GIORNATE) stati.set(chiave(u, g), inSede[u]!.includes(g) ? 'presenza' : 'smart')
  }

  const presenzePerGiorno = new Map<string, number>()
  const agilePerSettimana = new Map<string, number>()
  const programmatePerSettimana = new Map<string, number>()
  for (const [k, s] of stati) {
    const [u, g] = k.split('|') as [string, string]
    if (s === 'presenza') presenzePerGiorno.set(g, (presenzePerGiorno.get(g) ?? 0) + 1)
    const w = `${u}|${weekKey(g)}`
    programmatePerSettimana.set(w, (programmatePerSettimana.get(w) ?? 0) + 1)
    if (s === 'smart') agilePerSettimana.set(w, (agilePerSettimana.get(w) ?? 0) + 1)
  }

  return {
    oggi: '2026-09-01', ora: '09:00',
    scambioAttivo: true, oraLimite: '10:00',
    giornate: new Set(GIORNATE),
    stati,
    assenze: new Set<string>(),
    settoreDi: new Map([[1, 10], [2, 10], [3, 20]]),
    presidio: new Set([10]),
    membriSettore: new Map([[10, [1, 2]], [20, [3]]]),
    capienza: 3,
    presenzePerGiorno,
    smartMinSettimana: null, smartMaxSettimana: null,
    impegnate: new Set<string>(),
    agilePerSettimana, programmatePerSettimana,
    giornateDellaSettimana: new Map([[weekKey('2026-09-07'), 5]]),
    ...parziale,
  }
}

const offro = (dati: Partial<Parameters<typeof validaScambio>[1]> = {}) => ({
  tipo: 'offro' as const, proponenteId: 1, destinatarioId: 2,
  dataProponente: '2026-09-09', dataDestinatario: '2026-09-09', ...dati,
})

describe('effetti', () => {
  it('la cessione muove due celle, la permuta quattro', () => {
    expect(effetti(offro())).toHaveLength(2)
    expect(effetti({ ...offro(), tipo: 'permuta', dataDestinatario: '2026-09-10' })).toHaveLength(4)
  })

  it('non cambia mai il numero di persone in sede in una giornata', () => {
    for (const p of [offro(), { ...offro(), tipo: 'chiedo' as const },
                     { ...offro(), tipo: 'permuta' as const, dataDestinatario: '2026-09-10' }]) {
      const saldo = new Map<string, number>()
      for (const c of effetti(p)) {
        saldo.set(c.data, (saldo.get(c.data) ?? 0) + (c.stato === 'presenza' ? 1 : -1))
      }
      expect([...saldo.values()].every((n) => n === 0)).toBe(true)
    }
  })
})

describe('validaScambio', () => {
  it('accetta una cessione fra chi è in sede e chi è agile', () => {
    // Il 9 Anna è in sede e Bruno è agile; il settore resta presidiato da Bruno.
    expect(validaScambio(contesto(), offro())).toEqual({ ok: true })
  })

  it('rifiuta se l\'unità ha spento lo scambio', () => {
    const e = validaScambio(contesto({ scambioAttivo: false }), offro())
    expect(e).toMatchObject({ ok: false })
  })

  it('rifiuta lo scambio con se stessi', () => {
    expect(validaScambio(contesto(), offro({ destinatarioId: 1 })).ok).toBe(false)
  })

  it('rifiuta quando gli stati non sono opposti', () => {
    // L'8 Anna è agile e Bruno è in sede: Anna non ha niente da cedere.
    const e = validaScambio(contesto(), offro({ dataProponente: '2026-09-08', dataDestinatario: '2026-09-08' }))
    expect(e).toMatchObject({ ok: false, motivo: expect.stringContaining('non si possono scambiare') })
  })

  it('rifiuta se una delle due persone è assente in quella giornata', () => {
    const c = contesto({ assenze: new Set([chiave(2, '2026-09-09')]) })
    expect(validaScambio(c, offro())).toMatchObject({ ok: false, motivo: expect.stringContaining('assente') })
  })

  it('rifiuta se lo scambio scoprirebbe un settore che presidia', () => {
    // Il 10 in Segreteria c'è il solo Bruno. Cedendo la giornata a Carla, che è
    // di un altro settore, la Segreteria resta senza nessuno in sede.
    const e = validaScambio(contesto(), {
      tipo: 'offro', proponenteId: 2, destinatarioId: 3,
      dataProponente: '2026-09-10', dataDestinatario: '2026-09-10',
    })
    expect(e).toMatchObject({ ok: false, motivo: expect.stringContaining('presidio') })
  })

  it('rifiuta una giornata già dentro un altro scambio', () => {
    const c = contesto({ impegnate: new Set([chiave(1, '2026-09-09')]) })
    expect(validaScambio(c, offro())).toMatchObject({ ok: false, motivo: expect.stringContaining('altro scambio') })
  })

  it('non tocca le giornate passate', () => {
    const c = contesto({ oggi: '2026-09-10' })
    expect(validaScambio(c, offro())).toMatchObject({ ok: false, motivo: expect.stringContaining('passate') })
  })

  it('chiude la giornata di oggi all\'ora limite dell\'unità', () => {
    const prima = contesto({ oggi: '2026-09-09', ora: '09:59' })
    const dopo = contesto({ oggi: '2026-09-09', ora: '10:00' })
    expect(validaScambio(prima, offro())).toEqual({ ok: true })
    expect(validaScambio(dopo, offro())).toMatchObject({ ok: false, motivo: expect.stringContaining('10:00') })
  })

  it('rispetta il massimo settimanale di lavoro agile', () => {
    // Anna ha già 3 giornate agili su 5: cedendo la sua presenza salirebbe a 4.
    const c = contesto({ smartMaxSettimana: 3 })
    expect(validaScambio(c, offro())).toMatchObject({ ok: false, motivo: expect.stringContaining('massimo') })
  })

  it('rispetta il minimo settimanale di lavoro agile', () => {
    // Bruno ha 3 giornate agili: prendendo la presenza scenderebbe a 2.
    const c = contesto({ smartMinSettimana: 3 })
    expect(validaScambio(c, offro())).toMatchObject({ ok: false, motivo: expect.stringContaining('minimo') })
  })

  it('accetta una permuta fra due giornate in sede', () => {
    // Anna in sede il 9, Bruno in sede il 10, ciascuno agile nella giornata
    // dell'altro. Segreteria resta presidiata entrambi i giorni.
    expect(validaScambio(contesto(), {
      tipo: 'permuta', proponenteId: 1, destinatarioId: 2,
      dataProponente: '2026-09-09', dataDestinatario: '2026-09-10',
    })).toEqual({ ok: true })
  })

  it('pretende due giornate diverse per una permuta, una sola per una cessione', () => {
    expect(validaScambio(contesto(), { ...offro(), tipo: 'permuta' }).ok).toBe(false)
    expect(validaScambio(contesto(), offro({ dataDestinatario: '2026-09-10' })).ok).toBe(false)
  })

  it('non esce dal periodo pubblicato', () => {
    const e = validaScambio(contesto(), offro({ dataProponente: '2026-09-12', dataDestinatario: '2026-09-12' }))
    expect(e).toMatchObject({ ok: false, motivo: expect.stringContaining('periodo') })
  })
})

describe('possibili', () => {
  it('non elenca chi è assente in quella giornata', () => {
    const senza = possibili(contesto(), 1, '2026-09-09', [1, 2, 3])
    expect(senza.map((x) => x.userId)).toContain(2)

    const con = possibili(contesto({ assenze: new Set([chiave(2, '2026-09-09')]) }), 1, '2026-09-09', [1, 2, 3])
    const bruno = con.find((x) => x.userId === 2)
    expect(bruno?.giornate.some((g) => g.data === '2026-09-09')).toBeFalsy()
  })

  it('non elenca mai se stessi', () => {
    expect(possibili(contesto(), 1, '2026-09-09', [1, 2, 3]).some((x) => x.userId === 1)).toBe(false)
  })

  it('elenca solo ciò che validaScambio accetterebbe', () => {
    const ctx = contesto()
    for (const p of possibili(ctx, 1, '2026-09-09', [1, 2, 3])) {
      for (const g of p.giornate) {
        expect(validaScambio(ctx, {
          tipo: g.tipo, proponenteId: 1, destinatarioId: p.userId,
          dataProponente: '2026-09-09', dataDestinatario: g.data,
        })).toEqual({ ok: true })
      }
    }
  })

  it('da una giornata agile propone solo di chiedere, mai di permutare', () => {
    // L'8 Anna è agile: può chiedere la giornata di chi è in sede, non permutare.
    const p = possibili(contesto(), 1, '2026-09-08', [1, 2, 3])
    expect(p.flatMap((x) => x.giornate).every((g) => g.tipo === 'chiedo')).toBe(true)
  })
})
