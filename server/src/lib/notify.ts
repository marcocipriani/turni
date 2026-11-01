import { eq, inArray } from 'drizzle-orm'
import webpush from 'web-push'
import { db, schema } from '../db/index'

let pushPronto = false
const pub = process.env.VAPID_PUBLIC_KEY
const priv = process.env.VAPID_PRIVATE_KEY
if (pub && priv) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@turni.test', pub, priv)
  pushPronto = true
}

export type Avviso = { tipo: string; titolo: string; corpo: string; link?: string }

const SERVIZI_PUSH = /(^|\.)(googleapis\.com|google\.com|push\.apple\.com|notify\.windows\.com|push\.services\.mozilla\.com)$/

/**
 * L'indirizzo di un'iscrizione lo manda il browser e il server ci fa una
 * richiesta: senza questo controllo, chi ha una sessione gli fa chiamare ciò che
 * vuole. Solo i servizi push dei browser, e solo scritti nella forma normale:
 * web-push rilegge l'indirizzo con un altro parser, e i due non devono poter
 * capire due cose diverse.
 */
export function servizioPushNoto(endpoint: string) {
  try {
    const u = new URL(endpoint)
    return u.href === endpoint && u.protocol === 'https:' && u.port === '' && SERVIZI_PUSH.test(u.hostname)
  } catch {
    return false
  }
}

/**
 * Il centro notifiche riceve sempre tutto; il push è un di più che può fallire
 * senza compromettere l'operazione che l'ha generato.
 */
export async function avvisa(destinatari: number[], a: Avviso) {
  const utenti = [...new Set(destinatari)].filter((n) => Number.isInteger(n))
  if (utenti.length === 0) return

  await db.insert(schema.notification).values(
    utenti.map((userId) => ({ userId, tipo: a.tipo, titolo: a.titolo, corpo: a.corpo, link: a.link ?? null })),
  )
  if (!pushPronto) return

  const iscrizioni = await db
    .select()
    .from(schema.pushSubscription)
    .where(inArray(schema.pushSubscription.userId, utenti))

  const payload = JSON.stringify({ titolo: a.titolo, corpo: a.corpo, link: a.link ?? '/' })
  // Il filtro vale anche per le iscrizioni salvate prima del controllo.
  await Promise.all(iscrizioni.filter((s) => servizioPushNoto(s.endpoint)).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
    } catch (e: unknown) {
      // Iscrizione revocata dal browser: si rimuove invece di riprovare all'infinito.
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await db.delete(schema.pushSubscription).where(eq(schema.pushSubscription.id, s.id))
      }
    }
  }))
}
