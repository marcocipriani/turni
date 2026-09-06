import { sql } from 'drizzle-orm'
import {
  boolean, date, index, int, json, mysqlEnum, mysqlTable, primaryKey,
  text, timestamp, tinyint, uniqueIndex, varchar,
} from 'drizzle-orm/mysql-core'

const id = () => int('id').autoincrement().primaryKey()
const now = () => timestamp('creato_il').defaultNow().notNull()

/* ─── Organizzazione ─────────────────────────────────────────────── */

export const unit = mysqlTable('unit', {
  id: id(),
  parentId: int('parent_id'),
  nome: varchar('nome', { length: 160 }).notNull(),
  sigla: varchar('sigla', { length: 32 }),
  attiva: boolean('attiva').default(true).notNull(),
  // null = limite disattivato (comportamento predefinito)
  smartMinSettimana: tinyint('smart_min_settimana'),
  smartMaxSettimana: tinyint('smart_max_settimana'),
  // Scambio turni fra colleghi: attivo salvo diversa scelta del dirigente.
  // L'ora limite è il taglio oltre il quale la giornata di oggi non si tocca più.
  scambioAttivo: boolean('scambio_attivo').default(true).notNull(),
  scambioOraLimite: varchar('scambio_ora_limite', { length: 5 }).default('10:00').notNull(),
  creatoIl: now(),
}, (t) => [index('ix_unit_parent').on(t.parentId)])

export const user = mysqlTable('user', {
  id: id(),
  email: varchar('email', { length: 190 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  nome: varchar('nome', { length: 80 }).notNull(),
  cognome: varchar('cognome', { length: 80 }).notNull(),
  ruolo: mysqlEnum('ruolo', ['admin', 'dirigente', 'dipendente']).notNull(),
  unitId: int('unit_id'),
  sectorId: int('sector_id'),
  attivo: boolean('attivo').default(true).notNull(),
  passwordDaCambiare: boolean('password_da_cambiare').default(false).notNull(),
  creatoIl: now(),
  // Un'unità ha un solo dirigente: garantito dal database, non dal codice.
  dirigenteUnitId: int('dirigente_unit_id')
    .generatedAlwaysAs(sql`(case when \`ruolo\` = 'dirigente' then \`unit_id\` else null end)`, { mode: 'stored' }),
}, (t) => [
  uniqueIndex('uk_user_email').on(t.email),
  uniqueIndex('uk_dirigente_unit').on(t.dirigenteUnitId),
  index('ix_user_unit').on(t.unitId),
])

/** Solo i dipendenti delegati. Il dirigente programma per diritto di ruolo. */
export const organizer = mysqlTable('organizer', {
  userId: int('user_id').notNull(),
  unitId: int('unit_id').notNull(),
  nominatoDa: int('nominato_da').notNull(),
  creatoIl: now(),
}, (t) => [primaryKey({ columns: [t.userId, t.unitId] })])

export const sector = mysqlTable('sector', {
  id: id(),
  unitId: int('unit_id').notNull(),
  nome: varchar('nome', { length: 120 }).notNull(),
  richiedePresidio: boolean('richiede_presidio').default(false).notNull(),
  ordine: int('ordine').default(0).notNull(),
}, (t) => [index('ix_sector_unit').on(t.unitId)])

/* ─── Spazi ──────────────────────────────────────────────────────── */

export const room = mysqlTable('room', {
  id: id(),
  unitId: int('unit_id').notNull(),          // unità radice proprietaria
  etichetta: varchar('etichetta', { length: 60 }).notNull(),
  piano: varchar('piano', { length: 40 }),
  larghezzaCm: int('larghezza_cm').default(600).notNull(),
  altezzaCm: int('altezza_cm').default(400).notNull(),
  attiva: boolean('attiva').default(true).notNull(),
}, (t) => [index('ix_room_unit').on(t.unitId)])

/** La capienza della stanza è il numero di scrivanie attive. Nessun campo posti. */
export const desk = mysqlTable('desk', {
  id: id(),
  roomId: int('room_id').notNull(),
  numero: varchar('numero', { length: 20 }).notNull(),
  x: int('x').default(0).notNull(),
  y: int('y').default(0).notNull(),
  rotazione: int('rotazione').default(0).notNull(),
  attiva: boolean('attiva').default(true).notNull(),
}, (t) => [index('ix_desk_room').on(t.roomId)])

/* ─── Cataloghi gestiti dall'amministratore ──────────────────────── */

export const absenceReason = mysqlTable('absence_reason', {
  id: id(),
  codice: varchar('codice', { length: 40 }).notNull(),
  etichetta: varchar('etichetta', { length: 120 }).notNull(),
  attiva: boolean('attiva').default(true).notNull(),
  ordine: int('ordine').default(0).notNull(),
}, (t) => [uniqueIndex('uk_reason_codice').on(t.codice)])

export const holiday = mysqlTable('holiday', {
  id: id(),
  data: date('data', { mode: 'string' }).notNull(),
  descrizione: varchar('descrizione', { length: 120 }).notNull(),
  unitId: int('unit_id'),                    // null = vale per tutti
}, (t) => [index('ix_holiday_data').on(t.data)])

/* ─── Programmazione ─────────────────────────────────────────────── */

export const period = mysqlTable('period', {
  id: id(),
  unitId: int('unit_id').notNull(),
  dataInizio: date('data_inizio', { mode: 'string' }).notNull(),
  dataFine: date('data_fine', { mode: 'string' }).notNull(),
  stato: mysqlEnum('stato', ['bozza', 'in_approvazione', 'pubblicato']).default('bozza').notNull(),
  versione: int('versione').default(1).notNull(),
  assegnaScrivanie: boolean('assegna_scrivanie').default(false).notNull(),
  smartMinSettimana: tinyint('smart_min_settimana'),
  smartMaxSettimana: tinyint('smart_max_settimana'),
  notaApprovazione: text('nota_approvazione'),
  creatoDa: int('creato_da').notNull(),
  pubblicatoDa: int('pubblicato_da'),
  pubblicatoIl: timestamp('pubblicato_il'),
  creatoIl: now(),
}, (t) => [index('ix_period_unit').on(t.unitId, t.dataInizio)])

export const assignment = mysqlTable('assignment', {
  id: id(),
  periodId: int('period_id').notNull(),
  userId: int('user_id').notNull(),
  data: date('data', { mode: 'string' }).notNull(),
  stato: mysqlEnum('stato', ['presenza', 'smart']).notNull(),
  roomId: int('room_id'),
  deskId: int('desk_id'),
  bloccata: boolean('bloccata').default(false).notNull(),
  origine: mysqlEnum('origine', ['manuale', 'generata', 'copiata', 'scambio']).notNull(),
  motivazione: varchar('motivazione', { length: 500 }),
}, (t) => [
  uniqueIndex('uk_assignment_cell').on(t.periodId, t.userId, t.data),
  index('ix_assignment_data').on(t.periodId, t.data),
])

export const periodSnapshot = mysqlTable('period_snapshot', {
  id: id(),
  periodId: int('period_id').notNull(),
  versione: int('versione').notNull(),
  assegnazioni: json('assegnazioni').notNull(),
  motivo: varchar('motivo', { length: 500 }),
  autore: int('autore').notNull(),
  creatoIl: now(),
}, (t) => [index('ix_snapshot_period').on(t.periodId)])

/* ─── Assenze, preferenze, regole ────────────────────────────────── */

export const absence = mysqlTable('absence', {
  id: id(),
  userId: int('user_id').notNull(),
  dataInizio: date('data_inizio', { mode: 'string' }).notNull(),
  dataFine: date('data_fine', { mode: 'string' }).notNull(),
  causale: varchar('causale', { length: 40 }).notNull(),
  creatoIl: now(),
}, (t) => [index('ix_absence_user').on(t.userId, t.dataInizio)])

export const absenceRule = mysqlTable('absence_rule', {
  id: id(),
  userId: int('user_id').notNull(),
  giornoSettimana: tinyint('giorno_settimana').notNull(),   // 1 = lunedì … 5 = venerdì
  causale: varchar('causale', { length: 40 }).notNull(),
  validoDa: date('valido_da', { mode: 'string' }).notNull(),
  validoA: date('valido_a', { mode: 'string' }),
  creatoIl: now(),
}, (t) => [index('ix_absrule_user').on(t.userId)])

export const userPreference = mysqlTable('user_preference', {
  userId: int('user_id').primaryKey(),
  giorniPreferiti: json('giorni_preferiti').$type<number[]>(),
  giorniDaEvitare: json('giorni_da_evitare').$type<number[]>(),
  nota: varchar('nota', { length: 500 }),
  // Tonalità dell'avatar, 0-7. Null = ricavata dall'identificativo.
  avatarTinta: tinyint('avatar_tinta'),
})

export const recurringRule = mysqlTable('recurring_rule', {
  id: id(),
  unitId: int('unit_id').notNull(),
  ambito: mysqlEnum('ambito', ['utente', 'settore']).notNull(),
  targetId: int('target_id').notNull(),
  giornoSettimana: tinyint('giorno_settimana').notNull(),
  stato: mysqlEnum('stato', ['presenza', 'smart']).notNull(),
  validoDa: date('valido_da', { mode: 'string' }).notNull(),
  validoA: date('valido_a', { mode: 'string' }),
  creataDa: int('creata_da').notNull(),
}, (t) => [index('ix_rule_unit').on(t.unitId)])

/* ─── Scambio di turni fra colleghi ──────────────────────────────── */

/**
 * Una proposta di scambio fra due persone della stessa unità.
 * Non passa da nessuna approvazione: vale l'accordo fra i due, entro i vincoli
 * di presidio, capienza e lavoro agile verificati al momento dell'accettazione.
 *
 * Le due colonne di blocco tengono la regola «un turno in scambio non entra in
 * un altro scambio» dentro il database: valgono null appena lo stato non è più
 * 'proposto', e l'indice unico su una colonna che sa diventare null vincola le
 * sole proposte aperte.
 */
export const swap = mysqlTable('scambio', {
  id: id(),
  periodId: int('period_id').notNull(),
  tipo: mysqlEnum('tipo', ['offro', 'chiedo']).notNull(),
  proponenteId: int('proponente_id').notNull(),
  destinatarioId: int('destinatario_id').notNull(),
  dataProponente: date('data_proponente', { mode: 'string' }).notNull(),
  dataDestinatario: date('data_destinatario', { mode: 'string' }).notNull(),
  stato: mysqlEnum('stato', ['proposto', 'accettato', 'rifiutato', 'ritirato'])
    .default('proposto').notNull(),
  messaggio: varchar('messaggio', { length: 280 }),
  creatoIl: now(),
  chiusoIl: timestamp('chiuso_il'),
  bloccoProponente: varchar('blocco_proponente', { length: 40 }).generatedAlwaysAs(
    sql`(case when \`stato\` = 'proposto' then concat(\`proponente_id\`, ':', \`data_proponente\`) else null end)`,
    { mode: 'stored' },
  ),
  bloccoDestinatario: varchar('blocco_destinatario', { length: 40 }).generatedAlwaysAs(
    sql`(case when \`stato\` = 'proposto' then concat(\`destinatario_id\`, ':', \`data_destinatario\`) else null end)`,
    { mode: 'stored' },
  ),
}, (t) => [
  uniqueIndex('uk_scambio_blocco_prop').on(t.bloccoProponente),
  uniqueIndex('uk_scambio_blocco_dest').on(t.bloccoDestinatario),
  index('ix_scambio_periodo').on(t.periodId, t.stato),
  index('ix_scambio_proponente').on(t.proponenteId, t.stato),
  index('ix_scambio_destinatario').on(t.destinatarioId, t.stato),
])

/* ─── Notifiche, sessioni, tracciabilità ─────────────────────────── */

export const notification = mysqlTable('notification', {
  id: id(),
  userId: int('user_id').notNull(),
  tipo: varchar('tipo', { length: 60 }).notNull(),
  titolo: varchar('titolo', { length: 200 }).notNull(),
  corpo: varchar('corpo', { length: 600 }).notNull(),
  link: varchar('link', { length: 200 }),
  lettaIl: timestamp('letta_il'),
  creatoIl: now(),
}, (t) => [index('ix_notif_user').on(t.userId, t.lettaIl)])

export const pushSubscription = mysqlTable('push_subscription', {
  id: id(),
  userId: int('user_id').notNull(),
  endpoint: varchar('endpoint', { length: 500 }).notNull(),
  p256dh: varchar('p256dh', { length: 255 }).notNull(),
  auth: varchar('auth', { length: 255 }).notNull(),
  dispositivo: varchar('dispositivo', { length: 200 }),
  creatoIl: now(),
}, (t) => [uniqueIndex('uk_push_endpoint').on(t.endpoint)])

export const session = mysqlTable('session', {
  id: varchar('id', { length: 64 }).primaryKey(),   // hash sha256 del token
  userId: int('user_id').notNull(),
  scadeIl: timestamp('scade_il').notNull(),
  userAgent: varchar('user_agent', { length: 300 }),
  creatoIl: now(),
}, (t) => [index('ix_session_user').on(t.userId)])

export const auditLog = mysqlTable('audit_log', {
  id: id(),
  entita: varchar('entita', { length: 60 }).notNull(),
  entitaId: varchar('entita_id', { length: 60 }),
  azione: varchar('azione', { length: 60 }).notNull(),
  utente: int('utente'),
  prima: json('prima'),
  dopo: json('dopo'),
  motivazione: varchar('motivazione', { length: 500 }),
  creatoIl: now(),
}, (t) => [index('ix_audit_entita').on(t.entita, t.entitaId)])
