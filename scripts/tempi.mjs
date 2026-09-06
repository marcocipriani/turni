/**
 * Tempi e peso delle risposte, misurati invece che sperati.
 *
 * Ogni rotta viene chiamata a freddo una volta e poi venti volte: interessa la
 * mediana a caldo, non il primo colpo, perché è quella che l'utente vive.
 * Del peso conta la versione compressa: è quella che passa sulla rete.
 *
 *   node scripts/tempi.mjs [--base http://localhost:8787]
 */
import { gzipSync } from 'node:zlib'
import { Chrome, SCHERMI, sessioni } from './cdp.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('base', 'http://localhost:8787')
const GIRI = Number(arg('giri', 20))

const oggi = new Date().toISOString().slice(0, 10)
const fra = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

const ROTTE = [
  ['auth/me', '/auth/me', 'dipendente'],
  ['mio', '/mio', 'dipendente'],
  ['panoramica 2 sett.', `/panoramica?da=${oggi}&a=${fra(13)}`, 'dipendente'],
  ['panoramica 4 sett.', `/panoramica?da=${oggi}&a=${fra(27)}`, 'dipendente'],
  ['griglia del periodo', '/periodi/1/griglia', 'organizzatore'],
  ['elenco periodi', '/periodi?unitId=2', 'organizzatore'],
  ['scambi', '/scambi', 'dipendente'],
  ['scambi possibili', `/scambi/possibili?data=${oggi}`, 'dipendente'],
  ['notifiche', '/notifiche', 'dipendente'],
  ['export CSV', '/periodi/1/export.csv', 'organizzatore'],
]

const sess = await sessioni(BASE)
const cookie = Object.fromEntries(Object.entries(sess).map(([k, v]) => [k, v.cookie]))

const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

console.log(`\nTempi delle rotte — mediana su ${GIRI} chiamate a caldo\n`)
console.log(`  ${'rotta'.padEnd(22)} ${'mediana'.padStart(9)} ${'p95'.padStart(8)} ${'json'.padStart(9)} ${'gzip'.padStart(8)}`)
console.log(`  ${'-'.repeat(60)}`)

let lente = 0
for (const [nome, percorso, come] of ROTTE) {
  const chiama = () => fetch(`${BASE}/api${percorso}`, { headers: { cookie: cookie[come] } })
  const primo = await chiama()
  if (!primo.ok) { console.log(`  ${nome.padEnd(22)}  HTTP ${primo.status}`); continue }
  const corpo = await primo.text()

  const tempi = []
  for (let i = 0; i < GIRI; i++) {
    const t = performance.now()
    await (await chiama()).arrayBuffer()
    tempi.push(performance.now() - t)
  }
  tempi.sort((a, b) => a - b)
  const p95 = tempi[Math.min(tempi.length - 1, Math.floor(tempi.length * 0.95))]
  const med = mediana(tempi)
  if (med > 100) lente++

  const grezzo = Buffer.byteLength(corpo)
  const compresso = gzipSync(corpo).length
  console.log(`  ${nome.padEnd(22)} ${med.toFixed(1).padStart(7)}ms ${p95.toFixed(1).padStart(6)}ms ` +
              `${(grezzo / 1024).toFixed(1).padStart(7)}kB ${(compresso / 1024).toFixed(1).padStart(6)}kB`)
}

console.log(`\n${lente === 0 ? 'Nessuna rotta oltre i 100 ms.' : `${lente} rotte oltre i 100 ms.`}`)

/* ── Caricamento delle pagine ───────────────────────────────────────
   I tempi dell'API non dicono quando l'utente vede qualcosa. Qui si misura
   quello: primo disegno con contenuto, elemento più grande, byte trasferiti. */

const PAGINE = [
  ['accesso', '/mio', null],
  ['mio', '/mio', 'dipendente'],
  ['turni · giorni', '/turni', 'dipendente'],
  ['turni · griglia', '/turni/1', 'organizzatore'],
]

const chrome = await Chrome.avvia(9336, '/tmp/turni-chrome-tempi')
try {
  for (const rete of ['veloce', 'lenta']) {
    console.log(`\nCaricamento delle pagine, rete ${rete}` +
      (rete === 'lenta' ? ' (4G scarsa: 1.6 Mbit/s, 150 ms di latenza)' : '') + '\n')
    console.log(`  ${'pagina'.padEnd(18)} ${'primo testo'.padStart(12)} ${'più grande'.padStart(12)} ` +
                `${'pronta'.padStart(9)} ${'rete'.padStart(9)} ${'richieste'.padStart(10)} ${'scarti'.padStart(8)}`)
    console.log(`  ${'-'.repeat(86)}`)

    for (const [nome, percorso, come] of PAGINE) {
      const s = await chrome.scheda()
      await s.invia('Network.enable')
      if (rete === 'lenta') {
        await s.invia('Network.emulateNetworkConditions', {
          offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8,
        })
      }
      await s.apri(BASE, percorso, {
        token: come ? sess[come].token : null, schermo: SCHERMI.desktop, attesa: 3500,
      })

      const m = await s.valuta(`JSON.stringify({
        fcp: (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0,
        lcp: (window.__metriche || {}).lcp || 0,
        cls: (window.__metriche || {}).cls || 0,
        pronta: (performance.getEntriesByType('navigation')[0] || {}).domContentLoadedEventEnd || 0,
        byte: performance.getEntriesByType('resource').reduce((n, r) => n + (r.transferSize || 0), 0)
              + ((performance.getEntriesByType('navigation')[0] || {}).transferSize || 0),
        richieste: performance.getEntriesByType('resource').length + 1,
      })`)
      const d = JSON.parse(m)
      console.log(`  ${nome.padEnd(18)} ${d.fcp.toFixed(0).padStart(10)}ms ${d.lcp.toFixed(0).padStart(10)}ms ` +
                  `${d.pronta.toFixed(0).padStart(7)}ms ${(d.byte / 1024).toFixed(0).padStart(7)}kB ` +
                  `${String(d.richieste).padStart(10)} ${d.cls.toFixed(3).padStart(8)}`)
      s.chiudi()
    }
  }
} finally {
  chrome.chiudi()
}
console.log('')
