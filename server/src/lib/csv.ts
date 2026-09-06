/**
 * Lettura dei file di caricamento.
 *
 * Punto e virgola come separatore, che è quello che Excel italiano scrive e
 * rilegge senza chiedere niente a nessuno. Niente librerie: virgolette e righe
 * che vanno a capo dentro una cella non servono a nessuno di questi modelli, e
 * accettarle vorrebbe dire accettare anche i file che ne abusano.
 */
export type Riga = Record<string, string>

export function leggiCsv(testo: string): Riga[] {
  // Excel antepone la firma UTF-8: se non la si toglie, la prima colonna si
  // chiama «﻿persona» e nessun confronto va a buon fine.
  const righe = testo.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim())
  if (righe.length < 2) throw new Error('Il file non contiene righe oltre all\'intestazione.')

  const intestazione = righe[0]!.split(';').map((c) => c.trim())
  const vuote = intestazione.filter((c) => !c).length
  if (vuote) throw new Error('L\'intestazione ha colonne senza nome.')

  return righe.slice(1).map((r, i) => {
    const celle = r.split(';')
    if (celle.length > intestazione.length) {
      throw new Error(
        `Riga ${i + 2}: ${celle.length} colonne contro le ${intestazione.length} dell'intestazione. ` +
        'Il separatore è il punto e virgola, e nelle celle non deve comparire.',
      )
    }
    return Object.fromEntries(intestazione.map((c, j) => [c, (celle[j] ?? '').trim()]))
  })
}

/** «si», «sì», «x», «1», «true»: tutti i modi in cui si scrive sì in un foglio. */
export const si = (v: string | undefined) =>
  ['si', 'sì', 'x', 'true', 'vero', '1'].includes((v ?? '').trim().toLowerCase())

export const ISO = /^\d{4}-\d{2}-\d{2}$/
