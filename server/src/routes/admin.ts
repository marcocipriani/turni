import { randomBytes } from 'node:crypto'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { type Env, HttpError, nonTrovato, vietato } from '../context'
import { db, schema } from '../db/index'
import { traccia } from '../lib/audit'
import { carica, MODELLI, NOME_FILE, type Tabella, TABELLE } from '../lib/caricamento'
import { italianHolidays } from '../lib/dates'
import { esporta, SEZIONI, type Sezione } from '../lib/esportazione'
import { siglaCognome } from '../lib/nomi'
import { hashPassword } from '../lib/password'
import { avvisa } from '../lib/notify'

export const admin = new Hono<Env>()

/**
 * Gli indici unici del database sono l'ultima parola: posta irripetibile, un
 * solo dirigente per unità. Qui il loro rifiuto diventa una frase in italiano.
 */
function seDuplicato(x: unknown): never {
  if (x instanceof Error && 'code' in x && x.code === 'ER_DUP_ENTRY') {
    throw new HttpError(409, String(x.message).includes('uk_dirigente_unit')
      ? 'Quell\'unità ha già un dirigente.'
      : 'Quell\'indirizzo di posta è già di un\'altra persona.')
  }
  throw x
}

/**
 * Un'unità non deve restare senza chi la comanda finché contiene qualcuno o
 * qualche unità figlia. Vale quando si sposta il dirigente altrove e quando lo
 * si disattiva: è la stessa domanda, e ha la stessa risposta.
 */
async function scoprirebbeLUnita(u: { id: number; ruolo: string; unitId: number | null }) {
  if (u.ruolo !== 'dirigente' || u.unitId == null) return null
  const altri = (await db.select({ id: schema.user.id }).from(schema.user)
    .where(and(eq(schema.user.unitId, u.unitId), eq(schema.user.attivo, true))))
    .filter((x) => x.id !== u.id).length
  const figlie = (await db.select({ id: schema.unit.id }).from(schema.unit)
    .where(eq(schema.unit.parentId, u.unitId))).length
  if (!altri && !figlie) return null
  const [unita] = await db.select().from(schema.unit).where(eq(schema.unit.id, u.unitId)).limit(1)
  return `«${unita?.nome ?? 'L\'unità'}» resterebbe senza dirigente con ${altri} persone e ${figlie} unità figlie. `
    + 'Nominane un altro prima.'
}

// L'amministratore gestisce contenitori e credenziali, mai programmazioni.
admin.use('*', async (c, next) => {
  if (c.get('attore').ruolo !== 'admin') throw vietato('Riservato all\'amministratore di sistema')
  return next()
})

/* ── Unità radice ───────────────────────────────────────────────── */

/**
 * L'organigramma ha bisogno, oltre alla gerarchia, di chi comanda ogni unità e
 * di quanta gente ci lavora. Due letture intere di tabelle piccole: l'albero si
 * disegna tutto insieme, e nessuna schermata fa una domanda per nodo.
 */
admin.get('/unita', async (c) => {
  const righe = await db.select().from(schema.unit).orderBy(asc(schema.unit.id))
  const persone = await db.select({
    id: schema.user.id, nome: schema.user.nome, cognome: schema.user.cognome,
    ruolo: schema.user.ruolo, unitId: schema.user.unitId,
  }).from(schema.user).where(eq(schema.user.attivo, true))

  const quante = new Map<number, number>()
  const capi = new Map<number, { nome: string; cognome: string }>()
  for (const p of persone) {
    if (p.unitId == null || p.ruolo === 'admin') continue
    quante.set(p.unitId, (quante.get(p.unitId) ?? 0) + 1)
    if (p.ruolo === 'dirigente') capi.set(p.unitId, { nome: p.nome, cognome: p.cognome })
  }
  return c.json(righe.map((u) => ({
    ...u, persone: quante.get(u.id) ?? 0, dirigente: capi.get(u.id) ?? null,
  })))
})

const esiste = async (id: number) =>
  (await db.select({ id: schema.unit.id }).from(schema.unit).where(eq(schema.unit.id, id)).limit(1)).length > 0

/** Unità e dirigente nascono insieme: un'unità senza chi la comanda non esiste. */
admin.post('/unita', async (c) => {
  const b = z.object({
    nome: z.string().min(2),
    sigla: z.string().max(32).optional(),
    parentId: z.number().int().nullable().optional(),
    dirigente: z.object({
      nome: z.string().min(1), cognome: z.string().min(1), email: z.string().email(),
    }),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati incompleti: servono nome dell\'unità e dati del dirigente')

  const a = c.get('attore')
  const parentId = b.data.parentId ?? null
  if (parentId != null && !(await esiste(parentId))) throw new HttpError(404, 'Unità superiore non trovata')
  await nomeLibero(b.data.nome, b.data.sigla)
  const password = randomBytes(9).toString('base64url')
  const hash = await hashPassword(password)

  // Unità e dirigente nascono insieme davvero: se la seconda scrittura fallisce
  // — indirizzo già preso — la prima non deve restare, o l'archivio si ritrova
  // un'unità che nessuno comanda.
  let unitId = 0
  try {
    await db.transaction(async (tx) => {
      const [ins] = await tx.insert(schema.unit)
        .values({ nome: b.data.nome, sigla: b.data.sigla ?? null, parentId })
      unitId = ins.insertId
      await tx.insert(schema.user).values({
        email: b.data.dirigente.email.toLowerCase(), passwordHash: hash,
        // Il cognome si tronca prima di entrare, come ovunque: vedi lib/nomi.ts.
        nome: b.data.dirigente.nome, cognome: siglaCognome(b.data.dirigente.cognome),
        ruolo: 'dirigente', unitId, passwordDaCambiare: true,
      })
    })
  } catch (x) { seDuplicato(x) }
  await traccia({ entita: 'unit', entitaId: unitId, azione: parentId == null ? 'crea_radice' : 'crea_figlia', utente: a.id, dopo: b.data })
  return c.json({ unitId, passwordProvvisoria: password }, 201)
})

/**
 * Nome e sigla di un'unità sono la sua chiave per chi carica un file: due unità
 * che si chiamano uguale renderebbero ambiguo ogni riferimento, e le righe
 * finirebbero in silenzio nella sbagliata.
 */
async function nomeLibero(nome: string | undefined, sigla: string | null | undefined, escluso?: number) {
  const righe = await db.select().from(schema.unit)
  for (const u of righe) {
    if (u.id === escluso) continue
    const suoi = [u.nome.toLowerCase(), u.sigla?.toLowerCase()].filter(Boolean)
    for (const mio of [nome, sigla].filter(Boolean)) {
      if (suoi.includes(mio!.toLowerCase())) {
        throw new HttpError(409, `«${mio}» è già il nome o la sigla di un'altra unità.`)
      }
    }
  }
}

/** L'unità e tutte le sue discendenti: nessuna può finire sotto una di queste. */
async function conDiscendenti(id: number): Promise<Set<number>> {
  const righe = await db.select({ id: schema.unit.id, parentId: schema.unit.parentId }).from(schema.unit)
  const figlie = new Map<number, number[]>()
  for (const r of righe) if (r.parentId != null) figlie.set(r.parentId, [...(figlie.get(r.parentId) ?? []), r.id])
  const dentro = new Set([id])
  const coda = [id]
  while (coda.length) {
    for (const f of figlie.get(coda.pop()!) ?? []) { dentro.add(f); coda.push(f) }
  }
  return dentro
}

/** Rinomina o sposta un'unità nell'organigramma. */
admin.patch('/unita/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const b = z.object({
    nome: z.string().min(2).optional(),
    sigla: z.string().max(32).nullable().optional(),
    parentId: z.number().int().nullable().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati dell\'unità non validi')
  if (!(await esiste(id))) throw new HttpError(404, 'Unità non trovata')

  const campi: Record<string, unknown> = {}
  if (b.data.nome !== undefined || b.data.sigla !== undefined) {
    await nomeLibero(b.data.nome, b.data.sigla, id)
  }
  if (b.data.nome !== undefined) campi.nome = b.data.nome
  if (b.data.sigla !== undefined) campi.sigla = b.data.sigla || null
  if (b.data.parentId !== undefined) {
    const p = b.data.parentId
    if (p != null) {
      if (!(await esiste(p))) throw new HttpError(404, 'Unità superiore non trovata')
      if ((await conDiscendenti(id)).has(p)) {
        throw new HttpError(409, 'Un\'unità non può finire sotto sé stessa o sotto una propria discendente')
      }
    }
    campi.parentId = p
  }
  if (Object.keys(campi).length === 0) throw new HttpError(422, 'Niente da modificare')

  await db.update(schema.unit).set(campi).where(eq(schema.unit.id, id))
  await traccia({ entita: 'unit', entitaId: id, azione: 'modifica', utente: c.get('attore').id, dopo: campi })
  return c.json({ ok: true })
})

/**
 * Si cancella solo un'unità che non contiene niente: figlie, persone, settori,
 * stanze o programmazioni. Svuotarla è una decisione, non un effetto collaterale.
 */
admin.delete('/unita/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!(await esiste(id))) throw new HttpError(404, 'Unità non trovata')

  const legami: [string, string, number][] = [
    ['unità figlia', 'unità figlie', (await db.select({ id: schema.unit.id }).from(schema.unit).where(eq(schema.unit.parentId, id))).length],
    ['persona', 'persone', (await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.unitId, id))).length],
    ['settore', 'settori', (await db.select({ id: schema.sector.id }).from(schema.sector).where(eq(schema.sector.unitId, id))).length],
    ['stanza', 'stanze', (await db.select({ id: schema.room.id }).from(schema.room).where(eq(schema.room.unitId, id))).length],
    ['programmazione', 'programmazioni', (await db.select({ id: schema.period.id }).from(schema.period).where(eq(schema.period.unitId, id))).length],
  ]
  const pieni = legami.filter(([, , n]) => n > 0).map(([uno, molti, n]) => `${n} ${n === 1 ? uno : molti}`)
  if (pieni.length) throw new HttpError(409, `L'unità contiene ancora ${pieni.join(', ')}. Sposta o rimuovi prima quelli.`)

  await db.delete(schema.unit).where(eq(schema.unit.id, id))
  await traccia({ entita: 'unit', entitaId: id, azione: 'elimina', utente: c.get('attore').id })
  return c.json({ ok: true })
})

/* ── Utenti ─────────────────────────────────────────────────────── */

admin.get('/utenti', async (c) => {
  const righe = await db.select({
    id: schema.user.id, email: schema.user.email, nome: schema.user.nome,
    cognome: schema.user.cognome, ruolo: schema.user.ruolo, unitId: schema.user.unitId,
    attivo: schema.user.attivo,
  }).from(schema.user).orderBy(asc(schema.user.cognome))
  return c.json(righe)
})

admin.post('/utenti', async (c) => {
  const b = z.object({
    nome: z.string().min(1), cognome: z.string().min(1), email: z.string().email(),
    ruolo: z.enum(['dirigente', 'dipendente']), unitId: z.number().int(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati utente incompleti')

  if (!(await esiste(b.data.unitId))) throw new HttpError(404, 'Unità non trovata')
  const password = randomBytes(9).toString('base64url')
  let id = 0
  try {
    const [ins] = await db.insert(schema.user).values({
      email: b.data.email.toLowerCase(), passwordHash: await hashPassword(password),
      nome: b.data.nome, cognome: siglaCognome(b.data.cognome), ruolo: b.data.ruolo,
      unitId: b.data.unitId, passwordDaCambiare: true,
    })
    id = ins.insertId
  } catch (x) { seDuplicato(x) }
  await traccia({ entita: 'user', entitaId: id, azione: 'censimento', utente: c.get('attore').id })
  return c.json({ id, passwordProvvisoria: password }, 201)
})

/** Correzione dell'anagrafica: nome, posta, unità. Il ruolo non si tocca da qui. */
admin.patch('/utenti/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const b = z.object({
    nome: z.string().min(1).optional(), cognome: z.string().min(1).optional(),
    email: z.string().email().optional(), unitId: z.number().int().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati utente non validi')

  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id)).limit(1)
  if (!u) throw new HttpError(404, 'Utente non trovato')

  const campi: Record<string, unknown> = {}
  if (b.data.nome !== undefined) campi.nome = b.data.nome
  if (b.data.cognome !== undefined) campi.cognome = siglaCognome(b.data.cognome)
  if (b.data.email !== undefined) campi.email = b.data.email.toLowerCase()
  if (b.data.unitId !== undefined && b.data.unitId !== u.unitId) {
    if (!(await esiste(b.data.unitId))) throw new HttpError(404, 'Unità non trovata')
    const scoperta = await scoprirebbeLUnita(u)
    if (scoperta) throw new HttpError(409, scoperta)
    campi.unitId = b.data.unitId
  }
  if (Object.keys(campi).length === 0) throw new HttpError(422, 'Niente da modificare')

  try {
    await db.update(schema.user).set(campi).where(eq(schema.user.id, id))
  } catch (x) { seDuplicato(x) }
  await traccia({ entita: 'user', entitaId: id, azione: 'modifica', utente: c.get('attore').id, dopo: campi })
  return c.json({ ok: true })
})

admin.post('/utenti/:id/reset-password', async (c) => {
  const id = Number(c.req.param('id'))
  // Reimpostare chiude tutte le sessioni dell'interessato: farlo su sé stessi
  // significherebbe cadere fuori mentre la password nuova è ancora a schermo.
  if (id === c.get('attore').id) {
    throw new HttpError(409, 'Per la tua password usa il cambio password, non il reset.')
  }
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id)).limit(1)
  if (!u) throw new HttpError(404, 'Utente non trovato')

  const password = randomBytes(9).toString('base64url')
  await db.update(schema.user)
    .set({ passwordHash: await hashPassword(password), passwordDaCambiare: true })
    .where(eq(schema.user.id, id))
  // Reimpostare la password chiude ogni sessione aperta dell'interessato.
  await db.delete(schema.session).where(eq(schema.session.userId, id))
  await traccia({ entita: 'user', entitaId: id, azione: 'reset_password', utente: c.get('attore').id })
  await avvisa([id], {
    tipo: 'password_reimpostata',
    titolo: 'Password reimpostata',
    corpo: 'Un amministratore ha reimpostato la tua password. Dovrai cambiarla al prossimo accesso.',
  })
  return c.json({ passwordProvvisoria: password })
})

admin.post('/utenti/:id/attivo', async (c) => {
  const id = Number(c.req.param('id'))
  const a = c.get('attore')
  const b = z.object({ attivo: z.boolean() }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Valore non valido')

  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id)).limit(1)
  if (!u) throw new HttpError(404, 'Utente non trovato')

  if (!b.data.attivo) {
    // Chi amministra non si chiude fuori da solo, e non lascia il sistema
    // senza nessuno che possa rientrare.
    if (id === a.id) throw new HttpError(409, 'Non puoi disattivare te stesso.')
    if (u.ruolo === 'admin') {
      const restanti = (await db.select({ id: schema.user.id }).from(schema.user)
        .where(and(eq(schema.user.ruolo, 'admin'), eq(schema.user.attivo, true))))
        .filter((x) => x.id !== id).length
      if (restanti === 0) throw new HttpError(409, 'È l\'ultimo amministratore attivo: senza di lui nessuno entra più.')
    }
    const scoperta = await scoprirebbeLUnita(u)
    if (scoperta) throw new HttpError(409, scoperta)
  }
  await db.update(schema.user).set({ attivo: b.data.attivo }).where(eq(schema.user.id, id))
  if (!b.data.attivo) await db.delete(schema.session).where(eq(schema.session.userId, id))
  await traccia({ entita: 'user', entitaId: id, azione: b.data.attivo ? 'riattiva' : 'disattiva', utente: c.get('attore').id })
  return c.json({ ok: true })
})

/* ── Cataloghi ──────────────────────────────────────────────────── */

admin.get('/causali', async (c) =>
  c.json(await db.select().from(schema.absenceReason).orderBy(asc(schema.absenceReason.ordine))))

/** Il codice serve al programma, non all'utente: se non arriva, si ricava. */
const codiceDa = (etichetta: string) =>
  etichetta.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

admin.post('/causali', async (c) => {
  const b = z.object({
    codice: z.string().min(2).optional(), etichetta: z.string().min(2).max(120),
    ordine: z.number().int().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Causale non valida')
  const codice = b.data.codice ?? codiceDa(b.data.etichetta)
  if (codice.length < 2) throw new HttpError(422, 'Etichetta troppo povera per ricavarne un codice')
  try {
    const [ins] = await db.insert(schema.absenceReason)
      .values({ codice, etichetta: b.data.etichetta, ordine: b.data.ordine ?? 100 })
    await traccia({ entita: 'causale', entitaId: ins.insertId, azione: 'crea', utente: c.get('attore').id, dopo: { codice } })
    return c.json({ id: ins.insertId }, 201)
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Esiste già una causale con questo nome.')
    }
    throw e
  }
})

admin.patch('/causali/:id', async (c) => {
  const b = z.object({ etichetta: z.string().min(2).optional(), attiva: z.boolean().optional() })
    .safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati non validi')
  await db.update(schema.absenceReason).set(b.data).where(eq(schema.absenceReason.id, Number(c.req.param('id'))))
  return c.json({ ok: true })
})

admin.get('/festivita', async (c) =>
  c.json(await db.select().from(schema.holiday).orderBy(asc(schema.holiday.data))))

admin.post('/festivita', async (c) => {
  const b = z.object({
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), descrizione: z.string().min(2),
    unitId: z.number().int().nullable().optional(),
  }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Festività non valida')
  const unitId = b.data.unitId ?? null
  // Nessun indice unico su questa tabella: il doppione lo si ferma qui, o due
  // righe identiche restano a confondere chi legge il calendario.
  const gia = await db.select({ id: schema.holiday.id }).from(schema.holiday)
    .where(and(eq(schema.holiday.data, b.data.data),
      unitId == null ? isNull(schema.holiday.unitId) : eq(schema.holiday.unitId, unitId)))
  if (gia.length) throw new HttpError(409, 'Quella giornata è già in archivio.')
  const [ins] = await db.insert(schema.holiday)
    .values({ data: b.data.data, descrizione: b.data.descrizione, unitId })
  return c.json({ id: ins.insertId }, 201)
})

admin.delete('/festivita/:id', async (c) => {
  await db.delete(schema.holiday).where(eq(schema.holiday.id, Number(c.req.param('id'))))
  return c.json({ ok: true })
})

/** Precarica le festività nazionali di un anno, saltando quelle già presenti. */
admin.post('/festivita/nazionali/:anno', async (c) => {
  const anno = Number(c.req.param('anno'))
  if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) throw new HttpError(422, 'Anno non valido')
  const esistenti = new Set(
    (await db.select({ data: schema.holiday.data }).from(schema.holiday).where(isNull(schema.holiday.unitId)))
      .map((h) => h.data),
  )
  const nuove = italianHolidays(anno).filter((h) => !esistenti.has(h.data))
  if (nuove.length) await db.insert(schema.holiday).values(nuove.map((h) => ({ ...h, unitId: null })))
  return c.json({ aggiunte: nuove.length })
})

/* ── Trasferimento dati ───────────────────────────────────────────
   Modello, caricamento e scarico di ogni sezione. Le assenze restano fuori:
   sono dati personali, e l'amministratore di sistema non li vede — chi deve
   caricarne di storiche passa dalla riga di comando, sul server. */

const CARICABILI: readonly Tabella[] = TABELLE.filter((t) => t !== 'assenze')
const SCARICABILI: readonly Sezione[] = SEZIONI

/**
 * La firma UTF-8 in testa serve a Excel italiano, che senza di lei apre gli
 * accenti a rovescio. Chi rilegge il file la toglie (vedi lib/csv.ts).
 */
function comeFile(c: Context<Env>, nome: string, testo: string) {
  c.header('content-type', 'text/csv; charset=utf-8')
  c.header('content-disposition', `attachment; filename="${nome}.csv"`)
  return c.body(`﻿${testo}`)
}

admin.get('/modelli/:tabella', (c) => {
  const t = c.req.param('tabella') as Tabella
  if (!CARICABILI.includes(t)) throw nonTrovato('Modello inesistente')
  return comeFile(c, `modello-${NOME_FILE[t]}`, MODELLI[t])
})

admin.get('/esporta/:sezione', async (c) => {
  const s = c.req.param('sezione') as Sezione
  if (!SCARICABILI.includes(s)) throw nonTrovato('Sezione inesistente')
  const oggi = new Date().toISOString().slice(0, 10)
  await traccia({ entita: 'dati', entitaId: s, azione: 'esporta', utente: c.get('attore').id })
  return comeFile(c, `${s}-${oggi}`, await esporta(s))
})

admin.post('/importa/:tabella', async (c) => {
  const t = c.req.param('tabella') as Tabella
  if (!CARICABILI.includes(t)) throw nonTrovato('Tabella inesistente')

  const b = z.object({
    testo: z.string().min(1),
    prova: z.boolean().optional(),
    // Il dominio finisce dentro gli indirizzi che costruiamo: se è storto,
    // nascono utenze irraggiungibili.
    dominio: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i,
      'Dominio non valido').max(190).optional(),
  }).safeParse(await c.req.json())
  if (!b.success) {
    // Un dominio storto ha una sua ragione da dire; per il resto basta sapere
    // che il corpo non è quello che serve.
    const primo = b.error.issues[0]
    throw new HttpError(422, primo?.path[0] === 'dominio' ? primo.message : 'Serve il contenuto del file')
  }

  let esito: Awaited<ReturnType<typeof carica>>
  try {
    esito = await carica(t, b.data.testo, { prova: b.data.prova, dominio: b.data.dominio || undefined })
  } catch (x) {
    // Il file non è leggibile del tutto: intestazione storta, separatore
    // sbagliato, nessuna riga. È un errore solo, e va detto per intero.
    throw new HttpError(422, x instanceof Error ? x.message : 'File non leggibile')
  }

  if (!b.data.prova) {
    await traccia({
      entita: 'dati', entitaId: t, azione: 'importa', utente: c.get('attore').id,
      dopo: { aggiunti: esito.aggiunti, saltati: esito.saltati, errori: esito.errori.length },
    })
  }
  return c.json({
    aggiunti: esito.aggiunti, saltati: esito.saltati,
    errori: esito.errori, note: esito.note, credenziali: esito.credenziali,
  })
})
