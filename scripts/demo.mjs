/**
 * Porta l'archivio di prova in uno stato utile: un periodo generato e
 * pubblicato, così che «Mio» e «Turni» abbiano qualcosa da mostrare.
 *
 *   node scripts/demo.mjs [--base http://localhost:8787] [--settimane 4]
 */
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('base', 'http://localhost:8787')
const SETTIMANE = Number(arg('settimane', 4))
const PASSWORD = process.env.SEED_PASSWORD ?? 'turni2026'

async function sessione(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`accesso fallito per ${email}: ${r.status}`)
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  const chiama = async (metodo, p, corpo) => {
    const x = await fetch(`${BASE}/api${p}`, {
      method: metodo, headers: { cookie, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const testo = await x.text()
    if (!x.ok) throw new Error(`${metodo} ${p} → ${x.status} ${testo}`)
    return testo ? JSON.parse(testo) : null
  }
  return { get: (p) => chiama('GET', p), post: (p, b) => chiama('POST', p, b ?? {}) }
}

const iso = (d) => d.toISOString().slice(0, 10)
/** Si parte dal lunedì di questa settimana: un periodo che comincia di giovedì confonde. */
function lunedi() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d
}

const org = await sessione(arg('organizzatore', 'marco.cip@turni.test'))
const dir = await sessione(arg('dirigente', 'serena.gio@turni.test'))

const io = await org.get('/auth/me')
const unitId = io.organizzatoreDi[0] ?? io.unitId
const inizio = lunedi()
const fine = new Date(inizio)
fine.setUTCDate(fine.getUTCDate() + SETTIMANE * 7 - 3)   // fino al venerdì

const esistenti = await org.get(`/periodi?unitId=${unitId}`)
const gia = esistenti.find((p) => p.dataInizio === iso(inizio))
const id = gia?.id ?? (await org.post('/periodi', {
  unitId, dataInizio: iso(inizio), dataFine: iso(fine), assegnaScrivanie: true,
})).id

if (!gia || gia.stato !== 'pubblicato') {
  const esito = await org.post(`/periodi/${id}/genera`)
  console.log(`generate ${esito.quote.length} quote, ${esito.sottoQuota.length} sotto quota, ` +
              `${esito.presidiScoperti.length} presidi scoperti`)
  await org.post(`/periodi/${id}/invia`)
  await dir.post(`/periodi/${id}/approva`)
}

console.log(`periodo ${id} pubblicato: ${iso(inizio)} → ${iso(fine)}`)
