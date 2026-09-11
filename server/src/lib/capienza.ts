/**
 * Le stanze che in un giorno hanno più persone che scrivanie. A mano si può
 * sforare — si sposta prima e si sistema dopo — ma non si chiede
 * l'approvazione così.
 */
export function sforamenti(
  celle: { data: string; stato: string; roomId: number | null }[],
  stanze: { roomId: number; capienza: number; etichetta: string }[],
  giorni: string[],
) {
  const conta = new Map<string, number>()
  for (const x of celle) {
    if (x.stato !== 'presenza' || x.roomId == null) continue
    const k = `${x.data}|${x.roomId}`
    conta.set(k, (conta.get(k) ?? 0) + 1)
  }
  return giorni.flatMap((data) => stanze
    .map((s) => ({ data, etichetta: s.etichetta, presenti: conta.get(`${data}|${s.roomId}`) ?? 0, capienza: s.capienza }))
    .filter((x) => x.presenti > x.capienza))
}
