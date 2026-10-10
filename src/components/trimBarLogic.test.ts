import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clampEnd, clampStart, fraction, handleValueText, isOutside, keyDelta, moveHandle, nearestHandle, playEndFrom, pointerTime,
} from './trimBarLogic.ts'

test('början rundas till heltal och kan inte komma närmare slutet än den minsta längden', () => {
  assert.equal(clampStart(12.4, 100, 200), 12)
  assert.equal(clampStart(95, 100, 200), 90)
  assert.equal(clampStart(-5, 100, 200), 0)
  assert.equal(clampStart(50, 100, 200, 30), 50)
  assert.equal(clampStart(80, 100, 200, 30), 70)
})

test('slutet kan inte komma närmare början än den minsta längden eller efter videons slut', () => {
  assert.equal(clampEnd(105.6, 100, 200), 110)
  assert.equal(clampEnd(105, 100, 200), 110)
  assert.equal(clampEnd(500, 100, 200), 200)
  assert.equal(clampEnd(10, 0, 200, 30), 30)
})

test('en video kortare än minsta längden kan ändå trimmas utan att balkarna korsas', () => {
  assert.equal(clampStart(3, 6, 6), 0)
  assert.equal(clampEnd(1, 0, 6), 6)
})

test('moveHandle flyttar bara den valda balken', () => {
  const range = { start: 20, end: 100 }
  assert.deepEqual(moveHandle('start', 40, range, 200), { start: 40, end: 100 })
  assert.deepEqual(moveHandle('end', 150, range, 200), { start: 20, end: 150 })
  assert.deepEqual(moveHandle('start', 99, range, 200), { start: 90, end: 100 })
})

test('andel av videons längd stannar mellan noll och ett, och noll för en tom video', () => {
  assert.equal(fraction(50, 200), 0.25)
  assert.equal(fraction(-4, 200), 0)
  assert.equal(fraction(900, 200), 1)
  assert.equal(fraction(10, 0), 0)
})

test('pekarens tid räknas inom spåret, med marginal för balkens bredd', () => {
  // Spår 1000 px brett från x = 100, 4 px marginal i varje ände, 200 s.
  assert.equal(pointerTime(100, 100, 1000, 200, 4), 0)
  assert.equal(pointerTime(1100, 100, 1000, 200, 4), 200)
  assert.equal(pointerTime(600, 100, 1000, 200, 4), 100)
  assert.equal(pointerTime(50, 100, 1000, 200, 4), 0)
  assert.equal(pointerTime(5000, 100, 1000, 200, 4), 200)
})

test('ett tryck tar tag i närmaste balk', () => {
  assert.equal(nearestHandle(10, 40, 160), 'start')
  assert.equal(nearestHandle(170, 40, 160), 'end')
  assert.equal(nearestHandle(60, 40, 160), 'start')
  assert.equal(nearestHandle(140, 40, 160), 'end')
  // Mitt emellan: början.
  assert.equal(nearestHandle(100, 40, 160), 'start')
  assert.equal(nearestHandle(40, 40, 160), 'start')
  assert.equal(nearestHandle(160, 40, 160), 'end')
})

test('piltangenter flyttar en sekund, med Skift tio, och sidtangenterna tio', () => {
  assert.equal(keyDelta('ArrowRight', false), 1)
  assert.equal(keyDelta('ArrowUp', false), 1)
  assert.equal(keyDelta('ArrowLeft', false), -1)
  assert.equal(keyDelta('ArrowDown', false), -1)
  assert.equal(keyDelta('ArrowRight', true), 10)
  assert.equal(keyDelta('ArrowLeft', true), -10)
  assert.equal(keyDelta('PageUp', false), 10)
  assert.equal(keyDelta('PageDown', true), -10)
  assert.equal(keyDelta('a', false), null)
  assert.equal(keyDelta('Tab', false), null)
})

test('spelknappen vid slutet börjar åtta sekunder före, men aldrig före början', () => {
  assert.equal(playEndFrom(0, 100), 92)
  assert.equal(playEndFrom(95, 100), 95)
  assert.equal(playEndFrom(0, 100, 15), 85)
})

test('utanför är före början och efter slutet, kanterna räknas som innanför', () => {
  assert.equal(isOutside(10, 20, 100), true)
  assert.equal(isOutside(101, 20, 100), true)
  assert.equal(isOutside(20, 20, 100), false)
  assert.equal(isOutside(100, 20, 100), false)
})

test('skärmläsartexten anger vilken balk och tiden', () => {
  assert.equal(handleValueText('start', 192), 'Början 00:03:12')
  assert.equal(handleValueText('end', 7308), 'Slutet 02:01:48')
})
