/**
 * Caricamento delle tabelle di contorno da file.
 *
 * Le persone si caricano con `avvio`, che deve anche generare e mostrare le
 * password. Tutto il resto — stanze, settori, assenze, causali, giornate non
 * lavorative — passa da qui, e da qui si può ripassare quante volte serve: le
 * righe già presenti si saltano invece di duplicarsi.
 *
 * Le righe buone entrano anche se altre sono sbagliate, e il resoconto dice
 * quali correggere. È il contrario di `avvio`, che verifica tutto prima di
 * scrivere: lì un caricamento a metà lascerebbe utenze senza password
 * consegnata, qui lascia solo qualche riga da rifare.
 *
 *   npm run importa -w server -- stanze ../docs/modelli/stanze.csv
 *   npm run importa -w server -- assenze assenze.csv --prova
 *
 * I modelli, con le colonne e un paio di righe d'esempio, stanno in
 * `docs/modelli/`.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'

import { db, pool, schema } from './db/index'
import { ISO, leggiCsv, type Riga, si } from './lib/csv'
import { dividiNome, siglaCognome } from './lib/nomi'

const TABELLE = ['stanze', 'settori', 'assenze', 'causali', 'giornate'] as const
type Tabella = (typeof TABELLE)[number]

const argomenti = process.argv.slice(2)
const PROVA = argomenti.includes('--prova')
const [TABELLA, FILE] = argomenti.filter((a) => !a.startsWith('--'))

/** Raccoglie gli esiti invece di stamparli via via: prima si controlla tutto. */
class Esito {
  errori: string[] = []
  aggiunti = 0
  saltati = 0
  errore(riga: number, testo: string) { this.errori.push(`riga ${riga + 2}: ${testo}`) }
}

/* ── Anagrafiche già in archivio, per risolvere i riferimenti ─────── */

async function unitaPerNome() {
  const righe = await db.select().from(schema.unit)
  const m = new Map<string, number>()
  for (const u of righe) {
    m.set(u.nome.toLowerCase(), u.id)
    if (u.sigla) m.set(u.sigla.toLowerCase(), u.id)
  }
  return m
}

/**
 * Le persone si cercano per nome e sigla del cognome: in archivio il cognome
 * per esteso non c'è, quindi «Della Valle Tommaso» va prima ridotto a
 * «Tommaso» + «Del», che è ciò che il database contiene davvero.
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
    return m.get(`${nome}|${siglaCognome(cognome)}`.toLowerCase()) ?? []
  }
}

/* ── Stanze e scrivanie ───────────────────────────────────────────── */

async function stanze(righe: Riga[], e: Esito) {
  const unita = await unitaPerNome()
  const esistenti = new Set((await db.select().from(schema.room)).map((r) => r.etichetta.toLowerCase()))

  for (const [i, r] of righe.entries()) {
    if (!r.stanza) { e.errore(i, 'manca la colonna «stanza».'); continue }
    if (esistenti.has(r.stanza.toLowerCase())) { e.saltati++; continue }

    const unitId = unita.get((r.unita ?? '').toLowerCase())
    if (!unitId) { e.errore(i, `unità «${r.unita}» non trovata.`); continue }

    // «5» crea le scrivanie da 1 a 5; «1,2,5» crea esattamente quelle. Serve
    // quando la numerazione sul posto ha dei buchi, che è il caso normale.
    const grezzo = (r.scrivanie ?? '').trim()
    const numeri = grezzo.includes(',')
      ? grezzo.split(',').map((n) => n.trim()).filter(Boolean)
      : Array.from({ length: Number(grezzo) || 0 }, (_, n) => String(n + 1))
    if (numeri.length === 0) { e.errore(i, 'nessuna scrivania: indica un numero, oppure l\'elenco «1,2,5».'); continue }
    if (new Set(numeri).size !== numeri.length) { e.errore(i, 'due scrivanie con lo stesso numero.'); continue }

    if (!PROVA) {
      const [ins] = await db.insert(schema.room)
        .values({ unitId, etichetta: r.stanza, piano: r.piano || null })
      await db.insert(schema.desk).values(numeri.map((numero, n) => ({
        roomId: ins.insertId, numero, x: 40 + (n % 5) * 120, y: 60 + Math.floor(n / 5) * 140,
      })))
    }
    esistenti.add(r.stanza.toLowerCase())
    e.aggiunti++
    console.log(`  ${r.stanza} — ${numeri.length} scrivanie`)
  }
}

/* ── Settori ──────────────────────────────────────────────────────── */

async function settori(righe: Riga[], e: Esito) {
  const unita = await unitaPerNome()
  const esistenti = new Set((await db.select().from(schema.sector))
    .map((s) => `${s.unitId}|${s.nome.toLowerCase()}`))

  for (const [i, r] of righe.entries()) {
    if (!r.settore) { e.errore(i, 'manca la colonna «settore».'); continue }
    const unitId = unita.get((r.unita ?? '').toLowerCase())
    if (!unitId) { e.errore(i, `unità «${r.unita}» non trovata.`); continue }

    const k = `${unitId}|${r.settore.toLowerCase()}`
    if (esistenti.has(k)) { e.saltati++; continue }

    if (!PROVA) {
      await db.insert(schema.sector).values({
        unitId, nome: r.settore, richiedePresidio: si(r.presidio),
        ordine: Number(r.ordine) || esistenti.size,
      })
    }
    esistenti.add(k)
    e.aggiunti++
    console.log(`  ${r.settore}${si(r.presidio) ? ' (presidio)' : ''}`)
  }
}

/* ── Assenze ──────────────────────────────────────────────────────── */

async function assenze(righe: Riga[], e: Esito) {
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

  if (daInserire.length && !PROVA) await db.insert(schema.absence).values(daInserire)
  console.log(`  ${daInserire.length} assenze`)
}

/* ── Causali ──────────────────────────────────────────────────────── */

async function causali(righe: Riga[], e: Esito) {
  const esistenti = new Set((await db.select().from(schema.absenceReason)).map((c) => c.codice))

  for (const [i, r] of righe.entries()) {
    if (!r.codice || !r.etichetta) { e.errore(i, 'servono «codice» e «etichetta».'); continue }
    if (!/^[a-z0-9_]+$/.test(r.codice)) {
      e.errore(i, `codice «${r.codice}»: solo minuscole, cifre e trattino basso.`); continue
    }
    if (esistenti.has(r.codice)) { e.saltati++; continue }

    if (!PROVA) {
      await db.insert(schema.absenceReason).values({
        codice: r.codice, etichetta: r.etichetta,
        attiva: r.attiva === '' || r.attiva === undefined ? true : si(r.attiva),
        ordine: Number(r.ordine) || esistenti.size,
      })
    }
    esistenti.add(r.codice)
    e.aggiunti++
    console.log(`  ${r.codice} — ${r.etichetta}`)
  }
}

/* ── Giornate non lavorative ──────────────────────────────────────── */

async function giornate(righe: Riga[], e: Esito) {
  const unita = await unitaPerNome()
  const esistenti = new Set((await db.select().from(schema.holiday))
    .map((h) => `${h.data}|${h.unitId ?? ''}`))

  const daInserire: { data: string; descrizione: string; unitId: number | null }[] = []

  for (const [i, r] of righe.entries()) {
    if (!ISO.test(r.data ?? '')) { e.errore(i, 'data non valida: serve nella forma 2026-12-24.'); continue }
    if (!r.descrizione) { e.errore(i, 'manca la descrizione.'); continue }

    // Unità vuota significa «vale per tutti»: è il caso delle festività
    // nazionali, e resta il predefinito.
    let unitId: number | null = null
    if (r.unita) {
      unitId = unita.get(r.unita.toLowerCase()) ?? null
      if (unitId == null) { e.errore(i, `unità «${r.unita}» non trovata.`); continue }
    }

    const k = `${r.data}|${unitId ?? ''}`
    if (esistenti.has(k)) { e.saltati++; continue }
    esistenti.add(k)
    daInserire.push({ data: r.data!, descrizione: r.descrizione, unitId })
    e.aggiunti++
    console.log(`  ${r.data} — ${r.descrizione}${unitId ? ` (${r.unita})` : ''}`)
  }

  if (daInserire.length && !PROVA) await db.insert(schema.holiday).values(daInserire)
}

/* ── Comando ──────────────────────────────────────────────────────── */

const CARICATORI: Record<Tabella, (r: Riga[], e: Esito) => Promise<void>> = {
  stanze, settori, assenze, causali, giornate,
}

async function main() {
  if (!TABELLA || !FILE || !TABELLE.includes(TABELLA as Tabella)) {
    console.error(`
Carica una tabella da un file CSV.

  npm run importa -w server -- <tabella> <file.csv> [--prova]

Tabelle:  ${TABELLE.join('  ')}
          (le persone si caricano con «avvio», che genera anche le password)

  --prova   legge e verifica il file senza scrivere niente

I modelli, con le colonne e qualche riga d'esempio, stanno in docs/modelli/.
`)
    process.exit(1)
  }

  const righe = leggiCsv(readFileSync(FILE, 'utf8'))
  const e = new Esito()
  console.log(`\nCaricamento di ${righe.length} righe in «${TABELLA}»${PROVA ? ' (prova, niente viene scritto)' : ''}…\n`)

  await CARICATORI[TABELLA as Tabella](righe, e)

  if (e.errori.length) {
    console.error(`\n${e.errori.length} righe non caricate:\n`)
    for (const x of e.errori) console.error(`  ${x}`)
  }
  console.log(`\n${e.aggiunti} aggiunte, ${e.saltati} già presenti, ${e.errori.length} con errori.\n`)

  await pool.end()
  if (e.errori.length) process.exit(1)
}

main().catch(async (x) => {
  console.error(`\n${x instanceof Error ? x.message : String(x)}\n`)
  await pool.end()
  process.exit(1)
})
