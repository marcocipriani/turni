import { addDays, lunediDi } from '../date'

/** Di sabato e domenica la settimana che interessa è quella che viene. */
export function inizioSettimanaTurni(oggi: string) {
  const festa = [0, 6].includes(new Date(`${oggi}T00:00:00Z`).getUTCDay())
  return festa ? addDays(lunediDi(oggi), 7) : lunediDi(oggi)
}
