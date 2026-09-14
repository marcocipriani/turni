# Turni Print, Export, and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Settimana/Mese/Griglia navigation, clean CSV and PNG downloads, improved printed documents, and push/reminder switches in the user menu.

**Architecture:** Keep the current APIs and React routes. Add pure document-model functions shared by print and export, render print as HTML and PNG directly on canvas, and use a narrow preference patch endpoint for the menu reminder switch. No new runtime dependency is required.

**Tech Stack:** React 19, TypeScript, Canvas 2D, Hono, Drizzle ORM, MariaDB, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-09-13-turni-stampa-esportazioni-design.md`

## Global Constraints

- Preserve the current uncommitted Mese and historical-validation work; do not reset or replace it.
- `/turni` opens Settimana for every user; Saturday and Sunday advance to the next Monday in `Europe/Rome`.
- Screen symbols remain `⊗` for organization-entered absence and `×` for user-entered absence.
- Printed absence is always `×`; printed smart working is a house; rooms use prominent monochrome number boxes.
- PNG output is a clean document, never a screenshot of the application chrome.
- Do not add an image library; reuse Canvas 2D and the existing download/share pattern from `Mio.tsx`.
- Do not modify production scheduling data.
- Do not commit or push unless Marco separately requests Git publication; the commit commands below are logical checkpoints for an explicitly authorized Git run.

---

### Task 1: Define calendar start and view semantics

**Files:**
- Create: `web/src/pagine/turniVista.ts`
- Create: `web/src/pagine/turniVista.test.ts`
- Modify: `web/src/pagine/Turni.tsx`
- Modify: `web/src/pagine/Assenze.tsx`

**Interfaces:**
- Produces: `inizioSettimanaTurni(oggi: string): string` and `type VistaTurni = 'settimana' | 'mese' | 'griglia'`.
- Consumes: existing `addDays()` and `lunediDi()` from `web/src/date.ts`.

- [ ] **Step 1: Write the failing weekend tests**

```ts
import { describe, expect, it } from 'vitest'
import { inizioSettimanaTurni } from './turniVista'

describe('inizio della vista Settimana', () => {
  it('usa il lunedì corrente nei feriali', () => {
    expect(inizioSettimanaTurni('2026-09-16')).toBe('2026-09-14')
  })
  it('sabato e domenica avanzano al lunedì successivo', () => {
    expect(inizioSettimanaTurni('2026-09-19')).toBe('2026-09-21')
    expect(inizioSettimanaTurni('2026-09-20')).toBe('2026-09-21')
  })
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test --workspace web -- web/src/pagine/turniVista.test.ts`

Expected: FAIL because `turniVista.ts` does not exist.

- [ ] **Step 3: Add the minimal date helper**

```ts
import { addDays, lunediDi } from '../date'

export type VistaTurni = 'settimana' | 'mese' | 'griglia'

export function inizioSettimanaTurni(oggi: string) {
  const lunedi = lunediDi(oggi)
  const scarto = Math.round((Date.parse(`${oggi}T00:00:00Z`) - Date.parse(`${lunedi}T00:00:00Z`)) / 86_400_000)
  return scarto >= 5 ? addDays(lunedi, 7) : lunedi
}
```

- [ ] **Step 4: Update Turni navigation**

In `Turni.tsx`:

- initialize `inizio` with `inizioSettimanaTurni(oggiISO())`;
- remove the effect that redirects `/turni` using `utente.preferenze.vistaTurni`;
- label and order the view controls `Settimana`, `Mese`, `Griglia`;
- use `/turni?vista=settimana` as the explicit weekly URL while keeping bare `/turni` weekly;
- render the 1/2/4 controls as visible text `1`, `2`, `4`, retaining `aria-label="1 settimana"`, `aria-label="2 settimane"`, `aria-label="4 settimane"`;
- make the “Oggi” action return to `inizioSettimanaTurni(oggiISO())`.

Remove the `Turni si apre su` fieldset from `Assenze.tsx`. Keep `vistaTurni` in its request type and payload for backward-compatible server writes.

- [ ] **Step 5: Run the focused and existing date tests**

Run: `npm test --workspace web -- web/src/pagine/turniVista.test.ts web/src/date.test.ts`

Expected: PASS.

- [ ] **Step 6: Logical commit checkpoint**

```bash
git add web/src/pagine/turniVista.ts web/src/pagine/turniVista.test.ts web/src/pagine/Turni.tsx web/src/pagine/Assenze.tsx
git commit -m "feat: rende Settimana la vista iniziale di Turni"
```

---

### Task 2: Build shared print models and symbol rules

**Files:**
- Create: `web/src/pagine/documentiTurni.ts`
- Create: `web/src/pagine/documentiTurni.test.ts`
- Modify: `web/src/pagine/Stampa.tsx`
- Modify: `web/src/pagine/Griglia.tsx`

**Interfaces:**
- Produces: `gruppiDocumento(dati, raggruppa)`, `occupazioneDocumento(dati)`, `simboloStampa(cella)`, and `schedeGiorno(giorno, stanze, settori)`.
- Consumes: `Griglia`, `Cella`, `DatiGiorni`, and `Stanza` from current API/view types.

- [ ] **Step 1: Write failing tests for symbols, week borders, grouping, and occupancy**

Use a fixture with two sectors, two rooms, two Mondays and presence/smart/absence cells. Assert:

```ts
expect(simboloStampa({ stato: 'smart' })).toBe('casa')
expect(simboloStampa({ stato: 'assenza', perConto: false })).toBe('×')
expect(simboloStampa({ stato: 'assenza', perConto: true })).toBe('×')
expect(simboloStampa({ stato: 'presenza', roomId: 5 }, stanze)).toBe('3016')
expect(occupazioneDocumento(griglia).totali.get('2026-09-14')).toBe(2)
expect(occupazioneDocumento(griglia).stanze.get('2026-09-14|5')).toBe(1)
expect(gruppiDocumento(griglia, true).map(g => g.titolo)).toEqual(['Segreteria', 'Statistica'])
```

- [ ] **Step 2: Run the document-model test and confirm RED**

Run: `npm test --workspace web -- web/src/pagine/documentiTurni.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure document model**

Define these exact result shapes:

```ts
export type GruppoDocumento = { titolo: string | null; persone: Persona[] }
export type OccupazioneDocumento = {
  totali: Map<string, number>
  stanze: Map<string, number>
}
export type SchedaGiorno = {
  chiave: string
  titolo: string
  contatore: string
  persone: { userId: number; nome: string; settore: string | null; scrivania: string | null }[]
}
```

`schedeGiorno()` must return every shared room in server order, followed by Smart working and Assenti, including groups with zero people. Room counters use `n/capienza`; the final two use `n`.

- [ ] **Step 4: Make the screen legend permanently visible**

Remove the `<details>` legend from the Turni toolbar. Render `Legenda` beneath Griglia and beneath Mese, outside the horizontally scrolling table. Preserve these exact labels:

```tsx
<span>⊗ assenza registrata dall'organizzazione</span>
<span>× assenza dichiarata</span>
```

Keep `descriviCella()` unchanged where it already distinguishes the two sources; extend its tests only if the rendered symbol mapping is moved into a helper.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `npm test --workspace web -- web/src/pagine/documentiTurni.test.ts web/src/pagine/Griglia.test.ts`

Expected: PASS.

- [ ] **Step 6: Logical commit checkpoint**

```bash
git add web/src/pagine/documentiTurni.ts web/src/pagine/documentiTurni.test.ts web/src/pagine/Griglia.tsx web/src/pagine/Turni.tsx web/src/pagine/Mese.tsx
git commit -m "feat: unifica legenda e modello dei documenti Turni"
```

---

### Task 3: Improve the printed period grid

**Files:**
- Modify: `web/src/pagine/Stampa.tsx`
- Modify: `web/src/styles/app.css`
- Test: `web/src/pagine/documentiTurni.test.ts`
- Test: `web/src/verifiche/telefono.test.ts`

**Interfaces:**
- Consumes: `gruppiDocumento()`, `occupazioneDocumento()`, and `simboloStampa()` from Task 2.
- Produces: printed grid with sector grouping, weekly separators, occupancy footer, and legend.

- [ ] **Step 1: Add failing assertions for the print contract**

Add a pure helper `classeSettimana(data, indice)` and assert:

```ts
expect(classeSettimana('2026-09-14', 5)).toBe('inizio-settimana')
expect(classeSettimana('2026-09-15', 6)).toBe('')
```

In `telefono.test.ts`, assert that print CSS contains `.inizio-settimana`, `.stanza-stampa`, and `print-color-adjust`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test --workspace web -- web/src/pagine/documentiTurni.test.ts web/src/verifiche/telefono.test.ts`

Expected: FAIL because the new classes and helper are absent.

- [ ] **Step 3: Change the print controls and default grouping**

Treat grouping as active unless the URL contains `gruppi=0`:

```ts
const raggruppa = query.get('gruppi') !== '0'
```

The checkbox writes `gruppi=0` only when unchecked and deletes the parameter when checked.

- [ ] **Step 4: Render the new matrix details**

In every header, body, and occupancy cell, add `inizio-settimana` when the date is a Monday after the first displayed column. Render:

- presence as `<span className="stanza-stampa">3016</span>`;
- smart as `<I.Remoto size={11} />` with accessible text `Smart working`;
- either absence source as `×`;
- `<tfoot>` with `Postazioni occupate su N`, followed by one row per active shared room using `n/capienza`;
- `Legenda` below the table, visible in print.

- [ ] **Step 5: Add monochrome print CSS**

```css
@media print {
  .inizio-settimana { border-left: 2px solid var(--border-strong) !important; }
  .stanza-stampa { display: inline-block; border: 1px solid var(--ink); border-radius: 2px; padding: 0 2px; font-weight: 700; }
  .legenda-stampa { break-inside: avoid; margin-top: 4mm; }
}
```

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `npm test --workspace web -- web/src/pagine/documentiTurni.test.ts web/src/verifiche/telefono.test.ts`

Expected: PASS.

- [ ] **Step 7: Logical commit checkpoint**

```bash
git add web/src/pagine/Stampa.tsx web/src/styles/app.css web/src/pagine/documentiTurni.test.ts web/src/verifiche/telefono.test.ts
git commit -m "feat: completa la griglia stampata"
```

---

### Task 4: Replace daily print sections with nested cards

**Files:**
- Modify: `web/src/pagine/Stampa.tsx`
- Modify: `web/src/styles/app.css`
- Test: `web/src/pagine/documentiTurni.test.ts`

**Interfaces:**
- Consumes: `schedeGiorno()` from Task 2.
- Produces: one outer day card containing room, Smart working, and Assenti cards.

- [ ] **Step 1: Add a failing card-model test**

```ts
const schede = schedeGiorno(giorno, stanze, settori)
expect(schede.map(s => [s.titolo, s.contatore])).toEqual([
  ['1028', '1/2'], ['1032', '0/2'], ['3016', '1/3'],
  ['Smart working', '4'], ['Assenti', '2'],
])
expect(schede[1]!.persone).toEqual([])
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test --workspace web -- web/src/pagine/documentiTurni.test.ts`

Expected: FAIL until empty room cards and both final cards are returned.

- [ ] **Step 3: Render the nested cards**

Replace the current room list plus remote sentence in `FoglioGiorni` with:

```tsx
<section className="giorno-stampa">
  <header>{esteso(g.data)} · {g.presenti.length}/{g.capienza} in sede</header>
  <div className="schede-giorno-stampa">
    {schedeGiorno(g, dati.stanze, settori).map(s => <SchedaStampa key={s.chiave} scheda={s} />)}
  </div>
</section>
```

Each inner card displays title, counter, full names, optional sector, and desk. Use borders, font weight, and spacing only; do not assign room colors.

- [ ] **Step 4: Add print layout rules**

Use three inner columns in portrait A4, two below 720px screen width, and `break-inside: avoid` on the outer day card. Preserve page overflow rules already covered by `telefono.test.ts`.

- [ ] **Step 5: Run the focused test and build**

Run: `npm test --workspace web -- web/src/pagine/documentiTurni.test.ts && npm run build --workspace web`

Expected: PASS and successful TypeScript/Vite build.

- [ ] **Step 6: Logical commit checkpoint**

```bash
git add web/src/pagine/Stampa.tsx web/src/styles/app.css web/src/pagine/documentiTurni.test.ts
git commit -m "feat: stampa ogni giornata come gruppo di card"
```

---

### Task 5: Make print Back close to the originating view

**Files:**
- Create: `web/src/pagine/stampaRitorno.ts`
- Create: `web/src/pagine/stampaRitorno.test.ts`
- Modify: `web/src/pagine/Turni.tsx`
- Modify: `web/src/pagine/Mio.tsx`
- Modify: `web/src/pagine/Stampa.tsx`

**Interfaces:**
- Produces: `urlStampa(cosa, ritorno, params)` and `ritornoSicuro(value, fallback)`.
- Consumes: current `location.pathname` and `location.search` from React Router.

- [ ] **Step 1: Write failing URL and safety tests**

```ts
expect(urlStampa('periodo', '/turni/7', { id: '7' }))
  .toBe('/stampa/periodo?id=7&ritorno=%2Fturni%2F7')
expect(ritornoSicuro('/turni?vista=mese&mese=2026-09', '/turni'))
  .toBe('/turni?vista=mese&mese=2026-09')
expect(ritornoSicuro('https://example.com', '/turni')).toBe('/turni')
expect(ritornoSicuro('//example.com', '/turni')).toBe('/turni')
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test --workspace web -- web/src/pagine/stampaRitorno.test.ts`

Expected: FAIL because the helper module is absent.

- [ ] **Step 3: Implement safe internal return URLs**

Allow only values beginning with one `/` and reject `//`. `urlStampa()` must encode the exact source path and query.

- [ ] **Step 4: Wire all print entry points**

Use `useLocation()` in Turni and Mio. Every print link passes `ritorno`. The print-type pills preserve the existing query, including `ritorno`. The Indietro button executes:

```ts
navigate(ritornoSicuro(query.get('ritorno'), scelta === 'mio' ? '/mio' : '/turni'), { replace: true })
```

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `npm test --workspace web -- web/src/pagine/stampaRitorno.test.ts`

Expected: PASS.

- [ ] **Step 6: Logical commit checkpoint**

```bash
git add web/src/pagine/stampaRitorno.ts web/src/pagine/stampaRitorno.test.ts web/src/pagine/Turni.tsx web/src/pagine/Mio.tsx web/src/pagine/Stampa.tsx
git commit -m "fix: chiude la stampa sulla vista di origine"
```

---

### Task 6: Add CSV and clean PNG to all three Turni views

**Files:**
- Create: `web/src/esportaTurni.ts`
- Create: `web/src/esportaTurni.test.ts`
- Modify: `web/src/pagine/Giorni.tsx`
- Modify: `web/src/pagine/Mese.tsx`
- Modify: `web/src/pagine/Turni.tsx`
- Modify: `web/src/pagine/Mio.tsx`

**Interfaces:**
- Produces: `csvDaGiorni(dati)`, `csvDaGriglia(dati)`, `scaricaCsv(nome, testo)`, `pngGiorni(dati)`, and `pngGriglia(dati, raggruppa)`.
- Consumes: document-model functions from Task 2 and the existing `DatiGiorni`/`Griglia` payloads.

- [ ] **Step 1: Write failing CSV tests**

Assert the exact header and representative rows:

```ts
expect(csvDaGriglia(griglia)).toContain('data;persona;settore;stato;stanza;scrivania')
expect(csvDaGriglia(griglia)).toContain('2026-09-14;Rossi Anna;Segreteria;presenza;3016;')
expect(csvDaGiorni(giorni)).toContain('2026-09-14;Verdi Luca;Statistica;smart;;')
```

Also assert that missing month cells and non-programmed weekend columns do not create CSV rows.

- [ ] **Step 2: Run CSV tests and confirm RED**

Run: `npm test --workspace web -- web/src/esportaTurni.test.ts`

Expected: FAIL because `esportaTurni.ts` is absent.

- [ ] **Step 3: Implement CSV normalization and download**

Escape semicolons, quotes, CR and LF with RFC-style double quotes; prepend UTF-8 BOM for spreadsheet compatibility. Use filenames:

```text
turni-settimana-YYYY-MM-DD.csv
turni-mese-YYYY-MM.csv
turni-griglia-YYYY-MM-DD_YYYY-MM-DD.csv
```

- [ ] **Step 4: Write failing PNG layout tests**

Keep pixel drawing behind a pure layout phase. Assert:

```ts
expect(layoutPngGiorni(giorni).giorni[0]!.schede).toHaveLength(5)
expect(layoutPngGriglia(griglia, true).righe.at(-1)?.tipo).toBe('occupazione-stanza')
expect(layoutPngGriglia(griglia, true).legenda).toEqual([
  'stanza = in sede', '⌂ = smart working', '× = assenza',
])
```

- [ ] **Step 5: Run PNG layout tests and confirm RED**

Run: `npm test --workspace web -- web/src/esportaTurni.test.ts`

Expected: FAIL until both layouts are produced.

- [ ] **Step 6: Implement Canvas 2D renderers**

Use a fixed white background, black/dark gray text, 2× pixel scale, Inter/JetBrains Mono, borders without room colors, and these output widths:

```ts
const LARGHEZZA_CARTE = 1200
const LARGHEZZA_GRIGLIA = Math.max(1200, 220 + dati.giorni.length * 54)
```

Draw the house as a vector path, not a font glyph. Draw room numbers inside stroked rounded rectangles. Use the same counters, group titles, week separators, occupancy rows, and legend as print. Reuse the existing `navigator.canShare`/download fallback from Mio by extracting `salvaPng(canvas, nome)` into `esportaTurni.ts` and calling it from Mio.

- [ ] **Step 7: Expose loaded view data to Turni**

Use the existing `Giorni.onCaricato`. Add to Mese:

```ts
onCaricato?: (dati: DatiGriglia | null) => void
```

Call it after `componiMese()` changes and with `null` while loading. Store current weekly/month/grid data in Turni and enable the export buttons only when the selected view has data.

- [ ] **Step 8: Add six direct-download commands**

In the `Vista` actions, always render CSV and PNG icon buttons for Settimana, Mese, and Griglia. Use `I.Scarica` for CSV and `I.Immagine` for PNG, with view-specific accessible labels. Keep the print icon alongside them.

- [ ] **Step 9: Run focused tests and confirm GREEN**

Run: `npm test --workspace web -- web/src/esportaTurni.test.ts web/src/pagine/Mese.test.ts web/src/pagine/Mio.test.ts`

Expected: PASS.

- [ ] **Step 10: Logical commit checkpoint**

```bash
git add web/src/esportaTurni.ts web/src/esportaTurni.test.ts web/src/pagine/Giorni.tsx web/src/pagine/Mese.tsx web/src/pagine/Turni.tsx web/src/pagine/Mio.tsx
git commit -m "feat: esporta ogni vista Turni in CSV e PNG"
```

---

### Task 7: Move both notification switches into the user menu

**Files:**
- Create: `web/src/notifichePush.ts`
- Create: `web/src/notifichePush.test.ts`
- Modify: `server/src/routes/absences.ts`
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/routes/regressioni.test.ts`
- Modify: `web/src/api.ts`
- Modify: `web/src/navigazione.tsx`
- Modify: `web/src/pagine/Notifiche.tsx`
- Modify: `web/src/pagine/Assenze.tsx`

**Interfaces:**
- Produces server endpoint: `PATCH /api/assenze/preferenze` with body `{ promemoriaSera: boolean }`.
- Produces web helpers: `leggiPush()`, `impostaPush(attivo)`, and `descriviErrorePush()`.
- Extends `Utente.preferenze` with `promemoriaSera: boolean`.

- [ ] **Step 1: Add a failing MariaDB route test**

Mount `auth` in the regression test app and assert:

```ts
expect((await richiesta(collega, 'PATCH', '/assenze/preferenze', { promemoriaSera: true })).status).toBe(200)
const preferenze = await (await richiesta(collega, 'GET', '/assenze/preferenze')).json()
expect(preferenze.promemoriaSera).toBe(true)
expect(preferenze.giorniPreferiti).toEqual([])
```

Then send `{ promemoriaSera: 'sì' }` and expect 422.

- [ ] **Step 2: Run the opt-in route test and confirm RED**

Create a temporary `turni_review_menu_*` database, run `npm run migra`, then run:

```bash
TURNI_TEST_DATABASE_URL='mysql://marco@localhost/turni_review_menu_20260913?socketPath=/tmp/mysql.sock' npm test --workspace server -- server/src/routes/regressioni.test.ts
```

Expected: FAIL with 404 for PATCH.

- [ ] **Step 3: Add the narrow preference endpoint**

Validate exactly `{ promemoriaSera: boolean }`, upsert only that column, return `{ ok: true }`, and leave day preferences, notes, Turni view, and Mio filters unchanged.

In `/auth/me`, return:

```ts
preferenze: {
  vistaTurni: pref?.vistaTurni === 'griglia' ? 'griglia' : 'giorni',
  filtriMio: pref?.filtriMio?.length ? pref.filtriMio : ['presenza'],
  promemoriaSera: Boolean(pref?.promemoriaSera),
}
```

- [ ] **Step 4: Run the MariaDB route test and confirm GREEN**

Run the same command as Step 2. Expected: PASS. Drop only the named temporary review database after the test.

- [ ] **Step 5: Write failing push-state tests**

Inject the browser operations into a small controller and assert states `non-supportate`, `spente`, `accese`, `negate`, and `non-configurate`. Assert that disabling calls server deletion before local `unsubscribe()` and enabling posts endpoint and keys.

- [ ] **Step 6: Run push tests and confirm RED**

Run: `npm test --workspace web -- web/src/notifichePush.test.ts`

Expected: FAIL because `notifichePush.ts` is absent.

- [ ] **Step 7: Extract push subscription operations**

Move the logic currently private to `Notifiche.tsx` into `notifichePush.ts`. `leggiPush()` must inspect the current service-worker registration and subscription. `impostaPush(false)` posts `/notifiche/push/disiscrivi` with the endpoint, then unsubscribes locally. `impostaPush(true)` reuses `/notifiche/push/chiave` and `/notifiche/push/iscrivi`.

- [ ] **Step 8: Add both menu switches**

In `MenuUtente`, load push state when the menu opens. Add two accessible `role="switch"` controls:

```text
Push su questo dispositivo
Promemoria sera prima
```

Push updates immediately and displays a short state/error line. Reminder calls PATCH, then `ricarica()` from `useSessione`; while either request is pending, disable only its own switch.

Remove `Attiva le push` from `Notifiche.tsx`. Remove the reminder checkbox and its push explanatory text from `Assenze.tsx`; keep the rest of the preference form unchanged.

- [ ] **Step 9: Run focused tests and confirm GREEN**

Run: `npm test --workspace web -- web/src/notifichePush.test.ts && npm run build --workspace web`

Expected: PASS and successful build.

- [ ] **Step 10: Logical commit checkpoint**

```bash
git add server/src/routes/absences.ts server/src/routes/auth.ts server/src/routes/regressioni.test.ts web/src/api.ts web/src/notifichePush.ts web/src/notifichePush.test.ts web/src/navigazione.tsx web/src/pagine/Notifiche.tsx web/src/pagine/Assenze.tsx
git commit -m "feat: porta push e promemoria nel menu utente"
```

---

### Task 8: Documentation, full verification, and production release

**Files:**
- Modify: `README.md`
- Modify: `docs/MANUALE.md`
- Verify: all files changed in Tasks 1–7

**Interfaces:**
- Consumes: completed behavior from all previous tasks.
- Produces: documented, tested, backed-up, deployed release.

- [ ] **Step 1: Update documentation**

Document the three views, weekend rule, 1/2/4 controls, visible legend, six export actions, print layout, exact Back behavior, and both menu switches. State that push belongs to the current device while the evening reminder belongs to the account.

- [ ] **Step 2: Run source checks and full automated verification**

```bash
git diff --check
npm test
npm run build
```

Expected: all server and web tests pass, including the opt-in MariaDB suite when `TURNI_TEST_DATABASE_URL` is set; build succeeds without warnings.

- [ ] **Step 3: Verify locally in a real browser**

At 390×844 and desktop width, check:

1. `/turni` opens Settimana and weekend fixtures resolve to next Monday.
2. Settimana/Mese/Griglia selection and 1/2/4 controls fit without document-level horizontal overflow.
3. The legend is visible below Mese and Griglia and uses `⊗`/`×` correctly.
4. Printed grid has Monday separators, sector groups, room boxes, house icons, occupancy rows, and legend.
5. Daily print has outer day cards, all room/Smart/Assenti inner cards, zero counters, and no room colors.
6. Indietro returns to the exact source view after switching print types.
7. Each view downloads a CSV with the expected rows and a non-empty PNG with no application chrome.
8. Both notification switches reflect and update their actual state.

- [ ] **Step 4: Back up production before deployment**

Create a timestamped private backup outside the public webroot containing a `mysqldump --single-transaction --quick --skip-lock-tables` and the current `server/dist` plus `web/dist`. Verify non-zero size and mode 600 for the database dump.

- [ ] **Step 5: Deploy backend and frontend atomically**

Build locally, upload into a private staging directory, copy hashed assets first, then atomically replace `web/dist/index.html` and `server/dist/index.js`. Run `npm run migra` with the production `.env` even though no schema column is added, then restart only the processes whose `/proc/<pid>/cwd` matches the deployed application.

- [ ] **Step 6: Verify authenticated production behavior**

Verify login, authenticated `/api/auth/me` including `promemoriaSera`, PATCH preference, logout, and revoked-session 401. Restore the original reminder value after the PATCH smoke test. Verify both published schedules still contain 400 total assignments and zero warnings.

- [ ] **Step 7: Verify production UI and downloads**

Repeat Step 3 against `https://turni.marcocipriani.net`, inspect console warnings/errors, and compare local/remote hashes of the deployed entry files. Preserve the user-facing Turni tab only if Marco requests it left open.

- [ ] **Step 8: Logical commit checkpoint**

```bash
git add README.md docs/MANUALE.md
git commit -m "docs: aggiorna viste stampa esportazioni e notifiche"
```
