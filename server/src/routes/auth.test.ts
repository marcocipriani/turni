import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../context'
import { azzera } from '../lib/limite'
import { auth } from './auth'

const verifica = vi.hoisted(() => vi.fn(async () => false))
vi.mock('../lib/password', () => ({ hashPassword: async () => 'impronta', verifyPassword: verifica }))
// Archivio vuoto: nessun indirizzo esiste.
vi.mock('../db/index', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) },
  schema: { user: {}, session: {} },
}))

describe('accesso', () => {
  beforeEach(() => { azzera(); verifica.mockClear() })

  it('verifica la password anche per un indirizzo che non esiste', async () => {
    const app = new Hono().route('/', auth)
    app.onError((e, c) => c.json({ errore: e.message }, e instanceof HttpError ? e.status : 500))

    const r = await app.request('/login', {
      method: 'POST', body: JSON.stringify({ email: 'nessuno@esempio.it', password: 'sbagliata' }),
    })

    expect(r.status).toBe(401)
    expect(verifica).toHaveBeenCalledOnce()
  })
})
