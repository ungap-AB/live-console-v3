import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeBase64 } from '../../data/http/base64.ts'
import {
  bandProfile, bandWindow, cueIndexAt, focusWindow, level, snapToSpeech, speechThreshold, zoomFocusSpan, peakBetween, rowCenterY, timeAtRow, timeToY, viewWindow, visibleSpans, yToTime,
} from './captionWaveformLogic.ts'
import type { CaptionEnergy } from '../../data/types'

const cues = [
  { start: 1, end: 4 },
  { start: 5, end: 8 },
  { start: 10, end: 12 },
  { start: 14, end: 15 },
]

const energyOf = (values: number[], intervalMs = 20): CaptionEnergy => ({ intervalMs, minDb: -80, maxDb: 0, data: Uint8Array.from(values) })

test('base64 avkodas till byte', () => {
  assert.deepEqual([...decodeBase64('AAr/')], [0, 10, 255])
  assert.deepEqual([...decodeBase64('')], [])
})

test('tid vid radposition: radens start vid heltal, linjärt däremellan och förlängt utanför ändarna', () => {
  assert.equal(timeAtRow(cues, 0), 1)
  assert.equal(timeAtRow(cues, 1), 5)
  assert.equal(timeAtRow(cues, 1.5), 7.5)
  assert.equal(timeAtRow(cues, 2.25), 11)
  assert.equal(timeAtRow(cues, 3), 14)
  assert.equal(timeAtRow(cues, 4), 15) // förlängt med sista replikens längd (1 s)
  assert.equal(timeAtRow(cues, -1), 1 - 3) // och första replikens längd (3 s) före första
  assert.equal(timeAtRow([], 3), 0)
  assert.equal(timeAtRow([{ start: 2, end: 2 }], 1), 2.5) // minsta längd 0,5 s
})

test('fönstret följer listans scroll mjukt och rymmer varje synlig rads start', () => {
  const rowHeight = 76
  const win = viewWindow(cues, 0, 76 * 3, rowHeight)
  assert.equal(win.t0, 1)
  assert.equal(win.t1, 14) // tre rader ner = fjärde replikens start
  const half = viewWindow(cues, 38, 76 * 2, rowHeight, 0)
  assert.equal(half.t0, 3) // halv rad ner: mitt mellan start 1 och 5
  assert.equal(half.t1, 12) // 2,5 rader ner: mitt mellan start 10 och 14
})

test('minsta fönster hindrar för stark zoom och centreras på samma mitt', () => {
  const dense = [{ start: 10, end: 10.5 }, { start: 10.5, end: 11 }, { start: 11, end: 11.5 }]
  const win = viewWindow(dense, 0, 76 * 2, 76, 8)
  assert.equal(win.t1 - win.t0, 8)
  assert.equal((win.t0 + win.t1) / 2, 10.5)
  assert.deepEqual(viewWindow([], 0, 600, 76), { t0: 0, t1: 8 })
})

test('tid och pixelrad är varandras omvända', () => {
  const win = { t0: 10, t1: 40 }
  assert.equal(timeToY(10, win, 600), 0)
  assert.equal(timeToY(40, win, 600), 600)
  assert.equal(timeToY(25, win, 600), 300)
  assert.equal(yToTime(150, win, 600), 17.5)
  assert.equal(yToTime(timeToY(33.3, win, 600), win, 600), 33.3)
})

test('nivå: tystnad är 0, golv och tak klipps och tal ligger mitt emellan', () => {
  const meta = { minDb: -80, maxDb: 0 }
  assert.equal(level(0, meta), 0)
  assert.equal(level(255, meta), 1)
  const at = (db: number) => Math.round(((db + 80) / 80) * 255)
  assert.equal(level(at(-70), meta), 0) // under golvet
  assert.ok(level(at(-30), meta) > 0.4 && level(at(-30), meta) < 0.7)
  assert.ok(level(at(-20), meta) > level(at(-30), meta))
})

test('topp i intervall: kort topp bevaras, utanför datan är 0 och intervallet klipps mot ändarna', () => {
  const energy = energyOf([1, 2, 3, 200, 5, 6, 7, 8, 9, 10]) // 20 ms per värde = 0,2 s totalt
  assert.equal(peakBetween(energy, 0, 0.2), 200)
  assert.equal(peakBetween(energy, 0.07, 0.09), 200) // ramarna 3 och 4 delar intervallet: toppen vinner
  assert.equal(peakBetween(energy, 0.09, 0.09), 5)
  assert.equal(peakBetween(energy, 0.11, 0.11), 6)
  assert.equal(peakBetween(energy, 5, 6), 0)
  assert.equal(peakBetween(energy, -3, -1), 0)
  assert.equal(peakBetween(energy, -1, 0.03), 2) // klipps mot början: ramarna 0 och 1
  assert.equal(peakBetween(energyOf([]), 0, 1), 0)
  assert.equal(peakBetween(energy, 1, 0), 0)
})

test('bandprofil: en rad per pixel, tystnad platt och tal syns', () => {
  const loud = Math.round(((-25 + 80) / 80) * 255)
  const values = new Array(500).fill(0).map((_, index) => (index >= 100 && index < 200 ? loud : 0)) // 2-4 s är tal
  const profile = bandProfile(energyOf(values), { t0: 0, t1: 10 }, 100) // 0,1 s per pixel
  assert.equal(profile.length, 100)
  assert.equal(profile[5], 0)
  assert.ok(profile[30] > 0.4)
  assert.equal(profile[50], 0)
  assert.equal(bandProfile(energyOf(values), { t0: 0, t1: 10 }, 0).length, 0)
})

test('replik vid tid: den senast startade, och -1 före den första', () => {
  assert.equal(cueIndexAt(cues, 0.5), -1)
  assert.equal(cueIndexAt(cues, 1), 0)
  assert.equal(cueIndexAt(cues, 4.5), 0) // lucka efter 1:a: räknas till den som senast började
  assert.equal(cueIndexAt(cues, 10), 2)
  assert.equal(cueIndexAt(cues, 99), 3)
  assert.equal(cueIndexAt([], 3), -1)
})

test('synliga repliker i fönstret med pixelrader, och sådana som bara delvis syns tas med', () => {
  const spans = visibleSpans(cues, { t0: 3, t1: 11 }, 800) // 100 px per sekund
  assert.deepEqual(spans.map((span) => span.index), [0, 1, 2])
  assert.equal(spans[0].y0, -200) // börjar före fönstret
  assert.equal(spans[0].y1, 100)
  assert.equal(spans[1].y0, 200)
  assert.equal(spans[2].y1, 900) // slutar efter fönstret
  assert.deepEqual(visibleSpans(cues, { t0: 20, t1: 30 }, 800), [])
})

test('radens mittlinje följer scrollen', () => {
  assert.equal(rowCenterY(0, 0, 76), 38)
  assert.equal(rowCenterY(3, 100, 76), 3 * 76 - 100 + 38)
})

test('fokusfönster: centrerat på repliken, minst valt spann, växer för långa repliker och börjar aldrig före 0', () => {
  assert.deepEqual(focusWindow({ start: 20, end: 24 }, 12), { t0: 16, t1: 28 })
  assert.deepEqual(focusWindow({ start: 20, end: 40 }, 12), { t0: 16, t1: 44 }) // 20 s * 1,4 = 28 s
  assert.deepEqual(focusWindow({ start: 0, end: 2 }, 10), { t0: 0, t1: 10 })
})

test('bandets fönster: fokus på vald replik, annars listans scroll', () => {
  assert.deepEqual(bandWindow(cues, 0, 228, 76, 1, 10), focusWindow(cues[1], 10))
  assert.deepEqual(bandWindow(cues, 0, 228, 76, 1, null), viewWindow(cues, 0, 228, 76))
  assert.deepEqual(bandWindow(cues, 0, 228, 76, 9, 10), viewWindow(cues, 0, 228, 76)) // ingen vald replik
})

test('zoom i fokusläget: hjulsteg 1,25 gånger inom gränserna', () => {
  assert.equal(zoomFocusSpan(10, 1), 12.5)
  assert.equal(zoomFocusSpan(10, -1), 8)
  assert.equal(zoomFocusSpan(59, 1), 60)
  assert.equal(zoomFocusSpan(3.1, -1), 3)
})

// 20 ms per ram. Byte för dB: (db + 80) / 80 * 255.
const byteFor = (db: number) => Math.round(((db + 80) / 80) * 255)

test('talgräns: tröskel ligger 12 dB under talnivån och aldrig under −46 dB', () => {
  const speech = new Array(100).fill(byteFor(-20))
  const threshold = speechThreshold(energyOf([...speech, ...new Array(100).fill(byteFor(-70))]))
  assert.ok(Math.abs(threshold - byteFor(-32)) <= 1)
  assert.equal(speechThreshold(energyOf(new Array(50).fill(byteFor(-70)))), Math.ceil(((-46 + 80) / 80) * 255)) // bara tystnad
  assert.equal(speechThreshold(energyOf([])), Math.ceil(((-46 + 80) / 80) * 255))
})

test('fästning: start går till närmaste stigande kant och slut till närmaste fallande, annars orört', () => {
  // Tal mellan 1,00 s och 2,00 s (ram 50..99), tystnad runtom.
  const values = new Array(200).fill(0).map((_, index) => (index >= 50 && index < 100 ? byteFor(-20) : byteFor(-70)))
  const energy = energyOf(values)
  const threshold = speechThreshold(energy)
  assert.ok(Math.abs(snapToSpeech(energy, threshold, 1.05, 'start') - 1.0) < 0.03)
  assert.ok(Math.abs(snapToSpeech(energy, threshold, 0.95, 'start') - 1.0) < 0.03)
  assert.ok(Math.abs(snapToSpeech(energy, threshold, 2.04, 'end') - 2.0) < 0.03)
  assert.equal(snapToSpeech(energy, threshold, 1.5, 'start'), 1.5) // ingen kant inom 80 ms
  assert.equal(snapToSpeech(energy, threshold, 1.05, 'end'), 1.05) // fel sorts kant (stigande) för ett slut
  assert.equal(snapToSpeech(energy, threshold, 1.3, 'start'), 1.3) // 0,3 s från kanten: utanför standardfönstret
  assert.ok(Math.abs(snapToSpeech(energy, threshold, 1.3, 'start', 0.5) - 1.0) < 0.03) // men inom ett större
  assert.equal(snapToSpeech(energyOf([1, 2]), 1, 0.01, 'start'), 0.01) // för kort kurva
})
