import { type FormEvent, useState } from 'react'
import { api } from '../api'
import * as I from '../icone'
import { Badge, Bottone, Campo, inputCls, Pannello, Segmented } from '../ui'
import type { UnitaOrg } from './Organigramma'

export type UtenteRiga = {
  id: number; email: string; nome: string; cognome: string
  ruolo: 'admin' | 'dirigente' | 'dipendente'; unitId: number | null; attivo: boolean
}

export type Credenziale = { chi: string; password: string }

const TONO = { admin: 'forte', dirigente: 'medio', dipendente: 'neutro' } as const
const RUOLI_AL_PLURALE = [
  ['admin', 'amministratori'], ['dirigente', 'dirigenti'], ['dipendente', 'dipendenti'],
] as const

const nomeDi = (u: UtenteRiga) => `${u.cognome} ${u.nome}`

export default function Utenti({ utenti, unita, nomeUnita, prova, onCredenziali }: {
  utenti: UtenteRiga[]
  unita: UnitaOrg[]
  nomeUnita: (id: number | null) => string
  prova: (fn: () => Promise<unknown>) => Promise<void>
  onCredenziali: (c: Credenziale[]) => void
}) {
  const [ordine, setOrdine] = useState<'cognome' | 'nome'>('cognome')
  const [gruppo, setGruppo] = useState<'nessuno' | 'ruolo' | 'unita'>('nessuno')
  const [modifica, setModifica] = useState<number | null>(null)
  const [scelti, setScelti] = useState<Set<number>>(new Set())

  const confronta = (a: UtenteRiga, b: UtenteRiga) => {
    const primo = ordine === 'cognome' ? 'cognome' : 'nome'
    const secondo = ordine === 'cognome' ? 'nome' : 'cognome'
    return a[primo].localeCompare(b[primo], 'it') || a[secondo].localeCompare(b[secondo], 'it')
  }
  const ordinati = [...utenti].sort(confronta)

  /** Un solo gruppo senza titolo quando non si raggruppa: la tabella è una sola. */
  const gruppi: { titolo: string | null; righe: UtenteRiga[] }[] =
    gruppo === 'nessuno' ? [{ titolo: null, righe: ordinati }]
    : gruppo === 'ruolo'
      ? RUOLI_AL_PLURALE
          .map(([r, titolo]) => ({ titolo, righe: ordinati.filter((u) => u.ruolo === r) }))
          .filter((g) => g.righe.length > 0)
      : [...unita]
          .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
          .map((x) => ({ titolo: x.nome, righe: ordinati.filter((u) => u.unitId === x.id) }))
          .concat([{ titolo: 'senza unità', righe: ordinati.filter((u) => u.unitId == null) }])
          .filter((g) => g.righe.length > 0)

  const scegli = (id: number, dentro: boolean) =>
    setScelti((s) => {
      const n = new Set(s)
      if (dentro) n.add(id); else n.delete(id)
      return n
    })
  const scegliTutti = (righe: UtenteRiga[], dentro: boolean) =>
    setScelti((s) => {
      const n = new Set(s)
      for (const u of righe) { if (dentro) n.add(u.id); else n.delete(u.id) }
      return n
    })

  const selezionati = ordinati.filter((u) => scelti.has(u.id))
  const tutti = ordinati.length > 0 && selezionati.length === ordinati.length

  /** Le azioni di massa passano dalle stesse rotte di quelle singole, una per volta. */
  function inMassa(fn: (u: UtenteRiga) => Promise<unknown>, domanda: string) {
    if (!confirm(`${domanda} (${selezionati.length} ${selezionati.length === 1 ? 'persona' : 'persone'})`)) return
    void prova(async () => {
      for (const u of selezionati) await fn(u)
      setScelti(new Set())
    })
  }

  const cella = 'border-b border-border px-2.5 py-1.5 text-[12.5px]'
  const intestazione = 'border-b border-border bg-surface px-2.5 py-1.5 text-left text-xs font-semibold text-ink-muted'

  return (
    <Pannello titolo="Utenti" icona={<I.Persona size={18} />}>
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault()
          const form = e.currentTarget
          const f = new FormData(form)
          void prova(async () => {
            const r = await api.post<{ passwordProvvisoria: string }>('/admin/utenti', {
              nome: f.get('nome'), cognome: f.get('cognome'), email: f.get('email'),
              ruolo: f.get('ruolo'), unitId: Number(f.get('unitId')),
            })
            onCredenziali([{ chi: `${f.get('cognome')} ${f.get('nome')}`, password: r.passwordProvvisoria }])
            form.reset()
          })
        }}
        className="grid gap-3 sm:grid-cols-5"
      >
        <Campo etichetta="Nome"><input name="nome" className={inputCls} required /></Campo>
        <Campo etichetta="Cognome"><input name="cognome" className={inputCls} required /></Campo>
        <Campo etichetta="Posta"><input name="email" type="email" className={inputCls} required /></Campo>
        <Campo etichetta="Ruolo">
          <select name="ruolo" className={inputCls}>
            <option value="dipendente">Dipendente</option>
            <option value="dirigente">Dirigente</option>
          </select>
        </Campo>
        <Campo etichetta="Unità">
          <select name="unitId" className={inputCls} required defaultValue="">
            <option value="" disabled>Scegli</option>
            {unita.map((u) => <option key={u.id} value={u.id}>{u.sigla ?? u.nome}</option>)}
          </select>
        </Campo>
        <div className="sm:col-span-5"><Bottone type="submit">Censisci</Bottone></div>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
        <Segmented
          etichetta="Ordina per" valore={ordine} onCambia={setOrdine}
          opzioni={[
            { v: 'cognome', testo: 'Cognome', titolo: 'In ordine di cognome' },
            { v: 'nome', testo: 'Nome', titolo: 'In ordine di nome' },
          ]}
        />
        <Segmented
          etichetta="Raggruppa per" valore={gruppo} onCambia={setGruppo}
          opzioni={[
            { v: 'nessuno', testo: 'Tutti', titolo: 'Un elenco unico' },
            { v: 'ruolo', testo: 'Ruolo', titolo: 'Raggruppati per ruolo' },
            { v: 'unita', testo: 'Unità', titolo: 'Raggruppati per unità' },
          ]}
        />
      </div>

      {selezionati.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-r2 border border-border-controllo bg-surface-2 px-3 py-2">
          <span role="status" className="text-base">
            {selezionati.length} {selezionati.length === 1 ? 'selezionata' : 'selezionate'}
          </span>
          <Bottone variante="piccolo"
                   onClick={() => inMassa((u) => api.post(`/admin/utenti/${u.id}/attivo`, { attivo: false }), 'Disattivare?')}>
            Disattiva
          </Bottone>
          <Bottone variante="piccolo"
                   onClick={() => inMassa((u) => api.post(`/admin/utenti/${u.id}/attivo`, { attivo: true }), 'Riattivare?')}>
            Riattiva
          </Bottone>
          <Bottone variante="piccolo" onClick={() => {
            if (!confirm(`Reimpostare la password di ${selezionati.length} ${selezionati.length === 1 ? 'persona' : 'persone'}? Le vecchie smettono di funzionare subito.`)) return
            void prova(async () => {
              const nuove: Credenziale[] = []
              for (const u of selezionati) {
                const r = await api.post<{ passwordProvvisoria: string }>(`/admin/utenti/${u.id}/reset-password`)
                nuove.push({ chi: nomeDi(u), password: r.passwordProvvisoria })
              }
              onCredenziali(nuove)
              setScelti(new Set())
            })
          }}>Reset password</Bottone>
          <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-muted">
            Sposta in
            <select className={inputCls} defaultValue="" aria-label="Sposta le persone scelte in un'unità"
                    onChange={(e) => {
                      const unitId = Number(e.target.value)
                      e.currentTarget.value = ''
                      if (!unitId) return
                      inMassa((u) => api.patch(`/admin/utenti/${u.id}`, { unitId }),
                        `Spostare in ${nomeUnita(unitId)}?`)
                    }}>
              <option value="">unità…</option>
              {unita.map((u) => <option key={u.id} value={u.id}>{u.sigla ?? u.nome}</option>)}
            </select>
          </label>
          <Bottone variante="piccolo" onClick={() => setScelti(new Set())}>Deseleziona</Bottone>
        </div>
      )}

      <div className="overflow-x-auto rounded-r2 border border-border bg-bg">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th scope="col" className={intestazione}>
                <input type="checkbox" checked={tutti} aria-label="Seleziona tutte le persone"
                       onChange={(e) => scegliTutti(ordinati, e.target.checked)} />
              </th>
              {['Persona', 'Posta', 'Ruolo', 'Unità', 'Azioni'].map((t) => (
                <th key={t} scope="col" className={intestazione}>{t}</th>
              ))}
            </tr>
          </thead>
          {gruppi.map((g) => (
            <tbody key={g.titolo ?? 'tutti'}>
              {g.titolo && (
                <tr>
                  <th colSpan={6} scope="colgroup"
                      className="border-b border-border bg-surface-2 px-2.5 py-1 text-left text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
                    {g.titolo} <span className="font-normal tabular-nums">· {g.righe.length}</span>
                  </th>
                </tr>
              )}
              {g.righe.map((u, i) => modifica === u.id ? (
                <tr key={u.id}>
                  <td colSpan={6} className="border-b border-border px-2.5 py-2">
                    <form
                      className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1.4fr_1fr_auto_auto]"
                      onSubmit={(e: FormEvent<HTMLFormElement>) => {
                        e.preventDefault()
                        const f = new FormData(e.currentTarget)
                        void prova(async () => {
                          await api.patch(`/admin/utenti/${u.id}`, {
                            nome: f.get('nome'), cognome: f.get('cognome'),
                            email: f.get('email'), unitId: Number(f.get('unitId')),
                          })
                          setModifica(null)
                        })
                      }}
                    >
                      <Campo etichetta="Nome"><input name="nome" defaultValue={u.nome} className={inputCls} required /></Campo>
                      <Campo etichetta="Cognome"><input name="cognome" defaultValue={u.cognome} className={inputCls} required /></Campo>
                      <Campo etichetta="Posta"><input name="email" type="email" defaultValue={u.email} className={inputCls} required /></Campo>
                      <Campo etichetta="Unità">
                        <select name="unitId" className={inputCls} defaultValue={u.unitId ?? ''} required>
                          {unita.map((x) => <option key={x.id} value={x.id}>{x.sigla ?? x.nome}</option>)}
                        </select>
                      </Campo>
                      <Bottone type="submit" variante="primario">Salva</Bottone>
                      <Bottone onClick={() => setModifica(null)}>Annulla</Bottone>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={u.id} className={i % 2 ? 'bg-[color-mix(in_oklch,var(--surface)_50%,var(--bg))]' : ''}>
                  <td className={cella}>
                    <input type="checkbox" checked={scelti.has(u.id)} aria-label={`Seleziona ${nomeDi(u)}`}
                           onChange={(e) => scegli(u.id, e.target.checked)} />
                  </td>
                  <td className={cella}>
                    {u.cognome} <span className="text-ink-muted">{u.nome}</span>
                    {!u.attivo && <span className="ml-2 text-2xs text-ink-faint">disattivato</span>}
                  </td>
                  <td className={`mono ${cella} text-ink-muted`}>{u.email}</td>
                  <td className="border-b border-border px-2.5 py-1.5"><Badge tono={TONO[u.ruolo]}>{u.ruolo}</Badge></td>
                  <td className={`${cella} text-ink-muted`}>{nomeUnita(u.unitId)}</td>
                  <td className="border-b border-border px-2.5 py-1.5">
                    <div className="flex flex-wrap gap-2">
                      <Bottone variante="piccolo" onClick={() => setModifica(u.id)}>
                        <I.Matita size={14} />Correggi
                      </Bottone>
                      <Bottone variante="piccolo" onClick={() => void prova(async () => {
                        const r = await api.post<{ passwordProvvisoria: string }>(`/admin/utenti/${u.id}/reset-password`)
                        onCredenziali([{ chi: nomeDi(u), password: r.passwordProvvisoria }])
                      })}>Reset password</Bottone>
                      <Bottone variante="piccolo"
                               onClick={() => void prova(() => api.post(`/admin/utenti/${u.id}/attivo`, { attivo: !u.attivo }))}>
                        {u.attivo ? 'Disattiva' : 'Riattiva'}
                      </Bottone>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Pannello>
  )
}
