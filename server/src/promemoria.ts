/**
 * Il promemoria della sera: «domani in sede, stanza 101». Lo lancia il cron del
 * pannello di hosting una volta al giorno, domenica compresa — il lunedì ha la
 * sua sera prima. Nessun processo resta vivo ad aspettare le 18: su un piano
 * condiviso il server si addormenta, il cron no.
 *
 *   npm run promemoria                  la giornata di domani
 *   npm run promemoria -- 2026-09-14    una giornata indicata, per riprovare a mano
 */
import 'dotenv/config'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { db, pool, schema } from './db/index'
import { addDays } from './lib/dates'
import { avvisa } from './lib/notify'
import { daAvvisare, seraItaliana, testoPromemoria } from './lib/promemoria'
import { giorniIndisponibili } from './routes/absences'

async function main() {
  const { oggi, invia } = seraItaliana(new Date())
  if (!process.argv[2] && !invia) return console.log('Attendo le 18 in Europe/Rome.')
  const domani = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] ?? '') ? process.argv[2]! : addDays(oggi, 1)

  const periodi = await db.select({ id: schema.period.id }).from(schema.period).where(and(
    eq(schema.period.stato, 'pubblicato'), lte(schema.period.dataInizio, domani), gte(schema.period.dataFine, domani)))
  if (periodi.length === 0) return console.log('Nessun periodo pubblicato copre domani.')

  const celle = await db.select().from(schema.assignment).where(and(
    inArray(schema.assignment.periodId, periodi.map((p) => p.id)),
    eq(schema.assignment.data, domani), eq(schema.assignment.stato, 'presenza')))
  if (celle.length === 0) return console.log('Domani nessuno è in sede.')

  const ids = [...new Set(celle.map((c) => c.userId))]
  const [attivi, assenti, gia] = await Promise.all([
    db.select({ userId: schema.userPreference.userId }).from(schema.userPreference)
      .where(and(inArray(schema.userPreference.userId, ids), eq(schema.userPreference.promemoriaSera, true))),
    giorniIndisponibili(ids, domani, domani),
    // «Oggi» è il giorno del server: il cron parte una volta, alla stessa ora.
    db.select({ userId: schema.notification.userId }).from(schema.notification).where(and(
      eq(schema.notification.tipo, 'promemoria'), gte(schema.notification.creatoIl, new Date(`${oggi}T00:00:00Z`)))),
  ])

  const scelte = daAvvisare(celle, {
    data: domani, attivi: new Set(attivi.map((r) => r.userId)), assenti,
    giaAvvisati: new Set(gia.map((r) => r.userId)),
  })
  if (scelte.length === 0) return console.log('Promemoria inviati: 0.')

  const stanze = new Map((await db.select().from(schema.room)).map((r) => [r.id, r.etichetta]))
  const scrivanie = new Map((await db.select().from(schema.desk)).map((d) => [d.id, d.numero]))
  for (const c of scelte) {
    await avvisa([c.userId], {
      tipo: 'promemoria', titolo: 'Domani in sede',
      corpo: testoPromemoria(c.roomId != null ? stanze.get(c.roomId) ?? null : null,
                             c.deskId != null ? scrivanie.get(c.deskId) ?? null : null),
      link: '/mio',
    })
  }
  console.log(`Promemoria inviati: ${scelte.length}.`)
}

main()
  .catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exitCode = 1 })
  .finally(() => pool.end())
