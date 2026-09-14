import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { eq, inArray } from 'drizzle-orm'
import type { Env } from '../context'

vi.mock('../lib/notify', () => ({ avvisa: vi.fn() }))

// Opt-in: soltanto un archivio di prova già migrato. Nessuna istanza HTTP serve.
const url = process.env.TURNI_TEST_DATABASE_URL
describe.skipIf(!url)('regressioni API su MariaDB/MySQL', () => {
  let database: typeof import('../db/index')
  let app: Hono<Env>
  let unitId: number, roomId: number, deskId: number
  let dirigente: number, collega: number, altro: number, esterno: number
  const utenti: number[] = [], periodi: number[] = [], stanze: number[] = []
  const data = '2030-09-09'
  const risultato = (r: Response) => r.json() as Promise<{ id: number }>
  type Elenco = { giorni: { stato: string; colleghi: { userId: number }[]; presenti: { userId: number }[]; remoti: { userId: number }[] }[] }
  const richiesta = (user: number, metodo: string, path: string, body?: unknown) => app.request(path, {
    method: metodo, headers: { 'x-test-user': String(user), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  beforeAll(async () => {
    if (!/^\/turni_(test|review)[\w-]*$/.test(new URL(url!).pathname)) throw new Error('Serve un database turni_test* o turni_review*')
    process.env.DATABASE_URL = url!
    database = await import('../db/index')
    const { db, schema: s } = database
    const { caricaAlbero, caricaAttore, HttpError } = await import('../context')
    const { periods } = await import('./periods')
    const { absences } = await import('./absences')
    const { org } = await import('./org')
    const { mio } = await import('./mio')
    const { overview } = await import('./overview')
    const { auth } = await import('./auth')
    app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('attore', (await caricaAttore(Number(c.req.header('x-test-user'))))!)
      c.set('albero', await caricaAlbero())
      await next()
    })
    app.onError((e, c) => c.json({ errore: e.message }, e instanceof HttpError ? e.status : 500))
    app.route('/periodi', periods).route('/assenze', absences).route('/org', org).route('/mio', mio).route('/panoramica', overview).route('/auth', auth)
    const [unit] = await db.insert(s.unit).values({ nome: 'Regressione temporanea' })
    unitId = unit.insertId
    for (const [i, ruolo] of (['dirigente', 'dipendente', 'dipendente', 'admin'] as const).entries()) {
      const [u] = await db.insert(s.user).values({
        nome: 'Prova', cognome: `Regressione ${i}`, email: `regressione-${unitId}-${i}@turni.test`,
        passwordHash: 'non-utilizzabile', ruolo, unitId: ruolo === 'admin' ? null : unitId,
      })
      utenti.push(u.insertId)
    }
    ;[dirigente, collega, altro, esterno] = utenti as [number, number, number, number]
    const [room] = await db.insert(s.room).values({ unitId, etichetta: 'R', sede: 'Sede prova' })
    roomId = room.insertId; stanze.push(roomId)
    for (const numero of ['1', '2']) {
      const [d] = await db.insert(s.desk).values({ roomId, numero })
      if (numero === '1') deskId = d.insertId
    }
  })

  afterAll(async () => {
    if (!database) return
    const { db, pool, schema: s } = database
    if (periodi.length) {
      await db.delete(s.assignment).where(inArray(s.assignment.periodId, periodi))
      await db.delete(s.periodSnapshot).where(inArray(s.periodSnapshot.periodId, periodi))
      await db.delete(s.period).where(inArray(s.period.id, periodi))
    }
    if (utenti.length) {
      await db.delete(s.absence).where(inArray(s.absence.userId, utenti))
      await db.delete(s.absenceRule).where(inArray(s.absenceRule.userId, utenti))
      await db.delete(s.auditLog).where(inArray(s.auditLog.utente, utenti))
      await db.delete(s.userPreference).where(inArray(s.userPreference.userId, utenti))
      await db.delete(s.user).where(inArray(s.user.id, utenti))
    }
    if (stanze.length) {
      await db.delete(s.desk).where(inArray(s.desk.roomId, stanze))
      await db.delete(s.room).where(inArray(s.room.id, stanze))
    }
    if (unitId) await db.delete(s.unit).where(eq(s.unit.id, unitId))
    await pool.end()
  })

  it('il promemoria della sera si cambia da solo, senza toccare le altre preferenze', async () => {
    type Preferenze = { promemoriaSera: boolean; giorniPreferiti: number[]; nota: string | null }
    const leggi = async (user: number) =>
      await (await richiesta(user, 'GET', '/assenze/preferenze')).json() as Preferenze
    await richiesta(collega, 'PUT', '/assenze/preferenze', { giorniPreferiti: [2], nota: 'resta' })
    expect((await richiesta(collega, 'PATCH', '/assenze/preferenze', { promemoriaSera: true })).status).toBe(200)
    expect(await leggi(collega)).toMatchObject({ promemoriaSera: true, giorniPreferiti: [2], nota: 'resta' })
    const me = await (await richiesta(collega, 'GET', '/auth/me')).json() as { preferenze: Preferenze }
    expect(me.preferenze.promemoriaSera).toBe(true)
    // Il modulo delle preferenze non lo manda più: salvarlo non deve spegnerlo.
    await richiesta(collega, 'PUT', '/assenze/preferenze', { giorniPreferiti: [3], nota: 'resta' })
    expect((await leggi(collega)).promemoriaSera).toBe(true)
    expect((await richiesta(altro, 'PATCH', '/assenze/preferenze', { promemoriaSera: true })).status).toBe(200)
    expect((await leggi(altro)).giorniPreferiti).toEqual([])
    expect((await richiesta(collega, 'PATCH', '/assenze/preferenze', { promemoriaSera: 'sì' })).status).toBe(422)
    expect((await richiesta(collega, 'PATCH', '/assenze/preferenze', { promemoriaSera: false, nota: 'no' })).status).toBe(422)
  })

  it('ignora i conflitti passati ma controlla oggi e domani, anche prima di approvare', async () => {
    const { db, schema: s } = database
    const giorni = ['2030-09-09', '2030-09-10', '2030-09-11']
    const r = await richiesta(dirigente, 'POST', '/periodi', {
      unitId, dataInizio: giorni[0], dataFine: giorni[2],
    })
    expect(r.status).toBe(201)
    const id = (await risultato(r)).id; periodi.push(id)
    await db.insert(s.assignment).values(giorni.flatMap((data) =>
      [dirigente, collega, altro].map((userId) => ({
        periodId: id, userId, data, stato: 'presenza' as const, roomId, deskId, origine: 'manuale' as const,
      }))))
    await db.insert(s.absence).values({ userId: collega, dataInizio: giorni[0]!, dataFine: giorni[0]!, causale: 'ferie' })
    // A Roma è già il 10, mentre UTC è ancora il 9.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-09-09T22:30:00Z'))
    try {
      const griglia = await (await richiesta(dirigente, 'GET', `/periodi/${id}/griglia`)).json() as {
        avvisi: { data: string; gravita: string }[]
      }
      expect(griglia.avvisi.some((a) => a.data === giorni[0])).toBe(false)
      for (const giorno of giorni.slice(1)) {
        expect(griglia.avvisi.some((a) => a.data === giorno && a.gravita === 'errore')).toBe(true)
      }
      expect((await richiesta(dirigente, 'POST', `/periodi/${id}/invia`, {})).status).toBe(409)
      for (const data of giorni.slice(1)) {
        for (const userId of [dirigente, collega, altro]) {
          await richiesta(dirigente, 'PUT', `/periodi/${id}/cella`, { userId, data, stato: 'smart' })
        }
      }
      expect((await richiesta(dirigente, 'POST', `/periodi/${id}/invia`, {})).status).toBe(200)
      expect((await richiesta(dirigente, 'POST', `/periodi/${id}/approva`, {})).status).toBe(200)
    } finally {
      vi.useRealTimers()
      // La prova seguente usa la stessa unità e la giornata iniziale.
      await db.delete(s.absence).where(eq(s.absence.userId, collega))
      await db.delete(s.assignment).where(eq(s.assignment.periodId, id))
      await db.delete(s.period).where(eq(s.period.id, id))
    }
  })

  it('protegge revisioni, assenze, scrivanie, approvazione e confini organizzativi', async () => {
    const { db, schema: s } = database
    let r = await richiesta(dirigente, 'POST', '/periodi', { unitId, dataInizio: data, dataFine: data, assegnaScrivanie: true })
    expect(r.status).toBe(201)
    const id = (await risultato(r)).id; periodi.push(id)
    const cella = { userId: collega, data, stato: 'presenza', roomId, deskId }
    expect((await richiesta(dirigente, 'PUT', `/periodi/${id}/cella`, { ...cella, roomId: -1 })).status).toBe(422)
    expect((await richiesta(dirigente, 'PUT', `/periodi/${id}/cella`, cella)).status).toBe(200)
    expect((await richiesta(dirigente, 'POST', `/periodi/${id}/genera`, {})).status).toBe(200)
    let celle = await db.select().from(s.assignment).where(eq(s.assignment.periodId, id))
    expect(celle.filter((c) => c.deskId === deskId)).toHaveLength(1)
    expect((await richiesta(dirigente, 'POST', `/periodi/${id}/invia`, {})).status).toBe(200)
    // Dopo l'invio qualcuno duplica una scrivania: il dirigente deve ricontrollare.
    expect((await richiesta(dirigente, 'PUT', `/periodi/${id}/cella`, { ...cella, userId: altro })).status).toBe(200)
    expect((await richiesta(dirigente, 'POST', `/periodi/${id}/approva`, {})).status).toBe(409)
    await richiesta(dirigente, 'PUT', `/periodi/${id}/cella`, { ...cella, userId: altro, deskId: null })
    await richiesta(dirigente, 'PUT', `/periodi/${id}/cella`, { userId: dirigente, data, stato: 'smart' })
    expect((await richiesta(dirigente, 'POST', `/periodi/${id}/approva`, {})).status).toBe(200)
    expect((await richiesta(dirigente, 'POST', `/periodi/${id}/respingi`, { nota: 'Non deve ritirare il pubblicato' })).status).toBe(409)
    r = await richiesta(dirigente, 'POST', `/periodi/${id}/revisione`, {})
    const gemello = (await risultato(r)).id; periodi.push(gemello)
    expect((await richiesta(collega, 'GET', `/periodi/${gemello}/export.csv`)).status).toBe(403)
    expect((await richiesta(collega, 'GET', `/periodi/${gemello}/giornata/${data}`)).status).toBe(403)
    await db.insert(s.absenceRule).values({ userId: collega, giornoSettimana: 1, causale: 'ferie', validoDa: data })
    const personale = await (await richiesta(collega, 'GET', `/mio?da=${data}`)).json() as Elenco
    expect(personale.giorni[0]!.stato).toBe('assenza')
    expect(await (await richiesta(collega, 'GET', `/mio/export.csv?da=${data}`)).text()).toContain('ferie')
    const altrui = await (await richiesta(altro, 'GET', `/mio?da=${data}`)).json() as Elenco
    expect(altrui.giorni[0]!.colleghi.map((u: { userId: number }) => u.userId)).not.toContain(collega)
    const panoramica = await (await richiesta(altro, 'GET', `/panoramica?da=${data}&a=${data}`)).json() as Elenco
    expect(panoramica.giorni[0]!.presenti.map((u: { userId: number }) => u.userId)).not.toContain(collega)
    expect(panoramica.giorni[0]!.remoti.map((u: { userId: number }) => u.userId)).toContain(collega)
    expect(JSON.stringify(panoramica)).not.toContain('ferie')
    expect((await richiesta(dirigente, 'POST', `/periodi/${gemello}/genera`, {})).status).toBe(200)
    celle = await db.select().from(s.assignment).where(eq(s.assignment.periodId, gemello))
    expect(celle.find((c) => c.userId === collega)).toMatchObject({ stato: 'smart', bloccata: false, deskId: null })
    expect((await richiesta(dirigente, 'POST', `/periodi/${gemello}/invia`, {})).status).toBe(200)
    r = await richiesta(dirigente, 'POST', `/periodi/${gemello}/approva`, {})
    expect(r.status).toBe(200); expect((await risultato(r)).id).toBe(id)
    expect((await richiesta(dirigente, 'POST', `/org/unita/${unitId}/assegna-settore`, { userId: esterno, sectorId: null })).status).toBe(422)
    expect((await richiesta(dirigente, 'POST', '/org/unita', { parentId: unitId, nome: 'Vietata', dirigenteUserId: esterno })).status).toBe(422)
  })
})
