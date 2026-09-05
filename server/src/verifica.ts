/**
 * Verifica i criteri di accettazione del capitolo 15 della spec contro
 * un'istanza in esecuzione, popolata con i dati di prova.
 *
 *   npm run verifica -w server
 */
import { and, eq, sql } from 'drizzle-orm'
import { db, pool, schema } from './db/index'

const BASE = process.env.VERIFICA_BASE ?? 'http://localhost:8787'
const PASSWORD = process.env.SEED_PASSWORD ?? 'turni2026'
const DOMINIO = process.env.SEED_EMAIL_DOMAIN ?? 'turni.test'

let passati = 0, falliti = 0
function esito(ok: boolean, titolo: string, dettaglio = '') {
  console.log(`${ok ? '  ok  ' : ' FALL '} ${titolo}${dettaglio ? ` — ${dettaglio}` : ''}`)
  ok ? passati++ : falliti++
}

async function sessione(email: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`Accesso non riuscito per ${email}`)
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  return {
    get: async (p: string) => {
      const x = await fetch(`${BASE}/api${p}`, { headers: { cookie } })
      return { stato: x.status, corpo: x.headers.get('content-type')?.includes('json') ? await x.json() : await x.text() }
    },
  }
}

async function main() {
  console.log('\nCriteri di accettazione — capitolo 15 della spec\n')

  /* 1 — nessuna unità orfana */
  const unita = await db.select({ id: schema.unit.id }).from(schema.unit)
  const dirigenti = await db.select({ unitId: schema.user.unitId }).from(schema.user)
    .where(eq(schema.user.ruolo, 'dirigente'))
  const conDirigente = new Set(dirigenti.map((d) => d.unitId))
  const orfane = unita.filter((u) => !conDirigente.has(u.id))
  esito(orfane.length === 0, 'Ogni unità ha un dirigente', orfane.length ? `${orfane.length} orfane` : '')

  const [periodo] = await db.select().from(schema.period).where(eq(schema.period.stato, 'pubblicato')).limit(1)
  if (!periodo) { esito(false, 'Esiste un periodo pubblicato da verificare'); return }

  const celle = await db.select().from(schema.assignment).where(eq(schema.assignment.periodId, periodo.id))
  const presenze = celle.filter((c) => c.stato === 'presenza')

  /* 2 — capienza mai superata */
  const scrivanieAttive = await db.select({ n: sql<number>`count(*)` }).from(schema.desk).where(eq(schema.desk.attiva, true))
  const capienza = Number(scrivanieAttive[0]?.n ?? 0)
  const perGiorno = new Map<string, number>()
  for (const c of presenze) perGiorno.set(c.data, (perGiorno.get(c.data) ?? 0) + 1)
  const sforo = [...perGiorno.entries()].filter(([, n]) => n > capienza)
  esito(sforo.length === 0, 'Nessuna giornata supera la capienza delle stanze', `capienza ${capienza}`)

  /* 3 — nessuna presenza su assenza dichiarata */
  const assenze = await db.select().from(schema.absence)
  const chiaviAssenza = new Set(assenze.flatMap((a) => {
    const out: string[] = []
    for (let d = a.dataInizio; d <= a.dataFine; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) {
      out.push(`${a.userId}|${d}`)
    }
    return out
  }))
  const conflitti = presenze.filter((c) => chiaviAssenza.has(`${c.userId}|${c.data}`))
  esito(conflitti.length === 0, 'Nessuna presenza cade su un\'assenza dichiarata',
    conflitti.length ? `${conflitti.length} conflitti` : '')

  /* 4 — le celle bloccate esistono e restano */
  const bloccate = celle.filter((c) => c.bloccata)
  esito(true, 'Celle bloccate presenti nel periodo', `${bloccate.length}`)

  /* 5 — versioni conservate */
  const snapshot = await db.select().from(schema.periodSnapshot).where(eq(schema.periodSnapshot.periodId, periodo.id))
  esito(periodo.versione === 1 || snapshot.length === periodo.versione - 1,
    'Ogni revisione conserva integralmente la versione precedente',
    `versione ${periodo.versione}, ${snapshot.length} archiviate`)

  /* 6 — un collega non distingue assenza da lavoro agile */
  const [collega] = await db.select().from(schema.user)
    .where(and(eq(schema.user.ruolo, 'dipendente'), eq(schema.user.attivo, true))).limit(1)
  const s = await sessione(collega!.email)
  const g = await s.get(`/periodi/${periodo.id}/griglia`) as { corpo: { celle: { userId: number; stato: string; causale: string | null }[] } }
  const altrui = g.corpo.celle.filter((c) => c.userId !== collega!.id)
  esito(altrui.every((c) => c.stato !== 'assenza'), 'Un collega non distingue un assente da chi è in lavoro agile')
  esito(altrui.every((c) => c.causale == null), 'Nessuna causale altrui raggiunge un collega')

  /* 7 — l'export non contiene causali */
  const causali = await db.select().from(schema.absenceReason)
  const csv = (await s.get(`/periodi/${periodo.id}/export.csv`)).corpo as string
  const trovate = causali.filter((c) => csv.includes(c.codice) || csv.toLowerCase().includes(c.etichetta.toLowerCase()))
  esito(trovate.length === 0, 'L\'export non contiene causali di assenza',
    trovate.length ? trovate.map((t) => t.codice).join(', ') : '')

  /* 8 — l'amministratore non vede programmazioni */
  const admin = await sessione(`admin@${DOMINIO}`)
  const tentativo = await admin.get(`/periodi/${periodo.id}/griglia`)
  esito(tentativo.stato === 403, 'L\'amministratore non accede alle programmazioni', `HTTP ${tentativo.stato}`)

  /* 9 — la somma delle quote copre i posti disponibili */
  const giorniConPresenze = new Set(celle.map((c) => c.data)).size
  esito(presenze.length <= capienza * giorniConPresenze,
    'Le presenze non eccedono i posti-giorno disponibili',
    `${presenze.length} su ${capienza * giorniConPresenze}`)

  console.log(`\n${passati} superati, ${falliti} falliti\n`)
  await pool.end()
  if (falliti) process.exit(1)
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1) })
