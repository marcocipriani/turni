/** La stampa si apre ricordando da dove: Indietro torna lì, non alla pagina prima nella cronologia. */
export const urlStampa = (cosa: string, ritorno: string, params: Record<string, string> = {}) =>
  `/stampa/${cosa}?${new URLSearchParams({ ...params, ritorno })}`

/** Solo percorsi di quest'app: `//host` e `/\host` il browser li legge come un altro sito. */
export const ritornoSicuro = (valore: string | null, ripiego: string) =>
  valore && /^\/(?![/\\])/.test(valore) ? valore : ripiego
