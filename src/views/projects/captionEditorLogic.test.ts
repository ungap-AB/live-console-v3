import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_LINE_LENGTH, activeCueIndex, canInsertLineBreak, changedIndexes, formatCueTime, hasLineWarning, lineInfo, rangeStatus, savePayload, scrollToReveal, windowRange,
} from './captionEditorLogic.ts'

const cues = [
  { start: 1, end: 4 },
  { start: 5, end: 8 },
  { start: 8.5, end: 12 },
]

test('aktiv replik: den som pågår, och ingen i luckorna före, mellan och efter', () => {
  assert.equal(activeCueIndex(cues, 0.5), -1)
  assert.equal(activeCueIndex(cues, 1), 0)
  assert.equal(activeCueIndex(cues, 3.99), 0)
  assert.equal(activeCueIndex(cues, 4), -1)
  assert.equal(activeCueIndex(cues, 4.5), -1)
  assert.equal(activeCueIndex(cues, 5), 1)
  assert.equal(activeCueIndex(cues, 11.9), 2)
  assert.equal(activeCueIndex(cues, 12), -1)
  assert.equal(activeCueIndex([], 3), -1)
})

test('överlappande repliker: den senast startade som fortfarande pågår väljs', () => {
  const overlapping = [{ start: 0, end: 10 }, { start: 4, end: 6 }]
  assert.equal(activeCueIndex(overlapping, 5), 1)
  assert.equal(activeCueIndex(overlapping, 7), 0)
})

test('teckenräknare per rad och varning över 42 tecken eller över två rader', () => {
  assert.deepEqual(lineInfo('Kort\nrad'), [{ length: 4, tooLong: false }, { length: 3, tooLong: false }])
  const long = 'x'.repeat(MAX_LINE_LENGTH + 1)
  assert.deepEqual(lineInfo(long), [{ length: 43, tooLong: true }])
  assert.equal(hasLineWarning('x'.repeat(MAX_LINE_LENGTH)), false)
  assert.equal(hasLineWarning(long), true)
  assert.equal(hasLineWarning('a\nb\nc'), true)
  assert.equal(hasLineWarning('a\nb'), false)
})

test('radbrytning tillåts bara när det finns färre än två rader', () => {
  assert.equal(canInsertLineBreak('en rad'), true)
  assert.equal(canInsertLineBreak('rad ett\nrad två'), false)
})

test('fönstret för en lång lista: rader som syns plus marginal, begränsat till listan', () => {
  assert.deepEqual(windowRange(0, 300, 60, 3000, 2), { first: 0, last: 7 })
  assert.deepEqual(windowRange(6000, 300, 60, 3000, 2), { first: 98, last: 107 })
  assert.deepEqual(windowRange(179_700, 300, 60, 3000, 2), { first: 2993, last: 3000 })
  assert.deepEqual(windowRange(0, 300, 60, 0), { first: 0, last: 0 })
  const everything = windowRange(0, 100_000, 60, 10, 5)
  assert.deepEqual(everything, { first: 0, last: 10 })
})

test('att visa en rad: scrolla bara om den ligger utanför', () => {
  assert.equal(scrollToReveal(5, 0, 300, 60), 300 + 60 - 300)
  assert.equal(scrollToReveal(2, 0, 300, 60), 0)
  assert.equal(scrollToReveal(1, 400, 300, 60), 60)
  assert.equal(scrollToReveal(0, 400, 300, 60), 0)
})

test('ändrade rader: bara de vars text skiljer sig', () => {
  assert.deepEqual(changedIndexes(['a', 'b', 'c'], ['a', 'x', 'c']), [1])
  assert.deepEqual(changedIndexes(['a'], ['a']), [])
})

test('förhållande till publicerad del: utanför, över kanten och inuti', () => {
  assert.equal(rangeStatus({ start: 0, end: 5 }, 10, 20), 'outside')
  assert.equal(rangeStatus({ start: 25, end: 30 }, 10, 20), 'outside')
  assert.equal(rangeStatus({ start: 8, end: 12 }, 10, 20), 'edge')
  assert.equal(rangeStatus({ start: 18, end: 22 }, 10, 20), 'edge')
  assert.equal(rangeStatus({ start: 12, end: 15 }, 10, 20), 'inside')
  assert.equal(rangeStatus({ start: 0, end: 5 }), 'inside')
})

test('tid som hh:mm:ss (hel sekund)', () => {
  assert.equal(formatCueTime(0), '00:00:00')
  assert.equal(formatCueTime(3723.004), '01:02:03')
  assert.equal(formatCueTime(59.9996), '00:00:59') // avrundas nedåt: en replik visas aldrig som senare än den börjar
  assert.equal(formatCueTime(-3), '00:00:00')
})

test('det som sparas är bara tid och text, i ordning', () => {
  assert.deepEqual(savePayload([{ start: 1, end: 2, text: 'a', id: 9 } as never, { start: 3, end: 4, text: 'b' }]), [
    { start: 1, end: 2, text: 'a' },
    { start: 3, end: 4, text: 'b' },
  ])
})
