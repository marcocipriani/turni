/**
 * Il tocco: quello che il telefono restituisce al dito.
 *
 * Due cose sole, e stanno insieme perché servono nello stesso gesto: la
 * vibrazione che conferma un comando, e la lettura di uno swipe.
 *
 * La vibrazione è un lusso che non tutti hanno. `navigator.vibrate` c'è su
 * Android e non c'è su iOS, Safari o PWA che sia: lì la funzione non fa
 * niente, e il posto della conferma lo prende la pressione visibile del
 * comando, che sta in app.css. Nessun avviso, nessuna richiesta di permesso:
 * un feedback che manca non è un errore da raccontare.
 */

const CHIAVE = 'turni.aptico'

/** Dove l'API non c'è, l'interruttore non ha senso: non lo si mostra nemmeno. */
export const apticoDisponibile = () =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

/**
 * Acceso di suo: chi non lo vuole lo spegne, e la scelta resta sul telefono.
 *
 * Il magazzino locale non è sempre leggibile — finestra privata, storage
 * bloccato dalle impostazioni — e lì `localStorage` lancia invece di
 * rispondere. Una preferenza che non si riesce a leggere non è un motivo per
 * non disegnare la pagina: si torna al valore di partenza.
 */
export function apticoAcceso() {
  try { return localStorage.getItem(CHIAVE) !== 'no' } catch { return true }
}

export function impostaAptico(acceso: boolean) {
  try { localStorage.setItem(CHIAVE, acceso ? 'si' : 'no') } catch { /* resta per questa sessione */ }
  if (acceso) vibra(APTICO.tocco)
}

/**
 * Durate: poche e nominate, così la stessa cosa vibra sempre uguale.
 * Un tocco si sente e non si nota; una conferma dura il doppio; l'errore è
 * l'unico a due colpi, ed è quello che si riconosce in tasca senza guardare.
 */
export const APTICO = {
  tocco: 5,
  spostamento: 8,
  conferma: 12,
  errore: [8, 40, 8],
} as const

export function vibra(ms: number | readonly number[] = APTICO.tocco) {
  if (!apticoDisponibile() || !apticoAcceso()) return
  // Alcuni browser rifiutano la chiamata fuori da un gesto dell'utente, e lo
  // fanno lanciando: un feedback mancato non deve rompere il comando.
  try { navigator.vibrate(ms as number | number[]) } catch { /* pazienza */ }
}

/* ── Swipe ────────────────────────────────────────────────────────── */

/** Sotto questi pixel il dito non ha voluto scorrere: ha toccato storto. */
const SOGLIA = 60

/**
 * Che verso ha uno spostamento del dito: `1` avanti, `-1` indietro, `0` se non
 * è uno swipe. Trascinare a sinistra porta avanti, come si sfoglia un foglio.
 *
 * La dominanza sull'asse — orizzontale almeno il doppio del verticale — serve
 * a non rubare lo scorrimento della pagina: un elenco lungo lo si scorre
 * sempre un po' di sbieco, e senza questo controllo ogni scorrimento
 * cambierebbe settimana.
 */
export function direzioneSwipe(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) <= SOGLIA || Math.abs(dx) <= Math.abs(dy) * 2) return 0
  return dx < 0 ? 1 : -1
}
