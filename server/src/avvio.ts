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
 * Le persone le carica il motore condiviso (lib/caricamento.ts), lo stesso che
 * serve `importa` e la pagina «Sistema»: qui attorno c'è solo ciò che riguarda
 * la prima volta — i cataloghi di partenza e il rifiuto di ripartire su un
 * archivio già popolato.
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
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { db, pool, schema } from './db/index'
import { carica } from './lib/caricamento'
import { italianHolidays } from './lib/dates'

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

async function main() {
  if (!FILE) {
    console.error(`
Serve un file CSV.

  npm run avvio -w server -- persone.csv --dominio comune.it

Colonne: persona;ruolo;unita;sigla;unitaPadre;settore;presidio;organizzatore;email
Il modello si stampa con: npm run importa -w server -- --modello persone
`)
    process.exit(1)
  }

  const conteggio = await db.select({ n: sql<number>`count(*)` }).from(schema.user)
  const quanti = Number(conteggio[0]?.n ?? 0)
  if (quanti > 0 && !AGGIUNGI) {
    throw new Error(
      `L'archivio contiene già ${quanti} utenze. Per aggiungere persone a un'installazione ` +
      'avviata usa --aggiungi; per ripartire da zero, svuota il database a mano.',
    )
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

  /* ── Persone, unità e settori ─────────────────────────────────────── */

  const e = await carica('persone', readFileSync(FILE, 'utf8'), { dominio: DOMINIO })
  for (const n of e.note) console.log(`  ${n}`)

  if (e.errori.length) {
    console.error('\nIl file non è utilizzabile. Niente è stato scritto.\n')
    for (const x of e.errori) console.error(`  ${x}`)
    console.error('')
    process.exit(1)
  }

  /* ── Le password, una volta sola ──────────────────────────────────── */

  const largo = Math.max(...e.credenziali.map((c) => c.email.length), 9)
  console.log(`

${'='.repeat(largo + 42)}
  CREDENZIALI DI PRIMO ACCESSO — non verranno mostrate di nuovo.
  Consegnale a voce o su carta, non per posta elettronica.
  Al primo accesso ciascuno deve cambiare la propria.
${'='.repeat(largo + 42)}
`)
  console.log(`  ${'indirizzo'.padEnd(largo)}  ${'password'.padEnd(19)}  persona`)
  console.log(`  ${'-'.repeat(largo)}  ${'-'.repeat(19)}  ${'-'.repeat(24)}`)
  for (const c of e.credenziali) {
    console.log(`  ${c.email.padEnd(largo)}  ${c.password.padEnd(19)}  ${c.chi}`)
  }
  console.log(`
${'='.repeat(largo + 42)}

${e.credenziali.length} utenze create${e.saltati ? `, ${e.saltati} già presenti` : ''}. Stanze e scrivanie
si aggiungono da «Struttura», entrando come dirigente dell'unità che le possiede.
`)
}

main()
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`)
    process.exitCode = 1
  })
  .finally(() => pool.end())
