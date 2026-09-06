/**
 * Contrasto dei token, calcolato invece che sperato.
 *
 * I colori vivono in due file — `tokens.css`, che è del design system e non si
 * tocca, e `app.css`, che aggiunge quello che manca — e cambiano insieme al
 * tema. Un controllo a occhio regge finché nessuno sposta una luminosità: qui
 * i rapporti si calcolano dai file, in entrambi i temi.
 *
 * Soglie WCAG 2.1: 4.5:1 per il testo normale, 3:1 per i bordi e i grafici.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = ['./styles/tokens.css', './styles/app.css']
  .map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n')

/** I token del tema chiaro stanno su `:root` nudo, quelli scuri sotto data-theme. */
function tokens(tema: 'chiaro' | 'scuro'): Map<string, string> {
  const out = new Map<string, string>()
  const blocchi = [...css.matchAll(/(:root[^{]*)\{([^}]*)\}/g)]
  for (const [, selettore, corpo] of blocchi) {
    const scuro = selettore!.includes("data-theme='dark'")
    const chiaro = !scuro && !selettore!.includes('theming')
    if (tema === 'chiaro' ? !chiaro : !(chiaro || scuro)) continue
    for (const [, nome, valore] of corpo!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      if (valore!.trim().startsWith('oklch')) out.set(nome!, valore!.trim())
    }
  }
  return out
}

/** oklch → sRGB lineare. La formula è quella di Björn Ottosson. */
function lineare(oklch: string): [number, number, number] {
  const m = oklch.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  if (!m) throw new Error(`Non è un colore oklch: ${oklch}`)
  const L = Number(m[1]), C = Number(m[2]), H = (Number(m[3]) * Math.PI) / 180
  const a = C * Math.cos(H), b = C * Math.sin(H)

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3

  return [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s,
  ].map((v) => Math.min(1, Math.max(0, v))) as [number, number, number]
}

const luminanza = (c: string) => {
  const [r, g, b] = lineare(c)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function rapporto(uno: string, due: string) {
  const a = luminanza(uno), b = luminanza(due)
  const [alto, basso] = a > b ? [a, b] : [b, a]
  return (alto + 0.05) / (basso + 0.05)
}

/* La formula prima di tutto: se sbaglia lei, sbagliano tutte le misure sotto. */
describe('calcolo del rapporto di contrasto', () => {
  it('riconosce i due estremi', () => {
    expect(rapporto('oklch(1 0 0)', 'oklch(0 0 0)')).toBeCloseTo(21, 1)
    expect(rapporto('oklch(0.5 0 0)', 'oklch(0.5 0 0)')).toBeCloseTo(1, 5)
  })
})

const TESTO = 4.5
const NON_TESTO = 3

for (const tema of ['chiaro', 'scuro'] as const) {
  describe(`contrasto, tema ${tema}`, () => {
    const t = tokens(tema)
    const v = (nome: string) => {
      const x = t.get(nome)
      if (!x) throw new Error(`Token mancante nel tema ${tema}: ${nome}`)
      return x
    }

    it.each([
      ['--ink', '--bg'], ['--ink', '--surface'], ['--ink', '--surface-2'],
      ['--ink-muted', '--bg'], ['--ink-muted', '--surface'],
      ['--ink-faint', '--bg'], ['--ink-faint', '--surface'], ['--ink-faint', '--surface-2'],
      ['--ok-ink', '--bg'], ['--ok-ink', '--surface'],
      ['--warn-ink', '--bg'], ['--warn-ink', '--surface'],
      ['--danger-ink', '--bg'], ['--danger-ink', '--surface'],
      ['--action-ink', '--action'],
    ])('%s su %s regge il testo normale', (davanti, dietro) => {
      expect(rapporto(v(davanti), v(dietro))).toBeGreaterThanOrEqual(TESTO)
    })

    it('le otto tonalità degli avatar reggono le iniziali', () => {
      for (let i = 0; i < 8; i++) {
        expect(rapporto(v('--ink'), v(`--av-${i}`))).toBeGreaterThanOrEqual(TESTO)
      }
    })

    it('il bordo dei campi ne dichiara i limiti', () => {
      // Su un campo il bordo è l'unica cosa che ne segna i confini: vale la
      // soglia 3:1 della 1.4.11. I bordi decorativi non hanno questo obbligo.
      expect(rapporto(v('--border-controllo'), v('--bg'))).toBeGreaterThanOrEqual(NON_TESTO)
      expect(rapporto(v('--border-controllo'), v('--surface'))).toBeGreaterThanOrEqual(NON_TESTO)
    })

    it('il contorno del fuoco si vede su ogni superficie', () => {
      for (const sotto of ['--bg', '--surface', '--surface-2']) {
        expect(rapporto(v('--focus'), v(sotto))).toBeGreaterThanOrEqual(NON_TESTO)
      }
    })

    it.each([
      ['--ok', 'ok'], ['--warn-ink', 'attesa'], ['--danger', 'errore'],
    ])('%s regge come pallino di stato', (token) => {
      // I pallini di Stato e i pallini di non letto portano informazione: senza
      // 3:1 chi ha poca vista non li distingue dal fondo.
      expect(rapporto(v(token), v('--bg'))).toBeGreaterThanOrEqual(NON_TESTO)
      expect(rapporto(v(token), v('--surface'))).toBeGreaterThanOrEqual(NON_TESTO)
    })
  })
}
