import { useEffect, useState } from 'react'
import { api, type Notifica } from '../api'
import * as I from '../icone'
import { Bottone, Messaggio, Scheletro, StatoVuoto } from '../ui'
import { Vista } from '../Vista'

/** Iscrizione push: fallisce in modo leggibile dove non è supportata. */
async function iscriviPush(): Promise<string> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'Questo browser non supporta le notifiche push.'
  }
  const { chiave } = await api.get<{ chiave: string | null }>('/notifiche/push/chiave')
  if (!chiave) return 'Le notifiche push non sono configurate sul server: mancano le chiavi VAPID.'
  if ((await Notification.requestPermission()) !== 'granted') return 'Permesso negato dal browser.'

  const reg = await navigator.serviceWorker.register('/sw.js')
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiave })
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } }
  await api.post('/notifiche/push/iscrivi', {
    endpoint: j.endpoint, keys: j.keys, dispositivo: navigator.userAgent.slice(0, 200),
  })
  return 'Fatto. Le notifiche arriveranno anche a scheda chiusa.'
}

const quando = (iso: string) => new Date(iso).toLocaleString('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export default function Notifiche() {
  const [dati, setDati] = useState<{ notifiche: Notifica[]; daLeggere: number } | null>(null)
  const [messaggio, setMessaggio] = useState<string | null>(null)

  useEffect(() => {
    void api.get<{ notifiche: Notifica[]; daLeggere: number }>('/notifiche').then(async (d) => {
      setDati(d)
      if (d.daLeggere > 0) await api.post('/notifiche/lette')
    })
  }, [])

  return (
    <Vista
      titolo="Notifiche" icona={<I.Campana size={17} />} aiuto="Turni non manda messaggi di posta"
      azioni={<Bottone onClick={() => void iscriviPush().then(setMessaggio)}>Attiva le push</Bottone>}
    >
      <div className="flex max-w-[70ch] flex-col gap-4">
        {messaggio && <Messaggio>{messaggio}</Messaggio>}
        {!dati && <Scheletro righe={4} />}
        {dati?.notifiche.length === 0 && (
          <StatoVuoto testo="Nessuna notifica. Qui arrivano le pubblicazioni, le revisioni e le assenze che toccano una giornata già programmata." />
        )}
        {dati && dati.notifiche.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-r3 border border-border bg-surface">
            {dati.notifiche.map((n) => (
              <li key={n.id} className="flex gap-3 px-4 py-3">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.lettaIl ? 'bg-ink-faint' : 'bg-warn-ink'}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-base font-medium text-ink">
                    {n.titolo}{!n.lettaIl && <span className="solo-lettori-schermo"> (non letta)</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">{n.corpo}</p>
                  <p className="mono mt-1 text-2xs text-ink-faint">{quando(n.creatoIl)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Vista>
  )
}
