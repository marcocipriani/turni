# Miglioramenti di Turni — settembre 2026

Stato: approvato in conversazione il 2026-09-11, da rileggere prima del piano.

Una spec sola per un gruppo di interventi indipendenti, eseguiti in ordine. Ogni
passo è un commit (o pochi), verificato su `turni_dev` prima del successivo.

## Fuori perimetro

- **Posticipati** (vanno nel README, sezione «Stato»): server MCP locale per
  operare su Turni interrogando l'AI.
- **Esclusi**: feed ICS, collegamento diretto a un giorno, PNG in tema scuro,
  capienze datate («nuove capienze dal 14 settembre»), i quattro rinviati già
  elencati nel README.

## 0. Base di lavoro

- Commit delle modifiche già fatte (scorrimento a oggi, nomi per esteso e
  avatar di settore in Giorni, propria riga evidenziata in Griglia, PNG di Mio).
- Database `turni_dev` sullo stesso MySQL locale: `migra` + `seed` coi dati
  finti. Il `.env` punta a `turni_dev`; la riga di `turni_prod` resta
  commentata. `turni_prod` non si tocca.
- Ogni passo si verifica nel browser a 390px e a 1280px con utenti seed
  (dipendente, organizzatore, dirigente, admin).

## 1. «Respingi» con una modale

Il `prompt()` di `Turni.tsx` diventa una modale (componenti modali di `ui`)
con textarea obbligatoria. «Annulla» chiude senza chiamate.

## 2. Giorni: ricerca e «solo il mio settore»

- Nella Toolbar della vista Giorni: campo di ricerca e interruttore «Solo il
  mio settore» (nascosto se l'utente non ha settore).
- Funzione pura `filtraGente(gente, { testo, settore })`: il testo cerca in
  nome e cognome, senza maiuscole né accenti; il settore tiene solo chi ne fa
  parte. Si applica a in sede, remoto, assenze.
- Stanze e sezioni rimaste vuote dopo il filtro si nascondono. Il conteggio
  `x/capienza` della giornata non cambia: è un dato del giorno, non del filtro.
- Test: `filtraGente` in `Giorni.test.ts`.

## 3. «Quando vedo X»

- Nel pannello colleghi di una giornata di Mio, sotto ogni nome, le prossime
  tre date in cui si è entrambi in sede («anche 16, 18, 23 set»).
- Funzione pura `prossimeInsieme(giorni, userId, dopo)` sui dati di `/mio`,
  che porta già i colleghi di ogni giornata. Nessuna API nuova.
- Test in `Mio.test.ts`.

## 4. Griglia sul telefono

- Sotto i 640px: colonna nomi ~80px con «Cognome I.», colonne giorno 44px.
- All'apertura, se oggi cade nel periodo, la griglia scorre in orizzontale
  fino alla colonna di oggi (stessa misura della colonna nomi appiccicata).

## 5. Giorni offline

- `sw.js`: `/api/panoramica` diventa «rete, altrimenti copia» nella dispensa
  `turni-dati`, con la stessa marcatura della data di `/api/mio`. Uscendo si
  cancella con il resto (`dimenticaDatiOffline`).
- Le assenze di terzi restano generiche: la panoramica manda `Chi` (nome,
  settore), mai la causale. Da verificare in `overview.ts` e scriverlo nel
  commento del service worker, che cambia la regola «solo /api/mio».
- Giorni usa `getConEta` e mostra «Senza rete, dati del …» come Mio.

## 6. Promemoria della sera prima

- `user_preference.promemoria_sera` booleano, spento di default (`migra`).
- Interruttore nelle preferenze personali; accanto, se il push non è attivo
  su questo dispositivo, lo si dice.
- `server/src/promemoria.ts`, `npm run promemoria`, entry aggiunta a
  `build:server`. Seleziona chi domani è in sede in un periodo pubblicato e ha
  il promemoria acceso; invia con `avvisa()` (push + centro notifiche):
  «Domani in sede · 101/3».
- Doppio invio evitato cercando una notifica `promemoria` dello stesso utente
  creata oggi. Nessuna colonna in più.
- Selezione dei destinatari in una funzione pura, con test.
- Cron di hPanel ogni giorno, domenica compresa (il lunedì ha la sua sera
  prima). Nel MANUALE: la riga di cron e la nota sul fuso del server (le 18
  italiane sono le 16 UTC d'estate, le 17 d'inverno).

## 7. Preferenze di vista

Nella sezione preferenze personali (oggi in «Assenze e preferenze»):

- **Vista iniziale di Turni**: Giorni o Griglia. Con Griglia si apre il
  periodo di riferimento (`periodoDiRiferimento`); se non ce n'è, Giorni.
- **Filtri iniziali di Mio**: quali chip partono accese fra In sede, Da
  remoto, Assenze. Almeno una, come già vale per i filtri a mano.
- Colonne `user_preference.vista_turni` (`'giorni' | 'griglia'`, default
  giorni) e `filtri_mio` (JSON, default `["presenza"]`), aggiunte con `migra`,
  lette da `GET /assenze/preferenze` e salvate da `PUT`.

## 8. Sede delle stanze

- `room.sede varchar(80)` facoltativa (`migra`), accanto a piano e soprannome.
- Scheda Stanze: campo con `datalist` delle sedi già usate.
- Modello `docs/modelli/stanze.csv` e importazione: colonna `sede`.
- `fraseStanze` raggruppa per sede, poi per piano: «In via X, al primo
  piano: …; in via Y: …». Senza sedi indicate la frase resta com'è oggi.
  Test aggiornati in `Giorni.test.ts`.
- Giorni e stampa mostrano la sede accanto alla stanza dove c'è più di una
  sede.

## 9. Assenze registrate per conto di un collega

- `absence.registrata_da int NULL` (`migra`): `NULL` = dichiarata
  dall'interessato.
- `POST /assenze` accetta `userId` facoltativo. Se è di un altro, serve
  `puoProgrammare` sull'unità di programmazione dell'interessato
  (`unitaDiProgrammazione`). Controllo in una funzione pura
  `puoRegistrareAssenzaPer`, testata in `permissions.test.ts`.
- `DELETE /assenze/:id`: l'interessato sempre; chi può programmare la sua
  unità solo se l'assenza ha `registrata_da` valorizzato.
- Ogni registrazione e cancellazione per conto: `traccia` (`assenza_per_conto`)
  e `avvisa` all'interessato. Poi `segnalaConflitti` come oggi.
- Griglia: **×** assenza dichiarata dal collega, **⊗** registrata
  dall'organizzazione; testo per lettori di schermo e legenda aggiornati. La
  cella di `/griglia` porta l'informazione `registrataDaOrganizzazione`.
- L'organizzatore non tocca mai le assenze ×.

## 10. Modalità modifica della griglia

### Revisione come periodo gemello

- `period.revisione_di int NULL` (`migra`), unica per periodo.
- `POST /periodi/:id/revisione` (chi può programmare): se il periodo è
  pubblicato crea — o restituisce, se esiste — un periodo bozza con stesse
  date e unità, `revisione_di = id`, celle copiate (lucchetti compresi).
- Tutta la macchina esistente (celle, Genera, avvisi, Invia, Respingi) lavora
  sul gemello senza modifiche. L'originale resta `pubblicato`: Mio, Giorni,
  stampa, export leggono lui e non vedono niente della revisione.
- **Approva** su un gemello: in una transazione, snapshot dell'originale
  (versione corrente, motivo = nota della richiesta), celle dell'originale
  sostituite da quelle del gemello, versione + 1, `aggiornato_il`, avvisi a chi
  ha giornate cambiate (stessa logica di «Cosa è cambiato»), gemello eliminato.
- **Respingi** sul gemello: torna bozza, come oggi.
- **Scarta revisione**: elimina il gemello e le sue celle.
- Elenco periodi: il gemello non compare come periodo a sé; l'originale porta
  «in revisione».
- Scambi: proporne o accettarne uno su un periodo con revisione aperta →
  409 «Programmazione in revisione».
- La modifica di un periodo pubblicato non chiama più `nuovaVersione` né lo
  rimette in approvazione: si passa sempre dal gemello.

### Interfaccia

- Tasto «Modifica» nella toolbar della griglia per chi può programmare. Fuori
  dalla modalità la griglia è in sola lettura.
- Su un periodo pubblicato «Modifica» chiama `/revisione` e porta al gemello.
  Banner: «Stai modificando una revisione della v4. I colleghi vedono ancora
  la versione pubblicata.» Azioni: **Richiedi approvazione** (nota
  facoltativa) e **Scarta revisione**.
- **Desktop**
  - Trascinamento in verticale: stesso giorno, due persone → scambio delle
    celle.
  - Trascinamento in orizzontale: stessa persona, due giorni → scambio (così
    si sposta lo smart).
  - Tasto destro su una cella: menu con le stanze (ciascuna con `x/capienza`
    del giorno), Da remoto, Blocca / Sblocca, Registra assenza… o Togli
    assenza (solo ⊗), Dettagli… (pannello attuale, per la scrivania).
- **Telefono**: niente trascinamento né tasto destro. Il tocco su una cella
  apre lo stesso menu.
- Assenze: né trascinabili né bersaglio; menu ridotto a «Togli assenza» per
  le ⊗, niente per le ×.
- Nuovo `PUT /periodi/:id/celle` con un elenco di celle, scritto in una
  transazione: uno scambio non resta mai a metà. `PUT /cella` resta per il
  pannello.

### Lucchetto

- Ogni modifica a mano salva `bloccata: true`: Genera non la tocca.
- **Sblocca** la rimette fra le programmabili (`bloccata: false`): alla
  prossima Genera può cambiare, come se si fosse cambiata idea. Il valore
  attuale resta finché non si rigenera.
- Il segno ▪ diventa l'icona `Lucchetto` piccola; ⇄ resta per gli scambi.
- La motivazione non è più obbligatoria (sparisce il 422 su `/cella`).

### Capienza per stanza

- Riga di occupazione per stanza e per giorno sotto la griglia (come nel
  foglio HTML del 2026-09): rossa se sforata, piena se al limite.
- Avviso `errore` per ogni stanza sforata in un giorno.
- Il trascinamento non è impedito dalla capienza. Invia / Richiedi
  approvazione rispondono 409 finché ci sono avvisi `errore`.

### Generazione per settore

- Dopo lucchetti, assenze e regole, l'assegnazione delle stanze tiene insieme
  lo stesso settore e mescola meno settori possibile per stanza; a parità,
  conserva la stanza già assegnata. Funzione pura in `generate.ts`, test in
  `generate.test.ts`.

## 11. Documentazione

README («Cosa fa», «Stato» con l'MCP fra i posticipati) e MANUALE (modalità
modifica, revisioni, assenze per conto, sede, promemoria e cron, preferenze).

## Verifiche

- `npm test` verde a ogni passo; ogni funzione pura nuova ha il suo test.
- Prova a mano su `turni_dev`: 390px e 1280px, un ruolo per volta.
- Per il passo 10: revisione aperta → i colleghi vedono ancora la v
  pubblicata; approvazione → vedono la nuova, «Cosa è cambiato» la mostra,
  arrivano gli avvisi; scambio durante la revisione → rifiutato.
