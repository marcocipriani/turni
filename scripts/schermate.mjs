/**
 * Cattura schermate dell'app in esecuzione, autenticate e nei due temi.
 * Serve a verificare l'aspetto senza aprire un browser a mano.
 *
 *   node scripts/schermate.mjs [--base http://localhost:8787] [--out /tmp/schermate] [--mobile]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { Chrome, SCHERMI, sessioni } from './cdp.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('base', 'http://localhost:8787')
const OUT = arg('out', '/tmp/schermate')
const MOBILE = process.argv.includes('--mobile')

export const PAGINE = [
  ['accesso', '/mio', null],
  ['mio', '/mio', 'dipendente'],
  ['turni-giorni', '/turni', 'dipendente'],
  ['turni-griglia', '/turni/1', 'organizzatore'],
  ['assenze', '/assenze', 'dipendente'],
  ['stampa', '/stampa/giorno', 'organizzatore'],
  ['struttura', '/organizzazione', 'dirigente'],
  ['sistema', '/amministrazione', 'admin'],
  ['notifiche', '/notifiche', 'dipendente'],
]

const chrome = await Chrome.avvia(9333, '/tmp/turni-chrome-schermate')
try {
  mkdirSync(OUT, { recursive: true })
  const sess = await sessioni(BASE)

  for (const tema of ['light', 'dark']) {
    for (const [nome, percorso, come] of PAGINE) {
      const s = await chrome.scheda()
      await s.apri(BASE, percorso, {
        token: come ? sess[come].token : null, tema,
        schermo: MOBILE ? SCHERMI.telefono : SCHERMI.desktop,
      })
      const file = `${OUT}/${nome}${MOBILE ? '-mobile' : ''}-${tema}.png`
      writeFileSync(file, await s.schermata())
      console.log(`  ${file.split('/').pop()}`)
      s.chiudi()
    }
  }
  console.log(`\nSchermate in ${OUT}`)
} finally {
  chrome.chiudi()
}
