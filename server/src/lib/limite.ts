/**
 * Freno ai tentativi di accesso ripetuti.
 *
 * Sta in memoria e non nel database: il processo è uno solo, e un contatore
 * che si azzera al riavvio è comunque quello che serve — un attacco a forza
 * bruta dura minuti, non riavvii. Una tabella costerebbe una scrittura per
 * ogni tentativo fallito, cioè esattamente il carico che l'attacco vuole.
 */
const FINESTRA = 15 * 60_000
const SOGLIA = 8

type Voce = { tentativi: number; primo: number; bloccatoFino: number }
const voci = new Map<string, Voce>()

/** Pulizia opportunistica: la mappa non deve crescere per sempre. */
function scada(ora: number) {
  if (voci.size < 5000) return
  for (const [k, v] of voci) if (ora - v.primo > FINESTRA && ora > v.bloccatoFino) voci.delete(k)
}

/** Secondi di attesa rimanenti, oppure 0 se il tentativo è ammesso. */
export function attesaResidua(chiave: string, ora = Date.now()): number {
  const v = voci.get(chiave)
  if (!v || ora >= v.bloccatoFino) return 0
  return Math.ceil((v.bloccatoFino - ora) / 1000)
}

export function tentativoFallito(chiave: string, ora = Date.now()) {
  scada(ora)
  const v = voci.get(chiave)
  if (!v || ora - v.primo > FINESTRA) {
    voci.set(chiave, { tentativi: 1, primo: ora, bloccatoFino: 0 })
    return
  }
  v.tentativi++
  if (v.tentativi >= SOGLIA) {
    // Il blocco cresce con i tentativi: 1, 2, 4, 8 minuti, fino a un'ora.
    const minuti = Math.min(60, 2 ** (v.tentativi - SOGLIA))
    v.bloccatoFino = ora + minuti * 60_000
  }
}

export function tentativoRiuscito(chiave: string) {
  voci.delete(chiave)
}

/** Solo per i test: riporta il freno allo stato iniziale. */
export function azzera() {
  voci.clear()
}
