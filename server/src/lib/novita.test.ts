import { describe, expect, it } from 'vitest'
import { programmazioneNuova } from './differenze'

const t = (iso: string) => new Date(iso)

describe('quando una programmazione è nuova per chi guarda', () => {
  it('è nuova per chi non ha ancora guardato niente', () => {
    expect(programmazioneNuova(null, t('2026-09-08T10:00:00Z'))).toBe(true)
  })

  it('non è nuova per chi ha guardato dopo l\'ultima pubblicazione', () => {
    expect(programmazioneNuova(t('2026-09-08T11:00:00Z'), t('2026-09-08T10:00:00Z'))).toBe(false)
  })

  it('torna nuova quando esce una revisione dopo l\'ultima occhiata', () => {
    expect(programmazioneNuova(t('2026-09-08T11:00:00Z'), t('2026-09-09T09:00:00Z'))).toBe(true)
  })

  it('un periodo mai pubblicato non è nuovo per nessuno', () => {
    // Senza una data l'avviso non avrebbe modo di spegnersi: resterebbe lì per
    // sempre, e un avviso che non si spegne smette di essere letto.
    expect(programmazioneNuova(null, null)).toBe(false)
    expect(programmazioneNuova(t('2026-09-08T11:00:00Z'), null)).toBe(false)
  })

  it('guardata nello stesso istante della pubblicazione, non è nuova', () => {
    const istante = t('2026-09-08T10:00:00Z')
    expect(programmazioneNuova(istante, istante)).toBe(false)
  })
})
