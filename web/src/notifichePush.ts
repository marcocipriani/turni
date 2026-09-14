/**
 * Le push di questo dispositivo: una sottoscrizione del browser, gemella di
 * una riga sul server. Il browser e l'API entrano da fuori, così gli stati e
 * l'ordine delle chiamate si provano senza un service worker vero.
 */
import { api } from './api'

export type StatoPush = 'non-supportate' | 'spente' | 'accese' | 'negate' | 'non-configurate'

type Sottoscrizione = {
  endpoint: string
  toJSON(): { endpoint?: string; keys?: Record<string, string> }
  unsubscribe(): Promise<boolean>
}

export type BrowserPush = {
  supportato: () => boolean
  permesso: () => NotificationPermission
  chiediPermesso: () => Promise<NotificationPermission>
  sottoscrizione: () => Promise<Sottoscrizione | null>
  iscrivi: (chiave: string) => Promise<Sottoscrizione>
}
export type ServerPush = Pick<typeof api, 'get' | 'post'>

const browserReale: BrowserPush = {
  supportato: () => 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined',
  permesso: () => Notification.permission,
  chiediPermesso: () => Notification.requestPermission(),
  sottoscrizione: async () => (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription() ?? null,
  iscrivi: async (chiave) => (await navigator.serviceWorker.register('/sw.js'))
    .pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiave }),
}

const chiave = async (s: ServerPush) => (await s.get<{ chiave: string | null }>('/notifiche/push/chiave')).chiave

export async function leggiPush(b = browserReale, s: ServerPush = api): Promise<StatoPush> {
  if (!b.supportato()) return 'non-supportate'
  if (b.permesso() === 'denied') return 'negate'
  if (await b.sottoscrizione()) return 'accese'
  return (await chiave(s)) ? 'spente' : 'non-configurate'
}

export async function impostaPush(attivo: boolean, b = browserReale, s: ServerPush = api): Promise<StatoPush> {
  if (!b.supportato()) return 'non-supportate'
  if (!attivo) {
    const sub = await b.sottoscrizione()
    // Prima il server: se la rete manca, il dispositivo resta iscritto e lo switch dice il vero.
    if (sub) { await s.post('/notifiche/push/disiscrivi', { endpoint: sub.endpoint }); await sub.unsubscribe() }
    return 'spente'
  }
  const k = await chiave(s)
  if (!k) return 'non-configurate'
  if ((await b.chiediPermesso()) !== 'granted') return 'negate'
  const j = (await b.iscrivi(k)).toJSON()
  await s.post('/notifiche/push/iscrivi', {
    endpoint: j.endpoint, keys: j.keys, dispositivo: navigator.userAgent.slice(0, 200),
  })
  return 'accese'
}

export function descriviErrorePush(stato: StatoPush | null): string | null {
  if (stato === 'non-supportate') return 'Questo browser non supporta le notifiche push.'
  if (stato === 'negate') return 'Permesso negato: riattivalo dalle impostazioni del browser.'
  if (stato === 'non-configurate') return 'Push non configurate sul server.'
  return null
}
