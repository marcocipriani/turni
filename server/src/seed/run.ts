import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq, like, not, sql } from 'drizzle-orm'
import { db, pool, schema } from '../db/index'
import { italianHolidays } from '../lib/dates'
import { dividiNome, indirizzoDa } from '../lib/nomi'
import { hashPassword } from '../lib/password'

/** Le persone arrivano come stringa «Cognome Nome», l'ordine dell'archivio di origine. */
type Dati = {
  radice: { nome: string; sigla: string; dirigente: string }
  figlia: { nome: string; sigla: string; dirigente: string }
  stanze: { etichetta: string; piano: string; scrivanie: number }[]
  settoriPresidio: string[]
  organizzatori: string[]
  persone: { persona: string; settore: string; assenze: string[] }[]
}

/**
 * L'archivio di prova versionato ha nomi inventati. Chi lavora su un ambiente
 * proprio può puntare SEED_DATI a un altro file della stessa forma, che resta
 * fuori dal repository: i dati del personale non hanno motivo di entrarci.
 */
const PERCORSO_DATI = process.env.SEED_DATI
  ? new URL(process.env.SEED_DATI, `file://${process.cwd()}/`)
  : new URL('./dati.json', import.meta.url)
const dati: Dati = JSON.parse(readFileSync(fileURLToPath(PERCORSO_DATI), 'utf8'))

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

/** Nome e cognome di una persona dell'archivio di origine, che li scrive attaccati. */
const anagrafica = (completo: string) => dividiNome(completo)

/** Indirizzo sintetico: nessun indirizzo istituzionale reale entra nell'archivio di prova. */
const emailDi = (completo: string) => {
  const { nome, cognome } = anagrafica(completo)
  return indirizzoDa(nome, cognome, DOMINIO)
}

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
  for (const t of ['scambio', 'assignment', 'period_snapshot', 'period', 'absence', 'absence_rule',
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
  const dirRadice = anagrafica(dati.radice.dirigente)
  await db.insert(schema.user).values({
    email: emailDi(dati.radice.dirigente), passwordHash: hash,
    nome: dirRadice.nome, cognome: dirRadice.cognome,
    ruolo: 'dirigente', unitId: radiceId,
  })

  const [figlia] = await db.insert(schema.unit)
    .values({ nome: dati.figlia.nome, sigla: dati.figlia.sigla, parentId: radiceId })
  const figliaId = figlia.insertId
  const dirFigliaAnag = anagrafica(dati.figlia.dirigente)
  await db.insert(schema.user).values({
    email: emailDi(dati.figlia.dirigente), passwordHash: hash,
    nome: dirFigliaAnag.nome, cognome: dirFigliaAnag.cognome,
    ruolo: 'dirigente', unitId: figliaId,
  })

  // Le stanze stanno sull'unità che le usa, che è la stessa che programma:
  // un periodo cerca la capienza fra le stanze della propria unità.
  for (const s of dati.stanze) {
    const [r] = await db.insert(schema.room)
      .values({ unitId: figliaId, etichetta: s.etichetta, piano: s.piano })
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

  const dipendenti = dati.persone.filter((p) => p.persona !== dati.figlia.dirigente)
  const idPerNome = new Map<string, number>()
  for (const p of dipendenti) {
    const { nome, cognome } = anagrafica(p.persona)
    const [u] = await db.insert(schema.user).values({
      email: emailDi(p.persona), passwordHash: hash, nome, cognome,
      ruolo: 'dipendente', unitId: figliaId, sectorId: settori.get(p.settore) ?? null,
    })
    idPerNome.set(p.persona, u.insertId)
  }

  const [dirFiglia] = await db.select({ id: schema.user.id }).from(schema.user)
    .where(eq(schema.user.unitId, figliaId)).limit(1)
  for (const o of dati.organizzatori) {
    const uid = idPerNome.get(o)
    if (uid && dirFiglia) {
      await db.insert(schema.organizer).values({ userId: uid, unitId: figliaId, nominatoDa: dirFiglia.id })
    }
  }

  const assenze = dipendenti.flatMap((p) => {
    const uid = idPerNome.get(p.persona)
    if (!uid) return []
    return p.assenze.map((d) => ({ userId: uid, dataInizio: d, dataFine: d, causale: 'ferie' }))
  })
  if (assenze.length) await db.insert(schema.absence).values(assenze)

  console.log(`
Popolamento di prova completato.

  Unità radice      ${dati.radice.nome} (${dati.radice.sigla})
  Unità figlia      ${dati.figlia.nome} (${dati.figlia.sigla}) — stanze, settori, persone
  Settori           ${nomiSettori.join(', ')}
  Dipendenti        ${dipendenti.length}
  Assenze caricate  ${assenze.length}

  Accessi (password unica: la variabile SEED_PASSWORD)
    amministratore  admin@${DOMINIO}
    dirigente DIP   ${emailDi(dati.radice.dirigente)}
    dirigente UCS   ${emailDi(dati.figlia.dirigente)}
    organizzatore   ${dati.organizzatori.map(emailDi).join(', ')}

  Nessun indirizzo istituzionale reale è stato importato: gli indirizzi sono
  costruiti dai nomi, sul dominio di prova.
`)
  await pool.end()
}

main().catch(async (e) => {
  console.error(String(e instanceof Error ? e.message : e))
  await pool.end()
  process.exit(1)
})
