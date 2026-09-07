/**
 * Punto di ingresso per gli hosting che pretendono un file `.js`.
 *
 * Passenger — quello che sta dietro al pannello Node di parecchi hosting
 * condivisi — non sa avviare un file TypeScript. Qui si registra il caricatore
 * di tsx e poi si importa il server vero. Chi avvia da riga di comando non ha
 * bisogno di questo file: gli basta `npm start`.
 */
import { register } from 'tsx/esm/api'

register()
await import('./server/src/index.ts')
