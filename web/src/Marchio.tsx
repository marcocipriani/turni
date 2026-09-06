/**
 * Slot di brand, punto 1 e 4 del § 14: il marchio è raster senza canale alpha,
 * quindi la tile ritaglia e la variante cambia col tema.
 *
 * È uno sfondo e non due <img>: due immagini, una nascosta dal tema, si
 * scaricano comunque entrambe. Uno sfondo su un elemento la cui regola non si
 * applica non si scarica affatto — metà del peso, senza cambiare una riga di
 * resa.
 */
export function Marchio({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`marchio block overflow-hidden rounded-r3 border border-border bg-surface ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
