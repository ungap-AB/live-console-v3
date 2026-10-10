import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampPosition, nudgePosition, parseTimeInput, setBoundaryHere } from './trimPositionLogic.ts'

test('positionen hålls inom videon', () => {
  assert.equal(clampPosition(-3, 100), 0)
  assert.equal(clampPosition(130, 100), 100)
  assert.equal(clampPosition(40, 100), 40)
  assert.equal(nudgePosition(3, -5, 100), 0)
  assert.equal(nudgePosition(98, 5, 100), 100)
  assert.equal(nudgePosition(50, 5, 100), 55)
})

test('en inskriven tid läses som h:mm:ss, m:ss eller sekunder', () => {
  assert.equal(parseTimeInput('00:03:12', 7380), 192)
  assert.equal(parseTimeInput('1:02:03', 7380), 3723)
  assert.equal(parseTimeInput('3:12', 7380), 192)
  assert.equal(parseTimeInput('90', 7380), 90)
  assert.equal(parseTimeInput('  00:00:07  ', 7380), 7)
})

test('en inskriven tid utanför videon klämms, och ogiltig text ignoreras', () => {
  assert.equal(parseTimeInput('09:00:00', 7380), 7380)
  assert.equal(parseTimeInput('', 7380), null)
  assert.equal(parseTimeInput('abc', 7380), null)
  assert.equal(parseTimeInput('0:75', 7380), null)
  assert.equal(parseTimeInput('1:2:3:4', 7380), null)
  assert.equal(parseTimeInput('-5', 7380), null)
  assert.equal(parseTimeInput('1.5', 7380), null)
})

test('Start här sätter början till positionen och flyttar positionen dit balken hamnade', () => {
  const range = { start: 20, end: 100 }
  assert.deepEqual(setBoundaryHere('start', 40, range, 200), { range: { start: 40, end: 100 }, seek: 40 })
  // För nära slutet: klämd mot minsta längden, och positionen följer med dit.
  assert.deepEqual(setBoundaryHere('start', 99, range, 200), { range: { start: 90, end: 100 }, seek: 90 })
})

test('Slut här sätter slutet till positionen och klämmer mot början och videons slut', () => {
  const range = { start: 20, end: 100 }
  assert.deepEqual(setBoundaryHere('end', 150, range, 200), { range: { start: 20, end: 150 }, seek: 150 })
  assert.deepEqual(setBoundaryHere('end', 25, range, 200), { range: { start: 20, end: 30 }, seek: 30 })
  assert.deepEqual(setBoundaryHere('end', 900, range, 200), { range: { start: 20, end: 200 }, seek: 200 })
})
