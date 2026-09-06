<h1 align="center">Turni</h1>

<p align="center">
  <em>Sai sempre quando sei in sede, e con chi.</em>
</p>

<p align="center">
  Programmazione dei turni fra sede e lavoro agile per uffici pubblici:<br>
  entro le scrivanie che esistono davvero, senza mai rivelare perché un collega non c'è.
</p>

<p align="center">
  <img src="docs/schermate/mio-mobile-light.png" width="240" alt="La pagina Mio, da telefono">
  &nbsp;&nbsp;
  <img src="docs/schermate/mio-mobile-dark.png" width="240" alt="La pagina Mio, tema scuro">
</p>

![La griglia dei turni](docs/schermate/turni-griglia-dark.png)

---

## Il problema

Un ufficio con più persone che scrivanie deve decidere, ogni settimana, chi
viene e chi resta a casa. Si fa con un foglio di calcolo, finché non ci si
accorge che il foglio non sa quante scrivanie ci sono, non sa chi è in ferie,
non impedisce a un intero settore di sparire lo stesso giorno, e soprattutto
mostra a tutti la causale dell'assenza di ciascuno.

Turni fa quel lavoro sapendo tutte e quattro le cose.

## Cosa fa

- **Programma per periodi** — una settimana, un mese, quattro settimane. Bozza,
  approvazione del dirigente, pubblicazione, versioni conservate per intero.
- **Genera una proposta** e la lascia correggere. Le celle bloccate a mano
  sopravvivono a ogni rigenerazione.
- **Non supera mai la capienza**: la capienza di una stanza è il numero di
  scrivanie attive, non un numero scritto da qualche parte che qualcuno deve
  ricordarsi di aggiornare.
- **Copre i settori a presidio** prima di distribuire il resto.
- **Assenze dichiarate dagli interessati**, anche ricorrenti, anche su
  programmazioni già pubblicate. Il calendario pubblicato non si riscrive da
  solo: chi organizza viene avvisato.
- **Scambio di turni fra colleghi** senza passare da nessuna approvazione, ma
  solo dove i conti tornano: presidio, postazioni, limiti di lavoro agile.
- **Stampa** su carta o PDF: griglia del periodo, giorno per giorno, calendario
  personale, occupazione delle stanze.
- **Notifiche** in applicazione e push del browser. Nessuna posta elettronica.

## Privacy per costruzione

Non è una sezione di conformità: sono scelte che hanno cambiato il codice.

**Il cognome non esiste per esteso.** Viene troncato a tre caratteri *prima*
dell'inserimento in archivio — `Di Marco` diventa `DiM` — e lo stesso vale per
gli indirizzi generati. A video compare la sola sigla; il nome si aggiunge solo
alle sigle che collidono in quella schermata. Un test verifica che nessun
cognome in archivio superi i tre caratteri: la minimizzazione non regge su una
convenzione, regge su un controllo.

**Un collega non distingue un assente da chi lavora da casa.** Il mascheramento
avviene in un punto solo del server, prima della serializzazione, e nessuna
causale attraversa quella funzione senza titolo. Anche l'export CSV lo rispetta.

**Le esclusioni non si spiegano.** Quando cerchi qualcuno con cui scambiare un
turno, chi non compare non compare e basta: assenza, postazioni esaurite,
presidio, limiti settimanali e proposte già aperte escludono allo stesso modo.
Una motivazione racconterebbe di terzi ciò che non ti riguarda.

**L'amministratore di sistema non vede nessuna programmazione.** Censisce unità
e utenti. Non è una limitazione dell'interfaccia: le rotte rispondono 403.

## Misurato, non sperato

| | |
|---|---|
| Accessibilità | **nessuna violazione WCAG 2.1 AA** — axe-core su 9 pagine × 2 temi × 2 schermi |
| Contrasto dei token | calcolato dai file CSS in entrambi i temi, non valutato a occhio |
| Rotte API | mediana **3–10 ms**, la più pesante 51 kB → **2,7 kB** compressi |
| Motore, 1000 persone | **81 ms** per 21 giornate lavorative |
| Pagina, 4G scarsa | primo testo **390 ms**, elemento più grande **880 ms**, scarti di impaginazione **0.000** |
| Peso di una pagina | **63 kB** |

Ogni riga è prodotta da uno strumento che si riesegue, non da una stima:
axe-core su Chrome headless, i tempi misurati sulle rotte vere, il motore
lanciato su archivi sintetici fino a mille persone. `npm run carico` sta nel
repository; il resto della strumentazione vive fuori, insieme al materiale di
rilascio.

## Com'è fatta

```
web/     SPA React 19 + Vite + Tailwind v4, compilata in file statici
server/  API Hono su Node, Drizzle ORM su MySQL 8 / MariaDB
docs/    manuale d'uso
```

Nella radice c'è solo quello che serve a far girare l'applicazione. Strumenti
di misura, materiale di rilascio e design system di riferimento stanno fuori
dal repository.

Un processo solo serve l'API e il frontend compilato: sull'hosting serve un
solo slot applicativo. Il server esegue TypeScript direttamente con `tsx`, così
nel percorso di rilascio non c'è una compilazione che può fallire.

Alcune scelte che meritano una riga:

- **La capienza non è un campo**, è il conteggio delle scrivanie attive.
- **Un'unità ha un dirigente solo**, e a garantirlo è un indice unico su una
  colonna generata, non un controllo nel codice.
- **Una giornata in scambio non entra in un secondo scambio**: stesso trucco,
  due colonne generate che si spengono da sole quando la proposta si chiude.
- **Il motore è deterministico**: stessi ingressi, stesso risultato. Rigenerare
  non rimescola le carte.
- **Niente CDN, niente caratteri remoti, niente analitica.** La politica dei
  contenuti può dirlo perché è vero: nessun dato del personale raggiunge terzi.

L'interfaccia segue un design system a **isole neutre**: palette monocromatica
in OKLCH, il colore riservato agli stati, rail a sinistra da tablet in su e
barra in basso sul telefono. I token stanno in
[`web/src/styles/tokens.css`](web/src/styles/tokens.css); le correzioni di
contrasto che il design system non copriva stanno in
[`app.css`](web/src/styles/app.css), con la misura accanto.

## Avvio in locale

```bash
# 1. database
mysql -u root -e "CREATE DATABASE turni CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

# 2. configurazione
cp .env.example .env      # compila DATABASE_URL e SEED_PASSWORD

# 3. dipendenze e schema
npm install
npm run migra

# 4. dati di prova
npm run seed

# 5. API su 8787, interfaccia su 5173 con proxy verso l'API
npm run dev
```

Le utenze di prova hanno tutte la password indicata in `SEED_PASSWORD`, e nomi
inventati: `admin@turni.test` per l'amministratore, `marco.fab@turni.test` per
l'organizzatore, `serena.fer@turni.test` per il dirigente, ogni altra
`nome.sig@turni.test` per i dipendenti.

Il popolamento di prova **si rifiuta di girare** con `NODE_ENV=production`, e
anche se trova in archivio un solo indirizzo fuori dal dominio di prova.

## Verifiche

```bash
npm test          # 113 test: motore, permessi, scambi, nomi, contrasti, accessibilità
npm run verifica  # 12 criteri di accettazione contro un'istanza avviata
npm run carico    # motore fino a 1000 persone
npm run build     # controllo dei tipi e build di produzione
```

Le verifiche che parlano con un browser — accessibilità, tempi di
caricamento, schermate — pilotano Chrome headless dal protocollo di sviluppo,
senza Puppeteer né Playwright: un file, zero dipendenze. Stanno fuori dal
repository con il resto della strumentazione.

## Rilascio

Il rilascio è un archivio di circa 1 MB: server, frontend già compilato,
configurazione da riempire. Fuori restano test, popolamento di prova,
strumenti di misura e ogni traccia di dati del personale. Il frontend si
compila prima, non sul server: su un piano condiviso la compilazione è il
punto in cui ci si arena.

Sul server: `npm install --omit=dev`, il `.env`, `npm run migra`, e
`npm run avvio -- persone.csv` la prima volta — che crea le utenze reali e
stampa una volta sola una password diversa per ciascuno. Il resto delle
tabelle si carica con `npm run importa`, a partire dai
[modelli](docs/modelli/).

## Documentazione

- [Manuale d'uso](docs/MANUALE.md) — per tutti, con le parti dedicate a
  dirigenti, organizzatori e amministratore.
- [Modelli di caricamento](docs/modelli/) — sei file CSV, uno per tabella:
  persone, stanze, settori, assenze, causali, giornate non lavorative. Si
  aprono con un foglio di calcolo, e `--prova` li verifica senza scrivere.

## Stato

Prima versione completa e provata. Rinviato per scelta, non per dimenticanza:

- editor grafico delle planimetrie con trascinamento
- virtualizzazione della griglia oltre le 200 righe — sopra quella soglia il
  collo di bottiglia è il DOM, non più il server
- fasce orarie infragiornaliere e stanze condivise fra unità
- accesso con identità istituzionale e importazione dal sistema del personale

## Licenza

[MIT](LICENSE). Prendi, usa, modifica, rivendi, senza chiedere niente a
nessuno. Qui dentro non c'è niente di inventato: un motore che riempie una
griglia rispettando dei vincoli, un modello dei permessi e un po' di cura nel
non far uscire i dati di nessuno. Se serve a qualcun altro, tanto meglio.
