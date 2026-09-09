# Contribuire

Grazie: che sia una segnalazione o una modifica, si comincia allo stesso modo —
apri una *issue* e racconta il caso. Per un difetto servono tre righe: cosa
facevi, cosa ti aspettavi, cosa è successo. Per una funzione nuova basta il
problema che risolve; il come si discute dopo.

## Come si mette in piedi

Tutto sta nel [README](README.md#avvio-in-locale): database, `.env`, `npm
install`, `npm run migra`, `npm run seed`, `npm run dev`. Servono Node 20 o
successivo e un MySQL 8 (o MariaDB).

## Prima di aprire una proposta di modifica

```bash
npm test          # deve essere verde
npm run build     # controllo dei tipi e build di produzione
```

Se tocchi le rotte, anche `npm run verifica` contro un'istanza avviata.

## Come è scritto il codice

**In italiano.** Nomi di variabili, funzioni, componenti e file: `Giorni`,
`fraseStanze`, `periodoDiRiferimento`. Restano in inglese le parole che
appartengono alle librerie e al mestiere — `useState`, `fetch`, `commit`, gli
attributi ARIA. Non tradurle a metà.

**I commenti spiegano il perché, mai il cosa.** Il cosa si legge nel codice
sotto. Un commento che dice «incrementa il contatore» è rumore; uno che dice
perché quel contatore parte da uno vale la riga che occupa. Dove una scelta ha
un'alternativa ovvia che è stata scartata, il commento dice perché — è la
domanda che si farà chi legge fra un anno, e sarà probabilmente uno di noi.

**Meno codice, non più.** Prima di aggiungere: esiste già qui? Lo fa la
libreria standard? Lo fa il browser da solo? Una dipendenza nuova va motivata
nella proposta di modifica, e «così è più comodo» non è una motivazione: ogni
pacchetto è superficie da aggiornare per anni.

**Niente terzi a runtime.** Nessun CDN, nessun carattere remoto, nessuna
analitica, nessuna chiamata fuori. È una promessa scritta nel README e nella
politica dei contenuti, e riguarda dati del personale: non si fa un'eccezione
«solo per provare».

## Le regole che i test fanno rispettare da soli

Non sono buone intenzioni: se le violi, la suite diventa rossa.

| Dove | Cosa pretende |
|---|---|
| `web/src/contrasto.test.ts` | ogni token di colore sta sopra le soglie WCAG in tutti e due i temi |
| `web/src/verifiche/movimento.test.ts` | le animazioni muovono solo `opacity` e `transform` |
| `web/src/verifiche/telefono.test.ts` | scala del telefono, bersagli da 44px, viewport, la shell che non scorre |
| `web/src/verifiche/azioni.test.ts` | l'esito dei bottoni e quali righe contano come appena nate |

Se una di queste regole ti sta stretta perché il progetto è cambiato davvero,
cambia il test e spiega perché nella proposta di modifica. Quello che non deve
succedere è che cambi per sbaglio.

## Cosa provare, e cosa no

Le funzioni pure — il motore, i permessi, i nomi, le date, le frasi — vanno
provate sempre, e prima: sono quelle che si sbagliano in silenzio. Le regole di
stile e le invarianti si controllano leggendo i file, come fanno i test qui
sopra: niente browser, nessuna dipendenza in più.

Un componente che disegna e basta non ha bisogno di un test suo. Se ti accorgi
che ne servirebbe uno, quasi sempre vuol dire che dentro c'è una decisione da
tirare fuori e provare da sola.

## Messaggi di commit

[Conventional Commits](https://www.conventionalcommits.org/), in italiano, con
l'oggetto che dice cosa cambia per chi usa l'applicazione:

```
feat: la giornata si legge per stanza, e l'applicazione regge senza rete
fix: la pagina di accesso regge anche su uno schermo basso
```

Nel corpo, il perché e cosa succedeva prima. Il come sta nel diff.

## Segnalare una falla

Non aprirla come *issue* pubblica: scrivi in privato a chi mantiene il
repository, e lascia il tempo di chiudere il buco prima di raccontarlo. Vale
soprattutto per tutto ciò che riguarda permessi, sessioni e mascheramento delle
causali: lì un difetto espone dati di persone che non hanno scelto di stare qui.
