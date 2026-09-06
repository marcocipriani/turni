/**
 * Prova del giro completo di uno scambio contro l'istanza in esecuzione:
 * chi posso, propongo, l'altro accetta, la griglia cambia davvero.
 *
 *   node scripts/prova-scambio.mjs
 */
import { UTENTI } from './cdp.mjs'

const BASE = process.env.BASE ?? 'http://localhost:8787'
const PASSWORD = process.env.SEED_PASSWORD ?? 'turni2026'

async function sessione(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`accesso fallito per ${email}`)
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  const chiama = async (metodo, p, corpo) => {
    const x = await fetch(`${BASE}/api${p}`, {
      method: metodo, headers: { cookie, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const t = await x.text()
    return { stato: x.status, corpo: t ? JSON.parse(t) : null }
  }
  return {
    get: (p) => chiama('GET', p), post: (p, b) => chiama('POST', p, b ?? {}),
    del: (p) => chiama('DELETE', p),
  }
}

const io = await sessione(UTENTI.dipendente)
const mio = (await io.get('/mio')).corpo
const giornata = mio.giorni.find((g) => g.stato === 'presenza')
if (!giornata) throw new Error('nessuna giornata in sede da scambiare')
console.log(`giornata scelta: ${giornata.data} (${giornata.colleghi.length} colleghi in sede)`)

const poss = (await io.get(`/scambi/possibili?data=${giornata.data}`)).corpo
console.log(`scambio attivo: ${poss.scambio?.attivo}, ora limite ${poss.scambio?.oraLimite}`)
console.log(`candidati: ${poss.candidati.length}`)
for (const c of poss.candidati.slice(0, 3)) {
  console.log(`  ${c.cognome} ${c.nome} → ${c.giornate.map((g) => `${g.data}(${g.tipo})`).join(' ')}`)
}
if (!poss.candidati.length) throw new Error('nessun candidato')

const scelto = poss.candidati[0]
const g = scelto.giornate[0]
const creato = await io.post('/scambi', {
  tipo: g.tipo, destinatarioId: scelto.userId,
  dataProponente: g.tipo === 'chiedo' ? g.data : giornata.data,
  dataDestinatario: g.data,
  messaggio: 'prova automatica',
})
console.log('proposta:', creato.stato, JSON.stringify(creato.corpo))
if (creato.stato !== 201) process.exit(1)

// La stessa cella non entra in un secondo scambio.
const doppione = await io.post('/scambi', {
  tipo: g.tipo, destinatarioId: scelto.userId,
  dataProponente: g.tipo === 'chiedo' ? g.data : giornata.data,
  dataDestinatario: g.data,
})
console.log('secondo scambio sulla stessa cella:', doppione.stato, doppione.corpo?.errore ?? '')

// Il destinatario vede la proposta e accetta.
const emailDi = (c) => `${c.nome.toLowerCase().split(' ')[0]}.${c.cognome.toLowerCase()}@turni.test`
const altro = await sessione(emailDi(scelto))
const inArrivo = (await altro.get('/scambi')).corpo.inArrivo
console.log(`in arrivo per ${scelto.cognome}: ${inArrivo.length}`)

const primaMia = (await io.get('/mio')).corpo.giorni.find((x) => x.data === g.data)?.stato
const esito = await altro.post(`/scambi/${creato.corpo.id}/accetta`)
console.log('accettazione:', esito.stato, esito.corpo?.errore ?? '')
const dopoMia = (await io.get('/mio')).corpo.giorni.find((x) => x.data === g.data)?.stato
console.log(`la mia giornata ${g.data}: ${primaMia} → ${dopoMia ?? 'fuori elenco'}`)
