/**
 * Il movimento deve restare a buon mercato.
 *
 * `opacity` e `transform` il browser le muove sul compositor: nessun layout da
 * rifare, nessun ridisegno dell'albero. Tutto il resto — altezze, larghezze,
 * colori, posizioni — a ogni fotogramma costa, e su un telefono si vede.
 *
 * Questo controllo legge i fotogrammi chiave scritti in app.css e verifica che
 * nessuno tocchi altro. Le due eccezioni sono più vecchie di questa regola e
 * stanno scritte qui col loro nome: sono indicatori di caricamento, girano da
 * soli e non accompagnano nessuna interazione.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8')

/** Animazioni nate prima della regola, che muovono una proprietà cara. */
const ECCEZIONI = new Set(['scorre', 'luccica'])

/** I fotogrammi chiave: nome → proprietà che l'animazione tocca. */
function fotogrammi(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  // Un blocco @keyframes contiene a sua volta blocchi: si prende fino alla
  // graffa che riporta il conto a zero.
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let livello = 0
    let i = m.index! + m[0].length - 1
    for (; i < css.length; i++) {
      if (css[i] === '{') livello++
      else if (css[i] === '}' && --livello === 0) break
    }
    const corpo = css.slice(m.index! + m[0].length, i)
    const proprieta = new Set([...corpo.matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]!))
    out.set(m[1]!, proprieta)
  }
  return out
}

describe('animazioni', () => {
  const tutte = fotogrammi()

  it('ce ne sono, e si leggono', () => {
    expect(tutte.size).toBeGreaterThan(3)
  })

  it('muovono solo opacità e trasformazioni', () => {
    for (const [nome, proprieta] of tutte) {
      if (ECCEZIONI.has(nome)) continue
      for (const p of proprieta) {
        expect(['opacity', 'transform'], `@keyframes ${nome} muove ${p}`).toContain(p)
      }
    }
  })

  it('le eccezioni restano quelle dichiarate: nessuna nuova di soppiatto', () => {
    for (const nome of ECCEZIONI) {
      expect(tutte.has(nome), `l'eccezione ${nome} non esiste più: toglila dall'elenco`).toBe(true)
    }
  })

  it('le transizioni scritte a mano non animano il layout', () => {
    // `transition: width` o `height` costa quanto animarle nei fotogrammi.
    for (const m of css.matchAll(/transition:\s*([^;]+);/g)) {
      const proprieta = m[1]!.split(',').map((x) => x.trim().split(/\s+/)[0]!)
      for (const p of proprieta) {
        expect(['opacity', 'transform', 'background-color', 'border-color', 'color', 'all'],
               `transition su ${p}`).toContain(p)
      }
    }
  })
})
