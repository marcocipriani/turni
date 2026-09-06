/**
 * Migrazione dello schema, esplicita e idempotente.
 *
 * `drizzle-kit push` non riesce più a leggere lo schema da MariaDB — si ferma
 * su `checkConstraint` durante l'introspezione — e comunque su hosting condiviso
 * serve un passo di rilascio che non dipenda da un attrezzo interattivo.
 * Qui le modifiche sono scritte a mano, applicate solo se mancano, e si possono
 * rieseguire quante volte si vuole.
 *
 *   npm run migra -w server
 */
import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db, pool } from './index'

async function esiste(query: string, ...parametri: unknown[]) {
  const [righe] = await pool.query(query, parametri)
  return (righe as unknown[]).length > 0
}

const tabellaEsiste = (t: string) =>
  esiste('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', t)

const colonnaEsiste = (t: string, c: string) =>
  esiste(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    t, c,
  )

/** Aggiunge una colonna se non c'è. Il DDL è quello di MySQL 8, che MariaDB accetta. */
async function colonna(tabella: string, nome: string, ddl: string) {
  if (await colonnaEsiste(tabella, nome)) return
  await db.execute(sql.raw(`ALTER TABLE \`${tabella}\` ADD COLUMN ${ddl}`))
  console.log(`  + ${tabella}.${nome}`)
}

async function tabella(nome: string, ddl: string) {
  if (await tabellaEsiste(nome)) return
  await db.execute(sql.raw(ddl))
  console.log(`  + tabella ${nome}`)
}

async function main() {
  console.log('Migrazione dello schema…')

  // Scambio turni: interruttore e ora limite, per unità organizzativa.
  await colonna('unit', 'scambio_attivo', '`scambio_attivo` tinyint(1) NOT NULL DEFAULT 1')
  await colonna('unit', 'scambio_ora_limite', "`scambio_ora_limite` varchar(5) NOT NULL DEFAULT '10:00'")

  // Tonalità dell'avatar scelta dalla persona. Null = ricavata dall'identificativo.
  await colonna('user_preference', 'avatar_tinta', '`avatar_tinta` tinyint')

  // Una cella può ora nascere da uno scambio fra colleghi.
  await db.execute(sql.raw(
    "ALTER TABLE `assignment` MODIFY COLUMN `origine` enum('manuale','generata','copiata','scambio') NOT NULL",
  ))

  await tabella('scambio', `
    CREATE TABLE \`scambio\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`period_id\` int NOT NULL,
      \`tipo\` enum('offro','chiedo') NOT NULL,
      \`proponente_id\` int NOT NULL,
      \`destinatario_id\` int NOT NULL,
      \`data_proponente\` date NOT NULL,
      \`data_destinatario\` date NOT NULL,
      \`stato\` enum('proposto','accettato','rifiutato','ritirato') NOT NULL DEFAULT 'proposto',
      \`messaggio\` varchar(280),
      \`creato_il\` timestamp NOT NULL DEFAULT (now()),
      \`chiuso_il\` timestamp NULL,
      \`blocco_proponente\` varchar(40) AS (case when \`stato\` = 'proposto'
        then concat(\`proponente_id\`, ':', \`data_proponente\`) else null end) STORED,
      \`blocco_destinatario\` varchar(40) AS (case when \`stato\` = 'proposto'
        then concat(\`destinatario_id\`, ':', \`data_destinatario\`) else null end) STORED,
      CONSTRAINT \`scambio_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`uk_scambio_blocco_prop\` UNIQUE(\`blocco_proponente\`),
      CONSTRAINT \`uk_scambio_blocco_dest\` UNIQUE(\`blocco_destinatario\`),
      INDEX \`ix_scambio_periodo\` (\`period_id\`, \`stato\`),
      INDEX \`ix_scambio_proponente\` (\`proponente_id\`, \`stato\`),
      INDEX \`ix_scambio_destinatario\` (\`destinatario_id\`, \`stato\`)
    )
  `)

  console.log('Fatto.')
  await pool.end()
}

main().catch(async (e) => {
  console.error(String(e instanceof Error ? e.message : e))
  await pool.end()
  process.exit(1)
})
