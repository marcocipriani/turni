import { describe, expect, it } from 'vitest'
import { type BrowserPush, descriviErrorePush, impostaPush, leggiPush, type ServerPush } from './notifichePush'

function finto(browser: Partial<BrowserPush> = {}, chiave: string | null = 'K') {
  const log: string[] = []
  const sub = {
    endpoint: 'https://push.example/1',
    toJSON: () => ({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: async () => { log.push('unsubscribe locale'); return true },
  }
  const b: BrowserPush = {
    supportato: () => true,
    permesso: () => 'default',
    chiediPermesso: async () => 'granted',
    sottoscrizione: async () => null,
    iscrivi: async () => { log.push('subscribe locale'); return sub },
    ...browser,
  }
  const s: ServerPush = {
    get: async <T,>(p: string) => { log.push(`GET ${p}`); return { chiave } as T },
    post: async <T,>(p: string, c?: unknown) => { log.push(`POST ${p} ${JSON.stringify(c)}`); return undefined as T },
  }
  return { log, b, s, sub }
}

describe('stato delle push su questo dispositivo', () => {
  it('distingue non supportate, negate, accese, spente e non configurate', async () => {
    let f = finto({ supportato: () => false })
    expect(await leggiPush(f.b, f.s)).toBe('non-supportate')
    f = finto({ permesso: () => 'denied' })
    expect(await leggiPush(f.b, f.s)).toBe('negate')
    f = finto()
    f.b.sottoscrizione = async () => f.sub
    expect(await leggiPush(f.b, f.s)).toBe('accese')
    f = finto()
    expect(await leggiPush(f.b, f.s)).toBe('spente')
    f = finto({}, null)
    expect(await leggiPush(f.b, f.s)).toBe('non-configurate')
  })

  it('spegnere toglie prima la sottoscrizione dal server, poi quella locale', async () => {
    const f = finto()
    f.b.sottoscrizione = async () => f.sub
    expect(await impostaPush(false, f.b, f.s)).toBe('spente')
    expect(f.log).toEqual(['POST /notifiche/push/disiscrivi {"endpoint":"https://push.example/1"}', 'unsubscribe locale'])
  })

  it('accendere chiede il permesso, iscrive e manda endpoint e chiavi', async () => {
    const f = finto()
    expect(await impostaPush(true, f.b, f.s)).toBe('accese')
    expect(f.log[0]).toBe('GET /notifiche/push/chiave')
    expect(f.log[1]).toBe('subscribe locale')
    expect(f.log[2]).toMatch(/^POST \/notifiche\/push\/iscrivi \{"endpoint":"https:\/\/push.example\/1","keys":\{"p256dh":"p","auth":"a"\}/)
  })

  it('senza permesso o senza chiave non iscrive niente', async () => {
    let f = finto({ chiediPermesso: async () => 'denied' })
    expect(await impostaPush(true, f.b, f.s)).toBe('negate')
    expect(f.log).not.toContain('subscribe locale')
    f = finto({}, null)
    expect(await impostaPush(true, f.b, f.s)).toBe('non-configurate')
    expect(f.log).not.toContain('subscribe locale')
  })

  it('spiega solo gli stati che bloccano', () => {
    expect(descriviErrorePush('negate')).toMatch(/permesso/i)
    expect(descriviErrorePush('accese')).toBeNull()
    expect(descriviErrorePush('spente')).toBeNull()
  })
})
