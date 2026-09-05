import { useEffect, useRef, useState } from 'react'
import { api, type Notifica } from '../api'
import { Bottone } from '../componenti'

/** Iscrive il browser alle notifiche push. Fallisce in silenzio dove non è supportato. */
async function iscriviPush(): Promise<string | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'Questo browser non supporta le notifiche push.'
  }
  const { chiave } = await api.get<{ chiave: string | null }>('/notifiche/push/chiave')
  if (!chiave) return 'Le notifiche push non sono configurate sul server (chiavi VAPID assenti).'

  const permesso = await Notification.requestPermission()
  if (permesso !== 'granted') return 'Permesso negato dal browser.'

  const reg = await navigator.serviceWorker.register('/sw.js')
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: chiave,
  })
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } }
  await api.post('/notifiche/push/iscrivi', {
    endpoint: j.endpoint, keys: j.keys, dispositivo: navigator.userAgent.slice(0, 200),
  })
  return null
}

export function Campanella() {
  const [dati, setDati] = useState<{ notifiche: Notifica[]; daLeggere: number }>({ notifiche: [], daLeggere: 0 })
  const [aperto, setAperto] = useState(false)
  const [messaggioPush, setMessaggioPush] = useState<string | null>(null)
  const riferimento = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const carica = () => void api.get<typeof dati>('/notifiche').then(setDati).catch(() => {})
    carica()
    const t = setInterval(carica, 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!aperto) return
    const fuori = (e: MouseEvent) => {
      if (riferimento.current && !riferimento.current.contains(e.target as Node)) setAperto(false)
    }
    document.addEventListener('mousedown', fuori)
    return () => document.removeEventListener('mousedown', fuori)
  }, [aperto])

  async function apri() {
    const prossimo = !aperto
    setAperto(prossimo)
    if (prossimo && dati.daLeggere > 0) {
      await api.post('/notifiche/lette')
      setDati((d) => ({ ...d, daLeggere: 0 }))
    }
  }

  return (
    <div className="relative" ref={riferimento}>
      <button
        onClick={() => void apri()}
        aria-expanded={aperto}
        aria-label={dati.daLeggere > 0 ? `Notifiche, ${dati.daLeggere} da leggere` : 'Notifiche'}
        className="rounded-sm border border-filo bg-white px-3 py-1.5 text-[13px] text-az hover:border-az"
      >
        Notifiche{dati.daLeggere > 0 && <span className="ml-1.5 rounded-full bg-az px-1.5 py-0.5 text-[11px] text-white">{dati.daLeggere}</span>}
      </button>

      {aperto && (
        <div className="absolute right-0 z-30 mt-1 max-h-[70vh] w-96 overflow-y-auto rounded-sm border border-filo bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-filo px-3 py-2">
            <span className="text-xs font-medium text-grigio">Centro notifiche</span>
            <Bottone onClick={() => void iscriviPush().then(setMessaggioPush)}>Attiva push</Bottone>
          </div>
          {messaggioPush && <p className="border-b border-filo px-3 py-2 text-[11px] text-ambra">{messaggioPush}</p>}
          {dati.notifiche.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-tenue">Nessuna notifica.</p>}
          <ul>
            {dati.notifiche.map((n) => (
              <li key={n.id} className="border-b border-filo px-3 py-2.5 last:border-0">
                <p className="text-[13px] font-medium">{n.titolo}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-grigio">{n.corpo}</p>
                <p className="mt-1 text-[11px] text-tenue">{new Date(n.creatoIl).toLocaleString('it-IT')}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
