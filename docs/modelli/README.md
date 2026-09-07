# Modelli di caricamento

Sei file, uno per tabella. Si aprono con qualunque foglio di calcolo, si
riempiono e si caricano da riga di comando.

Il separatore è il **punto e virgola** — quello che Excel italiano scrive e
rilegge senza chiedere niente — e la codifica è **UTF-8**. Su Excel, «Salva con
nome → CSV UTF-8».

Nelle celle il punto e virgola non deve comparire: non ci sono virgolette da
interpretare, e un file che ne abusa viene rifiutato invece di essere indovinato.

| File | Comando |
|---|---|
| [`persone.csv`](persone.csv) | `npm run avvio -w server -- persone.csv --dominio esempio.it` |
| [`stanze.csv`](stanze.csv) | `npm run importa -w server -- stanze stanze.csv` |
| [`settori.csv`](settori.csv) | `npm run importa -w server -- settori settori.csv` |
| [`assenze.csv`](assenze.csv) | `npm run importa -w server -- assenze assenze.csv` |
| [`causali.csv`](causali.csv) | `npm run importa -w server -- causali causali.csv` |
| [`giornate-non-lavorative.csv`](giornate-non-lavorative.csv) | `npm run importa -w server -- giornate giornate-non-lavorative.csv` |

**Prima di scrivere, prova.** `--prova` legge e verifica tutto senza toccare
l'archivio:

```bash
npm run importa -w server -- stanze stanze.csv --prova
```

Ricaricare lo stesso file due volte non duplica niente: le righe già presenti
vengono contate come «già presenti» e saltate.

---

## `persone.csv` — persone, unità e deleghe

Il primo popolamento di un'installazione nuova. Crea anche le unità e i settori
che nomina, e assegna a ciascuno una **password casuale mostrata una volta
sola**: copiala subito.

| Colonna | |
|---|---|
| `persona` | **«Cognome Nome»**, come nell'anagrafica di origine. Le particelle restano al cognome: `Di Marco Luca` dà cognome `Di Marco`, nome `Luca` |
| `ruolo` | `admin`, `dirigente` o `dipendente` |
| `unita` | nome dell'unità; creata se non esiste. Vuoto per l'amministratore |
| `sigla` | facoltativa, sigla dell'unità |
| `unitaPadre` | facoltativa, nome dell'unità superiore |
| `settore` | facoltativo; creato se non esiste |
| `presidio` | `si` se quel settore richiede una presenza ogni giorno |
| `organizzatore` | `si` per delegare la costruzione dei turni |
| `email` | facoltativa: senza, si costruisce come `iniziale.cognome@dominio` |

Ogni unità nominata **deve avere esattamente un dirigente**, altrimenti il
comando si ferma prima di scrivere qualsiasi cosa.

Il comando si rifiuta di girare su un archivio già popolato. Per aggiungere
persone dopo: `npm run avvio -- nuovi.csv --aggiungi`.

## `stanze.csv` — stanze e scrivanie

| Colonna | |
|---|---|
| `stanza` | l'etichetta come la chiamano le persone. Se contiene un `·`, la parte prima è il codice breve che compare in griglia |
| `piano` | facoltativo |
| `scrivanie` | `5` crea le scrivanie da 1 a 5; `1,2,5,8` crea esattamente quelle |
| `unita` | l'unità **radice** che possiede gli spazi |

La capienza di una stanza è il numero di scrivanie attive: non esiste un campo
«posti» da tenere allineato a mano. Per togliere un posto si disattiva la
scrivania.

L'elenco esplicito serve quando la numerazione sul posto ha dei buchi, che è il
caso normale.

## `settori.csv` — settori

| Colonna | |
|---|---|
| `settore` | nome del settore |
| `unita` | l'unità a cui appartiene |
| `presidio` | `si` se richiede almeno una presenza in ogni giornata lavorativa |
| `ordine` | in che ordine compare in griglia |

Serve solo per i settori che `persone.csv` non ha già creato, o per fissare
presidio e ordine senza passare dall'interfaccia.

> Non chiamare un settore come una causale di assenza. Un settore «Formazione»
> accanto a una causale «Formazione» rende ambigua ogni frase dell'interfaccia.

## `assenze.csv` — assenze già note

Per travasare le assenze da un foglio esistente senza farle ridichiarare a
tutti.

| Colonna | |
|---|---|
| `persona` | «Cognome Nome», come in `persone.csv` |
| `dal` | `2026-09-14` |
| `al` | vuoto per una giornata sola |
| `causale` | il **codice**, non l'etichetta: `ferie`, non `Ferie` |

I codici disponibili li elenca il messaggio d'errore se ne sbagli uno.

Un'assenza su una giornata già programmata **non riscrive il calendario**: chi
organizza riceve un avviso e decide.

## `causali.csv` — causali di assenza

Tredici causali sono già caricate al primo avvio. Questo file serve ad
aggiungerne di specifiche.

| Colonna | |
|---|---|
| `codice` | minuscole, cifre e trattino basso. È quello che si scrive in `assenze.csv` |
| `etichetta` | come la leggono le persone |
| `attiva` | `si` per proporla; vuoto vale `si` |
| `ordine` | posizione nel menu |

Una causale non si cancella: si disattiva, così le assenze già dichiarate
restano leggibili.

## `giornate-non-lavorative.csv` — chiusure

Le festività nazionali dei prossimi due anni sono già caricate, Pasqua
compresa. Qui si aggiungono il santo patrono e le chiusure deliberate.

| Colonna | |
|---|---|
| `data` | `2026-12-24` |
| `descrizione` | come compare |
| `unita` | vuoto vale per tutti; altrimenti solo per quell'unità e le sue figlie |

Le giornate elencate qui escono dalla programmazione: nessuno viene messo in
sede, e non contano nel calcolo delle quote.
