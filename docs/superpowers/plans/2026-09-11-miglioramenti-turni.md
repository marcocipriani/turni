# Miglioramenti di Turni — piano d'implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Undici interventi su Turni (ricerca e filtri in Giorni, «quando vedo X», griglia mobile, Giorni offline, promemoria, preferenze di vista, sede delle stanze, assenze per conto, modalità modifica della griglia con revisioni), ciascuno verificabile da solo.

**Architecture:** Monorepo npm con `server/` (Hono + drizzle su MySQL/MariaDB, script eseguiti con tsx, bundle esbuild) e `web/` (React 19 + Vite + Tailwind 4). La logica nuova sta in funzioni pure testate con vitest; le rotte le chiamano. Le revisioni di un periodo pubblicato sono un periodo gemello (`period.revisione_di`) su cui lavora la macchina esistente, così i lettori del pubblicato non cambiano.

**Tech Stack:** TypeScript, Hono, drizzle-orm (mysql2), zod, vitest, React 19, react-router 7, Tailwind 4, service worker a mano.

**Spec:** `docs/superpowers/specs/2026-09-11-miglioramenti-turni-design.md`

## Global Constraints

- Lingua di interfaccia, commenti e messaggi: italiano, nel registro dei file esistenti (commenti che spiegano il perché, non il cosa).
- Nessuna dipendenza nuova, né nel server né nel web.
- Schema: ogni colonna nuova va sia in `server/src/db/schema.ts` sia in `server/src/db/migra.ts` (idempotente, helper `colonna`). `schema.sql` non si tocca.
- Le causali di assenza non escono mai verso chi non ha `puoVedereCausale`; l'admin non vede programmazioni.
- Test: `npm test` dalla radice (server + web) verde alla fine di ogni task.
- Verifica a mano su `turni_dev` (mai `turni_prod`), a 390px e a 1280px.
- Commit: uno per task, messaggio in italiano nello stile del repo (`feat: …`, `fix: …`, `docs: …`), chiuso da `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Tipo di data: stringhe ISO `YYYY-MM-DD`; nel web `oggiISO()`, `addDays`, `pezziData` da `web/src/date.ts`; nel server `addDays`, `toISO`, `eachDay` da `server/src/lib/dates.ts`.

## Mappa dei file

| File | Responsabilità | Task |
|---|---|---|
| `.env` | punta a `turni_dev` | 0 |
| `web/src/pagine/periodo.tsx` | `ModaleNota` (respingi, richiedi approvazione), editor cella | 1, 10 |
| `web/src/pagine/Turni.tsx` | toolbar, modalità modifica, azioni del periodo | 1, 2, 7, 10 |
| `web/src/pagine/Giorni.tsx` (+ test) | `filtraGente`, offline, sede nella frase | 2, 5, 8 |
| `web/src/pagine/Mio.tsx` (+ test) | `prossimeInsieme`, filtri iniziali | 3, 7 |
| `web/src/pagine/Griglia.tsx` (+ test) | griglia mobile, trascinamento, occupazione per stanza | 4, 9, 10 |
| `web/src/pagine/MenuCella.tsx` (+ test) | menu di cella (tasto destro / tocco) | 10 |
| `web/public/sw.js` | cache di `/api/panoramica` | 5 |
| `server/src/lib/promemoria.ts` (+ test), `server/src/promemoria.ts` | promemoria della sera | 6 |
| `server/src/routes/absences.ts`, `auth.ts` | preferenze, assenze per conto | 6, 7, 9 |
| `server/src/permissions.ts` (+ test) | `puoRegistrareAssenzaPer`, `mascheraCella` | 9 |
| `server/src/routes/org.ts`, `overview.ts`, `lib/caricamento.ts` | sede | 8 |
| `server/src/lib/capienza.ts` (+ test) | sforamenti per stanza | 10 |
| `server/src/generate.ts` (+ test) | `assegnaStanze` per settore | 10 |
| `server/src/routes/periods.ts`, `swaps.ts` | revisioni, celle in blocco, invio bloccato | 10 |
| `README.md`, `docs/MANUALE.md` | documentazione | 11 |

---

### Task 0: Database di sviluppo

**Files:**
- Modify: `.env` (non versionato)

**Interfaces:**
- Produces: un `turni_dev` migrato e popolato; gli account seed stampati dal popolamento.

- [ ] **Step 1: Creare il database**

Dalla radice del repo, con le credenziali già nel `.env`:

```bash
set -a && . ./.env && set +a
node -e "
import('mysql2/promise').then(async (m) => {
  const u = new URL(process.env.DATABASE_URL); u.pathname = '/'
  const c = await m.createConnection(u.toString())
  await c.query('CREATE DATABASE IF NOT EXISTS turni_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  await c.end(); console.log('ok')
})"
```

Expected: `ok`. Se risponde `Access denied … to database 'turni_dev'`, fermarsi e chiedere all'utente di eseguire da amministratore MySQL:
`CREATE DATABASE turni_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON turni_dev.* TO '<utente del .env>'@'localhost';`

- [ ] **Step 2: Puntare il `.env` a `turni_dev`**

Nel `.env`, commentare la riga attuale e aggiungerne una identica con `/turni_dev` al posto di `/turni_prod`:

```
# DATABASE_URL=mysql://…@127.0.0.1:3306/turni_prod
DATABASE_URL=mysql://…@127.0.0.1:3306/turni_dev
```

- [ ] **Step 3: Migrare e popolare**

```bash
npx tsx server/src/db/migra.ts && npm run seed
```

Expected: «Migrazione dello schema… Fatto.» e la tabella degli account di prova (amministratore `admin@turni.test`, dirigenti, organizzatori, dipendenti) con la password `SEED_PASSWORD`. Annotare in `private/accessi-locali.md` un account per ruolo (file non versionato).

- [ ] **Step 4: Verificare**

```bash
npm run dev
```

Accedere su `http://localhost:5173` con un dipendente seed: Mio e Turni mostrano dati. Fermare il server.

Nessun commit: `.env` e `private/` sono ignorati.

---

### Task 1: «Respingi» con una modale

**Files:**
- Modify: `web/src/pagine/periodo.tsx` (nuovo export `ModaleNota`)
- Modify: `web/src/pagine/Turni.tsx:162-175` (comando Respingi)

**Interfaces:**
- Produces: `ModaleNota({ titolo, etichetta, aperta, obbligatoria, conferma, variante, onChiudi, onConferma })` — riusata nel Task 10 per «Richiedi approvazione».

- [ ] **Step 1: Aggiungere `ModaleNota` in `periodo.tsx`**

In fondo al file:

```tsx
/**
 * Una nota da scrivere prima di un'azione sul periodo. Sostituisce `prompt()`,
 * che sul telefono è un riquadro di sistema senza stile e senza «annulla»
 * leggibile. Obbligatoria per il rinvio, facoltativa per la richiesta.
 */
export function ModaleNota({ titolo, etichetta, aperta, obbligatoria, conferma, variante = 'primario', onChiudi, onConferma }: {
  titolo: string
  etichetta: string
  aperta: boolean
  obbligatoria: boolean
  conferma: string
  variante?: 'primario' | 'distruttivo'
  onChiudi: () => void
  onConferma: (nota: string) => Promise<void>
}) {
  const [nota, setNota] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  useEffect(() => { if (aperta) { setNota(''); setErrore(null) } }, [aperta])

  // Il server vuole almeno tre caratteri per un rinvio: lo si dice qui prima.
  const valida = !obbligatoria || nota.trim().length >= 3

  async function invia() {
    setInCorso(true); setErrore(null)
    try { await onConferma(nota.trim()); onChiudi() }
    catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Operazione non riuscita.') }
    finally { setInCorso(false) }
  }

  return (
    <Modale titolo={titolo} aperta={aperta} onChiudi={onChiudi}
            piede={<>
              <Bottone onClick={onChiudi}>Annulla</Bottone>
              <Bottone variante={variante} disabled={!valida || inCorso} onClick={() => void invia()}>{conferma}</Bottone>
            </>}>
      <div className="flex flex-col gap-3">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}
        <Campo etichetta={etichetta} aiuto={obbligatoria ? undefined : 'Facoltativa.'}>
          <textarea className={`${inputCls} min-h-[80px] resize-y`} rows={3} maxLength={500}
                    value={nota} onChange={(e) => setNota(e.target.value)} autoFocus />
        </Campo>
      </div>
    </Modale>
  )
}
```

Verificare che `Bottone` accetti `variante="distruttivo"` (in `ui.tsx` le varianti sono in `VARIANTI`); se il nome è diverso, usare quello esistente.

- [ ] **Step 2: Usarla in `Turni.tsx`**

Aggiungere lo stato accanto agli altri:

```tsx
const [respingiAperto, setRespingiAperto] = useState(false)
```

Sostituire l'`onClick` di «Respingi»:

```tsx
onClick={() => setRespingiAperto(true)}>Respingi</Comando>
```

E prima di `<NuovoPeriodo …/>`:

```tsx
{p && (
  <ModaleNota
    titolo="Rimanda indietro" etichetta="Perché lo rimandi indietro?" obbligatoria
    conferma="Respingi" variante="distruttivo"
    aperta={respingiAperto} onChiudi={() => setRespingiAperto(false)}
    onConferma={async (nota) => {
      await api.post(`/periodi/${p.id}/respingi`, { nota })
      await caricaGriglia(p.id); await caricaPeriodi()
    }}
  />
)}
```

Importare `ModaleNota` da `./periodo`.

- [ ] **Step 3: Tipi e test**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: nessun errore, test verdi.

- [ ] **Step 4: Verifica a mano**

Da dirigente seed, periodo in approvazione → Respingi: la modale si apre, «Respingi» è disattivato sotto i tre caratteri, «Annulla» non chiama il server, con una nota il periodo torna bozza.

- [ ] **Step 5: Commit**

```bash
git add web/src/pagine/periodo.tsx web/src/pagine/Turni.tsx
git commit -m "feat: il rinvio si motiva in una finestra vera, non in un prompt di sistema"
```

---

### Task 2: Giorni — ricerca e «solo il mio settore»

**Files:**
- Modify: `web/src/pagine/Giorni.tsx`
- Modify: `web/src/pagine/Turni.tsx` (toolbar della vista Giorni)
- Test: `web/src/pagine/Giorni.test.ts`

**Interfaces:**
- Produces: `export type Filtro = { testo: string; settore: number | null }`, `export function filtraGente<T extends Chi>(gente: T[], f: Filtro): T[]`; `Giorni` riceve la prop `filtro?: Filtro`.

- [ ] **Step 1: Test che fallisce**

In `Giorni.test.ts`, importare `filtraGente` e aggiungere:

```ts
describe('filtro delle persone', () => {
  const chi = (userId: number, nome: string, cognome: string, sectorId: number | null) =>
    ({ userId, nome, cognome, unitId: 1, sectorId })
  const gente = [chi(1, 'Niccolò', 'Rossi', 1), chi(2, 'Elena', 'Bianchi', 2), chi(3, 'Marco', 'Rossetti', null)]

  it('senza filtro restituisce tutti', () => {
    expect(filtraGente(gente, { testo: '', settore: null })).toHaveLength(3)
  })
  it('cerca nel cognome e nel nome, senza maiuscole né accenti', () => {
    expect(filtraGente(gente, { testo: 'ross', settore: null }).map((p) => p.userId)).toEqual([1, 3])
    expect(filtraGente(gente, { testo: 'niccolo', settore: null }).map((p) => p.userId)).toEqual([1])
    expect(filtraGente(gente, { testo: 'rossi nic', settore: null }).map((p) => p.userId)).toEqual([1])
  })
  it('tiene solo il settore indicato', () => {
    expect(filtraGente(gente, { testo: '', settore: 2 }).map((p) => p.userId)).toEqual([2])
  })
  it('combina testo e settore', () => {
    expect(filtraGente(gente, { testo: 'ross', settore: 1 }).map((p) => p.userId)).toEqual([1])
  })
})
```

- [ ] **Step 2: Verificare che fallisca**

Run: `cd web && npx vitest run src/pagine/Giorni.test.ts`
Expected: FAIL, `filtraGente` non esportata.

- [ ] **Step 3: Implementare in `Giorni.tsx`**

Dopo `ordinaPersone`:

```ts
export type Filtro = { testo: string; settore: number | null }

/** «Niccolò» e «niccolo» sono la stessa ricerca: via maiuscole e accenti. */
const piega = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * Chi resta negli elenchi con un filtro acceso. Si cerca in «nome cognome» e
 * in «cognome nome»: la gente scrive nell'ordine in cui pensa il collega.
 */
export function filtraGente<T extends Chi>(gente: T[], f: Filtro): T[] {
  const t = piega(f.testo.trim())
  return gente.filter((p) =>
    (f.settore == null || p.sectorId === f.settore)
    && (!t || piega(`${p.nome} ${p.cognome}`).includes(t) || piega(`${p.cognome} ${p.nome}`).includes(t)))
}
```

- [ ] **Step 4: Verificare che passi**

Run: `cd web && npx vitest run src/pagine/Giorni.test.ts`
Expected: PASS.

- [ ] **Step 5: Applicare il filtro alle colonne**

In `Giorni`, aggiungere la prop `filtro = { testo: '', settore: null }` (tipo `Filtro`) e passarla a `ColonnaGiorno`. In `ColonnaGiorno`:

```tsx
const attivo = filtro.testo.trim() !== '' || filtro.settore != null
const presenti = filtraGente(giorno.presenti, filtro)
const remoti = filtraGente(giorno.remoti, filtro)
const assenti = filtraGente(giorno.assenti, filtro)
const { gruppi, senza, libere } = perStanza(presenti, stanze)
```

Sostituire `giorno.presenti`/`giorno.remoti`/`giorno.assenti` negli elenchi con le tre variabili filtrate. La barra di occupazione e `x/capienza` restano su `giorno.presenti` (è la giornata, non il filtro). Nascondere la riga «stanze libere» quando `attivo` (col filtro le stanze «libere» non lo sono davvero). Con filtro attivo e nessun presente, il testo diventa «Nessuna corrispondenza in sede.».

Con filtro attivo, i `<details>` delle assenze partono aperti: `<details open={attivo || undefined} …>`.

- [ ] **Step 6: Controlli nella toolbar di `Turni.tsx`**

Stato:

```tsx
const [cerca, setCerca] = useState('')
const [soloSettore, setSoloSettore] = useState(false)
```

Nel ramo `!inGriglia` della Toolbar, dopo il testo della finestra:

```tsx
<input
  type="search" value={cerca} onChange={(e) => setCerca(e.target.value)}
  placeholder="Cerca una persona" aria-label="Cerca una persona"
  className="min-h-[32px] max-sm:min-h-[44px] w-full rounded-r2 border border-border-controllo bg-bg px-2 text-sm
             text-ink sm:w-44"
/>
{utente.sectorId != null && (
  <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted">
    <input type="checkbox" className="size-3.5 cursor-pointer" checked={soloSettore}
           onChange={(e) => { vibra(); setSoloSettore(e.target.checked) }} />
    Solo il mio settore
  </label>
)}
```

E sul componente:

```tsx
<Giorni settimane={settimane} da={inizio} raggruppa={raggruppaGiorni}
        filtro={{ testo: cerca, settore: soloSettore ? utente.sectorId : null }} />
```

- [ ] **Step 7: Tipi, test, verifica a mano**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: verde. A 390px: digitando un cognome restano solo le sue righe, le stanze vuote spariscono, il conteggio della giornata non cambia; «Solo il mio settore» tiene il proprio settore.

- [ ] **Step 8: Commit**

```bash
git add web/src/pagine/Giorni.tsx web/src/pagine/Giorni.test.ts web/src/pagine/Turni.tsx
git commit -m "feat: nei giorni si cerca una persona e si guarda solo il proprio settore"
```

---

### Task 3: «Quando vedo X» in Mio

**Files:**
- Modify: `web/src/pagine/Mio.tsx` (funzione pura + componente `Colleghi`)
- Test: `web/src/pagine/Mio.test.ts`

**Interfaces:**
- Produces: `export function prossimeInsieme(giorni: GiornoMio[], userId: number, dopo: string, quante = 3): string[]`.

`/mio` carica i colleghi solo per le giornate in cui l'utente è in sede (`server/src/routes/mio.ts:65`): una data con il collega fra i `colleghi` è per definizione una giornata insieme in sede.

- [ ] **Step 1: Test che fallisce**

In `Mio.test.ts` (importare anche `prossimeInsieme` e il tipo `Collega`):

```ts
describe('prossimeInsieme', () => {
  const col = (userId: number): Collega =>
    ({ userId, nome: 'N', cognome: 'C', sectorId: null, roomId: null, scrivania: null })
  const giorni = [
    g({ data: '2026-09-14', colleghi: [col(5)] }),
    g({ data: '2026-09-15', colleghi: [col(6)] }),
    g({ data: '2026-09-16', colleghi: [col(5), col(6)] }),
    g({ data: '2026-09-17', stato: 'smart', colleghi: [] }),
    g({ data: '2026-09-18', colleghi: [col(5)] }),
    g({ data: '2026-09-21', colleghi: [col(5)] }),
  ]
  it('dà le prossime date insieme dopo quella indicata', () => {
    expect(prossimeInsieme(giorni, 5, '2026-09-14')).toEqual(['2026-09-16', '2026-09-18', '2026-09-21'])
  })
  it('si ferma a quante ne servono', () => {
    expect(prossimeInsieme(giorni, 5, '2026-09-13', 2)).toEqual(['2026-09-14', '2026-09-16'])
  })
  it('è vuota se non ci si incontra più', () => {
    expect(prossimeInsieme(giorni, 6, '2026-09-16')).toEqual([])
  })
})
```

- [ ] **Step 2: Verificare che fallisca**

Run: `cd web && npx vitest run src/pagine/Mio.test.ts`
Expected: FAIL, `prossimeInsieme` non esportata.

- [ ] **Step 3: Implementare**

In `Mio.tsx`, dopo i tipi:

```ts
/**
 * Le prossime giornate in cui si è in sede con un collega. I colleghi di
 * `/mio` sono quelli in sede nei giorni in cui ci sono anch'io: basta
 * cercarlo fra loro, senza altre richieste.
 */
export function prossimeInsieme(giorni: GiornoMio[], userId: number, dopo: string, quante = 3): string[] {
  return giorni
    .filter((g) => g.data > dopo && g.colleghi.some((c) => c.userId === userId))
    .slice(0, quante)
    .map((g) => g.data)
}
```

- [ ] **Step 4: Verificare che passi**

Run: `cd web && npx vitest run src/pagine/Mio.test.ts`
Expected: PASS.

- [ ] **Step 5: Mostrarlo nel pannello colleghi**

`Riga` riceve la prop nuova `giorni: GiornoMio[]` (passata da `Mio` con `dati.giorni`) e la gira a `Colleghi` insieme a `data={g.data}`. In `Colleghi`, dentro ogni `<li>`, dopo il nome:

```tsx
{(() => {
  const poi = prossimeInsieme(giorni, c.userId, data)
  if (poi.length === 0) return null
  const breve = (iso: string) => { const d = pezziData(iso); return `${d.giorno} ${d.mese}` }
  return (
    <span className="w-full pl-[34px] text-2xs text-ink-faint">
      anche {poi.map(breve).join(', ')}
    </span>
  )
})()}
```

(`pl-[34px]` allinea sotto il nome, oltre l'avatar da 24px e il suo spazio.)

- [ ] **Step 6: Tipi, test, verifica a mano**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: verde. In Mio, aprendo una giornata, sotto un collega compare «anche 16 set, 18 set».

- [ ] **Step 7: Commit**

```bash
git add web/src/pagine/Mio.tsx web/src/pagine/Mio.test.ts
git commit -m "feat: aprendo una giornata si vede quando si torna in sede con ciascun collega"
```

---

### Task 4: Griglia sul telefono

**Files:**
- Modify: `web/src/pagine/Griglia.tsx`

**Interfaces:**
- Produces: `th` di giornata con `data-giorno={iso}` (usato anche dal Task 10); prop `RigaPersona.breve: string`.

- [ ] **Step 1: Colonne più strette sotto i 640px**

In `Griglia.tsx`:
- `th` «Persona»: `min-w-[112px] … md:min-w-[168px]` → `min-w-[80px] sm:min-w-[112px] md:min-w-[168px]`.
- `th` di giornata: `w-[52px]` → `w-[44px] sm:w-[52px]`, e aggiungere `data-giorno={g}`.
- `th` di riga in `RigaPersona`: `px-2.5` → `px-1.5 sm:px-2.5`.
- `span` del nome: `max-w-[96px]` → `max-w-[68px] sm:max-w-[96px]`.
- `button` della cella: `text-[12.5px]` → `text-[11px] sm:text-[12.5px]`.

- [ ] **Step 2: «Cognome I.» sul telefono**

In `Griglia`, accanto a `nomi`:

```ts
const breve = (p: Persona) => `${p.cognome} ${p.nome.slice(0, 1)}.`
```

Passare `breve={breve(p)}` a `RigaPersona` (aggiungere la prop `breve: string` al tipo). Nel `th` di riga, al posto di `{etichetta}`:

```tsx
<span className="sm:hidden">{breve}</span>
<span className="max-sm:hidden">{etichetta}</span>
```

- [ ] **Step 3: Aprire sulla colonna di oggi**

In `Griglia`:

```tsx
const contenitore = useRef<HTMLDivElement>(null)

/* Un periodo di quattro settimane non sta in uno schermo: si apre dove si è,
   non al primo lunedì. La colonna dei nomi è appiccicata e copre quello che
   le passa sotto: si scorre di quanto è larga, così oggi resta visibile. */
useEffect(() => {
  const box = contenitore.current
  const th = box?.querySelector<HTMLElement>(`th[data-giorno="${oggiISO()}"]`)
  const nomi = box?.querySelector<HTMLElement>('thead th')
  if (!box || !th || !nomi) return
  box.scrollLeft = th.offsetLeft - nomi.offsetWidth
}, [dati.periodo.id])
```

Mettere `ref={contenitore}` sul `div` con `overflow-auto` che avvolge la tabella. Importare `useEffect` e `oggiISO`.

- [ ] **Step 4: Tipi, test, verifica a mano**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: verde. A 390px, su un periodo che contiene oggi, la griglia si apre con la colonna di oggi subito dopo i nomi, e i nomi si leggono «Rossi M.».

- [ ] **Step 5: Commit**

```bash
git add web/src/pagine/Griglia.tsx
git commit -m "feat: sul telefono la griglia è più stretta e si apre sulla colonna di oggi"
```

---

### Task 5: Giorni offline

**Files:**
- Modify: `web/public/sw.js`
- Modify: `web/src/pagine/Giorni.tsx`

**Interfaces:**
- Consumes: `getConEta` e `dimenticaDatiOffline` da `web/src/api.ts` (esistenti), `quando` da `./novita`.

- [ ] **Step 1: Controllare che la panoramica non porti causali**

Run: `grep -n "causale" server/src/routes/overview.ts server/src/lib/giornata.ts`
Expected: nessuna causale nelle righe che finiscono nella risposta. `dividiGiornata` produce `Chi` (`userId, nome, cognome, unitId, sectorId`) per gli assenti.

- [ ] **Step 2: Service worker**

In `sw.js`, al posto del blocco `if (url.pathname === '/api/mio')`:

```js
  if (url.pathname === '/api/mio' || url.pathname === '/api/panoramica') {
    event.respondWith(reteOCopia(richiesta, DATI, true))
    return
  }
```

Riscrivere il paragrafo «DEI DATI SI CONSERVA SOLO…» del commento in testa:

```js
 * DEI DATI SI CONSERVANO «/api/mio» E «/api/panoramica»: le proprie giornate
 * e chi c'è in sede, cioè le due cose che si guardano col telefono in mano
 * davanti al portone. Della panoramica nessuna causale arriva mai sul disco:
 * chi è assente vi compare come nome e settore, e le assenze di chi non si ha
 * titolo a vedere non lasciano il server affatto. La dispensa dei dati si
 * svuota all'uscita: ci pensa l'applicazione chiamando `caches.delete`.
```

Aggiornare anche la riga dell'elenco delle regole (`/api/mio     rete, e se non c'è…`) in `/api/mio, /api/panoramica`.

- [ ] **Step 3: Giorni dice da quando sono i dati**

In `Giorni.tsx`:

```tsx
const [copiaDel, setCopiaDel] = useState<Date | null>(null)

useEffect(() => {
  const a = addDays(da, settimane * 7 - 1)
  void getConEta<DatiGiorni>(`/panoramica?da=${da}&a=${a}`)
    .then(({ dati: d, copiaDel: c }) => { setDati(d); setCopiaDel(c); setErrore(null); onCaricato?.(d) })
    .catch((e) => setErrore(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [settimane, da])
```

In testa al contenuto principale (sia nel ramo normale sia in quello senza feriali), prima di `AvvisoStanze`:

```tsx
{copiaDel && (
  <Messaggio tono="attenzione" titolo="Senza rete">
    Stai vedendo i dati conservati sul telefono, aggiornati al {quando(copiaDel.toISOString())}.
  </Messaggio>
)}
```

Importare `getConEta` da `../api` e `quando` da `./novita`.

- [ ] **Step 4: Tipi, test, verifica a mano**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: verde. Con `npm run build --workspace web && npx vite preview --port 4173` (il service worker lavora sul build), in DevTools → Network → Offline, ricaricare Turni: la settimana già vista compare con l'avviso «Senza rete». Uscire dall'app → Application → Cache Storage: `turni-dati-v1` sparito.

- [ ] **Step 5: Commit**

```bash
git add web/public/sw.js web/src/pagine/Giorni.tsx
git commit -m "feat: chi c'è in sede si guarda anche senza rete, senza una causale sul disco"
```

---

### Task 6: Promemoria della sera prima

**Files:**
- Create: `server/src/lib/promemoria.ts`, `server/src/lib/promemoria.test.ts`, `server/src/promemoria.ts`
- Modify: `server/src/db/schema.ts`, `server/src/db/migra.ts`
- Modify: `server/src/routes/absences.ts` (preferenze)
- Modify: `package.json`, `server/package.json`, `private/scripts/pacchetto.mjs` (non versionato)
- Modify: `web/src/pagine/Assenze.tsx`

**Interfaces:**
- Produces: `daAvvisare(celle: CellaDomani[], o: { data: string; attivi: ReadonlySet<number>; assenti: ReadonlyMap<string, unknown>; giaAvvisati: ReadonlySet<number> }): CellaDomani[]`, `testoPromemoria(stanza: string | null, scrivania: string | null): string`; colonna `userPreference.promemoriaSera: boolean`.

- [ ] **Step 1: Test che fallisce**

`server/src/lib/promemoria.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { daAvvisare, testoPromemoria } from './promemoria'

const cella = (userId: number) => ({ userId, roomId: 1, deskId: null })

describe('promemoria della sera', () => {
  const base = { data: '2026-09-15', attivi: new Set([1, 2, 3]), assenti: new Map(), giaAvvisati: new Set<number>() }

  it('avvisa solo chi ha acceso il promemoria', () => {
    expect(daAvvisare([cella(1), cella(4)], base).map((c) => c.userId)).toEqual([1])
  })
  it('salta chi domani ha un\'assenza', () => {
    const o = { ...base, assenti: new Map([['2|2026-09-15', 'ferie']]) }
    expect(daAvvisare([cella(1), cella(2)], o).map((c) => c.userId)).toEqual([1])
  })
  it('non avvisa due volte nello stesso giorno', () => {
    const o = { ...base, giaAvvisati: new Set([3]) }
    expect(daAvvisare([cella(1), cella(3)], o).map((c) => c.userId)).toEqual([1])
  })
  it('scrive stanza e scrivania quando ci sono', () => {
    expect(testoPromemoria('101', '3')).toBe('Domani in sede · 101/3')
    expect(testoPromemoria('101', null)).toBe('Domani in sede · 101')
    expect(testoPromemoria(null, null)).toBe('Domani in sede')
  })
})
```

- [ ] **Step 2: Verificare che fallisca**

Run: `cd server && npx vitest run src/lib/promemoria.test.ts`
Expected: FAIL, modulo `./promemoria` inesistente.

- [ ] **Step 3: Funzioni pure**

`server/src/lib/promemoria.ts`:

```ts
/**
 * Chi riceve il promemoria della sera: è in sede domani, l'ha chiesto, domani
 * non ha un'assenza e oggi non l'ha già ricevuto. Pura, così la si prova senza
 * archivio; `promemoria.ts` le porta i dati.
 */
export type CellaDomani = { userId: number; roomId: number | null; deskId: number | null }

export function daAvvisare(celle: CellaDomani[], o: {
  data: string
  attivi: ReadonlySet<number>
  assenti: ReadonlyMap<string, unknown>
  giaAvvisati: ReadonlySet<number>
}): CellaDomani[] {
  return celle.filter((c) =>
    o.attivi.has(c.userId) && !o.assenti.has(`${c.userId}|${o.data}`) && !o.giaAvvisati.has(c.userId))
}

export const testoPromemoria = (stanza: string | null, scrivania: string | null) =>
  stanza ? `Domani in sede · ${stanza}${scrivania ? `/${scrivania}` : ''}` : 'Domani in sede'
```

- [ ] **Step 4: Verificare che passi**

Run: `cd server && npx vitest run src/lib/promemoria.test.ts`
Expected: PASS.

- [ ] **Step 5: Colonna**

`schema.ts`, in `userPreference`:

```ts
  // Promemoria la sera prima di una giornata in sede. Chiesto, non imposto.
  promemoriaSera: boolean('promemoria_sera').default(false).notNull(),
```

`migra.ts`, prima di `console.log('Fatto.')`:

```ts
  // Il promemoria della sera prima: spento finché la persona non lo accende.
  await colonna('user_preference', 'promemoria_sera', '`promemoria_sera` tinyint(1) NOT NULL DEFAULT 0')
```

Run: `npx tsx server/src/db/migra.ts`
Expected: `+ user_preference.promemoria_sera`.

- [ ] **Step 6: Lo script**

`server/src/promemoria.ts`:

```ts
/**
 * Il promemoria della sera: «domani in sede, stanza 101». Lo lancia il cron del
 * pannello di hosting una volta al giorno, domenica compresa — il lunedì ha la
 * sua sera prima. Nessun processo resta vivo ad aspettare le 18: su un piano
 * condiviso il server si addormenta, il cron no.
 *
 *   npm run promemoria
 */
import 'dotenv/config'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { db, pool, schema } from './db/index'
import { addDays, toISO } from './lib/dates'
import { avvisa } from './lib/notify'
import { daAvvisare, testoPromemoria } from './lib/promemoria'
import { giorniIndisponibili } from './routes/absences'

async function main() {
  const oggi = toISO(new Date())
  const domani = addDays(oggi, 1)

  const periodi = await db.select({ id: schema.period.id }).from(schema.period).where(and(
    eq(schema.period.stato, 'pubblicato'), lte(schema.period.dataInizio, domani), gte(schema.period.dataFine, domani)))
  if (periodi.length === 0) return console.log('Nessun periodo pubblicato copre domani.')

  const celle = await db.select().from(schema.assignment).where(and(
    inArray(schema.assignment.periodId, periodi.map((p) => p.id)),
    eq(schema.assignment.data, domani), eq(schema.assignment.stato, 'presenza')))
  if (celle.length === 0) return console.log('Domani nessuno è in sede.')

  const ids = [...new Set(celle.map((c) => c.userId))]
  const [attivi, assenti, gia] = await Promise.all([
    db.select({ userId: schema.userPreference.userId }).from(schema.userPreference)
      .where(and(inArray(schema.userPreference.userId, ids), eq(schema.userPreference.promemoriaSera, true))),
    giorniIndisponibili(ids, domani, domani),
    db.select({ userId: schema.notification.userId }).from(schema.notification).where(and(
      eq(schema.notification.tipo, 'promemoria'), gte(schema.notification.creatoIl, new Date(`${oggi}T00:00:00Z`)))),
  ])

  const scelte = daAvvisare(celle, {
    data: domani, attivi: new Set(attivi.map((r) => r.userId)), assenti,
    giaAvvisati: new Set(gia.map((r) => r.userId)),
  })

  const stanze = new Map((await db.select().from(schema.room)).map((r) => [r.id, r.etichetta]))
  const scrivanie = new Map((await db.select().from(schema.desk)).map((d) => [d.id, d.numero]))
  for (const c of scelte) {
    await avvisa([c.userId], {
      tipo: 'promemoria', titolo: 'Domani in sede',
      corpo: testoPromemoria(c.roomId != null ? stanze.get(c.roomId) ?? null : null,
                             c.deskId != null ? scrivanie.get(c.deskId) ?? null : null),
      link: '/mio',
    })
  }
  console.log(`Promemoria inviati: ${scelte.length}.`)
}

main()
  .catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exitCode = 1 })
  .finally(() => pool.end())
```

- [ ] **Step 7: Script npm e pacchetto**

Radice `package.json`: in `build:server` aggiungere `server/src/promemoria.ts` all'elenco degli entry; in `scripts` aggiungere `"promemoria": "node server/dist/promemoria.js"`.
`server/package.json`: `"promemoria": "tsx src/promemoria.ts"`.
`private/scripts/pacchetto.mjs` (fuori dal repo): accanto a `importa:` aggiungere `promemoria: 'node server/dist/promemoria.js',`.

Run: `npm run build:server && ls server/dist/promemoria.js`
Expected: il file esiste.

- [ ] **Step 8: Preferenza nell'API**

In `absences.ts`, `GET /preferenze`: il valore di ripiego diventa
`{ userId: a.id, giorniPreferiti: [], giorniDaEvitare: [], nota: null, promemoriaSera: false }`.
`PUT /preferenze`, nello schema zod:

```ts
    promemoriaSera: z.boolean().default(false),
```

- [ ] **Step 9: Interruttore nelle preferenze**

In `Assenze.tsx`: il tipo `Preferenze` guadagna `promemoriaSera: boolean`. Nel form, prima della nota:

```tsx
<label className="flex cursor-pointer items-start gap-2 text-base">
  <input type="checkbox" className="mt-1" checked={pref.promemoriaSera}
         onChange={(e) => setPref({ ...pref, promemoriaSera: e.target.checked })} />
  <span>
    Promemoria la sera prima
    <span className="block text-sm text-ink-faint">
      Alle 18 del giorno prima di una giornata in sede: stanza e scrivania.
      {typeof Notification !== 'undefined' && Notification.permission !== 'granted'
        && ' Su questo dispositivo le notifiche push non sono attive: lo troverai nella campanella.'}
    </span>
  </span>
</label>
```

- [ ] **Step 10: Prova sul database di sviluppo**

Da un dipendente seed, accendere il promemoria e salvare. Poi:

```bash
npx tsx server/src/promemoria.ts
npx tsx server/src/promemoria.ts
```

Expected: la prima volta «Promemoria inviati: 1.» (se domani è in sede in un periodo pubblicato; altrimenti il messaggio dice perché no), la seconda «Promemoria inviati: 0.». La campanella del dipendente mostra «Domani in sede · …».

- [ ] **Step 11: Test e commit**

Run: `npm test`
Expected: verde.

```bash
git add server/src/lib/promemoria.ts server/src/lib/promemoria.test.ts server/src/promemoria.ts \
        server/src/db/schema.ts server/src/db/migra.ts server/src/routes/absences.ts \
        package.json server/package.json web/src/pagine/Assenze.tsx
git commit -m "feat: chi lo chiede riceve la sera prima stanza e scrivania del giorno dopo"
```

---

### Task 7: Preferenze di vista

**Files:**
- Modify: `server/src/db/schema.ts`, `server/src/db/migra.ts`
- Modify: `server/src/routes/absences.ts`, `server/src/routes/auth.ts`
- Modify: `web/src/api.ts` (tipo `Utente`), `web/src/pagine/Assenze.tsx`, `web/src/pagine/Turni.tsx`, `web/src/pagine/Mio.tsx`

**Interfaces:**
- Produces: `Utente.preferenze: { vistaTurni: 'giorni' | 'griglia'; filtriMio: Stato[] }` da `/auth/me`; colonne `userPreference.vistaTurni`, `userPreference.filtriMio`.

- [ ] **Step 1: Colonne**

`schema.ts`, in `userPreference`:

```ts
  // Da dove si parte: la vista di Turni e le chip di Mio accese all'apertura.
  vistaTurni: varchar('vista_turni', { length: 10 }).default('giorni').notNull(),
  filtriMio: json('filtri_mio').$type<string[]>(),
```

`migra.ts`:

```ts
  // Le viste di partenza, scelte da ciascuno.
  await colonna('user_preference', 'vista_turni', "`vista_turni` varchar(10) NOT NULL DEFAULT 'giorni'")
  await colonna('user_preference', 'filtri_mio', '`filtri_mio` json DEFAULT NULL')
```

Run: `npx tsx server/src/db/migra.ts`
Expected: le due colonne aggiunte.

- [ ] **Step 2: API delle preferenze**

`absences.ts`, ripiego del `GET` con `vistaTurni: 'giorni', filtriMio: ['presenza']`. Nel `PUT`:

```ts
    vistaTurni: z.enum(['giorni', 'griglia']).default('giorni'),
    filtriMio: z.array(z.enum(['presenza', 'smart', 'assenza'])).min(1).max(3).default(['presenza']),
```

- [ ] **Step 3: `/auth/me` le porta con sé**

In `auth.ts`, dentro `auth.get('/me')`, prima del `return`:

```ts
  const [pref] = await db.select().from(schema.userPreference).where(eq(schema.userPreference.userId, u.id)).limit(1)
```

e nella risposta:

```ts
    preferenze: {
      vistaTurni: pref?.vistaTurni === 'griglia' ? 'griglia' : 'giorni',
      filtriMio: pref?.filtriMio?.length ? pref.filtriMio : ['presenza'],
    },
```

`web/src/api.ts`, nel tipo `Utente`:

```ts
  preferenze: { vistaTurni: 'giorni' | 'griglia'; filtriMio: ('presenza' | 'smart' | 'assenza')[] }
```

- [ ] **Step 4: Scelta nelle preferenze**

`Assenze.tsx`: il tipo `Preferenze` guadagna `vistaTurni: 'giorni' | 'griglia'; filtriMio: string[]`. Nel form, dopo i giorni preferiti:

```tsx
<fieldset>
  <legend className="mb-1.5 text-xs font-medium text-ink-muted">Turni si apre su</legend>
  <div className="flex flex-wrap gap-3">
    {([['giorni', 'Giorni'], ['griglia', 'Griglia']] as const).map(([v, t]) => (
      <label key={v} className="flex cursor-pointer items-center gap-1.5 text-base">
        <input type="radio" name="vistaTurni" checked={pref.vistaTurni === v}
               onChange={() => setPref({ ...pref, vistaTurni: v })} />
        {t}
      </label>
    ))}
  </div>
</fieldset>
<fieldset>
  <legend className="mb-1.5 text-xs font-medium text-ink-muted">In Mio, all'apertura mostra</legend>
  <div className="flex flex-wrap gap-3">
    {(Object.keys(STATI) as Stato[]).map((s) => {
      const on = pref.filtriMio.includes(s)
      return (
        <label key={s} className="flex cursor-pointer items-center gap-1.5 text-base">
          {/* Almeno una: una lista vuota all'apertura sembra un guasto. */}
          <input type="checkbox" checked={on} disabled={on && pref.filtriMio.length === 1}
                 onChange={(e) => setPref({
                   ...pref,
                   filtriMio: e.target.checked ? [...pref.filtriMio, s] : pref.filtriMio.filter((x) => x !== s),
                 })} />
          {STATI[s].plurale}
        </label>
      )
    })}
  </div>
</fieldset>
```

Importare `STATI` e `type Stato` da `../stati`. Dopo il salvataggio chiamare anche `ricarica()` di `useSessione()` (rinominata in `ricaricaSessione` per non scontrarsi con la `ricarica` locale), così Turni e Mio leggono subito la scelta.

- [ ] **Step 5: Mio parte dalle chip scelte**

In `Mio.tsx`:

```ts
const [attivi, setAttivi] = useState<Set<Filtro>>(
  () => new Set<Filtro>(utente?.preferenze.filtriMio ?? ['presenza']))
```

(`utente` è già letto da `useSessione()` in cima a `Mio`, dal commit del PNG.)

- [ ] **Step 6: Turni parte dalla vista scelta**

Il tasto «Giorni» della toolbar porta a `/turni?vista=giorni`; la preferenza vale solo su `/turni` senza parametro, cioè entrando dalla navigazione. In `Turni.tsx`:

```tsx
const [query] = useSearchParams()

// Chi preferisce la griglia ci atterra; chi preme «Giorni» ci resta.
useEffect(() => {
  if (id || query.get('vista') || utente?.preferenze.vistaTurni !== 'griglia' || !periodi) return
  const r = periodoDiRiferimento(periodi)
  if (r) navigate(`/turni/${r.id}`, { replace: true })
}, [id, query, periodi, utente, navigate])
```

e `onClick={() => navigate('/turni?vista=giorni')}` sul `BottoneVista` «Giorni». Importare `useSearchParams`.

- [ ] **Step 7: Tipi, test, verifica a mano**

Run: `npm test && cd web && npx tsc -b`
Expected: verde. Scegliere «Griglia» e «In sede + Da remoto», salvare: Turni dal menu apre la griglia, «Giorni» resta sui giorni, Mio parte con due chip accese.

- [ ] **Step 8: Commit**

```bash
git add server/src/db/schema.ts server/src/db/migra.ts server/src/routes/absences.ts server/src/routes/auth.ts \
        web/src/api.ts web/src/pagine/Assenze.tsx web/src/pagine/Turni.tsx web/src/pagine/Mio.tsx
git commit -m "feat: ciascuno sceglie da dove partono Turni e Mio"
```

---

### Task 8: Sede delle stanze

**Files:**
- Modify: `server/src/db/schema.ts`, `server/src/db/migra.ts`
- Modify: `server/src/routes/org.ts`, `server/src/routes/overview.ts`, `server/src/lib/caricamento.ts`
- Modify: `docs/modelli/stanze.csv`
- Modify: `web/src/api.ts` (`StanzaVista`), `web/src/pagine/Giorni.tsx`, `web/src/pagine/Organizzazione.tsx`, `web/src/pagine/Stampa.tsx`
- Test: `web/src/pagine/Giorni.test.ts`, `server/src/lib/caricamento.test.ts`

**Interfaces:**
- Produces: `room.sede: string | null` in tutte le risposte che già portano `piano`; `Stanza.sede` in `Giorni.tsx`.

- [ ] **Step 1: Test della frase, che fallisce**

In `Giorni.test.ts`, la fabbrica `stanza` prende un quinto argomento `sede: string | null = null` e lo mette nell'oggetto. Aggiungere:

```ts
  it('divide per sede quando le sedi sono più di una', () => {
    const frasi = fraseStanze([
      stanza('1028', null, 'Primo piano', 2, 'via Roma 1'),
      stanza('1032', null, 'Primo piano', 2, 'via Roma 1'),
      stanza('A3', null, 'Piano terra', 3, 'via Milano 5'),
    ])
    expect(frasi).toEqual([
      'In via Roma 1, le due stanze disponibili sono al primo piano: la stanza 1028 (due postazioni)'
        + ' e la stanza 1032 (due postazioni).',
      'In via Milano 5, l\'unica stanza disponibile è al piano terra: la stanza A3 (tre postazioni).',
    ])
  })

  it('con una sede sola non la ripete', () => {
    const frasi = fraseStanze([stanza('12', null, 'Primo piano', 1, 'via Roma 1')])
    expect(frasi[0]).toBe('L\'unica stanza disponibile è al primo piano: la stanza 12 (una postazione).')
  })
```

Run: `cd web && npx vitest run src/pagine/Giorni.test.ts`
Expected: FAIL sul primo nuovo test.

- [ ] **Step 2: Implementare in `Giorni.tsx`**

`Stanza` guadagna `sede: string | null`. Estrarre il corpo attuale del ramo «stanze condivise» di `fraseStanze` in una funzione `fraseGruppo(stanze: Stanza[]): string` (stesso testo di oggi, restituito invece di spinto). Poi:

```ts
  if (stanze.length > 0) {
    const sedi = [...new Set(stanze.map((s) => s.sede ?? ''))]
    if (sedi.length <= 1) frasi.push(fraseGruppo(stanze))
    else {
      // Più sedi: la sede è il primo dato che serve a chi deve arrivarci, prima
      // ancora del piano. La frase di ogni gruppo resta quella di sempre.
      for (const sede of sedi) {
        const gruppo = fraseGruppo(stanze.filter((s) => (s.sede ?? '') === sede))
        const minuscola = gruppo.slice(0, 1).toLowerCase() + gruppo.slice(1)
        frasi.push(`${sede ? `In ${sede}` : 'Senza sede indicata'}, ${minuscola}`)
      }
    }
  }
```

Run: `cd web && npx vitest run src/pagine/Giorni.test.ts`
Expected: PASS, compresi i test esistenti.

- [ ] **Step 3: Colonna e rotte**

`schema.ts`, in `room` dopo `piano`:

```ts
  // In quale edificio: le stanze non stanno più tutte sotto lo stesso tetto.
  sede: varchar('sede', { length: 80 }),
```

`migra.ts`: `await colonna('room', 'sede', '`sede` varchar(80) DEFAULT NULL')`, poi `npx tsx server/src/db/migra.ts`.

`org.ts`: negli schemi zod di `POST /stanze` (`sede: z.string().max(80).optional()`) e `PATCH /stanze/:rid` (`sede: z.string().max(80).nullable().optional()`); nell'insert `sede: b.data.sede || null`; nell'update `sede: b.data.sede === undefined ? undefined : b.data.sede || null`.

`overview.ts`, in `descrivi`: aggiungere `sede: s.sede`.

- [ ] **Step 4: Importazione da CSV**

In `caricamento.test.ts`, nel `describe('modelli di caricamento')`:

```ts
  it('il modello delle stanze porta la sede', () => {
    const righe = leggiCsv(MODELLI.stanze)
    expect(Object.keys(righe[0]!)).toContain('sede')
    expect(righe.some((r) => r.sede)).toBe(true)
  })
```

Run: `cd server && npx vitest run src/lib/caricamento.test.ts`
Expected: FAIL (il modello non ha ancora la colonna).

In `caricamento.ts`, funzione `stanze`: nel controllo delle lunghezze aggiungere `?? lungo(r.sede ?? '', 80, 'sede')`, nell'insert `sede: r.sede || null`. Nel modello (`stanze: \`stanza;soprannome;piano;…`) aggiungere la colonna `sede` dopo `piano`, con `via Roma 1` nelle righe d'esempio. Stesso cambio in `docs/modelli/stanze.csv`.

Run: `cd server && npx vitest run src/lib/caricamento.test.ts`
Expected: PASS, compreso il confronto fra modello nel codice e copia in `docs/modelli`.

- [ ] **Step 5: Interfaccia**

`api.ts`: `StanzaVista` guadagna `sede: string | null`.
`Organizzazione.tsx`:
- form di creazione: campo `<Campo etichetta="Sede"><input name="sede" list="sedi" className={inputCls} maxLength={80} placeholder="via Roma 1" /></Campo>` accanto a «Piano», `sede: f.get('sede') || undefined` nel corpo, griglia del form con una colonna in più (`sm:grid-cols-[.7fr_1fr_1fr_1fr_1fr_100px_auto]`);
- un solo `<datalist id="sedi">` nella sezione stanze: `{[...new Set(stanze.map((s) => s.sede).filter(Boolean))].map((s) => <option key={s} value={s!} />)}`;
- `FormaStanza`: campo «Sede» con `list="sedi"` e `defaultValue={stanza.sede ?? ''}`, `sede` nel `onSalva` (tipo aggiornato) e nel `PATCH`;
- nell'elenco: `{s.sede ? `${s.sede} · ` : ''}{s.piano ?? 'piano non indicato'} · capienza {s.capienza}`.

`Giorni.tsx`, intestazione della stanza in `ColonnaGiorno`: se le sedi fra `stanze` sono più di una, dopo il soprannome `<span className="ml-1 font-normal text-ink-faint">· {stanza.sede}</span>`. Stesso criterio in `Stampa.tsx` → `FoglioGiorni`, accanto all'etichetta.

- [ ] **Step 6: Tipi, test, verifica a mano**

Run: `npm test && cd web && npx tsc -b`
Expected: verde. Da dirigente seed: dare una sede diversa a una stanza; in Giorni l'avviso in cima si divide per sede e l'intestazione della stanza porta la sede.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/schema.ts server/src/db/migra.ts server/src/routes/org.ts server/src/routes/overview.ts \
        server/src/lib/caricamento.ts server/src/lib/caricamento.test.ts docs/modelli/stanze.csv \
        web/src/api.ts web/src/pagine/Giorni.tsx web/src/pagine/Giorni.test.ts \
        web/src/pagine/Organizzazione.tsx web/src/pagine/Stampa.tsx
git commit -m "feat: le stanze hanno una sede, e la frase in cima dice dove andare"
```

---

### Task 9: Assenze registrate per conto di un collega

**Files:**
- Modify: `server/src/permissions.ts`, `server/src/permissions.test.ts`
- Modify: `server/src/db/schema.ts`, `server/src/db/migra.ts`
- Modify: `server/src/routes/absences.ts`, `server/src/routes/periods.ts` (griglia)
- Modify: `web/src/api.ts` (`Cella`), `web/src/pagine/Griglia.tsx`, `web/src/pagine/Griglia.test.ts`, `web/src/pagine/Assenze.tsx`

**Interfaces:**
- Produces:
  - `puoRegistrareAssenzaPer(albero: Albero, a: Attore, interessato: { id: number; ruolo: Ruolo; unitId: number | null }): boolean`
  - `giorniIndisponibiliDettaglio(userIds, da, a): Promise<Map<string, { causale: string; assenzaId: number | null; perConto: boolean }>>` in `absences.ts`; `giorniIndisponibili` resta con la stessa firma e ne deriva.
  - `CellaGriglia` / `Cella` guadagnano `perConto?: boolean` e `assenzaId?: number | null`.
  - `POST /assenze` accetta `userId?: number`.

- [ ] **Step 1: Test del permesso, che fallisce**

In `permissions.test.ts` (importare `puoRegistrareAssenzaPer`):

```ts
describe('assenze registrate per conto di un collega', () => {
  const persona = (id: number, ruolo: 'dirigente' | 'dipendente', unitId: number) => ({ id, ruolo, unitId })

  it('ognuno registra le proprie', () => {
    expect(puoRegistrareAssenzaPer(albero, dipendenteX, persona(12, 'dipendente', 2))).toBe(true)
  })
  it('chi programma l\'unità registra per i suoi', () => {
    expect(puoRegistrareAssenzaPer(albero, organizzatoreX, persona(12, 'dipendente', 2))).toBe(true)
    expect(puoRegistrareAssenzaPer(albero, dirigenteX, persona(12, 'dipendente', 2))).toBe(true)
  })
  it('il dirigente di una figlia è programmato nel padre: lì lo registra chi programma il padre', () => {
    expect(puoRegistrareAssenzaPer(albero, organizzatoreX, persona(40, 'dirigente', 4))).toBe(true)
  })
  it('un collega senza delega no, l\'admin nemmeno', () => {
    expect(puoRegistrareAssenzaPer(albero, dipendenteX, persona(13, 'dipendente', 2))).toBe(false)
    expect(puoRegistrareAssenzaPer(albero, admin, persona(12, 'dipendente', 2))).toBe(false)
  })
  it('chi programma un\'altra unità no', () => {
    expect(puoRegistrareAssenzaPer(albero, dirigenteX, persona(30, 'dipendente', 3))).toBe(false)
  })
})
```

Run: `cd server && npx vitest run src/permissions.test.ts`
Expected: FAIL, funzione non esportata.

- [ ] **Step 2: Implementare il permesso**

In `permissions.ts`:

```ts
/**
 * Chi registra un'assenza per qualcun altro: chi programma l'unità in cui
 * quella persona è programmata. È lo stesso perimetro in cui vede la causale,
 * quindi registrarla non gli rivela niente che non sapesse già.
 */
export function puoRegistrareAssenzaPer(
  albero: Albero, a: Attore, interessato: { id: number; ruolo: Ruolo; unitId: number | null },
): boolean {
  if (a.id === interessato.id) return true
  const uid = unitaDiProgrammazione(albero, interessato.ruolo, interessato.unitId)
  return uid != null && puoProgrammare(a, uid)
}
```

Run: `cd server && npx vitest run src/permissions.test.ts`
Expected: PASS.

- [ ] **Step 3: Test di `mascheraCella` sui campi nuovi, che fallisce**

In `permissions.test.ts`, nel blocco di `mascheraCella`:

```ts
  it('a chi non ha titolo non dice chi ha registrato l\'assenza', () => {
    const cella = { userId: 12, data: '2026-09-07', stato: 'assenza' as const, roomId: null, deskId: null,
                    bloccata: false, causale: 'ferie', perConto: true, assenzaId: 7 }
    const collega: Attore = { id: 50, ruolo: 'dipendente', unitId: 2, organizzatoreDi: [] }
    const vista = mascheraCella(albero, collega, cella, { id: 12, unitId: 2 })
    expect(vista.perConto).toBe(false)
    expect(vista.assenzaId).toBeNull()
    // Chi ha titolo li vede.
    expect(mascheraCella(albero, organizzatoreX, cella, { id: 12, unitId: 2 }).assenzaId).toBe(7)
  })
```

Run: `cd server && npx vitest run src/permissions.test.ts`
Expected: FAIL.

- [ ] **Step 4: `mascheraCella`**

`CellaGriglia` guadagna:

```ts
  /** Assenza registrata da chi programma, non dall'interessato. */
  perConto?: boolean
  /** Serve a toglierla dalla griglia; solo a chi può farlo. */
  assenzaId?: number | null
```

Nel ramo mascherato di `mascheraCella` aggiungere `perConto: false, assenzaId: null`.

Run: `cd server && npx vitest run src/permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Colonna e dettaglio delle indisponibilità**

`schema.ts`, in `absence`:

```ts
  // Chi l'ha registrata, se non l'interessato: null = dichiarata da sé.
  registrataDa: int('registrata_da'),
```

`migra.ts`: `await colonna('absence', 'registrata_da', '`registrata_da` int DEFAULT NULL')`, poi `npx tsx server/src/db/migra.ts`.

In `absences.ts`, rinominare il corpo di `giorniIndisponibili` in `giorniIndisponibiliDettaglio`, che per le puntuali mette `{ causale: ass.causale, assenzaId: ass.id, perConto: ass.registrataDa != null }` e per le regole `{ causale: r.causale, assenzaId: null, perConto: false }`. Poi:

```ts
/** Giornate coperte da assenze o regole: chiave `userId|data` → causale. */
export async function giorniIndisponibili(userIds: number[], da: ISODate, a: ISODate): Promise<Map<string, string>> {
  const d = await giorniIndisponibiliDettaglio(userIds, da, a)
  return new Map([...d].map(([k, v]) => [k, v.causale]))
}
```

- [ ] **Step 6: La griglia porta le informazioni**

In `periods.ts`, `contesto`: aggiungere accanto a `indisponibili`

```ts
  const indisponibiliDettaglio = await giorniIndisponibiliDettaglio(ids, p.dataInizio, p.dataFine)
  const indisponibili = new Map([...indisponibiliDettaglio].map(([k, v]) => [k, v.causale]))
```

(al posto della chiamata a `giorniIndisponibili`) e restituire anche `indisponibiliDettaglio`. In `/:id/griglia`, nella cella grezza:

```ts
        perConto: ctx.indisponibiliDettaglio.get(`${u.id}|${g}`)?.perConto ?? false,
        assenzaId: ctx.indisponibiliDettaglio.get(`${u.id}|${g}`)?.assenzaId ?? null,
```

- [ ] **Step 7: `POST` e `DELETE /assenze`**

In `absences.ts`, `POST /`: schema zod con `userId: z.number().int().optional()`. Dopo il controllo della causale:

```ts
  const perId = b.data.userId ?? a.id
  let registrataDa: number | null = null
  if (perId !== a.id) {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, perId)).limit(1)
    if (!u || !u.attivo) throw nonTrovato('Persona non trovata')
    if (!puoRegistrareAssenzaPer(alb, a, { id: u.id, ruolo: u.ruolo, unitId: u.unitId })) {
      throw vietato('Registri assenze solo per chi programmi')
    }
    registrataDa = a.id
  }

  const { userId: _, ...periodo } = b.data
  const [ins] = await db.insert(schema.absence).values({ userId: perId, ...periodo, registrataDa })
  if (registrataDa != null) await notificaPerConto(a.id, perId, 'registrata', periodo)
  await segnalaConflitti(perId, alb, b.data.dataInizio, b.data.dataFine)
  return c.json({ id: ins.insertId }, 201)
```

`DELETE /:id`: sostituire il controllo con

```ts
  if (ass.userId !== a.id) {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, ass.userId)).limit(1)
    // Chi programma toglie solo quelle che ha messo l'organizzazione: una
    // dichiarata dall'interessato resta sua.
    const ammesso = ass.registrataDa != null && u
      && puoRegistrareAssenzaPer(c.get('albero'), a, { id: u.id, ruolo: u.ruolo, unitId: u.unitId })
    if (!ammesso) throw vietato('Si possono revocare solo le proprie assenze')
  }
  await db.delete(schema.absence).where(eq(schema.absence.id, id))
  if (ass.userId !== a.id) await notificaPerConto(a.id, ass.userId, 'tolta', ass)
```

E la funzione di supporto in fondo al file:

```ts
/** Traccia e avvisa l'interessato: un'assenza a proprio nome non arriva mai di nascosto. */
async function notificaPerConto(autoreId: number, interessatoId: number, cosa: 'registrata' | 'tolta',
                                p: { dataInizio: string; dataFine: string; causale: string }) {
  const [autore] = await db.select().from(schema.user).where(eq(schema.user.id, autoreId)).limit(1)
  const chi = autore ? `${autore.nome} ${autore.cognome}` : 'Chi programma'
  const quando = p.dataInizio === p.dataFine ? `il ${p.dataInizio}` : `dal ${p.dataInizio} al ${p.dataFine}`
  await traccia({ entita: 'absence', entitaId: `${interessatoId}:${p.dataInizio}`, azione: `assenza_per_conto_${cosa}`,
                  utente: autoreId, dopo: p })
  await avvisa([interessatoId], {
    tipo: 'assenza_per_conto',
    titolo: cosa === 'registrata' ? 'Un\'assenza registrata per te' : 'Un\'assenza tolta dal tuo calendario',
    corpo: `${chi} ${cosa === 'registrata' ? 'ha registrato' : 'ha tolto'} un'assenza ${quando}.`,
    link: '/assenze',
  })
}
```

Importare `traccia`, `puoRegistrareAssenzaPer`.

- [ ] **Step 8: Il segno ⊗ nella griglia — test che fallisce**

In `web/src/pagine/Griglia.test.ts`:

```ts
  it('dice chi ha registrato un\'assenza per conto', () => {
    expect(descriviCella(p, '2026-09-07', cella({ stato: 'assenza', perConto: true }), null, null))
      .toBe('Marchetti Elena, lun 7 settembre, assenza registrata dall\'organizzazione')
  })
```

Run: `cd web && npx vitest run src/pagine/Griglia.test.ts`
Expected: FAIL.

- [ ] **Step 9: Implementare**

`api.ts`, `Cella`: `perConto?: boolean; assenzaId?: number | null`.
`Griglia.tsx`, in `descriviCella`, prima del ramo assenza:

```ts
  if (c.stato === 'assenza' && c.perConto) {
    return `${chi}, ${quando}, assenza registrata dall'organizzazione${c.causale ? `, causale ${c.causale}` : ''}`
  }
```

Nella cella: `c?.stato === 'assenza' ? (c.perConto ? '⊗' : '×')`. In `Legenda`:

```tsx
<li className="inline-flex items-center gap-1.5"><span className="mono">⊗</span>assenza registrata dall'organizzazione</li>
```

`Assenze.tsx`: il tipo `Assenza` guadagna `registrataDa: number | null`; nell'elenco, accanto alla causale di una riga con `registrataDa`, `<Tag>registrata dall'organizzazione</Tag>`.

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Verifica a mano**

Con `curl` da organizzatore seed (cookie preso dal browser) o dal Task 10 quando c'è il menu: `POST /api/assenze {"userId": <collega>, "dataInizio": …, "dataFine": …, "causale": "ferie"}` → 201; il collega vede la notifica e la voce in «Assenze» col tag; la griglia mostra ⊗. Un dipendente senza delega riceve 403.

- [ ] **Step 11: Commit**

```bash
git add server/src/permissions.ts server/src/permissions.test.ts server/src/db/schema.ts server/src/db/migra.ts \
        server/src/routes/absences.ts server/src/routes/periods.ts \
        web/src/api.ts web/src/pagine/Griglia.tsx web/src/pagine/Griglia.test.ts web/src/pagine/Assenze.tsx
git commit -m "feat: chi programma registra un'assenza per un collega, che lo viene a sapere"
```

---

### Task 10a: Revisione come periodo gemello (server)

**Files:**
- Modify: `server/src/db/schema.ts`, `server/src/db/migra.ts`
- Modify: `server/src/routes/periods.ts`, `server/src/routes/swaps.ts`

**Interfaces:**
- Produces:
  - `period.revisioneDi: number | null`, `period.notaRichiesta: string | null`
  - `POST /periodi/:id/revisione` → `{ id }` (201 nuovo, 200 esistente)
  - `DELETE /periodi/:id` (solo gemelli) → `{ ok, originale }`
  - `POST /periodi/:id/invia` accetta `{ nota?: string }`
  - `GET /periodi?unitId=` esclude i gemelli e porta `revisione: number | null` sugli originali
  - `approva` su un gemello applica la revisione all'originale.

- [ ] **Step 1: Colonne**

`schema.ts`, in `period`:

```ts
  // Revisione di un periodo pubblicato: un gemello in bozza su cui si lavora
  // mentre i colleghi continuano a vedere l'originale. Uno per periodo.
  revisioneDi: int('revisione_di'),
  // Nota di chi chiede l'approvazione: finisce nell'istantanea come motivo.
  notaRichiesta: varchar('nota_richiesta', { length: 500 }),
```

e fra gli indici `uniqueIndex('uk_period_revisione').on(t.revisioneDi)`.

`migra.ts`, con un helper per l'indice:

```ts
const indiceEsiste = (t: string, i: string) =>
  esiste('SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', t, i)
```

e in `main`:

```ts
  // Le revisioni di un periodo pubblicato: il gemello e la nota di richiesta.
  await colonna('period', 'revisione_di', '`revisione_di` int DEFAULT NULL')
  await colonna('period', 'nota_richiesta', '`nota_richiesta` varchar(500) DEFAULT NULL')
  if (!(await indiceEsiste('period', 'uk_period_revisione'))) {
    await db.execute(sql.raw('ALTER TABLE `period` ADD UNIQUE INDEX `uk_period_revisione` (`revisione_di`)'))
    console.log('  + period.uk_period_revisione')
  }
```

Run: `npx tsx server/src/db/migra.ts`

- [ ] **Step 2: Elenco e collisioni ignorano i gemelli**

In `periods.get('/')`:

```ts
  const tutti = await db.select().from(schema.period)
    .where(soloPubblicati
      ? and(eq(schema.period.unitId, unitId), eq(schema.period.stato, 'pubblicato'))
      : eq(schema.period.unitId, unitId))
    .orderBy(desc(schema.period.dataInizio))
  // Il gemello non è un periodo a sé: si arriva dall'originale, che dice di averlo.
  const gemelli = new Map(tutti.filter((x) => x.revisioneDi != null).map((x) => [x.revisioneDi!, x.id]))
  return c.json(tutti.filter((x) => x.revisioneDi == null)
    .map((x) => ({ ...x, revisione: soloPubblicati ? null : gemelli.get(x.id) ?? null })))
```

In `periods.post('/')`, nella query `collisioni`, aggiungere `isNull(schema.period.revisioneDi)` all'`and`.

- [ ] **Step 3: Aprire una revisione**

Dopo `periods.put('/:id/cella', …)`:

```ts
/* ── Revisione di un periodo pubblicato ─────────────────────────── */

periods.post('/:id/revisione', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore')
  if (!puoProgrammare(a, p.unitId)) throw vietato()
  if (p.stato !== 'pubblicato' || p.revisioneDi != null) {
    throw new HttpError(409, 'Si apre una revisione solo su un periodo pubblicato')
  }
  const esistente = async () => (await db.select({ id: schema.period.id }).from(schema.period)
    .where(eq(schema.period.revisioneDi, p.id)).limit(1))[0]
  const gia = await esistente()
  if (gia) return c.json({ id: gia.id })

  try {
    const id = await db.transaction(async (tx) => {
      const [ins] = await tx.insert(schema.period).values({
        unitId: p.unitId, dataInizio: p.dataInizio, dataFine: p.dataFine, versione: p.versione,
        assegnaScrivanie: p.assegnaScrivanie, smartMinSettimana: p.smartMinSettimana,
        smartMaxSettimana: p.smartMaxSettimana, creatoDa: a.id, revisioneDi: p.id,
      })
      const celle = await tx.select().from(schema.assignment).where(eq(schema.assignment.periodId, p.id))
      if (celle.length) {
        await tx.insert(schema.assignment).values(celle.map(({ id: _, ...x }) => ({ ...x, periodId: ins.insertId })))
      }
      return ins.insertId
    })
    await traccia({ entita: 'period', entitaId: p.id, azione: 'apri_revisione', utente: a.id, dopo: { gemello: id } })
    return c.json({ id }, 201)
  } catch (e) {
    // Due organizzatori nello stesso istante: l'indice unico ne lascia passare uno.
    const vinto = await esistente()
    if (vinto) return c.json({ id: vinto.id })
    throw e
  }
})

/** Scartare una revisione: il gemello sparisce, l'originale non è mai stato toccato. */
periods.delete('/:id', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const a = c.get('attore')
  if (!puoProgrammare(a, p.unitId)) throw vietato()
  if (p.revisioneDi == null) throw new HttpError(409, 'Si scarta solo una revisione')
  await db.transaction(async (tx) => {
    await tx.delete(schema.assignment).where(eq(schema.assignment.periodId, p.id))
    await tx.delete(schema.period).where(eq(schema.period.id, p.id))
  })
  await traccia({ entita: 'period', entitaId: p.revisioneDi, azione: 'scarta_revisione', utente: a.id })
  return c.json({ ok: true, originale: p.revisioneDi })
})
```

- [ ] **Step 4: Il pubblicato non si modifica più direttamente**

In `periods.put('/:id/cella')`, sostituire il blocco `if (p.stato === 'pubblicato') { … nuovaVersione … }` con:

```ts
  if (p.stato === 'pubblicato') {
    throw new HttpError(409, 'Per modificare un periodo pubblicato apri una revisione')
  }
```

Cancellare la funzione `nuovaVersione`, rimasta senza chiamanti. Nel `traccia` di fondo la condizione diventa `if (b.data.motivazione)`.

- [ ] **Step 5: La nota della richiesta**

In `periods.post('/:id/invia')`:

```ts
  const b = z.object({ nota: z.string().max(500).optional() }).safeParse(await c.req.json().catch(() => ({})))
  const nota = b.success ? b.data.nota?.trim() || null : null
  await db.update(schema.period).set({ stato: 'in_approvazione', notaRichiesta: nota })
    .where(eq(schema.period.id, p.id))
```

e nel corpo dell'avviso al dirigente `…in attesa della tua approvazione.${nota ? ` Nota: ${nota}` : ''}`; se `p.revisioneDi != null` il titolo diventa «Revisione da approvare» e il link `/turni/${p.id}`.

- [ ] **Step 6: Approvare un gemello applica la revisione**

In `periods.post('/:id/approva')`, subito dopo i controlli di permesso e stato:

```ts
  if (p.revisioneDi != null) return c.json(await applicaRevisione(p, a.id, alb))
```

e prima della rotta:

```ts
/**
 * Il gemello approvato diventa la nuova versione dell'originale: istantanea di
 * quella in vigore, celle sostituite, versione avanti, gemello eliminato. Tutto
 * in una transazione: a metà strada i colleghi vedrebbero un periodo vuoto.
 */
async function applicaRevisione(gemello: typeof schema.period.$inferSelect, autore: number, alb: Albero) {
  const orig = await caricaPeriodo(gemello.revisioneDi!)
  const prima = await db.select().from(schema.assignment).where(eq(schema.assignment.periodId, orig.id))
  const dopo = await db.select().from(schema.assignment).where(eq(schema.assignment.periodId, gemello.id))
  const adesso = new Date()

  await db.transaction(async (tx) => {
    await tx.insert(schema.periodSnapshot).values({
      periodId: orig.id, versione: orig.versione, assegnazioni: prima as never,
      motivo: gemello.notaRichiesta, autore,
    })
    await tx.delete(schema.assignment).where(eq(schema.assignment.periodId, orig.id))
    if (dopo.length) {
      await tx.insert(schema.assignment).values(dopo.map(({ id: _, ...x }) => ({ ...x, periodId: orig.id })))
    }
    await tx.delete(schema.assignment).where(eq(schema.assignment.periodId, gemello.id))
    await tx.delete(schema.period).where(eq(schema.period.id, gemello.id))
    await tx.update(schema.period).set({
      versione: orig.versione + 1, pubblicatoDa: autore, aggiornatoIl: adesso, notaApprovazione: null,
    }).where(eq(schema.period.id, orig.id))
  })

  // Solo chi ha una giornata diversa riceve l'avviso: gli altri non hanno
  // niente da riguardare.
  const toccati = [...new Set(confronta(celleIstantanea(prima), dopo).map((x) => x.userId))]
  const inForza = new Set((await personeDellUnita(alb, orig.unitId)).map((u) => u.id))
  const destinatari = toccati.filter((id) => inForza.has(id))
  await avvisa(destinatari, {
    tipo: 'revisione_pubblicata', titolo: 'La tua programmazione è cambiata',
    corpo: `Periodo ${orig.dataInizio} – ${orig.dataFine}.`, link: '/mio',
  })
  await traccia({ entita: 'period', entitaId: orig.id, azione: 'pubblica_revisione', utente: autore,
                  dopo: { versione: orig.versione + 1 } })
  return { ok: true, destinatari: destinatari.length, id: orig.id }
}
```

Verificare che `confronta` accetti righe di `assignment` come secondo argomento (lo fa già in `/:id/differenze`). Se `CellaVersione` è più stretto, passare `celleIstantanea(dopo)`.

- [ ] **Step 7: Scambi fermi durante una revisione**

In `swaps.ts`, dopo `periodoDi`:

```ts
/** Una revisione aperta riscriverà queste celle: uno scambio adesso andrebbe perso. */
async function inRevisione(periodId: number) {
  const [g] = await db.select({ id: schema.period.id }).from(schema.period)
    .where(eq(schema.period.revisioneDi, periodId)).limit(1)
  return Boolean(g)
}
```

In `swaps.post('/')` subito dopo `if (!p) throw invalido(…)`, e in `swaps.post('/:id/accetta')` dopo il controllo sullo stato del periodo:

```ts
  if (await inRevisione(p.id)) throw new HttpError(409, 'Programmazione in revisione: gli scambi riaprono dopo l\'approvazione')
```

- [ ] **Step 8: Prova sul database di sviluppo**

`npm test` verde, poi `npm run dev` e, da organizzatore seed (cookie dal browser in `$C`):

```bash
curl -s -b "$C" -X POST localhost:8787/api/periodi/<pubblicato>/revisione     # {"id":G}
curl -s -b "$C" -X POST localhost:8787/api/periodi/<pubblicato>/revisione     # stesso G
curl -s -b "$C" -X PUT localhost:8787/api/periodi/<pubblicato>/cella -H 'content-type: application/json' \
     -d '{"userId":…,"data":"…","stato":"smart"}'                              # 409
```

Poi una modifica sul gemello, `invia` con `{"nota":"prova"}`, `approva` da dirigente: Mio di un collega toccato mostra la nuova giornata, «Cosa è cambiato» sulla v+1 la elenca, il gemello non esiste più. Durante la revisione, una proposta di scambio risponde 409.

- [ ] **Step 9: Commit**

```bash
git add server/src/db/schema.ts server/src/db/migra.ts server/src/routes/periods.ts server/src/routes/swaps.ts
git commit -m "feat: un periodo pubblicato si rivede in un gemello, e i colleghi vedono l'originale fino al sì"
```

---

### Task 10b: Celle in blocco, lucchetto automatico, capienza per stanza

**Files:**
- Create: `server/src/lib/capienza.ts`, `server/src/lib/capienza.test.ts`
- Modify: `server/src/routes/periods.ts`

**Interfaces:**
- Consumes: `giorniIndisponibili`, `personeDellUnita`.
- Produces:
  - `sforamenti(celle: { data: string; stato: string; roomId: number | null }[], stanze: { roomId: number; capienza: number; etichetta: string }[], giorni: string[]): { data: string; etichetta: string; presenti: number; capienza: number }[]`
  - `PUT /periodi/:id/celle` con `{ celle: { userId, data, stato, roomId?, deskId?, bloccata? }[], motivazione? }` → `{ ok: true }`; `bloccata` di default `true`.
  - `invia` → 409 se ci sono avvisi `errore`.

- [ ] **Step 1: Test che fallisce**

`server/src/lib/capienza.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sforamenti } from './capienza'

const stanze = [{ roomId: 1, capienza: 2, etichetta: '1028' }, { roomId: 2, capienza: 3, etichetta: '3016' }]
const c = (data: string, roomId: number | null, stato = 'presenza') => ({ data, roomId, stato })

describe('capienza per stanza', () => {
  it('segnala la stanza sforata nel giorno in cui succede', () => {
    const celle = [c('2026-09-14', 1), c('2026-09-14', 1), c('2026-09-14', 1), c('2026-09-14', 2)]
    expect(sforamenti(celle, stanze, ['2026-09-14'])).toEqual([
      { data: '2026-09-14', etichetta: '1028', presenti: 3, capienza: 2 },
    ])
  })
  it('stanza piena non è sforata; il lavoro da remoto non conta', () => {
    const celle = [c('2026-09-14', 1), c('2026-09-14', 1), c('2026-09-14', null, 'smart')]
    expect(sforamenti(celle, stanze, ['2026-09-14'])).toEqual([])
  })
})
```

Run: `cd server && npx vitest run src/lib/capienza.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementare**

`server/src/lib/capienza.ts`:

```ts
/**
 * Le stanze che in un giorno hanno più persone che scrivanie. A mano si può
 * sforare — si sposta prima e si sistema dopo — ma non si pubblica così.
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
```

Run: `cd server && npx vitest run src/lib/capienza.test.ts`
Expected: PASS.

- [ ] **Step 3: Avvisi per stanza**

In `periods.ts`, `validazioni`, dopo il ciclo sui giorni:

```ts
  const etichette = new Map(ctx.stanzeRighe.map((s) => [s.id, s.etichetta]))
  for (const x of sforamenti(ctx.celle, ctx.stanze.map((s) => ({ ...s, etichetta: etichette.get(s.roomId) ?? String(s.roomId) })), ctx.giorni)) {
    avvisi.push({ gravita: 'errore', data: x.data,
                  messaggio: `${x.data}: stanza ${x.etichetta} con ${x.presenti} persone per ${x.capienza} postazioni` })
  }
```

- [ ] **Step 4: Invio bloccato dai conflitti**

In `periods.post('/:id/invia')`, prima dell'update (servirà `alb`: `const a = c.get('attore'), alb = c.get('albero')`):

```ts
  const errori = validazioni(await contesto(p, alb), p).filter((x) => x.gravita === 'errore')
  if (errori.length) {
    throw new HttpError(409, `Ci sono ${errori.length} conflitti da risolvere prima di chiedere l'approvazione`)
  }
```

- [ ] **Step 5: Scrittura comune a `/cella` e `/celle`**

Sostituire il corpo di `periods.put('/:id/cella')` con una funzione condivisa e le due rotte:

```ts
const CellaIn = z.object({
  userId: z.number().int(), data: ISO,
  stato: z.enum(['presenza', 'smart']),
  roomId: z.number().int().nullable().default(null),
  deskId: z.number().int().nullable().default(null),
  // Una modifica a mano si blocca da sola: la generazione non la rifà.
  bloccata: z.boolean().default(true),
})
type CellaIn = z.infer<typeof CellaIn>

/**
 * Scrive una o più celle in una transazione: uno scambio fra due persone non
 * resta mai a metà. Su un'assenza non si programma — nemmeno a mano.
 */
async function scriviCelle(p: typeof schema.period.$inferSelect, a: Attore, alb: Albero,
                           celle: CellaIn[], motivazione: string | null) {
  if (!puoProgrammare(a, p.unitId)) throw vietato()
  if (p.stato === 'pubblicato') throw new HttpError(409, 'Per modificare un periodo pubblicato apri una revisione')

  const persone = new Set((await personeDellUnita(alb, p.unitId)).map((u) => u.id))
  for (const x of celle) {
    if (!persone.has(x.userId)) throw new HttpError(422, 'Persona fuori da questa programmazione')
    if (x.data < p.dataInizio || x.data > p.dataFine) throw new HttpError(422, 'Giornata fuori dal periodo')
  }
  const date = celle.map((x) => x.data).sort()
  const assenze = await giorniIndisponibili([...new Set(celle.map((x) => x.userId))], date[0]!, date.at(-1)!)
  if (celle.some((x) => assenze.has(`${x.userId}|${x.data}`))) {
    throw new HttpError(409, 'Su un\'assenza non si programma')
  }

  await db.transaction(async (tx) => {
    for (const x of celle) {
      const valori = {
        stato: x.stato,
        roomId: x.stato === 'presenza' ? x.roomId : null,
        deskId: x.stato === 'presenza' ? x.deskId : null,
        bloccata: x.bloccata, origine: 'manuale' as const, motivazione,
      }
      await tx.insert(schema.assignment).values({ periodId: p.id, userId: x.userId, data: x.data, ...valori })
        .onDuplicateKeyUpdate({ set: valori })
    }
  })
  if (motivazione) {
    await traccia({ entita: 'period', entitaId: p.id, azione: 'modifica_manuale', utente: a.id, dopo: celle, motivazione })
  }
}

periods.put('/:id/cella', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const b = CellaIn.extend({ motivazione: z.string().max(500).optional() }).safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati della cella non validi')
  const { motivazione, ...cella } = b.data
  await scriviCelle(p, c.get('attore'), c.get('albero'), [cella], motivazione?.trim() || null)
  return c.json({ ok: true })
})

periods.put('/:id/celle', async (c) => {
  const p = await caricaPeriodo(Number(c.req.param('id')))
  const b = z.object({ celle: z.array(CellaIn).min(1).max(50), motivazione: z.string().max(500).optional() })
    .safeParse(await c.req.json())
  if (!b.success) throw new HttpError(422, 'Dati delle celle non validi')
  await scriviCelle(p, c.get('attore'), c.get('albero'), b.data.celle, b.data.motivazione?.trim() || null)
  return c.json({ ok: true })
})
```

Importare `type Attore` da `../permissions` e `sforamenti` da `../lib/capienza`.

- [ ] **Step 6: Tipi e test**

Run: `cd server && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: verde.

- [ ] **Step 7: Prova sul database di sviluppo**

Su una bozza, `PUT /celle` con due celle scambiate → 200, entrambe `bloccata: 1` in archivio. Una cella su un giorno di assenza → 409. Tre persone in una stanza da due → la griglia porta l'avviso di errore e `invia` risponde 409.

- [ ] **Step 8: Commit**

```bash
git add server/src/lib/capienza.ts server/src/lib/capienza.test.ts server/src/routes/periods.ts
git commit -m "feat: le celle si scrivono a coppie, a mano si bloccano, e una stanza sforata ferma l'invio"
```

---

### Task 10c: Generazione che tiene insieme il settore

**Files:**
- Modify: `server/src/generate.ts`, `server/src/generate.test.ts`
- Modify: `server/src/routes/periods.ts` (passa le stanze precedenti)

**Interfaces:**
- Produces: `export function assegnaStanze(persone: { userId: number; sectorId: number | null }[], stanze: Stanza[], fissate: { userId: number; sectorId: number | null; roomId: number }[], precedente: (userId: number) => number | undefined): Map<number, number | null>`; `GenerateInput.stanzePrecedenti?: Map<string, number>` (chiave `userId|data`).

- [ ] **Step 1: Test che fallisce**

In `generate.test.ts` (importare `assegnaStanze`):

```ts
describe('stanze per settore', () => {
  const stanze = [{ roomId: 10, capienza: 2 }, { roomId: 20, capienza: 2 }, { roomId: 30, capienza: 3 }]
  const p = (userId: number, sectorId: number | null) => ({ userId, sectorId })
  const nessuna = () => undefined

  it('mette ogni settore nella sua stanza quando i posti bastano', () => {
    const m = assegnaStanze([p(1, 1), p(2, 2), p(3, 1), p(4, 2)], stanze, [], nessuna)
    expect(m.get(1)).toBe(m.get(3))
    expect(m.get(2)).toBe(m.get(4))
    expect(m.get(1)).not.toBe(m.get(2))
  })
  it('un settore di tre sceglie la stanza da tre invece di spezzarsi', () => {
    const m = assegnaStanze([p(1, 1), p(2, 1), p(3, 1)], stanze, [], nessuna)
    expect(new Set([m.get(1), m.get(2), m.get(3)])).toEqual(new Set([30]))
  })
  it('raggiunge il collega di settore già bloccato in una stanza', () => {
    const m = assegnaStanze([p(2, 1)], stanze, [{ userId: 1, sectorId: 1, roomId: 20 }], nessuna)
    expect(m.get(2)).toBe(20)
  })
  it('a parità conserva la stanza di prima', () => {
    const m = assegnaStanze([p(1, null)], stanze, [], (id) => (id === 1 ? 20 : undefined))
    expect(m.get(1)).toBe(20)
  })
  it('senza posti restituisce null', () => {
    const m = assegnaStanze([p(1, 1)], [{ roomId: 10, capienza: 1 }], [{ userId: 9, sectorId: 2, roomId: 10 }], nessuna)
    expect(m.get(1)).toBeNull()
  })
})
```

Run: `cd server && npx vitest run src/generate.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementare**

In `generate.ts`, prima di `generate`:

```ts
/**
 * Le stanze di una giornata, settore per settore: chi lavora insieme si siede
 * insieme, e una stanza mescola meno gruppi possibile. Vincoli prima di tutto:
 * chi è bloccato in una stanza ci resta, e i posti non si superano.
 *
 * Avido, non ottimo: i gruppi più grandi scelgono per primi. Con una ventina di
 * presenti al giorno e poche stanze l'ottimo non si distingue a occhio.
 */
export function assegnaStanze(
  persone: { userId: number; sectorId: number | null }[],
  stanze: Stanza[],
  fissate: { userId: number; sectorId: number | null; roomId: number }[],
  precedente: (userId: number) => number | undefined,
): Map<number, number | null> {
  const liberi = new Map(stanze.map((s) => [s.roomId, s.capienza]))
  const settoriIn = new Map(stanze.map((s) => [s.roomId, new Set<number | null>()]))
  for (const f of fissate) {
    liberi.set(f.roomId, (liberi.get(f.roomId) ?? 0) - 1)
    settoriIn.get(f.roomId)?.add(f.sectorId)
  }

  const gruppi = new Map<number | null, typeof persone>()
  for (const p of persone) gruppi.set(p.sectorId, [...(gruppi.get(p.sectorId) ?? []), p])
  const ordine = [...gruppi.entries()].sort((a, b) => b[1].length - a[1].length)

  const esito = new Map<number, number | null>()
  for (const [settore, membri] of ordine) {
    const restanti = [...membri]
    while (restanti.length) {
      const conPosto = stanze.filter((s) => (liberi.get(s.roomId) ?? 0) > 0)
      if (conPosto.length === 0) { for (const m of restanti) esito.set(m.userId, null); break }
      // Prima dove il settore c'è già, poi una stanza vuota che lo contenga
      // tutto (la più piccola che basta), poi quella con più posti.
      // A parità, la stanza dove qualcuno del gruppo stava già.
      const giaQui = conPosto.filter((s) => settoriIn.get(s.roomId)!.has(settore))
      const vuote = conPosto.filter((s) => settoriIn.get(s.roomId)!.size === 0)
      const preferita = (s: Stanza) => restanti.some((m) => precedente(m.userId) === s.roomId)
      const intera = vuote.filter((s) => liberi.get(s.roomId)! >= restanti.length)
        .sort((a, b) => Number(preferita(b)) - Number(preferita(a)) || liberi.get(a.roomId)! - liberi.get(b.roomId)!)[0]
      const scelta = giaQui[0] ?? intera
        ?? [...conPosto].sort((a, b) => liberi.get(b.roomId)! - liberi.get(a.roomId)!)[0]!
      // Dentro il gruppo passa prima chi in quella stanza c'era già.
      restanti.sort((a, b) => Number(precedente(b.userId) === scelta.roomId) - Number(precedente(a.userId) === scelta.roomId))
      const quanti = Math.min(liberi.get(scelta.roomId)!, restanti.length)
      for (const m of restanti.splice(0, quanti)) esito.set(m.userId, scelta.roomId)
      liberi.set(scelta.roomId, liberi.get(scelta.roomId)! - quanti)
      settoriIn.get(scelta.roomId)!.add(settore)
    }
  }
  return esito
}
```

Run: `cd server && npx vitest run src/generate.test.ts`
Expected: PASS, compresi i test esistenti di `generate`.

- [ ] **Step 3: Usarla nel generatore**

`GenerateInput` guadagna `stanzePrecedenti?: Map<string, number>`. Nel ciclo «Stanze» di `generate`, sostituire i due cicli `for (const p of presenti)` con:

```ts
    const fissateOggi = presenti.flatMap((p) => {
      const rid = fissata.get(key(p.userId, d))?.roomId
      return rid == null ? [] : [{ userId: p.userId, sectorId: p.sectorId, roomId: rid }]
    })
    const daCollocare = presenti.filter((p) => fissata.get(key(p.userId, d))?.roomId == null)
    const stanzaDi = assegnaStanze(daCollocare, stanze, fissateOggi,
                                   (uid) => input.stanzePrecedenti?.get(key(uid, d)))
    for (const f of fissateOggi) assegnazioni.push({ userId: f.userId, data: d, stato: 'presenza', roomId: f.roomId })
    for (const p of daCollocare) {
      assegnazioni.push({ userId: p.userId, data: d, stato: 'presenza', roomId: stanzaDi.get(p.userId) ?? null })
    }
```

Togliere la `residua` rimasta senza uso. Se `input` non è in scope col nome `input`, usare quello della firma di `generate`.

In `periods.ts`, `/:id/genera`, nella chiamata a `generate` aggiungere:

```ts
    stanzePrecedenti: new Map(ctx.celle.filter((x) => !x.bloccata && x.roomId != null)
      .map((x) => [`${x.userId}|${x.data}`, x.roomId!])),
```

- [ ] **Step 4: Test e prova**

Run: `npm test`
Expected: verde. Su `turni_dev`, Genera su una bozza: nella griglia raggruppata per settore, le celle dello stesso settore nello stesso giorno portano per lo più la stessa stanza.

- [ ] **Step 5: Commit**

```bash
git add server/src/generate.ts server/src/generate.test.ts server/src/routes/periods.ts
git commit -m "feat: la generazione siede insieme chi è dello stesso settore"
```

---

### Task 10d: Modalità modifica, trascinamento e menu di cella (web)

**Files:**
- Create: `web/src/pagine/MenuCella.tsx`, `web/src/pagine/MenuCella.test.ts`
- Modify: `web/src/api.ts` (`Periodo`), `web/src/pagine/Griglia.tsx`, `web/src/pagine/Griglia.test.ts`, `web/src/pagine/Turni.tsx`, `web/src/pagine/periodo.tsx`

**Interfaces:**
- Consumes: `PUT /periodi/:id/celle`, `POST /periodi/:id/revisione`, `DELETE /periodi/:id`, `POST /periodi/:id/invia {nota}`, `POST /assenze {userId}`, `DELETE /assenze/:id`; `ModaleNota` (Task 1); `th[data-giorno]` (Task 4).
- Produces:
  - `export type CellaModifica = { userId: number; data: string; stato: 'presenza' | 'smart'; roomId: number | null; deskId: number | null; bloccata: boolean }`
  - `export function scambio(a: Cella, b: Cella): CellaModifica[] | null` in `Griglia.tsx`
  - `export function vociMenu(cella: Cella, stanze: { id: number; etichetta: string; capienza: number }[], occupati: Map<number, number>): Voce[]` in `MenuCella.tsx`
  - `Periodo.revisioneDi: number | null`, `Periodo.revisione?: number | null`.

- [ ] **Step 1: Test dello scambio, che fallisce**

In `Griglia.test.ts` (importare `scambio`):

```ts
describe('scambio trascinando', () => {
  const a = cella({ userId: 1, data: '2026-09-14', stato: 'presenza', roomId: 3, deskId: 9 })
  const b = cella({ userId: 2, data: '2026-09-14', stato: 'smart' })

  it('in verticale scambia le giornate di due persone, e le blocca', () => {
    expect(scambio(a, b)).toEqual([
      { userId: 1, data: '2026-09-14', stato: 'smart', roomId: null, deskId: null, bloccata: true },
      { userId: 2, data: '2026-09-14', stato: 'presenza', roomId: 3, deskId: 9, bloccata: true },
    ])
  })
  it('in orizzontale sposta lo smart della stessa persona, senza portarsi dietro la scrivania', () => {
    const c = cella({ userId: 1, data: '2026-09-16', stato: 'smart' })
    expect(scambio(a, c)).toEqual([
      { userId: 1, data: '2026-09-14', stato: 'smart', roomId: null, deskId: null, bloccata: true },
      { userId: 1, data: '2026-09-16', stato: 'presenza', roomId: 3, deskId: null, bloccata: true },
    ])
  })
  it('non tocca le assenze né incrocia persone e giorni diversi', () => {
    expect(scambio(a, cella({ userId: 2, data: '2026-09-14', stato: 'assenza' }))).toBeNull()
    expect(scambio(a, cella({ userId: 2, data: '2026-09-15', stato: 'smart' }))).toBeNull()
    expect(scambio(a, a)).toBeNull()
  })
})
```

Run: `cd web && npx vitest run src/pagine/Griglia.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementare `scambio`**

In `Griglia.tsx`:

```ts
export type CellaModifica = {
  userId: number; data: string; stato: 'presenza' | 'smart'
  roomId: number | null; deskId: number | null; bloccata: boolean
}

/**
 * Cosa succede lasciando una cella su un'altra. Stesso giorno: due persone si
 * scambiano la giornata. Stessa persona: si scambiano due giorni, che è come si
 * sposta lo smart. La scrivania viaggia solo nello stesso giorno — in un altro
 * giorno potrebbe essere di qualcun altro. Le assenze non si toccano.
 */
export function scambio(a: Cella, b: Cella): CellaModifica[] | null {
  if (a.stato === 'assenza' || b.stato === 'assenza') return null
  const stessoGiorno = a.data === b.data && a.userId !== b.userId
  const stessaPersona = a.userId === b.userId && a.data !== b.data
  if (!stessoGiorno && !stessaPersona) return null
  const prende = (chi: Cella, da: Cella): CellaModifica => ({
    userId: chi.userId, data: chi.data, stato: da.stato as 'presenza' | 'smart',
    roomId: da.stato === 'presenza' ? da.roomId : null,
    deskId: da.stato === 'presenza' && stessoGiorno ? da.deskId : null,
    bloccata: true,
  })
  return [prende(a, b), prende(b, a)]
}
```

Run: `cd web && npx vitest run src/pagine/Griglia.test.ts`
Expected: PASS.

- [ ] **Step 3: Test delle voci di menu, che fallisce**

`web/src/pagine/MenuCella.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Cella } from '../api'
import { vociMenu } from './MenuCella'

const cella = (over: Partial<Cella>): Cella => ({
  userId: 1, data: '2026-09-14', stato: 'smart', roomId: null, deskId: null, bloccata: false, causale: null, ...over,
})
const stanze = [{ id: 3, etichetta: '1028', capienza: 2 }, { id: 4, etichetta: '3016', capienza: 3 }]

describe('voci del menu di cella', () => {
  it('su una giornata normale offre stanze con occupazione, remoto, lucchetto e dettagli', () => {
    const v = vociMenu(cella({ stato: 'presenza', roomId: 3, bloccata: true }), stanze, new Map([[3, 2], [4, 0]]))
    expect(v.map((x) => x.chiave)).toEqual(['stanza:3', 'stanza:4', 'remoto', 'sblocca', 'assenza', 'dettagli'])
    expect(v[0]).toMatchObject({ etichetta: '1028 · 2/2', attuale: true })
    expect(v[1]).toMatchObject({ etichetta: '3016 · 0/3', attuale: false })
  })
  it('su un\'assenza registrata dall\'organizzazione offre solo di toglierla', () => {
    expect(vociMenu(cella({ stato: 'assenza', perConto: true, assenzaId: 7 }), stanze, new Map()).map((x) => x.chiave))
      .toEqual(['togli-assenza'])
  })
  it('su un\'assenza dichiarata dal collega non offre niente', () => {
    expect(vociMenu(cella({ stato: 'assenza' }), stanze, new Map())).toEqual([])
  })
})
```

Run: `cd web && npx vitest run src/pagine/MenuCella.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementare `MenuCella.tsx`**

```tsx
/**
 * Il menu di una cella in modalità modifica. Sul desktop si apre col tasto
 * destro dove si è cliccato; sul telefono il tasto destro non esiste, e lo
 * apre il tocco, in una finestra dal basso.
 */
import { useEffect, useRef } from 'react'
import type { Cella } from '../api'
import { Modale } from '../ui'

export type Voce = { chiave: string; etichetta: string; attuale?: boolean }

export function vociMenu(
  cella: Cella, stanze: { id: number; etichetta: string; capienza: number }[], occupati: Map<number, number>,
): Voce[] {
  if (cella.stato === 'assenza') {
    return cella.perConto && cella.assenzaId != null ? [{ chiave: 'togli-assenza', etichetta: 'Togli l\'assenza' }] : []
  }
  return [
    ...stanze.map((s) => ({
      chiave: `stanza:${s.id}`, etichetta: `${s.etichetta} · ${occupati.get(s.id) ?? 0}/${s.capienza}`,
      attuale: cella.stato === 'presenza' && cella.roomId === s.id,
    })),
    { chiave: 'remoto', etichetta: 'Da remoto', attuale: cella.stato === 'smart' },
    cella.bloccata
      ? { chiave: 'sblocca', etichetta: 'Sblocca: la generazione potrà cambiarla' }
      : { chiave: 'blocca', etichetta: 'Blocca' },
    { chiave: 'assenza', etichetta: 'Registra un\'assenza…' },
    { chiave: 'dettagli', etichetta: 'Dettagli…' },
  ]
}

export function MenuCella({ titolo, voci, posizione, onScegli, onChiudi }: {
  titolo: string
  voci: Voce[]
  /** Dove si è cliccato col tasto destro; null col tocco. */
  posizione: { x: number; y: number } | null
  onScegli: (chiave: string) => void
  onChiudi: () => void
}) {
  const rif = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!posizione) return
    rif.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const fuori = (e: MouseEvent) => { if (!rif.current?.contains(e.target as Node)) onChiudi() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi() }
    document.addEventListener('mousedown', fuori); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuori); document.removeEventListener('keydown', esc) }
  }, [posizione, onChiudi])

  const elenco = (grandi: boolean) => voci.map((v) => (
    <button key={v.chiave} type="button" role="menuitem" onClick={() => onScegli(v.chiave)}
            className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-r1 px-2.5 text-left
                        text-sm hover:bg-surface-2 ${grandi ? 'min-h-[44px]' : 'min-h-[30px]'}
                        ${v.attuale ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
      {v.etichetta}{v.attuale && <span aria-hidden="true">•</span>}
    </button>
  ))

  if (!posizione) {
    return <Modale titolo={titolo} aperta onChiudi={onChiudi}><div role="menu">{elenco(true)}</div></Modale>
  }
  // Resta dentro lo schermo anche cliccando vicino al bordo.
  const x = Math.min(posizione.x, window.innerWidth - 260)
  const y = Math.min(posizione.y, window.innerHeight - voci.length * 30 - 48)
  return (
    <div ref={rif} role="menu" aria-label={titolo}
         className="fixed z-[400] w-[250px] rounded-r2 border border-border-controllo bg-bg p-1 shadow-overlay"
         style={{ left: x, top: y }}>
      <p className="px-2.5 py-1 text-2xs text-ink-faint">{titolo}</p>
      {elenco(false)}
    </div>
  )
}
```

Run: `cd web && npx vitest run src/pagine/MenuCella.test.ts`
Expected: PASS.

- [ ] **Step 5: Griglia in modalità modifica**

`api.ts`, `Periodo`: `revisioneDi: number | null; notaRichiesta: string | null; revisione?: number | null`.

`Griglia` guadagna le prop:

```ts
  /** Modalità modifica: trascinamento e menu. Fuori, la griglia si legge e basta. */
  modifica?: boolean
  onCambia?: (celle: CellaModifica[]) => void
  onMenu?: (s: { userId: number; data: string }, posizione: { x: number; y: number } | null) => void
```

e le gira a `RigaPersona` insieme a `trascinata` (ref condiviso: `const trascinata = useRef<Cella | null>(null)`) e a `indice`. In `RigaPersona`, sul `td` di ogni giornata:

```tsx
onDragOver={(e) => {
  const da = trascinata.current
  if (modifica && da && c && scambio(da, c)) { e.preventDefault(); e.currentTarget.classList.add('outline', 'outline-2', 'outline-ink') }
}}
onDragLeave={(e) => e.currentTarget.classList.remove('outline', 'outline-2', 'outline-ink')}
onDrop={(e) => {
  e.currentTarget.classList.remove('outline', 'outline-2', 'outline-ink')
  const da = trascinata.current; trascinata.current = null
  const esito = da && c ? scambio(da, c) : null
  if (esito) { e.preventDefault(); onCambia?.(esito) }
}}
```

e sul `button`:

```tsx
draggable={modifica && c != null && c.stato !== 'assenza'}
onDragStart={(e) => { trascinata.current = c ?? null; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '') }}
onDragEnd={() => { trascinata.current = null }}
onContextMenu={(e) => { if (!modifica) return; e.preventDefault(); onMenu?.({ userId: p.id, data: g }, { x: e.clientX, y: e.clientY }) }}
onClick={() => {
  // Sul telefono non c'è tasto destro: il tocco apre il menu.
  if (modifica && matchMedia('(pointer: coarse)').matches) onMenu?.({ userId: p.id, data: g }, null)
  else onSeleziona({ userId: p.id, data: g })
}}
```

`c` qui è la cella dell'indice (`indice.get(`${p.id}|${g}`)`), che esiste per ogni persona e giorno perché il server le compila tutte.

Il segno del lucchetto: al posto di `'▪'` usare `<I.Lucchetto size={9} className="inline-block align-[-1px]" />` dentro lo `span` `aria-hidden`; resta `⇄` per `daScambio`. In `Legenda`, la voce «cella bloccata» mostra la stessa icona e il testo «bloccata: la generazione non la tocca; sbloccata torna al generatore».

Occupazione per stanza, nel `tfoot` dopo la riga del totale:

```tsx
{dati.stanze.filter((s) => s.capienza > 0).map((s) => (
  <tr key={s.id}>
    <th scope="row" className="sticky bottom-0 left-0 z-[3] border-r border-border bg-surface px-2.5 py-1
                               text-left text-2xs font-normal text-ink-faint">
      {s.etichetta} <span className="mono">/{s.capienza}</span>
    </th>
    {dati.giorni.map((g) => {
      const n = occupazioneStanza.get(`${g}|${s.id}`) ?? 0
      const tono = n > s.capienza ? 'bg-danger-wash text-danger-ink font-semibold'
        : n === s.capienza ? 'text-ink font-semibold' : 'text-ink-faint'
      return (
        <td key={g} className={`mono sticky bottom-0 z-[1] border-r border-border bg-surface px-1 py-1 text-center text-2xs ${tono}`}>
          {n}<span className="solo-lettori-schermo">{` di ${s.capienza} nella stanza ${s.etichetta} il ${g}`}</span>
        </td>
      )
    })}
  </tr>
))}
```

con

```ts
const occupazioneStanza = useMemo(() => {
  const m = new Map<string, number>()
  for (const c of dati.celle) if (c.stato === 'presenza' && c.roomId != null) {
    const k = `${c.data}|${c.roomId}`; m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}, [dati.celle])
```

(`danger-wash` e `danger-ink` sono i token già usati dalla variante `distruttivo` di `Bottone`.)

- [ ] **Step 6: Turni: tasto, banner, azioni**

In `Turni.tsx`:

```tsx
const [modifica, setModifica] = useState(false)
const [menu, setMenu] = useState<{ sel: { userId: number; data: string }; pos: { x: number; y: number } | null } | null>(null)
const [assenzaPer, setAssenzaPer] = useState<{ userId: number; data: string } | null>(null)
const [richiestaAperta, setRichiestaAperta] = useState(false)
```

Nella toolbar, se `inGriglia && p && scrivibile`:

```tsx
<Bottone variante={modifica ? 'primario' : 'normale'} aria-pressed={modifica}
         onClick={() => void azione.esegui(async () => {
           if (modifica) { setModifica(false); return }
           // Il pubblicato non si tocca: si lavora sul suo gemello.
           if (p.stato === 'pubblicato') {
             const { id: gid } = await api.post<{ id: number }>(`/periodi/${p.id}/revisione`)
             navigate(`/turni/${gid}`)
           }
           setModifica(true)
         }, 'modifica')}>
  <I.Matita size={15} />{modifica ? 'Fine' : 'Modifica'}
</Bottone>
```

Il comando esistente «Invia» diventa «Richiedi approvazione» quando `p.revisioneDi != null` e apre `setRichiestaAperta(true)` invece di inviare subito. Sopra la griglia, nella colonna dei messaggi:

```tsx
{p.revisioneDi != null && (
  <Messaggio tono="info" titolo={`Revisione della v${p.versione}`}>
    I colleghi vedono ancora la versione pubblicata finché questa non è approvata.
    <span className="mt-1.5 flex gap-2">
      <Bottone variante="distruttivo" onClick={() => void azione.esegui(async () => {
        if (!confirm('Scartare la revisione? Le modifiche fatte qui si perdono.')) return
        const r = await api.del<{ originale: number }>(`/periodi/${p.id}`)
        setModifica(false); await caricaPeriodi(); navigate(`/turni/${r.originale}`)
      }, 'scarta')}>Scarta revisione</Bottone>
    </span>
  </Messaggio>
)}
{p.revisione != null && (
  <Messaggio tono="attenzione">
    C'è una revisione aperta di questo periodo. <a className="underline" href={`/turni/${p.revisione}`}>Aprila</a>.
  </Messaggio>
)}
```

(`p.revisione` arriva dall'elenco, non dalla griglia: al posto di `p.revisione` usare `periodi?.find((x) => x.id === p.id)?.revisione`. `api.del` esiste già.)

`ModaleNota` per la richiesta:

```tsx
<ModaleNota titolo="Richiedi approvazione" etichetta="Nota per il dirigente" obbligatoria={false}
            conferma="Richiedi" aperta={richiestaAperta} onChiudi={() => setRichiestaAperta(false)}
            onConferma={async (nota) => {
              await api.post(`/periodi/${p.id}/invia`, { nota: nota || undefined })
              setModifica(false); await caricaGriglia(p.id); await caricaPeriodi()
            }} />
```

Alla `Griglia`:

```tsx
<Griglia dati={dati} selezione={selezione} onSeleziona={setSelezione} raggruppa={raggruppaGriglia} ioId={utente.id}
         modifica={modifica && modificabile}
         onCambia={(celle) => void azione.esegui(async () => {
           await api.put(`/periodi/${p.id}/celle`, { celle }); await caricaGriglia(p.id)
         })}
         onMenu={(sel, pos) => setMenu({ sel, pos })} />
```

Il menu e le sue azioni:

```tsx
{menu && (() => {
  const c = dati.celle.find((x) => x.userId === menu.sel.userId && x.data === menu.sel.data)!
  const chi = dati.persone.find((x) => x.id === c.userId)!
  const occupati = new Map<number, number>()
  for (const x of dati.celle) if (x.data === c.data && x.stato === 'presenza' && x.roomId != null) {
    occupati.set(x.roomId, (occupati.get(x.roomId) ?? 0) + 1)
  }
  const scrivi = (m: Partial<CellaModifica>) => void azione.esegui(async () => {
    await api.put(`/periodi/${p.id}/celle`, { celle: [{
      userId: c.userId, data: c.data, stato: c.stato === 'presenza' ? 'presenza' : 'smart',
      roomId: c.roomId, deskId: c.deskId, bloccata: true, ...m,
    }] })
    await caricaGriglia(p.id)
  })
  return (
    <MenuCella
      titolo={`${chi.cognome} · ${c.data}`} posizione={menu.pos}
      voci={vociMenu(c, dati.stanze, occupati)}
      onChiudi={() => setMenu(null)}
      onScegli={(k) => {
        setMenu(null)
        if (k.startsWith('stanza:')) scrivi({ stato: 'presenza', roomId: Number(k.slice(7)), deskId: null })
        else if (k === 'remoto') scrivi({ stato: 'smart', roomId: null, deskId: null })
        else if (k === 'blocca') scrivi({ bloccata: true })
        else if (k === 'sblocca') scrivi({ bloccata: false })
        else if (k === 'dettagli') setSelezione(menu.sel)
        else if (k === 'assenza') setAssenzaPer(menu.sel)
        else if (k === 'togli-assenza') void azione.esegui(async () => {
          await api.del(`/assenze/${c.assenzaId}`); await caricaGriglia(p.id)
        })
      }}
    />
  )
})()}
```

Escludere il gemello dalla sovrapposizione del `select` dei periodi: in `etichettaPeriodo`, se `p.revisioneDi != null` il suffisso è ` · revisione`.

Tornando ai giorni la modalità si spegne: `useEffect(() => { if (!inGriglia) setModifica(false) }, [inGriglia])`. Il passaggio dall'originale al gemello resta dentro la griglia, quindi la modalità sopravvive alla navigazione; chi cambia periodo dal menu a tendina la spegne con «Fine».

- [ ] **Step 7: Registrare un'assenza dalla griglia**

In `periodo.tsx`, nuovo export:

```tsx
/** Un'assenza registrata per un collega, dal menu della griglia. */
export function ModaleAssenzaPerConto({ persona, data, aperta, onChiudi, onFatto }: {
  persona: { id: number; nome: string; cognome: string } | null
  data: string; aperta: boolean; onChiudi: () => void; onFatto: () => void
}) {
  const [causali, setCausali] = useState<{ codice: string; etichetta: string }[]>([])
  const [causale, setCausale] = useState('')
  const [dal, setDal] = useState(data)
  const [al, setAl] = useState(data)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!aperta) return
    setDal(data); setAl(data); setErrore(null)
    void api.get<{ codice: string; etichetta: string }[]>('/assenze/causali')
      .then((c) => { setCausali(c); setCausale(c[0]?.codice ?? '') })
  }, [aperta, data])

  async function registra() {
    if (!persona) return
    try {
      await api.post('/assenze', { userId: persona.id, dataInizio: dal, dataFine: al, causale })
      onFatto(); onChiudi()
    } catch (e) { setErrore(e instanceof ErroreApi ? e.message : 'Registrazione non riuscita.') }
  }

  return (
    <Modale titolo={`Assenza per ${persona ? `${persona.nome} ${persona.cognome}` : ''}`} aperta={aperta} onChiudi={onChiudi}
            piede={<><Bottone onClick={onChiudi}>Annulla</Bottone>
                     <Bottone variante="primario" onClick={() => void registra()}>Registra</Bottone></>}>
      <div className="flex flex-col gap-3">
        {errore && <Messaggio tono="errore">{errore}</Messaggio>}
        <Messaggio tono="info">La persona riceve un avviso. Nella griglia l'assenza compare come ⊗.</Messaggio>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etichetta="Dal"><input type="date" className={inputCls} value={dal} onChange={(e) => setDal(e.target.value)} /></Campo>
          <Campo etichetta="Al"><input type="date" className={inputCls} value={al} min={dal} onChange={(e) => setAl(e.target.value)} /></Campo>
        </div>
        <Campo etichetta="Causale">
          <select className={inputCls} value={causale} onChange={(e) => setCausale(e.target.value)}>
            {causali.map((c) => <option key={c.codice} value={c.codice}>{c.etichetta}</option>)}
          </select>
        </Campo>
      </div>
    </Modale>
  )
}
```

In `Turni.tsx`:

```tsx
{dati && p && (
  <ModaleAssenzaPerConto
    persona={assenzaPer ? dati.persone.find((x) => x.id === assenzaPer.userId) ?? null : null}
    data={assenzaPer?.data ?? ''} aperta={assenzaPer != null}
    onChiudi={() => setAssenzaPer(null)} onFatto={() => void caricaGriglia(p.id)} />
)}
```

- [ ] **Step 8: Editor di cella: lucchetto acceso, niente motivazione obbligatoria**

In `EditorCella` (`periodo.tsx`): nell'effetto iniziale `setBloccata(true)` (salvare a mano è una modifica a mano; per tornare al generatore si toglie la spunta); il testo sotto la casella diventa «La generazione non la tocca. Toglila per restituirla al generatore.»; il campo motivazione perde `required` e l'`aiuto` diventa «Facoltativa: resta nello storico.»; il blocco `{pubblicato && …}` si mostra sempre, e `pubblicato` sparisce. `EditorCella` riceve `abilitato={modificabile && modifica}` da `Turni.tsx`.

- [ ] **Step 9: Tipi e test**

Run: `npm test && cd web && npx tsc -b`
Expected: verde.

- [ ] **Step 10: Verifica a mano (1280px)**

Da organizzatore seed:
1. Bozza → «Modifica»: trascinare in verticale due persone nello stesso giorno → si scambiano, compare il lucchetto su entrambe. Trascinare in orizzontale una giornata remota su una in sede della stessa persona → si scambiano. Un'assenza non si trascina e non accetta trascinamenti.
2. Tasto destro → stanza con `2/2` → si sposta; la riga di occupazione della stanza diventa rossa e l'avviso «da risolvere» compare; «Richiedi approvazione» / «Invia» risponde con l'errore di conflitto. Rimettere a posto → invio possibile.
3. Tasto destro → «Sblocca» → il lucchetto sparisce; «Genera» può cambiare quella cella e non tocca quelle bloccate.
4. Tasto destro → «Registra un'assenza…» → ⊗ nella cella; tasto destro sulla ⊗ → «Togli l'assenza». Su una × il menu non si apre.
5. Periodo pubblicato → «Modifica» → si passa al gemello, banner «Revisione della vN»; da un altro browser un dipendente vede ancora la versione pubblicata. «Richiedi approvazione» con nota → da dirigente «Pubblica» → il dipendente vede la nuova giornata e riceve l'avviso.
6. «Scarta revisione» su un secondo gemello → si torna all'originale, invariato.

- [ ] **Step 11: Verifica a mano (390px)**

In modalità modifica, il tocco su una cella apre il menu dal basso con voci alte 44px; lo scorrimento della griglia non avvia trascinamenti.

- [ ] **Step 12: Commit**

```bash
git add web/src/api.ts web/src/pagine/Griglia.tsx web/src/pagine/Griglia.test.ts \
        web/src/pagine/MenuCella.tsx web/src/pagine/MenuCella.test.ts \
        web/src/pagine/Turni.tsx web/src/pagine/periodo.tsx
git commit -m "feat: la griglia si modifica trascinando, col tasto destro o col tocco, e il lucchetto si vede"
```

---

### Task 11: Documentazione

**Files:**
- Modify: `README.md` («Cosa fa», «Stato»)
- Modify: `docs/MANUALE.md`

- [ ] **Step 1: README**

In «Cosa fa»:
- «Programma per periodi»: aggiungere che la griglia si modifica trascinando (stesso giorno fra persone, stessa persona fra giorni), col tasto destro o col tocco; che una modifica a mano si blocca da sola e sbloccata torna al generatore; che un periodo pubblicato si rivede in una revisione, invisibile ai colleghi fino all'approvazione.
- «Genera una proposta»: le stanze tengono insieme lo stesso settore.
- «Non supera mai la capienza»: si può sforare a mano, ma una stanza sforata impedisce di chiedere l'approvazione.
- «Assenze dichiarate dagli interessati»: chi programma può registrarne una per un collega, che viene avvisato; in griglia ha un segno proprio.
- «Notifiche»: promemoria della sera prima, per chi lo accende.
- «Funziona senza rete»: anche chi c'è in sede, senza causali.
Aggiungere una riga sulla sede delle stanze e sulle preferenze di partenza di Turni e Mio.

In «Stato», fra i rinviati:

```markdown
- server MCP locale per operare su Turni interrogando un assistente AI
```

- [ ] **Step 2: MANUALE**

Aggiungere, nelle sezioni pertinenti (cercarle con `grep -n "^#" docs/MANUALE.md`):
- **Modificare la griglia**: tasto «Modifica», trascinamento nei due versi, menu (tasto destro / tocco), lucchetto e sblocco, occupazione per stanza e conflitti che fermano l'invio.
- **Rivedere un periodo pubblicato**: revisione, banner, «Richiedi approvazione» con nota facoltativa, «Scarta revisione», scambi sospesi, cosa vedono i colleghi.
- **Assenze per conto**: chi può, il segno ⊗, l'avviso all'interessato, chi le può togliere.
- **Stanze**: il campo sede e la colonna `sede` di `stanze.csv`.
- **Preferenze personali**: vista di partenza di Turni, chip di Mio, promemoria.
- **Promemoria (installazione)**: la riga di cron in hPanel

```
0 16 * * * cd ~/turni && npm run promemoria >> ~/turni/promemoria.log 2>&1
```

con la nota: il cron del server gira in UTC; `0 16` sono le 18 italiane con l'ora legale, d'inverno le 17. Per le 18 tutto l'anno usare `0 16,17 * * *`: il secondo invio non parte, perché lo script salta chi ha già ricevuto il promemoria oggi.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/MANUALE.md
git commit -m "docs: README e manuale raccontano modifica, revisioni, sedi e promemoria"
```

---

## Self-review

- **Copertura della spec:** 0 → Task 0; 1 → Task 1; 2 → Task 2; 3 → Task 3; 4 → Task 4; 5 → Task 5; 6 → Task 6; 7 → Task 7; 8 → Task 8; 9 → Task 9; 10 (revisione) → 10a; 10 (celle, lucchetto, motivazione, capienza, invio bloccato) → 10b; 10 (generazione per settore) → 10c; 10 (interfaccia, desktop e telefono, ⊗ nel menu) → 10d; 11 → Task 11. Scambi sospesi → 10a step 7.
- **Nomi coerenti:** `ModaleNota` (1 → 10d), `CellaModifica` e `scambio` (10d), `vociMenu`/`MenuCella` (10d), `puoRegistrareAssenzaPer` (9), `giorniIndisponibiliDettaglio` (9 → 10b usa `giorniIndisponibili`), `sforamenti` (10b), `assegnaStanze` e `stanzePrecedenti` (10c), `revisioneDi`/`notaRichiesta`/`revisione` (10a → 10d).
- **Dipendenze fra task:** 10d richiede 1, 4, 9, 10a, 10b; 10c è indipendente dall'interfaccia; 7 richiede che `utente` sia letto in `Mio` (lo è dal commit del PNG).
