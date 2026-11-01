import { describe, expect, it, vi } from 'vitest'
import { servizioPushNoto } from './notify'

vi.mock('../db/index', () => ({ db: {}, schema: {} }))

describe('servizioPushNoto', () => {
  it('riconosce i servizi push dei browser', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc:APA91b-x_y',
      'https://web.push.apple.com/QAbc-1_2',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
      'https://wns2-bn3p.notify.windows.com/w/?token=BQYAAA%2bx',
    ]) expect(servizioPushNoto(endpoint), endpoint).toBe(true)
  })

  it('rifiuta ogni altra destinazione', () => {
    for (const endpoint of [
      'https://esempio.it/x',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com:3306/x',
      'https://127.0.0.1/x',
      'https://finto-googleapis.com/x',
      'https://fcm.googleapis.com@esempio.it/x',
      'non è un indirizzo',
    ]) expect(servizioPushNoto(endpoint), endpoint).toBe(false)
  })

  it('rifiuta ciò che web-push leggerebbe in un altro modo', () => {
    // new URL toglie il tab e vede googleapis; url.parse, che fa la richiesta, vede esempio.it.
    expect(servizioPushNoto('https://esempio.it\t.googleapis.com/x')).toBe(false)
    expect(servizioPushNoto('https://fcm.googleapis.com\\@esempio.it/x')).toBe(false)
  })
})
