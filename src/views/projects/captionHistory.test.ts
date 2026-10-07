import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyHistory, MAX_HISTORY, record, redo, undo } from './captionHistory.ts'

test('ångra ger tillbaka föregående värde och gör om ger det tillbaka', () => {
  let history = record(emptyHistory<string>(), 'a')
  history = record(history, 'b')
  const first = undo(history, 'c')
  assert.ok(first)
  assert.equal(first.value, 'b')
  const second = undo(first.history, 'b')
  assert.ok(second)
  assert.equal(second.value, 'a')
  assert.equal(undo(second.history, 'a'), null)

  const again = redo(second.history, 'a')
  assert.ok(again)
  assert.equal(again.value, 'b')
  const last = redo(again.history, 'b')
  assert.ok(last)
  assert.equal(last.value, 'c')
  assert.equal(redo(last.history, 'c'), null)
})

test('en ny ändring efter ångra tömmer gör om', () => {
  let history = record(emptyHistory<number>(), 1)
  const undone = undo(history, 2)
  assert.ok(undone)
  history = record(undone.history, 1)
  assert.equal(redo(history, 5), null)
})

test('historiken är begränsad och de äldsta försvinner först', () => {
  let history = emptyHistory<number>()
  for (let i = 0; i < MAX_HISTORY + 10; i++) history = record(history, i)
  assert.equal(history.past.length, MAX_HISTORY)
  assert.equal(history.past[0], 10)
  assert.equal(history.past[MAX_HISTORY - 1], MAX_HISTORY + 9)
})

test('historiken ändras aldrig på plats', () => {
  const original = record(emptyHistory<number>(), 1)
  const snapshot = JSON.stringify(original)
  undo(original, 2)
  redo(original, 2)
  record(original, 3)
  assert.equal(JSON.stringify(original), snapshot)
})
