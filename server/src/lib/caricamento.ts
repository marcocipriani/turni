/**
 * Caricamento delle tabelle da file CSV.
 *
 * Un solo motore, due porte: la riga di comando (`importa`, `avvio`) e la
 * pagina «Sistema» dell'amministratore. Le regole di validazione stanno qui e
 * non si ripetono altrove, così un file rifiutato da una porta è rifiutato
 * anche dall'altra, per la stessa ragione e con le stesse parole.
 *
 * Due comportamenti diversi, e la differenza è voluta:
 *
 *   - stanze, settori, assenze, causali, giornate: le righe buone entrano
 *     anche se altre sono sbagliate, e il resoconto dice quali correggere.
 *     Ripassare lo stesso file non duplica niente: le righe già in archivio
 *     si saltano.
 *   - persone: o tutto o niente. Ogni persona nasce con una password mostrata
 *     una volta sola; un caricamento a metà lascerebbe utenze con credenziali
 *     che nessuno ha consegnato.
 */
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index'
import { EMAIL, ISO, leggiCsv, lungo, type Riga, si } from './csv'
import { dividiNome, indirizzoDa } from './nomi'
import { hashPassword } from './password'

export const TABELLE = ['persone', 'stanze', 'settori', 'assenze', 'causali', 'giornate'] as const
export type Tabella = (typeof TABELLE)[number]

export type Opzioni = {
  /** Legge e verifica senza scrivere niente. */
  prova?: boolean
  /** Dominio con cui costruire gli indirizzi mancanti, per le persone. */
  dominio?: string
}

/** Raccoglie gli esiti invece di stamparli via via: prima si controlla tutto. */
export class Esito {
  errori: string[] = []
  note: string[] = []
  aggiunti = 0
  saltati = 0
  /** Password appena generate: si mostrano una volta sola e non si rileggono. */
  credenziali: { chi: string; email: string; password: string }[] = []
  errore(riga: number, testo: string) { this.errori.push(`riga ${riga + 2}: ${testo}`) }
}

/* ── Anagrafiche già in archivio, per risolvere i riferimenti ─────── */

/**
 * Un'unità si nomina col nome per esteso o con la sigla: chi compila il file usa
 * quello che ha sottomano, e devono portare allo stesso posto. Se due unità
 * condividono un nome il riferimento è ambiguo, e va detto invece che scegliere
 * a caso: l'archivio nuovo lo impedisce, uno vecchio può contenerlo.
 */
function indice(righe: { id: number; nome: string; sigla: string | null }[]) {
  const uno = new Map<string, number>()
  const ambigue = new Set<string>()
  for (const u of righe) {
    for (const k of [u.nome.toLowerCase(), u.sigla?.toLowerCase()]) {
      if (!k) continue
      if (uno.has(k) && uno.get(k) !== u.id) ambigue.add(k)
      uno.set(k, u.id)
    }
  }
  return {
    id: (nome: string) => uno.get(nome.toLowerCase()),
    ambigua: (nome: string) => ambigue.has(nome.toLowerCase()),
    aggiungi: (nome: string, sigla: string | null, id: number) => {
      uno.set(nome.toLowerCase(), id)
      if (sigla) uno.set(sigla.toLowerCase(), id)
    },
  }
}

async function unitaPerNome() {
  return indice(await db.select().from(schema.unit))
}

/**
 * Le persone si cercano per nome e cognome, come stanno in archivio. «Della
 * Valle Tommaso» va prima diviso in «Della Valle» + «Tommaso»: il file scrive
 * cognome e nome attaccati, il database li tiene in due colonne.
 */
async function personePerNome() {
  const righe = await db.select({
    id: schema.user.id, nome: schema.user.nome, cognome: schema.user.cognome,
  }).from(schema.user)
  const m = new Map<string, number[]>()
  for (const u of righe) {
    const k = `${u.nome}|${u.cognome}`.toLowerCase()
    m.set(k, [...(m.get(k) ?? []), u.id])
  }
  return (completo: string) => {
    const { nome, cognome } = dividiNome(completo)
    return m.get(`${nome}|${cognome}`.toLowerCase()) ?? []
  }
}

/* ── Persone ──────────────────────────────────────────────────────── */

/**
 * Alfabeto senza caratteri che si confondono a voce o su carta: niente 0 e O,
 * niente 1 e l e I. Queste password si dettano a mano, e una lettera fraintesa
 * diventa una telefonata.
 */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'
export const passwordCasuale = () =>
  Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')).join('-')

async function persone(righe: Riga[], e: Esito, opz: Opzioni) {
  const righeUnita = await db.select().from(schema.unit)
  const idUnita = indice(righeUnita)
  const emailInArchivio = new Set((await db.select({ email: schema.user.email }).from(schema.user))
    .map((u) => u.email))
  const dirigentiInArchivio = new Set(
    (await db.select({ unitId: schema.user.unitId, ruolo: schema.user.ruolo }).from(schema.user))
      .filter((u) => u.ruolo === 'dirigente' && u.unitId != null)
      .map((u) => u.unitId!))

  type Persona = { nome: string; cognome: string; email: string; r: Riga }
  const buone: Persona[] = []
  const emailViste = new Set<string>()

  for (const [i, r] of righe.entries()) {
    if (!r.persona) { e.errore(i, 'manca la colonna «persona».'); continue }
    if (!['admin', 'dirigente', 'dipendente'].includes(r.ruolo ?? '')) {
      e.errore(i, `ruolo «${r.ruolo}» non valido (admin, dirigente o dipendente).`); continue
    }
    if (r.ruolo !== 'admin' && !r.unita) { e.errore(i, 'serve l\'unità organizzativa.'); continue }

    let nome: string, cognome: string
    try { ({ nome, cognome } = dividiNome(r.persona)) }
    catch (x) { e.errore(i, (x as Error).message); continue }

    const troppo = lungo(nome, 80, 'persona') ?? lungo(cognome, 80, 'persona')
      ?? lungo(r.unita ?? '', 160, 'unita')
      ?? lungo(r.sigla ?? '', 32, 'sigla') ?? lungo(r.settore ?? '', 120, 'settore')
      ?? lungo(r.unitaPadre ?? '', 160, 'unitaPadre')
    if (troppo) { e.errore(i, troppo); continue }

    const email = (r.email
      || (opz.dominio ? indirizzoDa(nome, cognome, opz.dominio) : '')).toLowerCase()
    if (!email) { e.errore(i, 'nessun indirizzo, e nessun dominio con cui costruirlo.'); continue }
    if (email.length > 190 || !EMAIL.test(email)) { e.errore(i, `indirizzo non valido: «${email}».`); continue }
    if (emailViste.has(email)) { e.errore(i, `indirizzo ripetuto «${email}».`); continue }
    emailViste.add(email)
    // Già in archivio: la riga si salta, così lo stesso file si può ripassare.
    if (emailInArchivio.has(email)) { e.saltati++; continue }

    buone.push({ nome, cognome, email, r })
  }

  // Un'unità ha un dirigente solo, e non ne può restare senza: il database
  // impone il primo vincolo, il secondo lo diciamo qui, prima di scrivere.
  const capiNelFile = new Map<string, number>()
  for (const p of buone) {
    if (p.r.ruolo !== 'dirigente' || !p.r.unita) continue
    capiNelFile.set(p.r.unita, (capiNelFile.get(p.r.unita) ?? 0) + 1)
  }
  for (const [u, n] of capiNelFile) {
    if (n > 1) e.errori.push(`L'unità «${u}» ha ${n} dirigenti nel file: ne è previsto uno solo.`)
    const idEsistente = idUnita.id(u)
    if (idEsistente != null && dirigentiInArchivio.has(idEsistente)) {
      e.errori.push(`L'unità «${u}» ha già un dirigente in archivio.`)
    }
  }
  const citate = new Set(buone.filter((p) => p.r.unita).map((p) => p.r.unita!))
  for (const u of citate) {
    if (idUnita.ambigua(u)) e.errori.push(`«${u}» è il nome di due unità diverse: il riferimento è ambiguo.`)
    const idEsistente = idUnita.id(u)
    const haCapo = capiNelFile.has(u) || (idEsistente != null && dirigentiInArchivio.has(idEsistente))
    if (!haCapo) e.errori.push(`L'unità «${u}» non ha nessun dirigente, né nel file né in archivio.`)
  }

  /* ── L'organigramma che ne esce deve stare in piedi ────────────────
     Ogni «unitaPadre» deve esistere — nel file o in archivio —, un'unità non
     può avere due superiori diversi, e la parentela non può chiudersi ad
     anello. Sono controlli sul grafo finale, non sulla singola riga: si fanno
     qui, prima di scrivere, perché dopo l'albero sarebbe già storto. */

  const nota = (n: string) => n.toLowerCase()
  const conosciuta = (n: string) => citate.has(n) || idUnita.id(n) != null
  const padreNelFile = new Map<string, string>()

  for (const p of buone) {
    const { unita, unitaPadre } = p.r
    if (!unita || !unitaPadre) continue
    if (!conosciuta(unitaPadre)) {
      e.errori.push(`L'unità superiore «${unitaPadre}» di «${unita}» non esiste, né nel file né in archivio.`)
      continue
    }
    const gia = padreNelFile.get(unita)
    if (gia && nota(gia) !== nota(unitaPadre)) {
      e.errori.push(`L'unità «${unita}» ha due unità superiori diverse nel file: «${gia}» e «${unitaPadre}».`)
      continue
    }
    padreNelFile.set(unita, unitaPadre)
  }

  // Il grafo si ragiona per chiavi stabili: un'unità già in archivio è il suo
  // id, una che nasce dal file è il suo nome. Così i due mondi si mescolano
  // senza confondersi.
  const chiave = (n: string) => { const id = idUnita.id(n); return id == null ? `nuova:${nota(n)}` : `id:${id}` }
  const sopra = new Map<string, string | null>()
  for (const u of righeUnita) sopra.set(`id:${u.id}`, u.parentId == null ? null : `id:${u.parentId}`)
  for (const u of citate) if (!sopra.has(chiave(u))) sopra.set(chiave(u), null)
  for (const [figlia, padre] of padreNelFile) sopra.set(chiave(figlia), chiave(padre))

  for (const partenza of sopra.keys()) {
    const visti = new Set<string>()
    let corrente: string | null | undefined = partenza
    while (corrente != null) {
      if (visti.has(corrente)) {
        const nome = [...padreNelFile.keys()].find((n) => chiave(n) === partenza) ?? partenza
        e.errori.push(`La parentela di «${nome}» si chiude ad anello: un'unità non può stare sotto sé stessa.`)
        break
      }
      visti.add(corrente)
      corrente = sopra.get(corrente) ?? null
    }
  }

  // O tutto o niente: le password si consegnano una volta sola.
  if (e.errori.length || opz.prova) {
    // Con un errore aperto non entra nessuno, e il conteggio deve dirlo: «tre
    // pronte» accanto a «niente è stato scritto» si legge male.
    e.aggiunti = e.errori.length ? 0 : buone.length
    if (e.errori.length) e.note.push('Niente è stato scritto: correggi gli errori e ricarica il file.')
    return
  }

  /* ── Scrittura, tutta dentro una transazione ──────────────────────
     Le persone entrano tutte o nessuna: se l'ultima riga si scontra con un
     indirizzo appena preso da qualcun altro, non devono restare a metà né le
     utenze né le unità nate per contenerle. */

  await db.transaction(async (tx) => {
    const idDi = (nome: string) => idUnita.id(nome)

    for (const nome of citate) {
      if (idDi(nome)) continue
      const sigla = buone.find((p) => p.r.unita === nome && p.r.sigla)?.r.sigla || null
      const [ins] = await tx.insert(schema.unit).values({ nome, sigla })
      idUnita.aggiungi(nome, sigla, ins.insertId)
      e.note.push(`unità: ${nome}`)
    }
    for (const [figlia, padre] of padreNelFile) {
      await tx.update(schema.unit).set({ parentId: idDi(padre)! }).where(eq(schema.unit.id, idDi(figlia)!))
    }

    const settoreId = new Map<string, number>()
    for (const s of await tx.select().from(schema.sector)) settoreId.set(`${s.unitId}|${s.nome}`, s.id)
    for (const p of buone) {
      const nome = p.r.settore
      if (!nome || !p.r.unita) continue
      const uid = idDi(p.r.unita)!
      const k = `${uid}|${nome}`
      if (settoreId.has(k)) continue
      const [ins] = await tx.insert(schema.sector).values({
        unitId: uid, nome, richiedePresidio: si(p.r.presidio), ordine: settoreId.size,
      })
      settoreId.set(k, ins.insertId)
      e.note.push(`settore: ${nome}${si(p.r.presidio) ? ' (presidio)' : ''}`)
    }

    const idPerEmail = new Map<string, number>()
    for (const p of buone) {
      const password = passwordCasuale()
      const uid = p.r.unita ? idDi(p.r.unita)! : null
      const sid = p.r.settore && uid ? settoreId.get(`${uid}|${p.r.settore}`) ?? null : null
      const [ins] = await tx.insert(schema.user).values({
        email: p.email, passwordHash: await hashPassword(password),
        nome: p.nome, cognome: p.cognome,
        ruolo: p.r.ruolo as 'admin' | 'dirigente' | 'dipendente',
        unitId: uid, sectorId: sid, passwordDaCambiare: true,
      })
      idPerEmail.set(p.email, ins.insertId)
      e.credenziali.push({ chi: `${p.cognome} ${p.nome}`, email: p.email, password })
      e.aggiunti++
    }

    for (const p of buone) {
      if (!si(p.r.organizzatore) || !p.r.unita) continue
      const capo = buone.find((x) => x.r.ruolo === 'dirigente' && x.r.unita === p.r.unita)
      const nominatoDa = capo ? idPerEmail.get(capo.email) : undefined
      if (!nominatoDa) continue
      await tx.insert(schema.organizer)
        .values({ userId: idPerEmail.get(p.email)!, unitId: idDi(p.r.unita)!, nominatoDa })
      e.note.push(`organizzatore: ${p.cognome} ${p.nome}`)
    }
  })
}

/* ── Stanze e scrivanie ───────────────────────────────────────────── */

async function stanze(righe: Riga[], e: Esito, opz: Opzioni) {
  const unita = await unitaPerNome()
  // L'etichetta è unica dentro l'unità, non nell'archivio intero: due servizi
  // su piani diversi possono avere ciascuno la propria stanza «12».
  const esistenti = new Set((await db.select().from(schema.room))
    .map((r) => `${r.unitId}|${r.etichetta.toLowerCase()}`))

  for (const [i, r] of righe.entries()) {
    if (!r.stanza) { e.errore(i, 'manca la colonna «stanza».'); continue }
    // «101 · Sala nord» resta scrivibile in una colonna sola, come nei modelli
    // già distribuiti: qui si separa nelle due che l'archivio tiene distinte.
    const [codice = '', ...resto] = r.stanza.split('·')
    const etichetta = codice.trim()
    const soprannome = (r.soprannome ?? resto.join('·')).trim()
    if (!etichetta) { e.errore(i, 'la colonna «stanza» non contiene un codice.'); continue }
    const troppo = lungo(etichetta, 60, 'stanza') ?? lungo(soprannome, 60, 'soprannome')
      ?? lungo(r.piano ?? '', 40, 'piano') ?? lungo(r.sede ?? '', 80, 'sede')
    if (troppo) { e.errore(i, troppo); continue }

    if (unita.ambigua(r.unita ?? '')) { e.errore(i, `«${r.unita}» è il nome di due unità diverse.`); continue }
    const unitId = unita.id(r.unita ?? '')
    if (!unitId) { e.errore(i, `unità «${r.unita}» non trovata.`); continue }
    if (esistenti.has(`${unitId}|${etichetta.toLowerCase()}`)) { e.saltati++; continue }

    // «5» crea le scrivanie da 1 a 5; «1,2,5» crea esattamente quelle. Serve
    // quando la numerazione sul posto ha dei buchi, che è il caso normale.
    const grezzo = (r.scrivanie ?? '').trim()
    const numeri = grezzo.includes(',')
      ? grezzo.split(',').map((n) => n.trim()).filter(Boolean)
      : Array.from({ length: Number(grezzo) || 0 }, (_, n) => String(n + 1))
    if (numeri.length === 0) { e.errore(i, 'nessuna scrivania: indica un numero, oppure l\'elenco «1,2,5».'); continue }
    if (new Set(numeri).size !== numeri.length) { e.errore(i, 'due scrivanie con lo stesso numero.'); continue }
    if (numeri.length > 200) { e.errore(i, `${numeri.length} scrivanie in una stanza sola: controlla la riga.`); continue }
    const numeroLungo = numeri.find((n) => n.length > 20)
    if (numeroLungo) { e.errore(i, `il numero di scrivania «${numeroLungo}» supera i 20 caratteri.`); continue }

    if (!opz.prova) {
      const [ins] = await db.insert(schema.room)
        .values({ unitId, etichetta, soprannome: soprannome || null, piano: r.piano || null, sede: r.sede || null })
      await db.insert(schema.desk).values(numeri.map((numero, n) => ({
        roomId: ins.insertId, numero, x: 40 + (n % 5) * 120, y: 60 + Math.floor(n / 5) * 140,
      })))
    }
    esistenti.add(`${unitId}|${etichetta.toLowerCase()}`)
    e.aggiunti++
    e.note.push(`${etichetta} — ${numeri.length} scrivanie`)
  }
}

/* ── Settori ──────────────────────────────────────────────────────── */

async function settori(righe: Riga[], e: Esito, opz: Opzioni) {
  const unita = await unitaPerNome()
  const esistenti = new Set((await db.select().from(schema.sector))
    .map((s) => `${s.unitId}|${s.nome.toLowerCase()}`))

  for (const [i, r] of righe.entries()) {
    if (!r.settore) { e.errore(i, 'manca la colonna «settore».'); continue }
    const troppo = lungo(r.settore, 120, 'settore')
    if (troppo) { e.errore(i, troppo); continue }
    if (unita.ambigua(r.unita ?? '')) { e.errore(i, `«${r.unita}» è il nome di due unità diverse.`); continue }
    const unitId = unita.id(r.unita ?? '')
    if (!unitId) { e.errore(i, `unità «${r.unita}» non trovata.`); continue }

    const k = `${unitId}|${r.settore.toLowerCase()}`
    if (esistenti.has(k)) { e.saltati++; continue }

    if (!opz.prova) {
      await db.insert(schema.sector).values({
        unitId, nome: r.settore, richiedePresidio: si(r.presidio),
        ordine: Number(r.ordine) || esistenti.size,
      })
    }
    esistenti.add(k)
    e.aggiunti++
    e.note.push(`${r.settore}${si(r.presidio) ? ' (presidio)' : ''}`)
  }
}

/* ── Assenze ──────────────────────────────────────────────────────── */

async function assenze(righe: Riga[], e: Esito, opz: Opzioni) {
  const trova = await personePerNome()
  const causaliValide = new Set((await db.select().from(schema.absenceReason)).map((c) => c.codice))
  const esistenti = new Set((await db.select().from(schema.absence))
    .map((a) => `${a.userId}|${a.dataInizio}|${a.dataFine}`))

  const daInserire: { userId: number; dataInizio: string; dataFine: string; causale: string }[] = []

  for (const [i, r] of righe.entries()) {
    if (!r.persona) { e.errore(i, 'manca la colonna «persona».'); continue }

    let id: number[]
    try { id = trova(r.persona) } catch (x) { e.errore(i, (x as Error).message); continue }
    if (id.length === 0) { e.errore(i, `«${r.persona}» non è in archivio.`); continue }
    if (id.length > 1) { e.errore(i, `«${r.persona}» corrisponde a più persone.`); continue }

    const dal = r.dal ?? ''
    const al = r.al || dal
    if (!ISO.test(dal) || !ISO.test(al)) { e.errore(i, 'date non valide: servono nella forma 2026-09-14.'); continue }
    if (al < dal) { e.errore(i, 'la data finale precede quella iniziale.'); continue }
    if (!causaliValide.has(r.causale ?? '')) {
      e.errore(i, `causale «${r.causale}» inesistente. Quelle in archivio: ${[...causaliValide].join(', ')}.`)
      continue
    }

    const k = `${id[0]}|${dal}|${al}`
    if (esistenti.has(k)) { e.saltati++; continue }
    esistenti.add(k)
    daInserire.push({ userId: id[0]!, dataInizio: dal, dataFine: al, causale: r.causale! })
    e.aggiunti++
  }

  if (daInserire.length && !opz.prova) await db.insert(schema.absence).values(daInserire)
  e.note.push(`${daInserire.length} assenze`)
}

/* ── Causali ──────────────────────────────────────────────────────── */

async function causali(righe: Riga[], e: Esito, opz: Opzioni) {
  const esistenti = new Set((await db.select().from(schema.absenceReason)).map((c) => c.codice))

  for (const [i, r] of righe.entries()) {
    if (!r.codice || !r.etichetta) { e.errore(i, 'servono «codice» e «etichetta».'); continue }
    if (!/^[a-z0-9_]+$/.test(r.codice)) {
      e.errore(i, `codice «${r.codice}»: solo minuscole, cifre e trattino basso.`); continue
    }
    const troppo = lungo(r.codice, 40, 'codice') ?? lungo(r.etichetta, 120, 'etichetta')
    if (troppo) { e.errore(i, troppo); continue }
    if (esistenti.has(r.codice)) { e.saltati++; continue }

    if (!opz.prova) {
      await db.insert(schema.absenceReason).values({
        codice: r.codice, etichetta: r.etichetta,
        attiva: r.attiva === '' || r.attiva === undefined ? true : si(r.attiva),
        ordine: Number(r.ordine) || esistenti.size,
      })
    }
    esistenti.add(r.codice)
    e.aggiunti++
    e.note.push(`${r.codice} — ${r.etichetta}`)
  }
}

/* ── Giornate non lavorative ──────────────────────────────────────── */

async function giornate(righe: Riga[], e: Esito, opz: Opzioni) {
  const unita = await unitaPerNome()
  const esistenti = new Set((await db.select().from(schema.holiday))
    .map((h) => `${h.data}|${h.unitId ?? ''}`))

  const daInserire: { data: string; descrizione: string; unitId: number | null }[] = []

  for (const [i, r] of righe.entries()) {
    if (!ISO.test(r.data ?? '')) { e.errore(i, 'data non valida: serve nella forma 2026-12-24.'); continue }
    if (!r.descrizione) { e.errore(i, 'manca la descrizione.'); continue }
    const troppo = lungo(r.descrizione, 120, 'descrizione')
    if (troppo) { e.errore(i, troppo); continue }

    // Unità vuota significa «vale per tutti»: è il caso delle festività
    // nazionali, e resta il predefinito.
    let unitId: number | null = null
    if (r.unita) {
      if (unita.ambigua(r.unita)) { e.errore(i, `«${r.unita}» è il nome di due unità diverse.`); continue }
      unitId = unita.id(r.unita) ?? null
      if (unitId == null) { e.errore(i, `unità «${r.unita}» non trovata.`); continue }
    }

    const k = `${r.data}|${unitId ?? ''}`
    if (esistenti.has(k)) { e.saltati++; continue }
    esistenti.add(k)
    daInserire.push({ data: r.data!, descrizione: r.descrizione, unitId })
    e.aggiunti++
    e.note.push(`${r.data} — ${r.descrizione}${unitId ? ` (${r.unita})` : ''}`)
  }

  if (daInserire.length && !opz.prova) await db.insert(schema.holiday).values(daInserire)
}

/* ── Il motore ────────────────────────────────────────────────────── */

const CARICATORI: Record<Tabella, (r: Riga[], e: Esito, o: Opzioni) => Promise<void>> = {
  persone, stanze, settori, assenze, causali, giornate,
}

export async function carica(tabella: Tabella, testo: string, opz: Opzioni = {}): Promise<Esito> {
  const e = new Esito()
  await CARICATORI[tabella](leggiCsv(testo), e, opz)
  return e
}

/* ── Modelli ──────────────────────────────────────────────────────────
   Le colonne che il motore sa leggere, con qualche riga d'esempio. Sono qui e
   non in un file sul disco perché chi carica deve poterli scaricare dall'app,
   che gira anche dove `docs/` non è stata installata. Le copie in
   `docs/modelli/` sono le stesse: un test le confronta con queste. */

export const MODELLI: Record<Tabella, string> = {
  persone: `persona;ruolo;unita;sigla;unitaPadre;settore;presidio;organizzatore;email
Ferri Anna;admin;;;;;;;amministratore@esempio.it
Rossi Maria;dirigente;Dipartimento esempio;DIPES;;;;;
Di Marco Luca;dipendente;Dipartimento esempio;;;Segreteria;si;si;
Bianchi Paolo;dirigente;Ufficio esempio;UFFES;Dipartimento esempio;;;;
Verdi Anna;dipendente;Ufficio esempio;;;Contabilità;;;anna.ver@esempio.it
`,
  stanze: `stanza;soprannome;piano;sede;scrivanie;unita
101;Sala nord;Primo piano;via Roma 1;5;Dipartimento esempio
102;;Primo piano;via Roma 1;2;Dipartimento esempio
204 · Archivio;;Secondo piano;via Milano 5;1,2,5;Ufficio esempio
`,
  settori: `settore;unita;presidio;ordine
Segreteria;Ufficio esempio;si;0
Contabilità;Ufficio esempio;;1
`,
  assenze: `persona;dal;al;causale
Di Marco Luca;2026-09-14;2026-09-14;ferie
Verdi Anna;2026-09-21;2026-09-25;ferie
`,
  causali: `codice;etichetta;attiva;ordine
ferie;Ferie;si;0
permesso_studio;Permesso per diritto allo studio;si;13
`,
  giornate: `data;descrizione;unita
2026-06-29;Santo patrono;
2026-12-24;Chiusura di fine anno;Dipartimento esempio
`,
}

/** Il nome del file che si scarica: quello che poi si ricarica com'è. */
export const NOME_FILE: Record<Tabella, string> = {
  persone: 'persone', stanze: 'stanze', settori: 'settori',
  assenze: 'assenze', causali: 'causali', giornate: 'giornate-non-lavorative',
}
