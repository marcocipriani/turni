/**
 * Primo popolamento di un'installazione vera.
 *
 * Il popolamento di prova si rifiuta di girare in produzione, ed è giusto così:
 * crea utenze con una password unica e nota. Qui invece si parte da un file di
 * persone reali, e ciascuna riceve una password diversa, casuale, mostrata una
 * volta sola su questo terminale e mai più recuperabile.
 *
 *   npm run avvio -w server -- persone.csv --dominio comune.it
 *   npm run avvio -w server -- nuovi.csv --aggiungi
 *
 * Il formato è un CSV con punto e virgola, una riga di intestazione e queste
 * colonne (l'ordine non conta, le facoltative si possono omettere):
 *
 *   persona          «Cognome Nome», come nell'anagrafica di origine
 *   ruolo            admin | dirigente | dipendente
 *   unita            nome dell'unità organizzativa; creata se non esiste
 *   sigla            facoltativa, sigla dell'unità
 *   unitaPadre       facoltativa, nome dell'unità superiore
 *   settore          facoltativo; creato se non esiste
 *   presidio         facoltativo, «si» se il settore richiede presidio
 *   organizzatore    facoltativo, «si» per delegare la programmazione
 *   email            facoltativa; senza, si costruisce da nome e sigla
 *
 * Il cognome viene troncato a tre caratteri prima di entrare nell'archivio,
 * come ovunque: vedi lib/nomi.ts.
 */
import 'dotenv/config'
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { db, pool, schema } from './db/index'
import { italianHolidays } from './lib/dates'
import { dividiNome, siglaCognome } from './lib/nomi'
import { hashPassword } from './lib/password'

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : d
}
const AGGIUNGI = process.argv.includes('--aggiungi')
const DOMINIO = arg('dominio')
const FILE = process.argv.slice(2).find((a) => !a.startsWith('--') && a.endsWith('.csv'))

const CAUSALI = [
  ['ferie', 'Ferie'], ['festivita_soppressa', 'Festività soppressa'],
  ['permesso_personale', 'Permesso personale'], ['legge_104', 'Permesso L. 104/1992'],
  ['malattia', 'Malattia'], ['visita_medica', 'Visita medica o accertamento'],
  ['missione', 'Missione o trasferta'], ['formazione', 'Formazione'],
  ['congedo_parentale', 'Congedo parentale'], ['permesso_sindacale', 'Permesso sindacale'],
  ['donazione_sangue', 'Donazione sangue'], ['lutto', 'Permesso per lutto'],
  ['altro', 'Altro permesso'],
]

/**
 * Alfabeto senza caratteri che si confondono a voce o su carta: niente 0 e O,
 * niente 1 e l e I. Queste password si dettano a mano, e una lettera fraintesa
 * diventa una telefonata.
 */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
const passwordCasuale = () =>
  Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')).join('-')

const senzaAccenti = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toLowerCase()

const si = (v: string | undefined) => ['si', 'sì', 'x', 'true', '1'].includes((v ?? '').trim().toLowerCase())

/** CSV con punto e virgola. Niente librerie: virgolette e righe multiple non servono qui. */
function leggiCsv(testo: string): Record<string, string>[] {
  const righe = testo.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim())
  if (righe.length < 2) throw new Error('Il file non contiene righe oltre all\'intestazione.')
  const intestazione = righe[0]!.split(';').map((c) => c.trim())
  return righe.slice(1).map((r, i) => {
    const celle = r.split(';')
    if (celle.length > intestazione.length) {
      throw new Error(`Riga ${i + 2}: più colonne dell'intestazione. Il separatore è il punto e virgola.`)
    }
    return Object.fromEntries(intestazione.map((c, j) => [c, (celle[j] ?? '').trim()]))
  })
}

async function main() {
  if (!FILE) {
    console.error(`
Serve un file CSV.

  npm run avvio -w server -- persone.csv --dominio comune.it

Colonne: persona;ruolo;unita;sigla;unitaPadre;settore;presidio;organizzatore;email
Un esempio pronto sta in server/src/seed/persone.esempio.csv
`)
    process.exit(1)
  }

  const righe = leggiCsv(readFileSync(FILE, 'utf8'))

  const conteggio = await db.select({ n: sql<number>`count(*)` }).from(schema.user)
  const quanti = Number(conteggio[0]?.n ?? 0)
  if (quanti > 0 && !AGGIUNGI) {
    throw new Error(
      `L'archivio contiene già ${quanti} utenze. Per aggiungere persone a un'installazione ` +
      'avviata usa --aggiungi; per ripartire da zero, svuota il database a mano.',
    )
  }

  /* ── Controlli sul file, tutti prima di scrivere qualsiasi cosa ───── */

  const errori: string[] = []
  const emailViste = new Set<string>()
  type Persona = { nome: string; sigla: string; email: string; riga: Record<string, string> }
  const persone: Persona[] = []

  for (const [i, r] of righe.entries()) {
    const dove = `riga ${i + 2}`
    if (!r.persona) { errori.push(`${dove}: manca la colonna «persona».`); continue }
    if (!['admin', 'dirigente', 'dipendente'].includes(r.ruolo ?? '')) {
      errori.push(`${dove}: ruolo «${r.ruolo}» non valido (admin, dirigente o dipendente).`); continue
    }
    if (r.ruolo !== 'admin' && !r.unita) { errori.push(`${dove}: serve l'unità organizzativa.`); continue }

    let nome: string, cognome: string
    try { ({ nome, cognome } = dividiNome(r.persona!)) }
    catch (e) { errori.push(`${dove}: ${(e as Error).message}`); continue }

    const sigla = siglaCognome(cognome)
    const email = (r.email || (DOMINIO ? `${senzaAccenti(nome)}.${senzaAccenti(sigla)}@${DOMINIO}` : '')).toLowerCase()
    if (!email) { errori.push(`${dove}: nessuna email, e nessun --dominio con cui costruirla.`); continue }
    if (emailViste.has(email)) { errori.push(`${dove}: indirizzo ripetuto «${email}».`); continue }
    emailViste.add(email)

    persone.push({ nome, sigla, email, riga: r })
  }

  // Un'unità ha un dirigente solo: il database lo impone, ma dirlo qui evita
  // di lasciare l'archivio a metà.
  const dirigentiPerUnita = new Map<string, number>()
  for (const p of persone) {
    if (p.riga.ruolo !== 'dirigente') continue
    const u = p.riga.unita!
    dirigentiPerUnita.set(u, (dirigentiPerUnita.get(u) ?? 0) + 1)
  }
  for (const [u, n] of dirigentiPerUnita) {
    if (n > 1) errori.push(`L'unità «${u}» ha ${n} dirigenti: ne è previsto uno solo.`)
  }
  const unitaCitate = new Set(persone.filter((p) => p.riga.unita).map((p) => p.riga.unita!))
  for (const u of unitaCitate) {
    if (!dirigentiPerUnita.has(u)) errori.push(`L'unità «${u}» non ha nessun dirigente.`)
  }

  if (errori.length) {
    console.error(`\nIl file non è utilizzabile. Niente è stato scritto.\n`)
    for (const e of errori) console.error(`  ${e}`)
    console.error('')
    process.exit(1)
  }

  /* ── Cataloghi, solo alla prima installazione ─────────────────────── */

  if (quanti === 0) {
    await db.insert(schema.absenceReason).values(
      CAUSALI.map(([codice, etichetta], i) => ({ codice: codice!, etichetta: etichetta!, ordine: i })))
    const anno = new Date().getFullYear()
    await db.insert(schema.holiday).values(
      [...italianHolidays(anno), ...italianHolidays(anno + 1)].map((h) => ({ ...h, unitId: null })))
    console.log(`  ${CAUSALI.length} causali di assenza e le festività di ${anno} e ${anno + 1}`)
  }

  /* ── Unità, in due passate: prima tutte, poi i legami di parentela ── */

  const unitaId = new Map<string, number>()
  const esistenti = await db.select().from(schema.unit)
  for (const u of esistenti) unitaId.set(u.nome, u.id)

  for (const p of persone) {
    const nome = p.riga.unita
    if (!nome || unitaId.has(nome)) continue
    const [ins] = await db.insert(schema.unit).values({ nome, sigla: p.riga.sigla || null })
    unitaId.set(nome, ins.insertId)
    console.log(`  unità: ${nome}`)
  }
  for (const p of persone) {
    const padre = p.riga.unitaPadre
    if (!padre || !p.riga.unita) continue
    if (!unitaId.has(padre)) { console.warn(`  attenzione: unità padre «${padre}» non trovata`); continue }
    await db.update(schema.unit).set({ parentId: unitaId.get(padre)! })
      .where(eq(schema.unit.id, unitaId.get(p.riga.unita)!))
  }

  /* ── Settori ──────────────────────────────────────────────────────── */

  const settoreId = new Map<string, number>()
  for (const s of await db.select().from(schema.sector)) settoreId.set(`${s.unitId}|${s.nome}`, s.id)
  for (const p of persone) {
    const nome = p.riga.settore
    if (!nome || !p.riga.unita) continue
    const uid = unitaId.get(p.riga.unita)!
    const k = `${uid}|${nome}`
    if (settoreId.has(k)) continue
    const [ins] = await db.insert(schema.sector).values({
      unitId: uid, nome, richiedePresidio: si(p.riga.presidio), ordine: settoreId.size,
    })
    settoreId.set(k, ins.insertId)
    console.log(`  settore: ${nome}${si(p.riga.presidio) ? ' (presidio)' : ''}`)
  }

  /* ── Persone ──────────────────────────────────────────────────────── */

  const credenziali: { nome: string; email: string; password: string; ruolo: string }[] = []
  const idPerEmail = new Map<string, number>()

  for (const p of persone) {
    const password = passwordCasuale()
    const uid = p.riga.unita ? unitaId.get(p.riga.unita)! : null
    const sid = p.riga.settore && uid ? settoreId.get(`${uid}|${p.riga.settore}`) ?? null : null
    const [ins] = await db.insert(schema.user).values({
      email: p.email,
      passwordHash: await hashPassword(password),
      nome: p.nome,
      cognome: p.sigla,
      ruolo: p.riga.ruolo as 'admin' | 'dirigente' | 'dipendente',
      unitId: uid,
      sectorId: sid,
      passwordDaCambiare: true,
    })
    idPerEmail.set(p.email, ins.insertId)
    credenziali.push({ nome: `${p.nome} ${p.sigla}`, email: p.email, password, ruolo: p.riga.ruolo! })
  }

  /* ── Deleghe di organizzatore ─────────────────────────────────────── */

  for (const p of persone) {
    if (!si(p.riga.organizzatore) || !p.riga.unita) continue
    const uid = unitaId.get(p.riga.unita)!
    const dirigente = persone.find((x) => x.riga.ruolo === 'dirigente' && x.riga.unita === p.riga.unita)
    const nominatoDa = dirigente ? idPerEmail.get(dirigente.email) : undefined
    if (!nominatoDa) continue
    await db.insert(schema.organizer).values({ userId: idPerEmail.get(p.email)!, unitId: uid, nominatoDa })
    console.log(`  organizzatore: ${p.nome} ${p.sigla}`)
  }

  /* ── Le password, una volta sola ──────────────────────────────────── */

  const largo = Math.max(...credenziali.map((c) => c.email.length), 5)
  console.log(`

${'='.repeat(largo + 42)}
  CREDENZIALI DI PRIMO ACCESSO — non verranno mostrate di nuovo.
  Consegnale a voce o su carta, non per posta elettronica.
  Al primo accesso ciascuno deve cambiare la propria.
${'='.repeat(largo + 42)}
`)
  console.log(`  ${'indirizzo'.padEnd(largo)}  ${'password'.padEnd(19)}  persona`)
  console.log(`  ${'-'.repeat(largo)}  ${'-'.repeat(19)}  ${'-'.repeat(24)}`)
  for (const c of credenziali) {
    console.log(`  ${c.email.padEnd(largo)}  ${c.password.padEnd(19)}  ${c.nome}${c.ruolo === 'dipendente' ? '' : ` (${c.ruolo})`}`)
  }
  console.log(`
${'='.repeat(largo + 42)}

${credenziali.length} utenze create. Stanze e scrivanie si aggiungono da
«Struttura», entrando come dirigente dell'unità che le possiede.
`)
  await pool.end()
}

main().catch(async (e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`)
  await pool.end()
  process.exit(1)
})
