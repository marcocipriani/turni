/**
 * Caricamento delle tabelle da riga di comando.
 *
 * Il motore sta in lib/caricamento.ts, lo stesso che serve la pagina «Sistema»
 * dell'amministratore: qui c'è solo il file da leggere e il resoconto da
 * stampare. Le assenze si caricano solo da qui — nella pagina non compaiono,
 * perché l'amministratore di sistema non vede i dati personali.
 *
 *   npm run importa -w server -- stanze stanze.csv --prova
 *   npm run importa -w server -- persone nuovi.csv --dominio comune.it
 *   npm run importa -w server -- --modello stanze > stanze.csv
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { carica, MODELLI, type Tabella, TABELLE } from './lib/caricamento'
import { pool } from './db/index'

const argomenti = process.argv.slice(2)
const PROVA = argomenti.includes('--prova')
const opzione = (n: string) => {
  const i = argomenti.indexOf(`--${n}`)
  return i >= 0 ? argomenti[i + 1] : undefined
}
const MODELLO = opzione('modello')
const DOMINIO = opzione('dominio')
// Solo queste due opzioni portano un valore: il resto sono interruttori, e
// quello che le segue è un argomento vero.
const CON_VALORE = new Set(['--modello', '--dominio'])
const liberi = argomenti.filter((a, i) => !a.startsWith('--') && !CON_VALORE.has(argomenti[i - 1] ?? ''))
const [TABELLA, FILE] = liberi

const valida = (t: string | undefined): t is Tabella => TABELLE.includes(t as Tabella)

async function main() {
  if (MODELLO) {
    if (!valida(MODELLO)) throw new Error(`Modello inesistente. Tabelle: ${TABELLE.join(', ')}`)
    process.stdout.write(MODELLI[MODELLO])
    return
  }

  if (!valida(TABELLA) || !FILE) {
    console.error(`
Carica una tabella da un file CSV.

  npm run importa -w server -- <tabella> <file.csv> [--prova] [--dominio comune.it]
  npm run importa -w server -- --modello <tabella>     stampa il modello

Tabelle:  ${TABELLE.join('  ')}

  --prova     legge e verifica il file senza scrivere niente
  --dominio   costruisce gli indirizzi mancanti, per «persone»

Le persone entrano tutte o nessuna, e ciascuna riceve una password mostrata
una volta sola. Le altre tabelle caricano le righe buone e segnalano le altre.
`)
    process.exit(1)
  }

  console.log(`\nCaricamento in «${TABELLA}»${PROVA ? ' (prova, niente viene scritto)' : ''}…\n`)
  const e = await carica(TABELLA, readFileSync(FILE, 'utf8'), { prova: PROVA, dominio: DOMINIO })

  for (const n of e.note) console.log(`  ${n}`)

  if (e.credenziali.length) {
    const largo = Math.max(...e.credenziali.map((c) => c.email.length), 9)
    console.log(`\n${'='.repeat(largo + 42)}
  CREDENZIALI DI PRIMO ACCESSO — non verranno mostrate di nuovo.
  Consegnale a voce o su carta, non per posta elettronica.
${'='.repeat(largo + 42)}\n`)
    console.log(`  ${'indirizzo'.padEnd(largo)}  ${'password'.padEnd(19)}  persona`)
    console.log(`  ${'-'.repeat(largo)}  ${'-'.repeat(19)}  ${'-'.repeat(24)}`)
    for (const c of e.credenziali) console.log(`  ${c.email.padEnd(largo)}  ${c.password.padEnd(19)}  ${c.chi}`)
    console.log(`\n${'='.repeat(largo + 42)}`)
  }

  if (e.errori.length) {
    console.error(`\n${e.errori.length} righe non caricate:\n`)
    for (const x of e.errori) console.error(`  ${x}`)
  }
  console.log(`\n${e.aggiunti} aggiunte, ${e.saltati} già presenti, ${e.errori.length} con errori.\n`)
  if (e.errori.length) process.exitCode = 1
}

main()
  .catch((x) => {
    console.error(`\n${x instanceof Error ? x.message : String(x)}\n`)
    process.exitCode = 1
  })
  .finally(() => pool.end())
