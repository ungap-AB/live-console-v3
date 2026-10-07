import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CaptionEnergy } from '../../data/types'
import type { EditCue } from './captionEditOps.ts'
import { estimateSplitTime, moveBoundary, speechClock } from './captionFlow.ts'
import { speechRuns } from './captionTimingLogic.ts'

const byteFor = (db: number) => Math.round(((db + 80) / 80) * 255)
function energyWith(seconds: number, talk: [number, number][]): CaptionEnergy {
  const data = new Uint8Array(Math.round(seconds * 50)).fill(byteFor(-70))
  for (const [from, to] of talk) for (let i = Math.round(from * 50); i < Math.round(to * 50); i++) data[i] = byteFor(-20)
  return { intervalMs: 20, minDb: -80, maxDb: 0, data }
}
const cue = (id: number, start: number, end: number, text: string): EditCue => ({ id, start, end, text })
const allWords = (cues: readonly EditCue[]) => cues.flatMap((c) => c.text.split(/\s+/).filter(Boolean))

test('talklockan räknar bara tal och är sin egen invers', () => {
  const runs = speechRuns(energyWith(30, [[2, 4], [10, 14]]))
  const clock = speechClock(runs)
  // Utjämningen vidgar talsegmenten med någon ram åt vardera hållet, därav toleransen.
  assert.ok(Math.abs(clock.toSpeech(4) - 2) < 0.1)
  assert.ok(Math.abs(clock.toSpeech(9) - 2) < 0.1) // paus: ingenting läggs till
  assert.ok(Math.abs(clock.toSpeech(12) - 4) < 0.1)
  for (const t of [2.5, 3.9, 10.5, 13.5]) assert.ok(Math.abs(clock.toTime(clock.toSpeech(t)) - t) < 1e-6)
  assert.ok(clock.toSpeech(1) < clock.toSpeech(2)) // före första talet: ordningen bevaras
  const plain = speechClock(null)
  assert.equal(plain.toSpeech(7), 7)
  assert.equal(plain.toTime(7), 7)
})

// Tal 0–10 s (ingen paus): 12 ord à ca lika långa, första repliken 0–5, andra 5–10.
const list = [
  cue(1, 0, 5, 'ett två tre fyra fem sex'),
  cue(2, 5, 10, 'sju åtta nio tio elva tolv'),
]
const talk = speechRuns(energyWith(12, [[0, 10]]))

test('en gräns som dras in i nästa replik tar ord med sig, och tillbaka ger exakt utgångsläget', () => {
  const later = moveBoundary(list, 1, 7.5, talk) // 7,5 s ≈ 3 ord in i andra repliken
  assert.ok(later.split > 6, `split ${later.split}`)
  assert.equal(later.baseSplit, 6)
  assert.equal(later.cues[1].start, 7.5)
  assert.deepEqual(allWords(later.cues), allWords(list)) // inga ord tappas eller dubbleras, samma ordning
  const back = moveBoundary(list, 1, 5, talk)
  assert.deepEqual(back.cues, list) // tillbaka = utgångsläget, med orörda texter
  const earlier = moveBoundary(list, 1, 2.5, talk)
  assert.ok(earlier.split < 6)
  assert.deepEqual(allWords(earlier.cues), allWords(list))
})

test('samma tid ger alltid samma fördelning, oavsett väg dit (räknas från utgångsläget)', () => {
  const direct = moveBoundary(list, 1, 7, talk)
  const viaOther = moveBoundary(list, 1, 7, talk) // ett nytt drag räknas om från samma base
  assert.deepEqual(direct, viaOther)
})

test('en gräns som dras genom en paus flyttar inga ord', () => {
  const withPause = speechRuns(energyWith(20, [[0, 5], [10, 15]]))
  const cues = [cue(1, 0, 5, 'ett två tre fyra fem'), cue(2, 10, 15, 'sex sju åtta nio tio')]
  const inPause = moveBoundary(cues, 1, 7, withPause)
  assert.equal(inPause.split, 5)
  assert.equal(inPause.cues[1].start, 7)
  assert.deepEqual(inPause.cues.map((c) => c.text), cues.map((c) => c.text)) // texterna rörs inte
  const intoSpeech = moveBoundary(cues, 1, 12, withPause)
  assert.ok(intoSpeech.split > 5)
})

test('en gräns lämnar alltid minst ett ord åt varje sida och minst 0,3 s mot grannarna', () => {
  const far = moveBoundary(list, 1, 99, talk)
  assert.equal(far.split, 11)
  assert.ok(far.cues[1].start <= 10 - 0.3 + 1e-9)
  assert.equal(far.cues[1].text, 'tolv')
  const near = moveBoundary(list, 1, -4, talk)
  assert.equal(near.split, 1)
  assert.ok(near.cues[1].start >= 0.3 - 1e-9)
  assert.equal(near.cues[0].text, 'ett')
  assert.deepEqual(allWords(far.cues), allWords(list))
})

test('första gränsen har ingen granne att flöda till: bara tiden ändras', () => {
  const moved = moveBoundary(list, 0, 1.5, talk)
  assert.equal(moved.cues[0].start, 1.5)
  assert.deepEqual(moved.cues.map((c) => c.text), list.map((c) => c.text))
  assert.equal(moveBoundary(list, 0, 99, talk).cues[0].start, 4.7) // högst 0,3 s före nästa gräns
  assert.deepEqual(moveBoundary(list, 5, 1, talk).cues, list)
})

test('utan tal (ingen energikurva) fördelas orden efter tid', () => {
  const moved = moveBoundary(list, 1, 7.5, null)
  assert.ok(moved.split > 6)
  assert.deepEqual(allWords(moved.cues), allWords(list))
})

test('flödet radbryter de två berörda replikerna om och lämnar orörda texter ifred', () => {
  const wrapped = [cue(1, 0, 5, 'ett två tre\nfyra fem sex'), cue(2, 5, 10, 'sju åtta nio tio elva tolv')]
  const same = moveBoundary(wrapped, 1, 5.1, talk) // för litet drag: inget ord byter sida
  assert.equal(same.cues[0].text, 'ett två tre\nfyra fem sex')
  const moved = moveBoundary(wrapped, 1, 9, talk)
  assert.ok(!moved.cues[1].text.includes('\n'))
})

test('utan flöde ändras bara tiden och gränsen hålls inom grannarna', () => {
  const timeOnly = moveBoundary(list, 1, 8, talk, false)
  assert.equal(timeOnly.cues[1].start, 8)
  assert.deepEqual(timeOnly.cues.map((c) => c.text), list.map((c) => c.text))
  assert.equal(moveBoundary(list, 1, 99, talk, false).cues[1].start, 9.7)
  assert.equal(moveBoundary(list, 1, -1, talk, false).cues[1].start, 0.3)
})

test('uppskattad delningstid: tecken fördelas över talet, så en paus i mitten skjuter delningen förbi pausen', () => {
  // Tal 0–4 s och 8–12 s (paus 4–8). Första halvan av tecknen ligger i det första talet.
  const runs = speechRuns(energyWith(14, [[0, 4], [8, 12]]))
  const split = estimateSplitTime(0, 12, 50, 50, runs)
  assert.ok(split > 3.9 && split < 8.1, String(split)) // mitt i talet = vid pausen
  const early = estimateSplitTime(0, 12, 25, 75, runs)
  assert.ok(Math.abs(early - 2) < 0.2, String(early)) // en fjärdedel av talet (8 s) = 2 s
  assert.equal(estimateSplitTime(10, 20, 30, 70, null), 13) // utan tal: tecken-proportionellt över tiden
  assert.equal(estimateSplitTime(5, 5.01, 1, 1, runs), 5.005) // intervall utan tal
})
