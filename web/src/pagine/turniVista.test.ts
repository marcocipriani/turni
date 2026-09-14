import { describe, expect, it } from 'vitest'
import { inizioSettimanaTurni } from './turniVista'

describe('inizio della vista Settimana', () => {
  it('usa il lunedì corrente nei feriali', () => {
    expect(inizioSettimanaTurni('2026-09-14')).toBe('2026-09-14')
    expect(inizioSettimanaTurni('2026-09-16')).toBe('2026-09-14')
    expect(inizioSettimanaTurni('2026-09-18')).toBe('2026-09-14')
  })
  it('sabato e domenica avanzano al lunedì successivo', () => {
    expect(inizioSettimanaTurni('2026-09-19')).toBe('2026-09-21')
    expect(inizioSettimanaTurni('2026-09-20')).toBe('2026-09-21')
  })
})
