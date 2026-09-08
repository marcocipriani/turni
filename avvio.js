/**
 * Punto di ingresso per gli hosting che pretendono un file `.js`.
 *
 * Passenger — quello che sta dietro al pannello Node di parecchi hosting
 * condivisi — non sa avviare un file TypeScript. Qui si registra il caricatore
 * di tsx e poi si importa il server vero. Chi avvia da riga di comando non ha
 * bisogno di questo file: gli basta `npm start`.
 *
 * Niente `await` al livello più esterno: LiteSpeed carica questo file con
 * `require()`, e Node rifiuta un modulo con attesa in cima
 * (ERR_REQUIRE_ASYNC_MODULE). L'importazione parte e basta; il server si
 * avvia da sé quando è pronto.
 */
import { register } from 'tsx/esm/api'

register()
void import('./server/src/index.ts')
