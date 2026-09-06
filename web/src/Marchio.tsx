/**
 * Slot di brand, punto 1 e 4 del § 14: il marchio è raster senza canale alpha,
 * quindi la tile ritaglia e la variante cambia col tema.
 */
export function Marchio({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`block overflow-hidden rounded-r3 border border-border bg-surface ${className}`}
      style={{ width: size, height: size }}
    >
      <img src="/marchio/marchio.png" alt="" width={size} height={size}
           className="size-full object-cover [:root[data-theme='dark']_&]:hidden" />
      <img src="/marchio/marchio-scuro.png" alt="" width={size} height={size}
           className="hidden size-full object-cover [:root[data-theme='dark']_&]:block" />
    </span>
  )
}
