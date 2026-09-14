/**
 * Le tre viste di Turni fuori dall'app: un CSV con sempre le stesse colonne e
 * un PNG che è un documento, non una fotografia dello schermo. Il PNG si
 * disegna a mano sul canvas dal modello della stampa: niente libreria, e carta
 * e immagine non possono dire cose diverse.
 */
import type { Griglia } from './api'
import { esteso, oggiISO, pezziData } from './date'
import {
  classeSettimana, elencoStanze, gruppiDocumento, occupazioneDocumento, type SchedaGiorno, schedeGiorno, simboloStampa,
} from './pagine/documentiTurni'
import type { DatiGiorni } from './pagine/Giorni'

/* ── CSV ─────────────────────────────────────────────────────────── */

const INTESTAZIONE = 'data;persona;settore;stato;stanza;scrivania'
const campo = (v: string) => /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
const csv = (righe: string[][]) => [INTESTAZIONE, ...righe.map((r) => r.map(campo).join(';'))].join('\r\n') + '\r\n'

/** Settimana: solo le giornate lavorative, com'è sullo schermo. */
export function csvDaGiorni(dati: DatiGiorni) {
  const settori = new Map(dati.settori.map((s) => [s.id, s.nome]))
  const stanze = new Map([...dati.stanze, ...(dati.stanzeRiservate ?? [])].map((s) => [s.id, s.etichetta]))
  const riga = (data: string, p: { cognome: string; nome: string; sectorId: number | null }, stato: string, stanza = '', scrivania = '') =>
    [data, `${p.cognome} ${p.nome}`, p.sectorId != null ? settori.get(p.sectorId) ?? '' : '', stato, stanza, scrivania]
  return csv(dati.giorni.filter((g) => g.feriale && !g.festivo).flatMap((g) => [
    ...g.presenti.map((p) => riga(g.data, p, 'presenza', p.roomId != null ? stanze.get(p.roomId) ?? '' : '', p.scrivania ?? '')),
    ...g.remoti.map((p) => riga(g.data, p, 'smart')),
    ...g.assenti.map((p) => riga(g.data, p, 'assenza')),
  ]))
}

/** Mese e Griglia: le celle che esistono. Un giorno scoperto non ha righe. */
export function csvDaGriglia(dati: Griglia) {
  const settori = new Map(dati.settori.map((s) => [s.id, s.nome]))
  const stanze = new Map(dati.stanze.map((s) => [s.id, s]))
  const celle = new Map(dati.celle.map((c) => [`${c.userId}|${c.data}`, c]))
  return csv(dati.giorni.flatMap((g) => dati.persone.flatMap((p) => {
    const c = celle.get(`${p.id}|${g}`)
    if (!c) return []
    const s = c.stato === 'presenza' && c.roomId != null ? stanze.get(c.roomId) : undefined
    return [[g, `${p.cognome} ${p.nome}`, p.sectorId != null ? settori.get(p.sectorId) ?? '' : '', c.stato,
      s?.etichetta ?? '', s?.scrivanie.find((d) => d.id === c.deskId)?.numero ?? '']]
  })))
}

function scarica(file: File) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file); a.download = file.name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Il BOM fa leggere a Excel gli accenti come accenti. */
export const scaricaCsv = (nome: string, testo: string) =>
  scarica(new File(['﻿' + testo], nome, { type: 'text/csv;charset=utf-8' }))

/** Sul telefono passa dal foglio di condivisione — «Salva immagine» o dritta in chat —, altrove si scarica. */
export async function salvaPng(canvas: HTMLCanvasElement, nome: string) {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
  if (!blob) throw new Error('Non sono riuscito a creare l\'immagine.')
  const file = new File([blob], nome, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    // Chiudere il foglio di condivisione non è un errore.
    await navigator.share({ files: [file] }).catch((e) => { if (e?.name !== 'AbortError') throw e })
    return
  }
  scarica(file)
}

/* ── PNG: prima l'impaginazione, pura; poi il disegno ────────────── */

export const LEGENDA_PNG = ['stanza = in sede', '⌂ = smart working', '× = assenza']

export type RigaPng =
  | { tipo: 'gruppo'; titolo: string }
  | { tipo: 'persona'; titolo: string; presenze: number; celle: string[] }

export function layoutPngGiorni(dati: DatiGiorni) {
  return {
    giorni: dati.giorni.filter((g) => g.feriale && !g.festivo).map((g) => ({
      titolo: esteso(g.data), contatore: `${g.presenti.length}/${g.capienza} in sede`,
      schede: schedeGiorno(g, dati.stanze, dati.settori),
    })),
  }
}

export function layoutPngGriglia(dati: Griglia, raggruppa: boolean) {
  const celle = new Map(dati.celle.map((c) => [`${c.userId}|${c.data}`, c]))
  const occupazione = occupazioneDocumento(dati)
  const righe: RigaPng[] = []
  for (const g of gruppiDocumento(dati, raggruppa)) {
    if (g.titolo) righe.push({ tipo: 'gruppo', titolo: g.titolo })
    for (const p of g.persone) {
      righe.push({
        tipo: 'persona', titolo: `${p.cognome} ${p.nome}`, presenze: occupazione.persone.get(p.id) ?? 0,
        celle: dati.giorni.map((d) => simboloStampa(celle.get(`${p.id}|${d}`), dati.stanze)),
      })
    }
  }
  return {
    colonne: dati.giorni.map((d, i) => ({ ...pezziData(d), inizioSettimana: classeSettimana(d, i) !== '' })),
    righe, stanze: elencoStanze(dati, occupazione), legenda: LEGENDA_PNG,
  }
}

// ponytail: tavolozza chiara fissa, come l'immagine di Mio: un PNG inoltrato si
// legge su sfondi che non conosciamo.
const C = { fondo: '#ffffff', ink: '#111111', muted: '#404040', faint: '#6b6b6b', bordo: '#c8c8c8', forte: '#5a5a5a', fascia: '#f0f0f0' }
const SANS = 'Inter, system-ui, sans-serif', MONO = "'JetBrains Mono', ui-monospace, monospace"

async function tela(L: number, H: number, titolo: string) {
  await Promise.all([`400 14px ${SANS}`, `600 14px ${SANS}`, `400 14px ${MONO}`, `600 14px ${MONO}`]
    .map((f) => document.fonts.load(f)))
  const canvas = document.createElement('canvas')
  canvas.width = L * 2; canvas.height = H * 2
  const x = canvas.getContext('2d')!
  x.scale(2, 2)
  x.fillStyle = C.fondo; x.fillRect(0, 0, L, H)
  x.textBaseline = 'middle'
  /** Scrive e dice quanto è largo: le legende si impaginano in fila. */
  const testo = (t: string, px: number, py: number, font: string, colore = C.ink, allinea: CanvasTextAlign = 'left', max?: number) => {
    x.font = font; x.fillStyle = colore; x.textAlign = allinea
    if (max) x.fillText(t, px, py, max); else x.fillText(t, px, py)
    return Math.min(x.measureText(t).width, max ?? Infinity)
  }
  const linea = (x1: number, y1: number, x2: number, y2: number, colore = C.bordo, spessore = 1) => {
    x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.strokeStyle = colore; x.lineWidth = spessore; x.stroke()
  }
  testo('TURNI', 24, 26, `400 11px ${MONO}`, C.faint)
  testo(titolo, 24, 52, `600 20px ${SANS}`)
  testo(`al ${esteso(oggiISO())}`, L - 24, 26, `400 11px ${MONO}`, C.faint, 'right')
  return { canvas, x, testo, linea }
}

/** La casetta disegnata, non un glifo: nessun font la garantisce. */
function casa(x: CanvasRenderingContext2D, cx: number, cy: number, r = 5) {
  x.beginPath()
  x.moveTo(cx - r, cy - r * 0.15); x.lineTo(cx, cy - r); x.lineTo(cx + r, cy - r * 0.15)
  x.moveTo(cx - r * 0.7, cy - r * 0.4); x.lineTo(cx - r * 0.7, cy + r); x.lineTo(cx + r * 0.7, cy + r); x.lineTo(cx + r * 0.7, cy - r * 0.4)
  x.strokeStyle = C.faint; x.lineWidth = 1; x.lineJoin = 'round'; x.stroke()
  return r * 2
}

export async function pngGriglia(dati: Griglia, raggruppa: boolean, titolo: string) {
  const l = layoutPngGriglia(dati, raggruppa)
  const n = Math.max(1, l.colonne.length)
  const M = 24, NOMI = 220, CAPO = 34, RIGA = 24, GRUPPO = 22, LEGENDA = 46, STANZA = 16
  const L = Math.max(1200, M + NOMI + n * 54 + M)
  const col = (L - 2 * M - NOMI) / n
  // Le stanze vanno a capo: si misurano prima di sapere quanto è alta la tela.
  const misura = document.createElement('canvas').getContext('2d')!
  misura.font = `400 11px ${MONO}`
  const righeStanze: string[] = []
  for (const s of l.stanze) {
    const unita = righeStanze.length ? `${righeStanze.at(-1)}    ${s}` : ''
    if (unita && misura.measureText(unita).width <= L - 2 * M) righeStanze[righeStanze.length - 1] = unita
    else righeStanze.push(s)
  }
  const TESTA = righeStanze.length ? 92 + (righeStanze.length - 1) * STANZA : 80
  const H = TESTA + CAPO + l.righe.reduce((h, r) => h + (r.tipo === 'gruppo' ? GRUPPO : RIGA), 0) + LEGENDA + M
  const { canvas, x, testo, linea } = await tela(L, H, titolo)
  const centro = (i: number) => M + NOMI + col * i + col / 2
  righeStanze.forEach((t, i) => testo(t, M, 76 + i * STANZA, `400 11px ${MONO}`, C.muted, 'left', L - 2 * M))

  let y = TESTA
  testo('Persona', M + 6, y + CAPO / 2, `600 12px ${SANS}`, C.muted)
  testo('in sede', M + NOMI - 8, y + CAPO / 2, `400 10px ${SANS}`, C.faint, 'right')
  l.colonne.forEach((c, i) => {
    testo(c.breve, centro(i), y + 10, `400 10px ${SANS}`, C.faint, 'center')
    testo(String(c.giorno), centro(i), y + 24, `600 12px ${MONO}`, C.ink, 'center')
  })
  y += CAPO
  linea(M, y, L - M, y, C.forte)

  for (const r of l.righe) {
    if (r.tipo === 'gruppo') {
      x.fillStyle = C.fascia; x.fillRect(M, y, L - 2 * M, GRUPPO)
      testo(r.titolo.toUpperCase(), M + 6, y + GRUPPO / 2, `600 10.5px ${MONO}`, C.muted)
      y += GRUPPO; linea(M, y, L - M, y)
      continue
    }
    const py = y + RIGA / 2
    testo(r.titolo, M + 6, py, `400 12.5px ${SANS}`, C.ink, 'left', NOMI - 44)
    testo(String(r.presenze), M + NOMI - 8, py, `400 11px ${MONO}`, C.muted, 'right')
    r.celle.forEach((s, i) => {
      if (s === 'casa') casa(x, centro(i), py)
      else if (['×', '·', '•'].includes(s)) testo(s, centro(i), py, `400 12px ${MONO}`, C.faint, 'center')
      else testo(s, centro(i), py, `600 11px ${MONO}`, C.ink, 'center', col - 6)
    })
    y += RIGA
    linea(M, y, L - M, y)
  }

  linea(M, TESTA, M, y); linea(L - M, TESTA, L - M, y); linea(M + NOMI, TESTA, M + NOMI, y, C.forte)
  l.colonne.forEach((c, i) => {
    if (i > 0) linea(M + NOMI + col * i, TESTA, M + NOMI + col * i, y, c.inizioSettimana ? C.forte : C.bordo, c.inizioSettimana ? 2 : 1)
  })

  // I segni disegnati come nelle celle; le parole vengono dal layout.
  y += LEGENDA / 2
  const segni = [
    (px: number) => testo('101', px, y, `600 11px ${MONO}`),
    (px: number) => casa(x, px + 5, y),
    (px: number) => testo('×', px, y, `400 13px ${MONO}`, C.faint),
  ]
  let lx = M
  l.legenda.forEach((voce, i) => {
    lx += segni[i]!(lx) + 6
    lx += testo(voce.split(' = ')[1]!, lx, y, `400 12px ${SANS}`, C.muted) + 24
  })
  return canvas
}

export async function pngGiorni(dati: DatiGiorni, titolo: string) {
  const l = layoutPngGiorni(dati)
  const L = 1200, M = 24, GAP = 10, PAD = 10, TESTA = 80, TITOLO = 36, RIGA = 18, CAPO = 28
  const w = (L - 2 * M - 2 * PAD - 2 * GAP) / 3
  const altezza = (s: SchedaGiorno) => CAPO + Math.max(1, s.persone.length) * RIGA + 8
  const blocchi = l.giorni.map((g) => {
    const righe: number[] = []
    for (let i = 0; i < g.schede.length; i += 3) righe.push(Math.max(...g.schede.slice(i, i + 3).map(altezza)))
    return { g, righe, alto: TITOLO + righe.reduce((a, b) => a + b, 0) + GAP * (righe.length - 1) + PAD }
  })
  const H = TESTA + Math.max(40, blocchi.reduce((h, b) => h + b.alto + GAP, 0)) + M
  const { canvas, x, testo, linea } = await tela(L, H, titolo)

  let y = TESTA
  if (blocchi.length === 0) testo('Nessuna giornata lavorativa in questo tratto di calendario.', M, y + 16, `400 14px ${SANS}`, C.muted)
  for (const { g, righe, alto } of blocchi) {
    x.strokeStyle = C.forte; x.lineWidth = 1; x.strokeRect(M, y, L - 2 * M, alto)
    testo(g.titolo.charAt(0).toUpperCase() + g.titolo.slice(1), M + PAD, y + TITOLO / 2, `600 15px ${SANS}`)
    testo(g.contatore, L - M - PAD, y + TITOLO / 2, `400 12px ${MONO}`, C.muted, 'right')
    linea(M + PAD, y + TITOLO - 4, L - M - PAD, y + TITOLO - 4)
    let sy = y + TITOLO
    righe.forEach((h, r) => {
      g.schede.slice(r * 3, r * 3 + 3).forEach((s, c) => {
        const sx = M + PAD + (w + GAP) * c
        x.strokeStyle = C.bordo; x.strokeRect(sx, sy, w, h)
        testo(s.titolo, sx + 8, sy + CAPO / 2, `600 13px ${SANS}`, C.ink, 'left', w - 70)
        testo(s.contatore, sx + w - 8, sy + CAPO / 2, `400 12px ${MONO}`, C.muted, 'right')
        linea(sx + 8, sy + CAPO - 2, sx + w - 8, sy + CAPO - 2)
        if (s.persone.length === 0) testo('—', sx + 8, sy + CAPO + RIGA / 2, `400 12px ${SANS}`, C.faint)
        s.persone.forEach((p, i) => {
          const py = sy + CAPO + RIGA * i + RIGA / 2
          const scrivania = p.scrivania ? `/${p.scrivania}` : ''
          const spazio = w - 16 - (scrivania ? 40 : 0)
          const usato = testo(p.nome, sx + 8, py, `400 12.5px ${SANS}`, C.ink, 'left', spazio)
          if (p.settore && usato + 30 < spazio) testo(` · ${p.settore}`, sx + 8 + usato, py, `400 11px ${SANS}`, C.faint, 'left', spazio - usato)
          if (scrivania) testo(scrivania, sx + w - 8, py, `400 12px ${MONO}`, C.muted, 'right')
        })
      })
      sy += h + GAP
    })
    y += alto + GAP
  }
  return canvas
}
