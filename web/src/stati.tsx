/**
 * I tre stati di una giornata, detti in un posto solo.
 *
 * «Sede», «Agile», «Assente» erano tre parole diverse a seconda della
 * schermata, e chi legge non ha modo di sapere che parlano della stessa cosa.
 * Qui stanno etichetta, segno e peso visivo: chi mostra uno stato pesca da
 * qui, e cambiare una parola la cambia ovunque.
 *
 * Il segno non sostituisce la parola — un'icona da sola non si legge ad alta
 * voce — ma la accompagna dove lo spazio c'è, e la rimpiazza solo dove è
 * accompagnata da un'etichetta per i lettori di schermo.
 */
import * as I from './icone'

export type Stato = 'presenza' | 'smart' | 'assenza'

export const STATI = {
  presenza: {
    etichetta: 'In sede',
    plurale: 'In sede',
    icona: I.Sede,
    /* Chi è in sede è il caso pieno: inchiostro. Da remoto è normale ma non
       richiede niente a nessuno, e sta un gradino sotto. L'assenza è la più
       tenue: non è un errore, è una giornata che non c'è. */
    inchiostro: 'text-ink',
    fondo: 'bg-bg',
  },
  smart: {
    etichetta: 'Da remoto',
    plurale: 'Da remoto',
    icona: I.Remoto,
    inchiostro: 'text-ink-muted',
    fondo: '',
  },
  assenza: {
    etichetta: 'Assenza',
    plurale: 'Assenze',
    icona: I.Croce,
    inchiostro: 'text-ink-faint',
    fondo: 'bg-surface-2',
  },
} as const satisfies Record<Stato, {
  etichetta: string; plurale: string
  icona: (p: { size?: number; className?: string }) => React.ReactElement
  inchiostro: string; fondo: string
}>

/** Solo il segno, con il nome dello stato per chi non lo vede. */
export function SegnoStato({ stato, size = 15 }: { stato: Stato; size?: number }) {
  const { icona: Icona, etichetta, inchiostro } = STATI[stato]
  return (
    <span className={inchiostro}>
      <Icona size={size} />
      <span className="solo-lettori-schermo">{etichetta}</span>
    </span>
  )
}

/** Segno più parola: dove c'è larghezza, si dicono tutte e due. */
export function EtichettaStato({ stato, size = 15 }: { stato: Stato; size?: number }) {
  const { icona: Icona, etichetta, inchiostro } = STATI[stato]
  return (
    <span className={`inline-flex items-center gap-1.5 ${inchiostro}`}>
      <Icona size={size} />{etichetta}
    </span>
  )
}
