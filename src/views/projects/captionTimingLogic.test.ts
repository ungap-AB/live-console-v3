import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CaptionEnergy } from '../../data/types'
import type { EditCue } from './captionEditOps.ts'
import { DEFAULT_TIMING, deriveTimes, inSpeech, lastSpeechEnd, nextOnsetAfter, speechRuns } from './captionTimingLogic.ts'

const byteFor = (db: number) => Math.round(((db + 80) / 80) * 255)
// 20 ms per ram. talk = lista av [från, till] sekunder med tal (−20 dB), tystnad (−70 dB) annars.
function energyWith(seconds: number, talk: [number, number][]): CaptionEnergy {
  const frames = Math.round(seconds * 50)
  const data = new Uint8Array(frames).fill(byteFor(-70))
  for (const [from, to] of talk) for (let i = Math.round(from * 50); i < Math.round(to * 50); i++) data[i] = byteFor(-20)
  return { intervalMs: 20, minDb: -80, maxDb: 0, data }
}
const cue = (id: number, start: number, end: number, text: string): EditCue => ({ id, start, end, text })

test('talsegment hittas ur energin och korta luckor (andning) slås ihop', () => {
  const runs = speechRuns(energyWith(20, [[1, 3], [3.1, 4], [8, 9]])) // 0,1 s lucka mellan första två
  assert.equal(runs.starts.length, 2)
  assert.ok(Math.abs(runs.starts[0] - 1) < 0.05 && Math.abs(runs.ends[0] - 4) < 0.05)
  assert.ok(Math.abs(runs.starts[1] - 8) < 0.05 && Math.abs(runs.ends[1] - 9) < 0.05)
  assert.equal(speechRuns({ intervalMs: 20, minDb: -80, maxDb: 0, data: new Uint8Array(0) }).starts.length, 0)
})

test('inSpeech, nästa talstart och talets slut inom ett intervall', () => {
  const runs = speechRuns(energyWith(20, [[1, 4], [8, 9]]))
  assert.equal(inSpeech(runs, 2), true)
  assert.equal(inSpeech(runs, 5), false)
  assert.equal(inSpeech(runs, 0.5), false)
  assert.ok(Math.abs((nextOnsetAfter(runs, 5) ?? 0) - 8) < 0.05)
  assert.equal(nextOnsetAfter(runs, 8.5), null)
  assert.ok(Math.abs((lastSpeechEnd(runs, 0, 6) ?? 0) - 4) < 0.05)
  assert.equal(lastSpeechEnd(runs, 5, 7), null)
  assert.ok(Math.abs((lastSpeechEnd(runs, 3, 8.5) ?? 0) - 8.5) < 0.001) // talet fortsätter förbi intervallets slut: klipps
})

test('slut = talets slut + väntan när det räcker, annars läsetid, aldrig längre än nästa start', () => {
  const runs = speechRuns(energyWith(30, [[1, 6], [20, 21]]))
  // Replik 1: tal 1–6 s (10 ord → läsetid 1,4+1,2 = 2,6 s): talets slut + 0,25 = 6,25 vinner.
  const first = cue(1, 1, 99, 'ett två tre fyra fem sex sju åtta nio tio')
  // Replik 2: ett enda ord, tal 20–21 s: talets slut + väntan 21,25 mot läsetid 20 + 1,52 = 21,52 → läsetiden.
  const second = cue(2, 20, 99, 'Tack')
  const [a, b] = deriveTimes([first, second], runs, 30)
  assert.ok(Math.abs(a.end - 6.25) < 0.05, String(a.end))
  assert.ok(Math.abs(b.end - 21.52) < 0.05, String(b.end))
  // Läsetid vinner när talet är kort: ett ord som sägs på 0,3 s visas minst 1,52 s.
  const brief = speechRuns(energyWith(30, [[5, 5.3]]))
  const [c] = deriveTimes([cue(1, 5, 9, 'Ja')], brief, 30)
  assert.ok(Math.abs(c.end - 6.52) < 0.05, String(c.end))
  // Aldrig längre än nästa start.
  const [d] = deriveTimes([cue(1, 5, 9, 'Ja'), cue(2, 5.5, 9, 'Nej')], brief, 30)
  assert.ok(d.end <= 5.5 + 1e-9)
})

test('en gräns i en paus skjuts fram till nästa talstart, men en gräns i tal står kvar', () => {
  const runs = speechRuns(energyWith(30, [[1, 3], [10, 12]]))
  const [inPause, other] = deriveTimes([cue(1, 1, 3, 'a b'), cue(2, 6, 99, 'c d')], runs, 30)
  assert.equal(inPause.start, 1)
  assert.ok(Math.abs(other.start - 10) < 0.05, String(other.start)) // 6 s ligger i paus → talstart vid 10 s
  const [, inside] = deriveTimes([cue(1, 1, 3, 'a b'), cue(2, 11, 99, 'c d')], runs, 30)
  assert.equal(inside.start, 11) // mitt i tal: gränsen gäller
  // Ingen talstart före nästa gräns: lämnas.
  const [, stays] = deriveTimes([cue(1, 1, 3, 'a b'), cue(2, 6, 99, 'c d'), cue(3, 8, 99, 'e f')], runs, 30)
  assert.equal(stays.start, 6)
})

test('härledningen är idempotent, bevarar oförändrade repliker och rör inget utan tal', () => {
  const runs = speechRuns(energyWith(30, [[1, 3], [10, 12]]))
  const once = deriveTimes([cue(1, 0.5, 9, 'a b'), cue(2, 6, 9, 'c d e')], runs, 30)
  const twice = deriveTimes(once, runs, 30)
  assert.deepEqual(twice, once)
  assert.equal(twice[0], once[0]) // samma objekt
  const untouched = [cue(1, 0.5, 9, 'a b')]
  assert.deepEqual(deriveTimes(untouched, null, 30), untouched)
  assert.deepEqual(DEFAULT_TIMING, { lingerSeconds: 0.25, minBaseSeconds: 1.4, perWordSeconds: 0.12, startLeadSeconds: 0 })
})
