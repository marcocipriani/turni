/**
 * Lettura dei file di caricamento.
 *
 * Punto e virgola come separatore, che è quello che Excel italiano scrive e
 * rilegge senza chiedere niente a nessuno. Niente librerie: virgolette e righe
 * che vanno a capo dentro una cella non servono a nessuno di questi modelli, e
 * accettarle vorrebbe dire accettare anche i file che ne abusano.
 */
export type Riga = Record<string, string>

/**
 * Oltre questa soglia non è più un caricamento, è un carico: il limite sul
 * corpo delle richieste ferma già i file enormi, questo ferma i file lunghi e
 * stretti prima che diventino decine di migliaia di scritture.
 */
const RIGHE_MASSIME = 5000

/**
 * Nessun carattere di controllo entra in archivio. Un CSV che arriva da un
 * gestionale può portarsi dietro tabulazioni, ritorni a capo isolati o byte
 * nulli: non significano niente in una cella, e passano intatti dentro
 * esportazioni, PDF e intestazioni HTTP di chi verrà dopo.
 */
const ripulisci = (v: string) => v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()

export function leggiCsv(testo: string): Riga[] {
  // Excel antepone la firma UTF-8: se non la si toglie, la prima colonna si
  // chiama «﻿persona» e nessun confronto va a buon fine.
  const righe = testo.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim())
  if (righe.length < 2) throw new Error('Il file non contiene righe oltre all\'intestazione.')
  if (righe.length - 1 > RIGHE_MASSIME) {
    throw new Error(`Il file ha ${righe.length - 1} righe: il massimo è ${RIGHE_MASSIME}. Dividilo in più file.`)
  }

  const intestazione = righe[0]!.split(';').map(ripulisci)
  const vuote = intestazione.filter((c) => !c).length
  if (vuote) throw new Error('L\'intestazione ha colonne senza nome.')
  if (new Set(intestazione).size !== intestazione.length) {
    throw new Error('L\'intestazione ripete una colonna: ogni nome deve comparire una volta sola.')
  }

  return righe.slice(1).map((r, i) => {
    const celle = r.split(';')
    if (celle.length > intestazione.length) {
      throw new Error(
        `Riga ${i + 2}: ${celle.length} colonne contro le ${intestazione.length} dell'intestazione. ` +
        'Il separatore è il punto e virgola, e nelle celle non deve comparire.',
      )
    }
    return Object.fromEntries(intestazione.map((c, j) => [c, ripulisci(celle[j] ?? '')]))
  })
}

/** «si», «sì», «x», «1», «true»: tutti i modi in cui si scrive sì in un foglio. */
export const si = (v: string | undefined) =>
  ['si', 'sì', 'x', 'true', 'vero', '1'].includes((v ?? '').trim().toLowerCase())

export const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Un indirizzo di posta plausibile: non si pretende di validare la RFC, si
 * pretende che quello che entra in archivio abbia una chiocciola, un dominio e
 * nessuno spazio. Il resto lo dirà il primo messaggio che non arriva.
 */
export const EMAIL = /^[^\s@;]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

/** Il testo sta nella colonna che lo aspetta, o si dice quale non ci sta. */
export const lungo = (valore: string, massimo: number, colonna: string) =>
  valore.length > massimo ? `«${colonna}» supera i ${massimo} caratteri.` : null
