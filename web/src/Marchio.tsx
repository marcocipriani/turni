/**
 * Il marchio, punto 1 del § 14.
 *
 * È una maschera, non un'immagine: il segno prende `currentColor` e segue il
 * tema da sé. Un file solo invece di due, nessuna variante chiara e scura da
 * tenere allineate, e nessun riquadro bianco da nascondere sotto un bordo.
 */
export function Marchio({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`marchio block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

/** Riga di copyright. È l'unico punto in cui compare il nome della casa. */
export const COPYRIGHT = `© ${new Date().getFullYear()} Turni from Zucchetto`
