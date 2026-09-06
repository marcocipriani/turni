# Turni · by Zucchetto

*Sai sempre quando sei in sede, e con chi.*

Applicazione web per programmare, per periodi definiti, chi lavora in sede e chi
in lavoro agile, entro la capienza fisica delle stanze e tenendo conto delle
assenze dichiarate dagli interessati.

- Design: [`docs/superpowers/specs/2026-09-05-piattaforma-turni-design.md`](docs/superpowers/specs/2026-09-05-piattaforma-turni-design.md)
- Piano dei lavori: [`docs/superpowers/plans/2026-09-05-fase-1-implementazione.md`](docs/superpowers/plans/2026-09-05-fase-1-implementazione.md)
- Design system: [`design-system/DESIGN.md`](design-system/DESIGN.md) — normativo.
  I token si copiano da [`design-system/tokens.css`](design-system/tokens.css) senza modificarne i valori
- Slot di brand compilato: [`docs/marchio.md`](docs/marchio.md)
- Materiali di partenza: `handoff-webapp-rotazione-postazioni.md` (motore art.9, fase 3),
  `prototipo-griglia.html` (prototipo della griglia), l'xlsx delle adesioni

## Come è fatta

```
web/     SPA React + Vite + Tailwind v4, compilata in file statici
server/  API Hono su Node, con Drizzle su MySQL 8 / MariaDB
```

L'interfaccia è una **shell a due isole**: rail da 68px sempre visibile,
pannello da 214px comprimibile, isola di contenuto con header da 52px. Tema
chiaro, scuro e automatico, persistito. Inter e JetBrains Mono sono
self-ospitati: nessuna richiesta a un CDN esterno, quindi nessun dato del
personale che raggiunge terzi.

Il processo Node serve sia l'API sia il frontend compilato, così l'hosting
richiede un solo slot applicativo. In alternativa il contenuto di `web/dist`
può essere copiato in `public_html` e servito dal server web, lasciando al
processo Node la sola API.

## Avvio in locale

```bash
# 1. database
mysql -u root -e "CREATE DATABASE turni CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

# 2. configurazione
cp .env.example .env      # e compila DATABASE_URL e SEED_PASSWORD

# 3. dipendenze e schema
npm install
npm run db:push

# 4. dati di prova
npm run seed

# 5. sviluppo: API su 8787, interfaccia su 5173 con proxy verso l'API
npm run dev
```

Accessi generati dal popolamento di prova, tutti con la password indicata in
`SEED_PASSWORD`:

| Ruolo | Utenza |
|---|---|
| Amministratore di sistema | `admin@turni.test` |
| Dirigente del Dipartimento | `s.vitali@turni.test` |
| Dirigente UFFES | `b.ferraro@turni.test` |
| Organizzatore delegato | `m.fabbri@turni.test` |
| Dipendente | ogni altra `iniziale.cognome@turni.test` |

## Verifiche

```bash
npm test                        # 31 test di unità: motore, permessi, calendario, accessibilità
npm run verifica -w server      # criteri di accettazione contro un'istanza avviata
npm run carico -w server        # tempi del motore fino a 1000 persone
npm run build                   # controllo dei tipi e build di produzione
node scripts/schermate.mjs      # schermate autenticate nei due temi, via Chrome headless
```

### Tempi misurati

Motore di generazione, 21 giornate lavorative:

| Persone | Postazioni | Tempo |
|---:|---:|---:|
| 20 | 8 | 12 ms |
| 100 | 40 | 10 ms |
| 500 | 240 | 54 ms |
| 1000 | 480 | 96 ms |

API, media su 20 richieste dopo riscaldamento, con la griglia reale da 19 persone × 20 giornate:

| Rotta | Tempo | Risposta | Compressa |
|---|---:|---:|---:|
| `/api/periodi/:id/griglia` | 8,3 ms | 45,7 kB | 2,8 kB |
| `/api/panoramica` | 5,1 ms | 15,3 kB | 1,3 kB |
| `/api/periodi/:id/export.csv` | 8,2 ms | 27,6 kB | 2,0 kB |

## Messa in linea su Hostinger

Il piano Business esegue applicazioni Node e include MySQL.

1. **Database** — crea database e utente da hPanel, poi riporta le credenziali in `DATABASE_URL`.
2. **Applicazione Node** — in hPanel, *Avanzate → Node.js*: crea l'app puntando alla
   cartella del repository, comando di avvio `npm start --workspace server`.
3. **Variabili d'ambiente** — imposta `DATABASE_URL`, `SESSION_COOKIE`, `NODE_ENV=production`
   e le due chiavi VAPID. Non impostare `SEED_PASSWORD` in produzione.
4. **Frontend** — esegui `npm run build` in locale e carica `web/dist`. Se il processo
   Node serve anche i file statici, basta che la cartella esista accanto al server.
5. **Schema** — `npm run db:push` una volta sola, verso il database di produzione.
6. **Chiavi push** — generale con
   `node -e "console.log(require('web-push').generateVAPIDKeys())"` e conservale
   fuori dal repository.

### Prima di caricare dati reali

L'ambiente di prova usa una password unica per tutte le utenze. Prima che entri
un solo dato vero vanno soddisfatte tutte queste condizioni:

- la password condivisa è revocata e ogni utenza ha credenziali proprie;
- `password_da_cambiare` è attivo su tutte le utenze;
- l'ambiente non è raggiungibile dalla rete pubblica, oppure è protetto da un
  ulteriore livello di autenticazione;
- le utenze di prova sono eliminate, non soltanto disattivate.

Il popolamento di prova si rifiuta di girare con `NODE_ENV=production` e si
ferma se trova nel database utenze con indirizzi diversi da quello di test.

## Scostamenti dalla spec, e perché

**Hash delle password con `scrypt` di `node:crypto` invece di argon2id.**
Argon2 richiede una compilazione nativa che l'hosting condiviso può non
completare. `scrypt` è nella libreria standard, non ha dipendenze e resta un KDF
adeguato. Il modulo `server/src/lib/password.ts` è isolato: cambiare KDF
significa sostituire quel solo file.

**Il server gira con `tsx` invece di essere compilato con `tsc`.**
Toglie un passo di build dal percorso di rilascio, che sull'hosting condiviso è
il punto più fragile. Il controllo dei tipi resta e gira con `npm run build`.

## Cosa non c'è ancora

Fase 2: editor di planimetria drag and drop, reportistica di equità, serie
storiche, virtualizzazione della griglia oltre le 200 righe. Fase 3: motore art.9 con protrazioni e debito orario, fasce orarie
infragiornaliere, stanze condivise fra unità, SSO istituzionale, Design System
Italia.
