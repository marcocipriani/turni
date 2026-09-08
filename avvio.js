/**
 * Punto di ingresso per gli hosting che pretendono un file `.js`.
 *
 * Passenger — quello che sta dietro al pannello Node di parecchi hosting
 * condivisi — vuole un `.js` e lo carica con `require()`. Qui non c'è niente da
 * trasformare: il server è già compilato in `server/dist` durante la build.
 *
 * Niente `await` al livello più esterno: Node rifiuta un modulo che attende in
 * cima quando lo si carica con `require()` (ERR_REQUIRE_ASYNC_MODULE).
 */
void import('./server/dist/index.js')
