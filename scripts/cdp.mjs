/**
 * Chrome headless pilotato dal protocollo di sviluppo, senza dipendenze.
 *
 * Lo usano le schermate, la verifica di accessibilità e la misura dei tempi:
 * tre strumenti che avevano la stessa classe copiata tre volte.
 */
import { spawn } from 'node:child_process'
import { setTimeout as attendi } from 'node:timers/promises'

export const CHROME = process.env.CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const SCHERMI = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false },
  telefono: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
}

/** Le utenze dell'ambiente di prova, per ruolo. */
export const UTENTI = {
  organizzatore: 'marco.cip@turni.test',
  dirigente: 'serena.gio@turni.test',
  dipendente: 'elena.pul@turni.test',
  admin: 'admin@turni.test',
}

export async function accedi(base, email) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: process.env.SEED_PASSWORD ?? 'turni2026' }),
  })
  if (!r.ok) throw new Error(`accesso fallito per ${email}: HTTP ${r.status}`)
  return {
    cookie: r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '),
    token: r.headers.getSetCookie()[0].split(';')[0].split('=').slice(1).join('='),
  }
}

/** Un token di sessione per ciascun ruolo. */
export async function sessioni(base) {
  const out = {}
  for (const [ruolo, email] of Object.entries(UTENTI)) out[ruolo] = await accedi(base, email)
  return out
}

export class Chrome {
  #processo; #porta
  static async avvia(porta = 9333, profilo = '/tmp/turni-chrome') {
    const c = new Chrome()
    c.#porta = porta
    c.#processo = spawn(CHROME, [
      '--headless=new', `--remote-debugging-port=${porta}`, '--disable-gpu', '--hide-scrollbars',
      '--no-first-run', `--user-data-dir=${profilo}`, 'about:blank',
    ], { stdio: 'ignore' })
    for (let i = 0; i < 60; i++) {
      try { await fetch(`http://127.0.0.1:${porta}/json/version`); return c } catch { await attendi(250) }
    }
    c.chiudi()
    throw new Error(`Chrome non risponde sulla porta ${porta}. Percorso: ${CHROME}`)
  }

  /** Una scheda nuova, isolata dalle altre. */
  async scheda() {
    const t = await (await fetch(
      `http://127.0.0.1:${this.#porta}/json/new?about:blank`, { method: 'PUT' })).json()
    return Scheda.collega(t.webSocketDebuggerUrl)
  }

  chiudi() { this.#processo?.kill() }
}

class Scheda {
  #ws; #id = 0; #attese = new Map(); #ascolti = new Map()

  static async collega(url) {
    const s = new Scheda()
    s.#ws = new WebSocket(url)
    await new Promise((ok, ko) => { s.#ws.onopen = ok; s.#ws.onerror = ko })
    s.#ws.onmessage = (m) => {
      const d = JSON.parse(m.data)
      if (d.method) { for (const f of s.#ascolti.get(d.method) ?? []) f(d.params); return }
      const p = s.#attese.get(d.id)
      if (p) { s.#attese.delete(d.id); d.error ? p.ko(new Error(d.error.message)) : p.ok(d.result) }
    }
    return s
  }

  invia(metodo, parametri = {}) {
    const id = ++this.#id
    this.#ws.send(JSON.stringify({ id, method: metodo, params: parametri }))
    return new Promise((ok, ko) => this.#attese.set(id, { ok, ko }))
  }

  ascolta(evento, fn) {
    const lista = this.#ascolti.get(evento) ?? this.#ascolti.set(evento, []).get(evento)
    lista.push(fn)
  }

  /**
   * Apre una pagina già autenticata, nel tema richiesto.
   * Il tema si legge da localStorage all'avvio: va scritto prima del caricamento.
   */
  async apri(base, percorso, { token, tema = 'light', schermo = SCHERMI.desktop, attesa = 1800 } = {}) {
    await this.invia('Network.enable')
    await this.invia('Page.enable')
    await this.invia('Emulation.setDeviceMetricsOverride', schermo)
    await this.invia('Network.setCookie', {
      name: 'turni_session', value: token ?? 'nessuna',
      domain: 'localhost', path: '/', httpOnly: true,
    })
    await this.invia('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('turni.tema', ${JSON.stringify(tema === 'dark' ? 'scuro' : 'chiaro')}) } catch {}
        // LCP e CLS esistono solo attraverso un osservatore, e vanno installati
        // prima che la pagina cominci a disegnare: dopo, le voci sono perse.
        window.__metriche = { lcp: 0, cls: 0 };
        try {
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) window.__metriche.lcp = e.startTime
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) if (!e.hadRecentInput) window.__metriche.cls += e.value
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {}`,
    })
    await this.invia('Page.navigate', { url: `${base}${percorso}` })
    if (attesa) await attendi(attesa)
  }

  async valuta(espressione, { attendiPromessa = false } = {}) {
    const r = await this.invia('Runtime.evaluate', {
      expression: espressione, awaitPromise: attendiPromessa, returnByValue: true,
    })
    return r.result?.value
  }

  async schermata() {
    const { data } = await this.invia('Page.captureScreenshot', { format: 'png' })
    return Buffer.from(data, 'base64')
  }

  chiudi() { this.#ws.close() }
}
