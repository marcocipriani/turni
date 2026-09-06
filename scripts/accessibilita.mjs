/**
 * Verifica di accessibilità automatica: axe-core su ogni pagina, in entrambi i
 * temi, da desktop e da telefono.
 *
 * Non sostituisce la prova con un lettore di schermo — nessuno strumento la
 * sostituisce — ma intercetta contrasti, etichette mancanti, ordine dei titoli
 * e ruoli sbagliati, che sono la parte che si ripresenta a ogni modifica.
 *
 *   node scripts/accessibilita.mjs [--base http://localhost:8787]
 */
import { readFileSync } from 'node:fs'
import { Chrome, SCHERMI, sessioni } from './cdp.mjs'
import { PAGINE } from './schermate.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('base', 'http://localhost:8787')
const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const REGOLE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']

const chrome = await Chrome.avvia(9335, '/tmp/turni-chrome-a11y')
let occorrenze = 0
const riepilogo = new Map()

try {
  const sess = await sessioni(BASE)

  for (const [nomeSchermo, schermo] of Object.entries(SCHERMI)) {
    for (const tema of ['light', 'dark']) {
      for (const [nome, percorso, come] of PAGINE) {
        const s = await chrome.scheda()
        await s.apri(BASE, percorso, { token: come ? sess[come].token : null, tema, schermo })

        await s.valuta(AXE)
        const trovate = JSON.parse(await s.valuta(
          `axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(REGOLE)} } })
             .then(r => JSON.stringify(r.violations.map(v => ({
               id: v.id, impatto: v.impact, quanti: v.nodes.length, descrizione: v.help,
               dove: v.nodes.slice(0, 2).map(n => n.html.slice(0, 140)),
             }))))`, { attendiPromessa: true }) ?? '[]')

        for (const v of trovate) {
          occorrenze += v.quanti
          const prima = riepilogo.get(v.id) ?? { ...v, quanti: 0, pagine: new Set() }
          prima.quanti += v.quanti
          prima.pagine.add(`${nome}/${nomeSchermo}/${tema}`)
          riepilogo.set(v.id, prima)
        }
        console.log(`  ${trovate.length ? 'FALL' : ' ok '}  ${nome} · ${nomeSchermo} · ${tema}` +
          (trovate.length ? ` — ${trovate.map((v) => `${v.id}×${v.quanti}`).join(', ')}` : ''))
        s.chiudi()
      }
    }
  }

  console.log('')
  if (riepilogo.size === 0) {
    console.log('Nessuna violazione: WCAG 2.1 AA, entrambi i temi, desktop e telefono.\n')
  } else {
    console.log(`${riepilogo.size} tipi di violazione, ${occorrenze} occorrenze:\n`)
    for (const v of [...riepilogo.values()].sort((a, b) => b.quanti - a.quanti)) {
      console.log(`  ${v.id} (${v.impatto}) ×${v.quanti} — ${v.descrizione}`)
      console.log(`    pagine: ${[...v.pagine].slice(0, 4).join(', ')}`)
      for (const d of v.dove ?? []) console.log(`    ${d}`)
    }
    console.log('')
  }
} finally {
  chrome.chiudi()
}
process.exit(occorrenze > 0 ? 1 : 0)
