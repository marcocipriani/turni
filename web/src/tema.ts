export type Tema = 'auto' | 'chiaro' | 'scuro'

const CHIAVE = 'turni.tema'

export function temaSalvato(): Tema {
  const v = localStorage.getItem(CHIAVE)
  return v === 'chiaro' || v === 'scuro' ? v : 'auto'
}

/** Lo swap avviene su data-theme del root: i token sono già consapevoli del tema. */
export function applicaTema(pref: Tema) {
  const scuro = pref === 'scuro'
    || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  const root = document.documentElement
  root.classList.add('theming')            // la transizione vale solo per lo swap
  root.dataset.theme = scuro ? 'dark' : 'light'
  localStorage.setItem(CHIAVE, pref)
  setTimeout(() => root.classList.remove('theming'), 200)
}
