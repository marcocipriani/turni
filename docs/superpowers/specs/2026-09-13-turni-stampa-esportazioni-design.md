# Turni: stampa, esportazioni e notifiche

## Obiettivo

Rendere Turni leggibile in tre viste nette — Settimana, Mese e Griglia — e produrre da ciascuna CSV e PNG puliti. Migliorare la stampa della griglia e del giorno per giorno, spostare push e promemoria nel menu utente e mantenere coerenti i simboli delle assenze.

## Navigazione Turni

- Le viste, in quest'ordine, sono `Settimana`, `Mese`, `Griglia`.
- `/turni` apre sempre Settimana. La vecchia preferenza personale non cambia più la vista iniziale e il relativo controllo viene tolto da Assenze; la colonna in archivio resta per compatibilità.
- Dal lunedì al venerdì Settimana parte dal lunedì corrente. Il sabato e la domenica parte dal lunedì successivo, usando il giorno italiano.
- Le ampiezze restano 1, 2 e 4 settimane, mostrate come chip `1`, `2`, `4` con etichette accessibili complete.
- Il pulsante Indietro della pagina Stampa torna alla vista esatta da cui è stata aperta. Cambiare tipo di foglio dentro Stampa non altera tale destinazione.

## Griglia e legenda

- Sullo schermo la legenda non è più richiusa nella barra: resta visibile sotto Griglia e Mese.
- `⊗` significa assenza registrata dall'organizzazione; `×` assenza dichiarata dall'utente; la descrizione accessibile segue la stessa distinzione.
- La stampa mostra una sola `×` per entrambe le origini dell'assenza, una casetta per lo smart working e il numero della stanza in un riquadro monocromatico più marcato.
- Nella griglia stampata ogni lunedì ha un bordo verticale più forte. In fondo compaiono una riga con il totale delle postazioni occupate e una riga per ogni stanza con conteggio e capienza.
- La stampa della griglia parte raggruppata per settore; l'utente può disattivare il raggruppamento.
- La legenda è stampata sotto la tabella.

## Stampa giorno per giorno

Ogni giornata è una card che contiene una card per ogni stanza condivisa, una per Smart working e una per Assenti. Tutte le card sono monocromatiche, mostrano il contatore; le stanze mostrano `occupati/capienza`, Smart e Assenti il numero di persone. Anche i gruppi vuoti restano visibili con contatore zero. Ogni giornata resta indivisibile fra due pagine quando lo spazio lo consente.

## CSV e PNG

- Settimana, Mese e Griglia espongono sempre due icone: CSV e PNG. Restano disabilitate finché i dati della vista non sono caricati.
- Il CSV usa sempre le colonne `data;persona;settore;stato;stanza;scrivania`, contiene soltanto giornate programmate e rispetta l'intervallo mostrato.
- Il PNG non è uno screenshot. È un documento chiaro, monocromatico, senza barra, menu o messaggi.
- Il PNG di Settimana usa le card della stampa giorno per giorno; Mese e Griglia usano la matrice stampabile con separazione delle settimane, occupazione e legenda.
- Il rendering PNG riusa il modello dati della stampa e il canvas già adottato nella pagina Mio; non aggiunge dipendenze.

## Notifiche nel menu utente

- Il menu utente contiene due switch: `Push su questo dispositivo` e `Promemoria sera prima`.
- Push legge la sottoscrizione del browser corrente. Accendere chiede il permesso, iscrive il dispositivo e aggiorna il server; spegnere rimuove sia la sottoscrizione locale sia quella sul server. Stato non supportato, permesso negato e chiave server assente sono mostrati accanto allo switch.
- Promemoria sera prima è una preferenza dell'account. Il cambio viene salvato subito e aggiornato nella sessione.
- I due vecchi controlli vengono rimossi dalla pagina Notifiche e dal pannello Preferenze di Assenze per non avere duplicati.

## Verifica

Test puri coprono lunedì iniziale, modello delle card, simboli, occupazione, CSV e modello PNG. Un test MariaDB copre l'aggiornamento parziale del promemoria. Build e suite complete devono passare; la verifica finale usa browser desktop e mobile, scarica realmente i sei file e controlla le due stampe prima della pubblicazione.
