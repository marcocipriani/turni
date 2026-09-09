/**
 * Le regole del telefono, verificate invece che sperate.
 *
 * Sono invarianti che si rompono in silenzio: nessuno se ne accorge finché non
 * apre l'app su un telefono vero, e a quel punto il commit che le ha rotte è
 * già dietro venti commit. Si controllano leggendo i file, come fa
 * `contrasto.test.ts` per i colori: niente browser, niente dipendenze, e
 * girano a ogni `npm test`.
 *
 * Se un controllo qui dà fastidio perché il design è cambiato davvero, si
 * cambia il controllo. Quello che non deve succedere è cambiarlo per sbaglio.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stileBottone } from '../ui'

const leggi = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')

const html = leggi('../../index.html')
const tokens = leggi('../styles/tokens.css')
const app = leggi('../styles/app.css')
const vista = leggi('../App.tsx')

/** Il corpo di `@media (max-width: 640px)`, che è dove vive la scala del telefono. */
function bloccoTelefono(): string {
  const i = app.indexOf('@media (max-width: 640px)')
  expect(i, 'manca il blocco della scala del telefono in app.css').toBeGreaterThan(-1)
  // Il blocco contiene una sola graffa annidata per regola: si chiude alla
  // prima graffa che riporta il conto a zero.
  let livello = 0
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') livello++
    else if (app[k] === '}' && --livello === 0) return app.slice(i, k)
  }
  throw new Error('blocco del telefono senza chiusura')
}

/** La regola che dà forma alla shell: altezza della finestra e scorrimento. */
function shell(): string {
  const m = app.match(/html, body, #root \{[^}]*\}/)
  expect(m, 'manca la regola di shell su html, body, #root').not.toBeNull()
  return m![0]
}

const misure = (css: string) => new Map(
  [...css.matchAll(/(--text-[\w-]+)\s*:\s*([\d.]+)px/g)].map(([, n, v]) => [n!, Number(v)]),
)

/* Va cercato nell'attributo, non nel file: in cima a index.html c'è un
   commento che spiega perché serve, e contiene la stessa stringa. */
const META_COVER = /name="viewport"[^>]*viewport-fit=cover/

describe('viewport', () => {
  it('dichiara viewport-fit=cover, senza cui env(safe-area-inset-*) vale zero', () => {
    expect(html).toMatch(META_COVER)
  })

  it('chi usa le safe area ha il viewport che le accende', () => {
    // Le due cose vanno in coppia: un padding sulla tacca senza `cover` è
    // codice morto, e `cover` senza padding manda il contenuto sotto la tacca.
    if (vista.includes('env(safe-area-inset')) {
      expect(html).toMatch(META_COVER)
    }
  })

  it('il documento non scorre: scorre la regione interna', () => {
    /* È il difetto che portava via header e barra in basso insieme al
       contenuto: con `cover` la pagina si estende sotto le barre di sistema, e
       se il documento è scorribile se ne va tutto quanto. */
    expect(shell()).toMatch(/overflow:\s*hidden/)
  })

  it("l'altezza della shell non si muove sotto i piedi", () => {
    // `dvh` cambia insieme alla barra degli indirizzi. Qui il documento non
    // scorre, quindi quella barra non si ritrae mai: resterebbe solo il salto.
    expect(shell(), 'la shell non deve dipendere da un\'altezza dinamica').not.toMatch(/\d+dvh/)
    expect(shell()).toMatch(/height:\s*100svh/)
  })

  it('chi si estende sotto le barre di sistema si tiene alla larga da tutte', () => {
    // Con `cover` il contenuto passa anche sotto la barra di stato, non solo
    // sopra quella di navigazione: senza il margine in alto l'header ci finisce
    // sotto.
    if (!META_COVER.test(html)) return
    for (const lato of ['top', 'bottom']) {
      expect(vista, `manca il margine dalla safe area ${lato}`)
        .toContain(`env(safe-area-inset-${lato})`)
    }
  })
})

describe('scala del telefono', () => {
  const telefono = misure(bloccoTelefono())
  const scrivania = misure(tokens)

  it('rialza ogni gradino della scala, senza saltarne nessuno', () => {
    expect(telefono.size).toBeGreaterThan(0)
    for (const [nome, px] of telefono) {
      const base = scrivania.get(nome)
      expect(base, `${nome} non esiste in tokens.css`).toBeDefined()
      expect(px, `${nome} sul telefono non deve rimpicciolire`).toBeGreaterThan(base!)
    }
  })

  it('tiene l\'ordine dei gradini: 2xs < xs < sm < base < md < lg', () => {
    const ordine = ['--text-2xs', '--text-xs', '--text-sm', '--text-base', '--text-md', '--text-lg']
      .map((n) => telefono.get(n) ?? scrivania.get(n)!)
    for (let i = 1; i < ordine.length; i++) {
      expect(ordine[i], `il gradino ${i} non supera il precedente`).toBeGreaterThanOrEqual(ordine[i - 1]!)
    }
  })

  it('porta i campi a 16px esatti, o Safari iOS zooma al fuoco', () => {
    expect(bloccoTelefono()).toMatch(/input,\s*select,\s*textarea\s*\{\s*font-size:\s*16px/)
  })
})

describe('il tocco risponde anche dove non vibra', () => {
  it('la pressione si vede sul puntatore grossolano', () => {
    // iOS non ha navigator.vibrate: lì la conferma del tocco è visiva, o il
    // comando sembra non aver risposto.
    const i = app.indexOf('(hover: none) and (pointer: coarse)')
    expect(i, 'manca la pressione visibile per il puntatore grossolano').toBeGreaterThan(-1)
    expect(app.slice(i, i + 400)).toContain('scale(')
  })

  it('non scatta per chi ha chiesto meno movimento', () => {
    const i = app.indexOf('(hover: none) and (pointer: coarse)')
    expect(app.slice(i, app.indexOf('{', i))).toContain('prefers-reduced-motion: no-preference')
  })
})

describe('bersagli da polpastrello', () => {
  const varianti = ['normale', 'primario', 'piccolo', 'icona', 'distruttivo'] as const

  it('ogni variante di bottone cresce sul telefono', () => {
    for (const v of varianti) {
      expect(stileBottone(v), `la variante ${v} non ha un bersaglio da telefono`)
        .toMatch(/max-sm:(min-h-\[(3[6-9]|4\d|[5-9]\d)px\]|size-1[1-9])/)
    }
  })

  it('i comandi non di navigazione arrivano a 44px', () => {
    for (const v of ['normale', 'primario', 'icona', 'distruttivo'] as const) {
      expect(stileBottone(v), `la variante ${v} sta sotto i 44px`)
        .toMatch(/max-sm:(min-h-\[44px\]|size-11)/)
    }
  })
})

describe('stampa', () => {
  it("chiusa l'anteprima, qualcuno rimette in moto il ridisegno", () => {
    /* La shell è alta 100svh e non scorre: se al ritorno dalla stampa il
       browser non ricalcola il layout, resta una schermata bianca. Non è
       codice morto: toglierlo riporta il bug. */
    expect(leggi('../main.tsx')).toContain("addEventListener('afterprint'")
  })

  it('la carta annulla altezze e scorrimenti della shell', () => {
    const stampa = app.slice(app.indexOf('@media print'))
    expect(stampa).toMatch(/height:\s*auto\s*!important/)
    expect(stampa).toMatch(/overflow:\s*visible\s*!important/)
  })
})

describe('comandi dell\'header', () => {
  const turni = leggi('../pagine/Turni.tsx')

  it('nessun Comando resta senza icona: sul telefono l\'etichetta è nascosta', () => {
    // `Comando` disegna l'etichetta dentro `hidden sm:inline`. Senza icona, su
    // uno schermo stretto resta un bottone vuoto che nessuno sa cosa fa.
    const pezzi = turni.split('<Comando').slice(1)
    expect(pezzi.length).toBeGreaterThan(0)
    for (const pezzo of pezzi) {
      const corpo = pezzo.slice(0, pezzo.indexOf('</Comando>'))
      expect(corpo, `un Comando è senza icona: ${corpo.slice(0, 60)}…`).toContain('icona=')
    }
  })

  it('i comandi che sono link riusano stileBottone invece di rifarne le classi', () => {
    // Le classi copiate a mano invecchiano da sole: quando il bersaglio è
    // cresciuto, quelle erano rimaste a 27px.
    for (const f of ['../pagine/Turni.tsx', '../pagine/Mio.tsx']) {
      expect(leggi(f), `${f} ridisegna a mano un bottone icona`).not.toContain('rounded-r1 p-[5px]')
    }
  })
})
