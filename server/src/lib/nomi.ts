/**
 * Nomi delle persone.
 *
 * L'archivio di origine scrive «Cognome Nome» e i cognomi italiani composti
 * cominciano con una particella: dividere al primo spazio produce «Di» come
 * cognome e «Valle Tommaso» come nome. Qui la particella resta attaccata al
 * cognome, dove appartiene.
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
 * Indirizzo costruito dal nome, quando il file non ne porta uno: iniziale del
 * nome, punto, cognome senza spazi né accenti. È la forma degli indirizzi
 * istituzionali — «Marchetti Elena» → «e.marchetti@dominio».
 */
export function indirizzoDa(nome: string, cognome: string, dominio: string): string {
  const pulito = (s: string) =>
    s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toLowerCase()
  return `${pulito(nome).slice(0, 1)}.${pulito(cognome)}@${dominio}`.toLowerCase()
}
