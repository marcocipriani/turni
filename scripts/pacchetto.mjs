/**
 * Prepara l'archivio da caricare sull'hosting.
 *
 * Dentro finisce solo ciò che serve a servire l'applicazione: il codice del
 * server, il frontend già compilato, e un file di configurazione da riempire.
 * Restano fuori i test, il popolamento di prova, gli strumenti di misura e
 * ogni traccia di dati del personale.
 *
 * Il frontend si compila qui, non sul server: su un piano condiviso la
 * compilazione è il punto in cui ci si arena, per memoria o per tempo.
 *
 *   node scripts/pacchetto.mjs [--out ./rilascio]
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const RADICE = new URL('..', import.meta.url).pathname
const OUT = arg('out', join(RADICE, 'rilascio'))

const esegui = (cmd, args, cwd = RADICE) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })

/* ── 1. Compilazione ────────────────────────────────────────────────── */

console.log('\nControllo dei tipi e compilazione del frontend…')
esegui('npm', ['run', 'build'])

/* ── 2. Composizione ────────────────────────────────────────────────── */

const versione = JSON.parse(readFileSync(join(RADICE, 'package.json'), 'utf8')).version ?? '0.0.0'
const oggi = new Date().toISOString().slice(0, 10)
const nome = `turni-${versione}-${oggi}`
const lavoro = mkdtempSync(join(tmpdir(), 'turni-pacchetto-'))
const dentro = join(lavoro, nome)
mkdirSync(dentro, { recursive: true })

console.log('\nComposizione del pacchetto…')

/** Il codice del server, meno tutto ciò che non gira in produzione. */
const ESCLUSI = new Set(['verifica.ts', 'carico.ts', 'seed'])
cpSync(join(RADICE, 'server/src'), join(dentro, 'server/src'), {
  recursive: true,
  filter: (src) => {
    const parti = src.split('/')
    if (parti.some((p) => ESCLUSI.has(p))) return false
    return !src.endsWith('.test.ts')
  },
})
cpSync(join(RADICE, 'server/tsconfig.json'), join(dentro, 'server/tsconfig.json'))
cpSync(join(RADICE, 'web/dist'), join(dentro, 'web/dist'), { recursive: true })

/**
 * Un package.json piatto invece dei workspace: sull'hosting `npm install`
 * deve funzionare senza sapere niente della struttura di sviluppo.
 */
const server = JSON.parse(readFileSync(join(RADICE, 'server/package.json'), 'utf8'))
writeFileSync(join(dentro, 'package.json'), `${JSON.stringify({
  name: 'turni',
  version: versione,
  private: true,
  type: 'module',
  engines: { node: '>=20' },
  scripts: {
    start: 'tsx server/src/index.ts',
    migra: 'tsx server/src/db/migra.ts',
    avvio: 'tsx server/src/avvio.ts',
  },
  dependencies: server.dependencies,
}, null, 2)}\n`)

writeFileSync(join(dentro, '.env.esempio'), `# Configurazione di produzione. Copiare in .env e riempire.
# Nessuno di questi valori deve finire in un archivio di codice.

DATABASE_URL=mysql://utente:password@127.0.0.1:3306/nome_database
PORT=8787
NODE_ENV=production

# Nome del cookie di sessione: cambiarlo invalida tutte le sessioni aperte.
SESSION_COOKIE=turni_sessione

# Dove sta il frontend compilato, rispetto alla cartella da cui si avvia.
WEB_DIST=web/dist

# Origini ammesse, solo se il frontend è servito da un dominio diverso.
# APP_ORIGIN=https://turni.esempio.it

# Notifiche push. Generare la coppia una volta sola:
#   npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:tecnico@esempio.it
`)

// Le istruzioni non stanno nel codice, ma nel pacchetto sì: è lì che servono.
for (const f of ['ISTRUZIONI.md', '_note/ISTRUZIONI.md']) {
  if (existsSync(join(RADICE, f))) {
    cpSync(join(RADICE, f), join(dentro, 'ISTRUZIONI.md'))
    break
  }
}
cpSync(join(RADICE, 'server/src/seed/persone.esempio.csv'), join(dentro, 'persone.esempio.csv'))

/* ── 3. Archivio ────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true })
const archivio = join(OUT, `${nome}.tar.gz`)
rmSync(archivio, { force: true })
esegui('tar', ['-czf', archivio, nome], lavoro)
rmSync(lavoro, { recursive: true, force: true })

const mb = (statSync(archivio).size / 1024 / 1024).toFixed(1)
console.log(`
Pacchetto pronto: ${archivio}  (${mb} MB)

Sull'hosting, una volta scompattato:

  npm install --omit=dev     scarica le dipendenze di produzione
  cp .env.esempio .env       e riempilo
  npm run migra              crea o aggiorna lo schema
  npm run avvio -- persone.csv --dominio ...    solo la prima volta
  npm start

I passi per esteso, con le schermate del pannello, stanno in ISTRUZIONI.md.
`)
