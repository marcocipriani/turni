/**
 * Cattura schermate dell'app in esecuzione, autenticate e nei due temi.
 * Serve a verificare l'aspetto senza aprire un browser a mano.
 *
 *   node scripts/schermate.mjs [--base http://localhost:8787] [--out /tmp/schermate]
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as attendi } from 'node:timers/promises'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('base', 'http://localhost:8787')
const OUT = arg('out', '/tmp/schermate')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9333

const PAGINE = [
  ['accesso', '/panoramica', null],
  ['panoramica', '/panoramica', 'organizzatore'],
  ['turni-elenco', '/programmazione', 'organizzatore'],
  ['turni-griglia', '/programmazione/1', 'organizzatore'],
  ['calendario', '/calendario', 'dipendente'],
  ['assenze', '/assenze', 'dipendente'],
  ['struttura', '/organizzazione', 'dirigente'],
  ['sistema', '/amministrazione', 'admin'],
  ['notifiche', '/notifiche', 'dipendente'],
]

const UTENTI = {
  organizzatore: 'm.fabbri@turni.test',
  dirigente: 'b.ferraro@turni.test',
  dipendente: 'l.marchetti@turni.test',
  admin: 'admin@turni.test',
}

async function sessione(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: process.env.SEED_PASSWORD ?? 'turni2026' }),
  })
  if (!r.ok) throw new Error(`accesso fallito per ${email}`)
  const set = r.headers.getSetCookie()[0] ?? ''
  return set.split(';')[0].split('=').slice(1).join('=')
}

class Cdp {
  #ws; #id = 0; #attese = new Map()
  static async apri(url) {
    const r = await fetch(`http://127.0.0.1:${PORTA}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
    const t = await r.json()
    const c = new Cdp()
    c.#ws = new WebSocket(t.webSocketDebuggerUrl)
    await new Promise((ok, ko) => { c.#ws.onopen = ok; c.#ws.onerror = ko })
    c.#ws.onmessage = (m) => {
      const d = JSON.parse(m.data)
      const p = c.#attese.get(d.id)
      if (p) { c.#attese.delete(d.id); d.error ? p.ko(new Error(d.error.message)) : p.ok(d.result) }
    }
    return c
  }
  invia(method, params = {}) {
    const id = ++this.#id
    this.#ws.send(JSON.stringify({ id, method, params }))
    return new Promise((ok, ko) => this.#attese.set(id, { ok, ko }))
  }
  chiudi() { this.#ws.close() }
}

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORTA}`, '--disable-gpu', '--hide-scrollbars',
  '--no-first-run', '--user-data-dir=/tmp/turni-chrome-profilo', 'about:blank',
], { stdio: 'ignore' })

try {
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://127.0.0.1:${PORTA}/json/version`); break } catch { await attendi(250) }
  }
  mkdirSync(OUT, { recursive: true })
  const token = {}
  for (const [k, email] of Object.entries(UTENTI)) token[k] = await sessione(email)

  for (const tema of ['light', 'dark']) {
    for (const [nome, percorso, come] of PAGINE) {
      const c = await Cdp.apri('about:blank')
      await c.invia('Network.enable')
      await c.invia('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
      await c.invia('Emulation.setScriptExecutionDisabled', { value: false })
      await c.invia('Network.setCookie', {
        name: 'turni_session', value: come ? token[come] : 'nessuna',
        domain: 'localhost', path: '/', httpOnly: true,
      })
      // Il tema si legge da localStorage all'avvio: si imposta prima del caricamento.
      await c.invia('Page.enable')
      await c.invia('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('turni.tema', ${JSON.stringify(tema === 'dark' ? 'scuro' : 'chiaro')}) } catch {}`,
      })
      await c.invia('Page.navigate', { url: `${BASE}${percorso}` })
      await attendi(1800)
      const { data } = await c.invia('Page.captureScreenshot', { format: 'png' })
      writeFileSync(`${OUT}/${nome}-${tema}.png`, Buffer.from(data, 'base64'))
      console.log(`  ${nome}-${tema}.png`)
      c.chiudi()
    }
  }
  console.log(`\nSchermate in ${OUT}`)
} finally {
  chrome.kill()
}
