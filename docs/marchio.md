# Lo slot di brand, compilato per Turni

Riferimento: `design-system/DESIGN.md` § 14. Il design system è neutro; qui si
dichiara come l'identità entra nei **cinque punti** ammessi, e in nessun altro.

`design-system/BRAND.md` descrive **Zucchetto**, il marchio a cui Turni
appartiene. Questo file non lo sostituisce: dice come quel marchio si applica a
questo prodotto.

## Chi è Turni

Il posto dove un dipendente scopre quando è in sede e con chi, e dove chi
programma costruisce il calendario senza fogli di calcolo.

**Promessa:** *sai sempre quando sei in sede, e con chi.*

Nome del prodotto: **Turni**. Firma del produttore: **by Zucchetto**, sempre
separata e più piccola, mai fusa nel nome.

## Il principio dei due registri

- **Superficie di lavoro** — griglia, pannelli, tabelle: densa, neutra, senza
  decorazione. Nessun marchio, nessun colore di marca, nessuna illustrazione.
- **Voce di marca** — accesso, stati vuoti, errori: qui si parla alla persona.
  Frasi brevi, del `tu`, mai burocratese.

## I cinque punti

| # | Punto | Come è compilato |
|---|---|---|
| 1 | Marchio nel rail | Tile 40px `--r3`, raster senza alpha quindi `overflow:hidden`. `marchio.png` in tema chiaro, `marchio-scuro.png` in scuro. Porta alla panoramica |
| 2 | Wordmark | «Turni» in sans 600, `-0.01em`; «by Zucchetto» sotto, 12px `--ink-faint` |
| 3 | Glifo nella pagina d'accesso | Marchio 48px accanto al titolo «Turni» in **mono 22px**, `-0.02em`, con la promessa sotto |
| 4 | Stati vuoti | Marchio 72px, una frase che dice cosa manca più l'azione che lo risolve. Unico punto della superficie densa dove il marchio compare |
| 5 | Favicon e icona app | `icona-app.png`, la stessa del marchio. Dichiarata anche nel manifest |

Fuori da questi punti il marchio non entra: nessun colore di marca come
riempimento, nessuna illustrazione nelle viste dense, nessuna mascotte nelle
tabelle.

## Come si scrive in Turni

- «Fatto.» invece di «Operazione completata con successo.»
- Gli errori dicono cosa è successo **e la via d'uscita**: «La porta 8787 è già
  occupata. Liberala con `lsof -ti :8787 | xargs kill`.»
- Numeri, codici e date sempre in mono.
- Niente esclamativi, niente maiuscolo per enfasi, niente emoji nella
  superficie di lavoro.
