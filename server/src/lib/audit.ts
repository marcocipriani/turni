import { db, schema } from '../db/index'

export async function traccia(v: {
  entita: string
  entitaId?: string | number | null
  azione: string
  utente?: number | null
  prima?: unknown
  dopo?: unknown
  motivazione?: string | null
}) {
  await db.insert(schema.auditLog).values({
    entita: v.entita,
    entitaId: v.entitaId == null ? null : String(v.entitaId),
    azione: v.azione,
    utente: v.utente ?? null,
    prima: (v.prima ?? null) as never,
    dopo: (v.dopo ?? null) as never,
    motivazione: v.motivazione ?? null,
  })
}
