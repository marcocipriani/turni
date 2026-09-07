import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { leggiCsv } from './csv'
import { MODELLI, NOME_FILE, TABELLE } from './caricamento'

/**
 * I modelli vivono nel codice, perché l'app deve poterli offrire anche dove
 * `docs/` non è stata installata. Le copie su disco servono a chi lavora dal
 * terminale e viaggiano nel pacchetto di rilascio: qui si controlla che non
 * abbiano preso strade diverse.
 */
describe('modelli di caricamento', () => {
  it.each(TABELLE)('«%s» ha una copia identica in docs/modelli', (t) => {
    const file = new URL(`../../../docs/modelli/${NOME_FILE[t]}.csv`, import.meta.url)
    expect(readFileSync(file, 'utf8')).toBe(MODELLI[t])
  })

  it.each(TABELLE)('«%s» si rilegge con il proprio lettore', (t) => {
    const righe = leggiCsv(MODELLI[t])
    expect(righe.length).toBeGreaterThan(0)
    // Ogni riga ha esattamente le colonne dell'intestazione, nessuna vuota.
    const colonne = Object.keys(righe[0]!)
    expect(colonne.every((c) => c.length > 0)).toBe(true)
    for (const r of righe) expect(Object.keys(r)).toEqual(colonne)
  })

  it('il modello delle persone dichiara ogni unità con il suo dirigente', () => {
    // È la regola dell'app: un'unità senza chi la comanda non esiste. Se il
    // modello la violasse, chi lo usa come punto di partenza verrebbe respinto.
    const righe = leggiCsv(MODELLI.persone)
    const unita = new Set(righe.filter((r) => r.unita).map((r) => r.unita!))
    const capi = new Set(righe.filter((r) => r.ruolo === 'dirigente').map((r) => r.unita!))
    for (const u of unita) expect([...capi]).toContain(u)
  })
})
