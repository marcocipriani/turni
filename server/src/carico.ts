/**
 * Prova di carico del motore, isolata dal database: 500 persone su 22 giornate,
 * la dimensione che la spec indica come tetto di estensione.
 *
 *   npm run carico
 */
import { generate, type Persona } from './generate'
import { workingDays } from './lib/dates'

const giorni = workingDays('2026-09-01', '2026-09-30', new Set(['2026-09-07']))

function prova(nPersone: number, nStanze: number, capienza: number) {
  const persone: Persona[] = Array.from({ length: nPersone }, (_, i) => ({
    userId: i + 1,
    cognome: `Persona${String(i).padStart(4, '0')}`,
    sectorId: (i % 12) + 1,
    giorniPreferiti: i % 3 === 0 ? [2, 4] : [],
    giorniDaEvitare: i % 5 === 0 ? [1] : [],
  }))
  const stanze = Array.from({ length: nStanze }, (_, i) => ({ roomId: i + 1, capienza }))

  // Un quinto delle persone ha almeno un'assenza, come nei dati reali.
  const indisponibili = new Set<string>()
  for (let i = 0; i < nPersone; i += 5) {
    for (const d of giorni.slice(i % 10, (i % 10) + 3)) indisponibili.add(`${i + 1}|${d}`)
  }

  const t0 = performance.now()
  const r = generate({
    giorni, persone, stanze, bloccate: [], indisponibili, regole: new Map(),
    presidioSettori: [1, 2, 3], smartMinSettimana: null, smartMaxSettimana: null,
  })
  const ms = performance.now() - t0

  const presenze = r.assegnazioni.filter((a) => a.stato === 'presenza').length
  console.log(
    `  ${String(nPersone).padStart(4)} persone · ${String(nStanze * capienza).padStart(3)} postazioni · ` +
    `${giorni.length} giornate  →  ${ms.toFixed(0).padStart(5)} ms   ` +
    `${r.assegnazioni.length} celle, ${presenze} presenze, ${r.sottoQuota.length} sotto quota`,
  )
  return ms
}

console.log('\nMotore di generazione, tempi di calcolo\n')
prova(20, 2, 4)
prova(100, 5, 8)
prova(500, 20, 12)
prova(1000, 40, 12)
console.log('')
