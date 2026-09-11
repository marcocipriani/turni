/**
 * Migrazione dello schema, esplicita e idempotente.
 *
 * `drizzle-kit push` non riesce a leggere lo schema da MariaDB — si ferma su
 * `checkConstraint` durante l'introspezione — e comunque su hosting condiviso
 * serve un passo di rilascio che non dipenda da un attrezzo interattivo. È
 * stato tolto dalle dipendenze: un attrezzo rotto in elenco invita a usarlo.
 *
 * Qui le modifiche sono scritte a mano, applicate solo se mancano, e si possono
 * rieseguire quante volte si vuole. Lo schema in `schema.ts` resta la
 * descrizione autorevole: questo file la insegue, e le due cose vanno
 * cambiate insieme.
 *
 *   npm run migra
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

/**
 * Prima installazione: l'archivio è vuoto e le tabelle vanno create tutte.
 * Il DDL sta in `schema.sql`, estratto dall'archivio di sviluppo. Le modifiche
 * qui sotto sono successive a quel punto di partenza: su un archivio nuovo
 * trovano già tutto a posto e non fanno niente.
 */
async function schemaIniziale() {
  if (await tabellaEsiste('unit')) return
  const file = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql')
  const istruzioni = readFileSync(file, 'utf8')
    .split(/;\s*(?:\n|$)/)
    .map((i) => i.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean)
  for (const i of istruzioni) await db.execute(sql.raw(i))
  console.log(`  + ${istruzioni.length} tabelle`)
}

async function main() {
  console.log('Migrazione dello schema…')

  await schemaIniziale()

  // Scambio turni: interruttore e ora limite, per unità organizzativa.
  await colonna('unit', 'scambio_attivo', '`scambio_attivo` tinyint(1) NOT NULL DEFAULT 1')
  await colonna('unit', 'scambio_ora_limite', "`scambio_ora_limite` varchar(5) NOT NULL DEFAULT '10:00'")

  // Tonalità dell'avatar scelta dalla persona. Null = ricavata dall'identificativo.
  await colonna('user_preference', 'avatar_tinta', '`avatar_tinta` tinyint')

  // Il soprannome della stanza stava dentro l'etichetta, dopo un «·». Ora ha una
  // colonna sua: le righe vecchie si spacchettano una volta sola, qui.
  if (!(await colonnaEsiste('room', 'soprannome'))) {
    await db.execute(sql.raw('ALTER TABLE `room` ADD COLUMN `soprannome` varchar(60)'))
    await db.execute(sql.raw(
      "UPDATE `room` SET `soprannome` = TRIM(SUBSTRING_INDEX(`etichetta`, '·', -1)), " +
      "`etichetta` = TRIM(SUBSTRING_INDEX(`etichetta`, '·', 1)) WHERE `etichetta` LIKE '%·%'",
    ))
    console.log('  + room.soprannome')
  }

  // L'ufficio di una persona sola: sta fuori dalla capienza condivisa.
  await colonna('room', 'riservata_a', '`riservata_a` int DEFAULT NULL')

  // Data dell'ultima pubblicazione, distinta dalla prima: «v2, aggiornata il…».
  // Sui periodi già pubblicati le due date coincidono, che è la verità nota.
  if (!(await colonnaEsiste('period', 'aggiornato_il'))) {
    await db.execute(sql.raw('ALTER TABLE `period` ADD COLUMN `aggiornato_il` timestamp NULL'))
    await db.execute(sql.raw('UPDATE `period` SET `aggiornato_il` = `pubblicato_il` WHERE `pubblicato_il` IS NOT NULL'))
    console.log('  + period.aggiornato_il')
  }

  // Fin dove ciascuno ha guardato la programmazione.
  await colonna('user_preference', 'programmazione_vista_il', '`programmazione_vista_il` timestamp NULL')

  // Una cella può ora nascere da uno scambio fra colleghi.
  await db.execute(sql.raw(
    "ALTER TABLE `assignment` MODIFY COLUMN `origine` enum('manuale','generata','copiata','scambio') NOT NULL",
  ))

  // La permuta di due giornate diverse è arrivata dopo la cessione secca.
  if (await tabellaEsiste('scambio')) {
    await db.execute(sql.raw("ALTER TABLE `scambio` MODIFY COLUMN `tipo` enum('offro','chiedo','permuta') NOT NULL"))
  }

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

  // Il promemoria della sera prima: spento finché la persona non lo accende.
  await colonna('user_preference', 'promemoria_sera', '`promemoria_sera` tinyint(1) NOT NULL DEFAULT 0')

  // Le viste di partenza, scelte da ciascuno.
  await colonna('user_preference', 'vista_turni', "`vista_turni` varchar(10) NOT NULL DEFAULT 'giorni'")
  await colonna('user_preference', 'filtri_mio', '`filtri_mio` json DEFAULT NULL')

  // La sede della stanza: prima c'era un edificio solo.
  await colonna('room', 'sede', '`sede` varchar(80) DEFAULT NULL')

  // Assenze registrate da chi programma, per conto di un collega.
  await colonna('absence', 'registrata_da', '`registrata_da` int DEFAULT NULL')

  console.log('Fatto.')
  await pool.end()
}

main().catch(async (e) => {
  console.error(String(e instanceof Error ? e.message : e))
  await pool.end()
  process.exit(1)
})
