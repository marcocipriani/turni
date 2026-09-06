/**
 * Un solo set, inline, a contorno. viewBox 24, stroke 1.75, mai riempite.
 * Ereditano il colore dal contesto. Decorative per default: chi le usa da sola
 * come comando mette un'etichetta accessibile sul bottone.
 */
type Props = { size?: number; className?: string }

function Svg({ size = 20, className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className={className} style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  )
}

export const Panoramica = (p: Props) => <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Svg>
export const Griglia = (p: Props) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M15 9v11" /></Svg>
export const Calendario = (p: Props) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>
export const Assenza = (p: Props) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M9.5 15.5l5 3M14.5 15.5l-5 3" /></Svg>
export const Organizzazione = (p: Props) => <Svg {...p}><path d="M9 21V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v12" /><path d="M3 21V7a2 2 0 0 1 2-2h2M21 21V7a2 2 0 0 1-2-2h-2M2 21h20M11.5 11h1M11.5 15h1" /></Svg>
export const Amministrazione = (p: Props) => <Svg {...p}><path d="M12 3l7.5 3v5.5c0 4.2-3 7.9-7.5 9-4.5-1.1-7.5-4.8-7.5-9V6z" /><path d="M9.5 12l1.8 1.8 3.4-3.6" /></Svg>
export const Campana = (p: Props) => <Svg {...p}><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></Svg>
export const Lente = (p: Props) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></Svg>
export const Piu = (p: Props) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const Chiudi = (p: Props) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
export const Spunta = (p: Props) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7" /></Svg>
export const Attenzione = (p: Props) => <Svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></Svg>
export const Lucchetto = (p: Props) => <Svg {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>
export const Scarica = (p: Props) => <Svg {...p}><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" /></Svg>
export const Bacchetta = (p: Props) => <Svg {...p}><path d="M4 20 16.5 7.5M14 4l.7 1.9L16.6 6l-1.9.7L14 8.6l-.7-1.9L11.4 6l1.9-.7ZM19.5 11l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5Z" /></Svg>
export const Freccia = (p: Props) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const Indietro = (p: Props) => <Svg {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></Svg>
export const Sole = (p: Props) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
export const Luna = (p: Props) => <Svg {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></Svg>
export const Monitor = (p: Props) => <Svg {...p}><rect x="2.5" y="4" width="19" height="12.5" rx="2" /><path d="M8.5 20.5h7M12 16.5v4" /></Svg>
export const Esci = (p: Props) => <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>
export const Persona = (p: Props) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>
export const Stanza = (p: Props) => <Svg {...p}><path d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M4 21h16M15 8h4a1 1 0 0 1 1 1v12" /><circle cx="11.5" cy="12.5" r="1" /></Svg>
export const Info = (p: Props) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>
export const Vuoto = (p: Props) => <Svg {...p}><path d="M3 8.5 12 4l9 4.5-9 4.5Z" /><path d="M3 12.5 12 17l9-4.5M3 16.5 12 21l9-4.5" /></Svg>
export const Scambio = (p: Props) => <Svg {...p}><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" /></Svg>
export const Stampa = (p: Props) => <Svg {...p}><path d="M7 8V3h10v5" /><path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" rx="1" /></Svg>
