import { and, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type Env, HttpError } from '../context'
import { db, schema } from '../db/index'

export const notifications = new Hono<Env>()

notifications.get('/', async (c) => {
  const a = c.get('attore')
  const righe = await db.select().from(schema.notification)
    .where(eq(schema.notification.userId, a.id))
    .orderBy(desc(schema.notification.creatoIl)).limit(60)
  const daLeggere = righe.filter((n) => n.lettaIl == null).length
  return c.json({ notifiche: righe, daLeggere })
})

notifications.post('/lette', async (c) => {
  const a = c.get('attore')
  await db.update(schema.notification).set({ lettaIl: new Date() })
    .where(and(eq(schema.notification.userId, a.id), isNull(schema.notification.lettaIl)))
  return c.json({ ok: true })
})

notifications.get('/push/chiave', (c) => c.json({ chiave: process.env.VAPID_PUBLIC_KEY ?? null }))

notifications.post('/push/iscrivi', async (c) => {
  const a = c.get('attore')
  const b = z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
    dispositivo: z.string().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Iscrizione push non valida')
  await db.insert(schema.pushSubscription).values({
    userId: a.id, endpoint: b.data.endpoint, p256dh: b.data.keys.p256dh,
    auth: b.data.keys.auth, dispositivo: b.data.dispositivo?.slice(0, 200) ?? null,
  }).onDuplicateKeyUpdate({ set: { userId: a.id, p256dh: b.data.keys.p256dh, auth: b.data.keys.auth } })
  return c.json({ ok: true }, 201)
})

notifications.post('/push/disiscrivi', async (c) => {
  const b = z.object({ endpoint: z.string().url() }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Endpoint non valido')
  await db.delete(schema.pushSubscription).where(eq(schema.pushSubscription.endpoint, b.data.endpoint))
  return c.json({ ok: true })
})
