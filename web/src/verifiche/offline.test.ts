import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it('un 401 cancella la sessione e i calendari prima di tornare offline', async () => {
  const cache = new Map<string, Response>()
  let rete = true, scaduta = false
  const contesto = {
    self: { addEventListener() {} }, Headers, Response,
    caches: {
      open: async () => ({
        put: async (k: string, v: Response) => { cache.set(k, v) },
        match: async (k: string) => cache.get(k)?.clone(),
      }),
      delete: async () => { cache.clear(); return true },
    },
    fetch: async () => {
      if (!rete) throw new Error('offline')
      return new Response('{}', { status: scaduta ? 401 : 200 })
    },
  }
  runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), contesto)
  const leggi = (p: string) => runInNewContext(`reteOCopia('${p}', DATI, false)`, contesto) as Promise<Response>
  await leggi('/api/auth/me'); await leggi('/api/mio')
  rete = false
  expect((await leggi('/api/auth/me')).status).toBe(200)
  rete = true; scaduta = true
  expect((await leggi('/api/auth/me')).status).toBe(401)
  expect(cache.size).toBe(0)
  rete = false
  await expect(leggi('/api/auth/me')).rejects.toThrow('offline')
})
