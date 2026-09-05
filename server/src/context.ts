import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { db, schema } from './db/index'
import type { Albero, Attore } from './permissions'

export type Env = { Variables: { attore: Attore; albero: Albero } }

/** L'albero organizzativo è piccolo: si carica intero invece di interrogarlo a rami. */
export async function caricaAlbero(): Promise<Albero> {
  const righe = await db.select({ id: schema.unit.id, parentId: schema.unit.parentId }).from(schema.unit)
  return new Map(righe.map((r) => [r.id, r.parentId]))
}

export async function caricaAttore(userId: number): Promise<Attore | null> {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1)
  if (!u || !u.attivo) return null
  const deleghe = await db
    .select({ unitId: schema.organizer.unitId })
    .from(schema.organizer)
    .where(eq(schema.organizer.userId, userId))
  return { id: u.id, ruolo: u.ruolo, unitId: u.unitId, organizzatoreDi: deleghe.map((d) => d.unitId) }
}

export const attore = (c: Context<Env>) => c.get('attore')
export const albero = (c: Context<Env>) => c.get('albero')

export class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 422, message: string) {
    super(message)
  }
}

export const vietato = (msg = 'Operazione non consentita') => new HttpError(403, msg)
export const nonTrovato = (msg = 'Risorsa non trovata') => new HttpError(404, msg)
export const invalido = (msg: string) => new HttpError(422, msg)
