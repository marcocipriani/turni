/**
 * Nomi delle persone.
 *
 * L'archivio di origine scrive «Cognome Nome» e i cognomi italiani composti
 * cominciano con una particella: dividere al primo spazio produce «Di» come
 * cognome e «Valle Tommaso» come nome. Qui la particella resta attaccata al
 * cognome, dove appartiene.
 *
 * Il cognome viene poi troncato a tre caratteri PRIMA di entrare nell'archivio:
 * è una misura di minimizzazione, non una scelta di impaginazione. Chi legge il
 * database non deve trovarci il cognome per esteso.
 */

/** Particelle che fanno parte del cognome, non nomi propri. */
const PARTICELLE = new Set([
  'di', 'de', 'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'da', 'dal', 'dallo', 'dalla', 'dai', 'dagli',
  'lo', 'la', 'li', 'le', 'san', 'santa', 'sant', 'santo',
  'van', 'von', 'der', 'den', 'mac', 'mc', 'o',
])

const chiave = (t: string) =>
  t.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toLowerCase()

/**
 * Divide «Cognome Nome» tenendo unite le particelle del cognome.
 *
 *   'Della Valle Tommaso' → { cognome: 'Della Valle', nome: 'Tommaso' }
 *   'Marchetti Elena'     → { cognome: 'Marchetti',   nome: 'Elena'   }
 *
 * Al nome resta sempre almeno una parola: un cognome senza nome non serve a
 * nessuno, e una stringa di sole particelle non è un dato che vogliamo salvare.
 */
export function dividiNome(completo: string): { cognome: string; nome: string } {
  const parti = completo.trim().split(/\s+/).filter(Boolean)
  if (parti.length < 2) {
    throw new Error(`Nome incompleto: «${completo}». Serve almeno «Cognome Nome».`)
  }

  let ultimo = 0
  while (PARTICELLE.has(chiave(parti[ultimo]!)) && ultimo + 1 < parti.length - 1) ultimo++

  return {
    cognome: parti.slice(0, ultimo + 1).join(' '),
    nome: parti.slice(ultimo + 1).join(' '),
  }
}

/**
 * Sigla del cognome: spazi e apostrofi via, primi tre caratteri, maiuscola
 * iniziale su ogni parola conservata.
 *
 *   'Della Valle' → 'DiF'   'De Angelis' → 'DeM'   'Marchetti' → 'Pul'
 *
 * Tre caratteri fanno collidere i cognomi vicini — Riva e Meloni danno
 * entrambi 'Pan'. È voluto: la disambiguazione la fa il nome, a video.
 */
export function siglaCognome(cognome: string): string {
  const compatto = cognome.replace(/[\s'’]/g, '')
  if (!compatto) throw new Error('Cognome vuoto: non si può ricavarne una sigla.')
  return compatto.slice(0, 3)
}
