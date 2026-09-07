/**
 * Come si scrive una persona a video.
 *
 * Nelle liste basta il cognome. Quando due cognomi visibili coincidono — due
 * Rossi nella stessa schermata — quelle due righe, e solo quelle, portano anche
 * il nome.
 */

export type Anagrafica = { id: number; nome: string; cognome: string }

/**
 * Etichetta breve per ogni persona dell'insieme visibile.
 * La disambiguazione dipende da chi è in lista: la stessa persona può leggersi
 * «Rossi» in una schermata e «Rossi Elena» in un'altra, ed è il comportamento
 * giusto — il nome compare dove serve a distinguere, non ovunque per abitudine.
 */
export function etichette(persone: Anagrafica[]): Map<number, string> {
  const quante = new Map<string, number>()
  for (const p of persone) quante.set(p.cognome, (quante.get(p.cognome) ?? 0) + 1)

  return new Map(persone.map((p) => [
    p.id,
    (quante.get(p.cognome) ?? 0) > 1 ? `${p.cognome} ${p.nome}` : p.cognome,
  ]))
}

/** Nome per esteso: profilo, menu utente, intestazioni di dettaglio. */
export const perEsteso = (p: Anagrafica) => `${p.nome} ${p.cognome}`

export const iniziali = (p: Anagrafica) =>
  `${p.nome[0] ?? ''}${p.cognome[0] ?? ''}`.toUpperCase()

/**
 * Tonalità dell'avatar. Otto neutri, scelti da un'impronta dell'identificativo
 * così che la stessa persona abbia sempre lo stesso tono, su ogni dispositivo e
 * senza consultare il server. Chi vuole può fissarne una nelle preferenze.
 */
/**
 * Otto tonalità in ordine sparso: gli identificativi sono contigui, e `id % 8`
 * darebbe a due colleghi vicini in elenco due grigi adiacenti, cioè uguali a
 * occhio. Questa permutazione tiene quattro gradini di distanza fra un id e il
 * successivo. Nessuna funzione di dispersione: il caso qui non serve, serve la
 * distanza.
 */
const GIRO = [0, 4, 1, 5, 2, 6, 3, 7]

export function tintaDi(id: number, scelta?: number | null): number {
  if (scelta != null && scelta >= 0 && scelta < 8) return scelta
  return GIRO[Math.abs(id) % 8]!
}

const MISURE = {
  piccolo: 'size-6 text-[9px] leading-none tracking-[-0.02em]',
  medio: 'size-8 text-xs',
  grande: 'size-9 text-xs',
} as const

export function Avatar({ persona, tinta, misura = 'medio', titolo }: {
  persona: Anagrafica
  tinta?: number | null
  misura?: keyof typeof MISURE
  /** Testo alternativo. Se assente, l'avatar è decorativo: il nome è già accanto. */
  titolo?: string
}) {
  return (
    <span
      className={`mono grid shrink-0 place-items-center rounded-full font-semibold text-ink ${MISURE[misura]}`}
      style={{ background: `var(--av-${tintaDi(persona.id, tinta)})` }}
      title={titolo}
      role={titolo ? 'img' : undefined}
      aria-label={titolo}
      aria-hidden={titolo ? undefined : true}
    >
      {iniziali(persona)}
    </span>
  )
}

/**
 * Fila di avatar sovrapposti, con il resto contato.
 * L'elenco per esteso resta disponibile ai lettori di schermo: i pallini sono
 * una scorciatoia visiva, non l'unico modo di sapere chi c'è.
 */
export function FilaAvatar({ persone, massimo = 5, tinte }: {
  persone: Anagrafica[]
  massimo?: number
  tinte?: Map<number, number | null>
}) {
  if (persone.length === 0) return null
  const mostrati = persone.slice(0, massimo)
  const restanti = persone.length - mostrati.length

  // Niente sovrapposizione: con le iniziali dentro, i cerchi accavallati si
  // tagliano le lettere a vicenda e non si legge più nessuno dei due.
  return (
    <span className="flex items-center">
      <span className="flex gap-0.5">
        {mostrati.map((p) => (
          <Avatar key={p.id} persona={p} tinta={tinte?.get(p.id)} misura="piccolo" />
        ))}
      </span>
      {restanti > 0 && <span className="mono ml-1.5 text-2xs text-ink-faint">+{restanti}</span>}
      <span className="solo-lettori-schermo">
        {persone.map((p) => `${p.nome} ${p.cognome}`).join(', ')}
      </span>
    </span>
  )
}
