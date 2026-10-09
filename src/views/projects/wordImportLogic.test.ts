import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { WordImportResult } from '../../data/types.ts'
import {
  buildReview, conflictKey, isLocked, nextReviewIndex, openConflictCount, reviewHeadline, reviewIndexes,
} from './wordImportLogic.ts'

function result(overrides: Partial<WordImportResult> = {}): WordImportResult {
  return {
    baseVersion: 3, currentVersion: 3, baseVerified: true, trackedInsertions: 0, trackedDeletions: 0,
    summary: { wordsAdded: 0, wordsRemoved: 0, changedCues: 0, addedCues: 0, removedCues: 0, conflicts: 0, checkCues: 0 },
    cues: [
      { id: 1, start: 0, end: 3, text: 'Ett.', state: 'unchanged', flags: [] },
      { id: 2, start: 3, end: 6, text: 'Två rättad.', state: 'changed', before: 'Två.', flags: [] },
      { id: 3, start: 6, end: 9, text: 'Tre.', state: 'unchanged', flags: [] },
      { id: 4, start: 9, end: 12, text: 'Fyra.', state: 'unchanged', flags: [] },
    ],
    removed: [], conflicts: [], warnings: [],
    ...overrides,
  }
}

const counter = () => { let next = -1; return () => next-- }

test('oförändrade rader behåller sitt id, ändrade och nya markeras, och nya rutor får tillfälliga id direkt efter sin ursprungsruta', () => {
  const built = buildReview(result({
    cues: [
      { id: 1, start: 0, end: 3, text: 'Ett.', state: 'unchanged', flags: [] },
      { id: 2, start: 3, end: 4.5, text: 'Två rättad', state: 'changed', before: 'Två.', flags: ['split'] },
      { id: 2, start: 4.5, end: 6, text: 'och lång fortsättning.', state: 'added', flags: ['split', 'fast'] },
      { id: 3, start: 6, end: 9, text: 'Tre.', state: 'unchanged', flags: [] },
    ],
  }), counter())

  assert.deepEqual(built.cues.map((c) => c.id), [1, 2, -1, 3])
  assert.deepEqual([...built.review.changedIds].sort(), [-1, 2].sort())
  assert.equal(built.review.before.get(2), 'Två.')
  assert.deepEqual(built.review.flags.get(-1), ['split', 'fast'])
})

test('borttagna rutor följer med som tomma rader på rätt plats och räknas som ändrade', () => {
  const built = buildReview(result({
    cues: [
      { id: 1, start: 0, end: 3, text: 'Ett.', state: 'unchanged', flags: [] },
      { id: 3, start: 6, end: 9, text: 'Tre.', state: 'unchanged', flags: [] },
    ],
    removed: [{ id: 2, start: 3, end: 6, text: 'Två.' }],
  }), counter())

  assert.deepEqual(built.cues.map((c) => [c.id, c.text]), [[1, 'Ett.'], [2, ''], [3, 'Tre.']])
  assert.ok(built.review.removedIds.has(2))
  assert.equal(built.review.before.get(2), 'Två.')
})

test('ej ändrade rader är låsta tills de låses upp, och Tab hoppar bara mellan ändrade rader', () => {
  const { cues, review } = buildReview(result({
    cues: [
      { id: 1, start: 0, end: 3, text: 'a', state: 'changed', before: 'A', flags: [] },
      { id: 2, start: 3, end: 6, text: 'b', state: 'unchanged', flags: [] },
      { id: 3, start: 6, end: 9, text: 'c', state: 'unchanged', flags: [] },
      { id: 4, start: 9, end: 12, text: 'd', state: 'changed', before: 'D', flags: [] },
    ],
  }), counter())

  assert.equal(isLocked(review, 1), false)
  assert.equal(isLocked(review, 2), true)
  review.unlocked.add(2)
  assert.equal(isLocked(review, 2), false)

  const stops = reviewIndexes(cues, review)
  assert.deepEqual(stops, [0, 3])
  assert.equal(nextReviewIndex(stops, 0, false), 3)
  assert.equal(nextReviewIndex(stops, 1, false), 3) // från en rad mellan ändringarna
  assert.equal(nextReviewIndex(stops, 3, true), 0)
  assert.equal(nextReviewIndex(stops, 2, true), 0)
  assert.equal(nextReviewIndex(stops, 3, false), null)
  assert.equal(nextReviewIndex(stops, 0, true), null)
})

test('en olöst konflikt gör raden granskningsbar och olåst; markerad som löst blir den en vanlig låst rad igen', () => {
  const { cues, review } = buildReview(result({
    conflicts: [{ id: 3, currentText: 'Tre.', baseText: 'tre', wordText: 'fyra' }],
    summary: { wordsAdded: 1, wordsRemoved: 1, changedCues: 1, addedCues: 0, removedCues: 0, conflicts: 1, checkCues: 0 },
  }), counter())

  assert.equal(isLocked(review, 3), false)
  assert.deepEqual(reviewIndexes(cues, review), [1, 2])
  assert.equal(openConflictCount(review), 1)

  review.resolved.add(conflictKey(3, 0))
  assert.equal(isLocked(review, 3), true)
  assert.equal(openConflictCount(review), 0)
  assert.deepEqual(reviewIndexes(cues, review), [1])
})

test('rubriken räknar rutor, nya, borttagna, konflikter och rutor att kontrollera', () => {
  const { review } = buildReview(result({
    summary: { wordsAdded: 5, wordsRemoved: 3, changedCues: 31, addedCues: 2, removedCues: 1, conflicts: 3, checkCues: 2 },
    conflicts: [
      { id: 1, currentText: 'a', baseText: 'b', wordText: 'c' }, { id: 2, currentText: 'a', baseText: 'b', wordText: 'c' }, { id: 3, currentText: 'a', baseText: 'b', wordText: 'c' },
    ],
  }), counter())

  assert.equal(reviewHeadline(review), '31 ändrade rutor · 2 nya rutor · 1 borttagen · 3 konflikter · 2 att kontrollera')
})

test('rubriken säger det när Word inte ändrat något', () => {
  const { review } = buildReview(result(), counter())
  assert.equal(reviewHeadline(review), 'Inga ändrade rutor')
})
