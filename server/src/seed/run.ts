import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq, like, not, sql } from 'drizzle-orm'
import { db, pool, schema } from '../db/index'
import { italianHolidays } from '../lib/dates'
import { hashPassword } from '../lib/password'

type Dati = {
  radice: { nome: string; sigla: string; dirigente: { nome: string; cognome: string } }
  figlia: { nome: string; sigla: string; dirigente: { nome: string; cognome: string } }
  stanze: { etichetta: string; piano: string; scrivanie: number }[]
  settoriPresidio: string[]
  organizzatori: { nome: string; cognome: string }[]
  persone: { nome: string; cognome: string; settore: string; assenze: string[] }[]
}

const dati: Dati = JSON.parse(readFileSync(fileURLToPath(new URL('./dati.json', import.meta.url)), 'utf8'))

const DOMINIO = process.env.SEED_EMAIL_DOMAIN ?? 'turni.test'
const PASSWORD = process.env.SEED_PASSWORD

const CAUSALI = [
  ['ferie', 'Ferie'], ['festivita_soppressa', 'Festività soppressa'],
  ['permesso_personale', 'Permesso personale'], ['legge_104', 'Permesso L. 104/1992'],
  ['malattia', 'Malattia'], ['visita_medica', 'Visita medica o accertamento'],
  ['missione', 'Missione o trasferta'], ['formazione', 'Formazione'],
  ['congedo_parentale', 'Congedo parentale'], ['permesso_sindacale', 'Permesso sindacale'],
  ['donazione_sangue', 'Donazione sangue'], ['lutto', 'Permesso per lutto'],
  ['altro', 'Altro permesso'],
]

const senzaAccenti = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toLowerCase()

/** Indirizzo sintetico: nessun indirizzo istituzionale reale entra nell'archivio di prova. */
const emailDi = (nome: string, cognome: string) =>
  `${senzaAccenti(nome).slice(0, 1)}.${senzaAccenti(cognome)}@${DOMINIO}`

async function guardie() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Il popolamento di prova non gira in produzione.')
  }
  if (!PASSWORD || PASSWORD.length < 8) {
    throw new Error('SEED_PASSWORD non impostata, o troppo corta: servono almeno 8 caratteri.')
  }
  // Rifiuta di toccare un archivio che contiene utenze reali.
  const reali = await db.select({ n: sql<number>`count(*)` }).from(schema.user)
    .where(not(like(schema.user.email, `%@${DOMINIO}`)))
  if ((reali[0]?.n ?? 0) > 0) {
    throw new Error(
      `Trovate ${reali[0]!.n} utenze con indirizzi diversi da @${DOMINIO}: ` +
      'questo archivio contiene dati reali e il popolamento di prova si ferma.',
    )
  }
}

async function svuota() {
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`)
  for (const t of ['assignment', 'period_snapshot', 'period', 'absence', 'absence_rule',
    'user_preference', 'recurring_rule', 'organizer', 'notification', 'push_subscription',
    'session', 'audit_log', 'desk', 'room', 'sector', 'user', 'unit', 'holiday', 'absence_reason']) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${t}\``))
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`)
}

async function main() {
  await guardie()
  await svuota()
  const hash = await hashPassword(PASSWORD!)

  await db.insert(schema.absenceReason).values(
    CAUSALI.map(([codice, etichetta], i) => ({ codice: codice!, etichetta: etichetta!, ordine: i })),
  )
  await db.insert(schema.holiday).values(
    [...italianHolidays(2026), ...italianHolidays(2027)].map((h) => ({ ...h, unitId: null })),
  )

  await db.insert(schema.user).values({
    email: `admin@${DOMINIO}`, passwordHash: hash, nome: 'Amministratore', cognome: 'Sistema',
    ruolo: 'admin', unitId: null,
  })

  const [radice] = await db.insert(schema.unit).values({ nome: dati.radice.nome, sigla: dati.radice.sigla })
  const radiceId = radice.insertId
  await db.insert(schema.user).values({
    email: emailDi(dati.radice.dirigente.nome, dati.radice.dirigente.cognome), passwordHash: hash,
    nome: dati.radice.dirigente.nome, cognome: dati.radice.dirigente.cognome,
    ruolo: 'dirigente', unitId: radiceId,
  })

  const [figlia] = await db.insert(schema.unit)
    .values({ nome: dati.figlia.nome, sigla: dati.figlia.sigla, parentId: radiceId })
  const figliaId = figlia.insertId
  await db.insert(schema.user).values({
    email: emailDi(dati.figlia.dirigente.nome, dati.figlia.dirigente.cognome), passwordHash: hash,
    nome: dati.figlia.dirigente.nome, cognome: dati.figlia.dirigente.cognome,
    ruolo: 'dirigente', unitId: figliaId,
  })

  // Le stanze appartengono all'unità radice.
  for (const s of dati.stanze) {
    const [r] = await db.insert(schema.room)
      .values({ unitId: radiceId, etichetta: s.etichetta, piano: s.piano })
    await db.insert(schema.desk).values(
      Array.from({ length: s.scrivanie }, (_, i) => ({
        roomId: r.insertId, numero: String(i + 1), x: 40 + i * 120, y: 60,
      })),
    )
  }

  const nomiSettori = [...new Set(dati.persone.map((p) => p.settore))]
  const settori = new Map<string, number>()
  for (const [i, nome] of nomiSettori.entries()) {
    const [s] = await db.insert(schema.sector).values({
      unitId: figliaId, nome, ordine: i, richiedePresidio: dati.settoriPresidio.includes(nome),
    })
    settori.set(nome, s.insertId)
  }

  const dirigenteFigliaNome = `${dati.figlia.dirigente.cognome} ${dati.figlia.dirigente.nome}`
  const dipendenti = dati.persone.filter((p) => `${p.cognome} ${p.nome}` !== dirigenteFigliaNome)
  const idPerNome = new Map<string, number>()
  for (const p of dipendenti) {
    const [u] = await db.insert(schema.user).values({
      email: emailDi(p.nome, p.cognome), passwordHash: hash, nome: p.nome, cognome: p.cognome,
      ruolo: 'dipendente', unitId: figliaId, sectorId: settori.get(p.settore) ?? null,
    })
    idPerNome.set(`${p.cognome} ${p.nome}`, u.insertId)
  }

  const [dirFiglia] = await db.select({ id: schema.user.id }).from(schema.user)
    .where(eq(schema.user.unitId, figliaId)).limit(1)
  for (const o of dati.organizzatori) {
    const uid = idPerNome.get(`${o.cognome} ${o.nome}`)
    if (uid && dirFiglia) {
      await db.insert(schema.organizer).values({ userId: uid, unitId: figliaId, nominatoDa: dirFiglia.id })
    }
  }

  const assenze = dipendenti.flatMap((p) => {
    const uid = idPerNome.get(`${p.cognome} ${p.nome}`)
    if (!uid) return []
    return p.assenze.map((d) => ({ userId: uid, dataInizio: d, dataFine: d, causale: 'ferie' }))
  })
  if (assenze.length) await db.insert(schema.absence).values(assenze)

  console.log(`
Popolamento di prova completato.

  Unità radice      ${dati.radice.nome} (${dati.radice.sigla}) — stanze e scrivanie
  Unità figlia      ${dati.figlia.nome} (${dati.figlia.sigla})
  Settori           ${nomiSettori.join(', ')}
  Dipendenti        ${dipendenti.length}
  Assenze caricate  ${assenze.length}

  Accessi (password unica: la variabile SEED_PASSWORD)
    amministratore  admin@${DOMINIO}
    dirigente DIP   ${emailDi(dati.radice.dirigente.nome, dati.radice.dirigente.cognome)}
    dirigente UCS   ${emailDi(dati.figlia.dirigente.nome, dati.figlia.dirigente.cognome)}
    organizzatore   ${dati.organizzatori.map((o) => emailDi(o.nome, o.cognome)).join(', ')}

  Nessun indirizzo istituzionale reale è stato importato.
`)
  await pool.end()
}

main().catch(async (e) => {
  console.error(String(e instanceof Error ? e.message : e))
  await pool.end()
  process.exit(1)
})
