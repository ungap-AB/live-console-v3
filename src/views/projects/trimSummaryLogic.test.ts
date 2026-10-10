import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canMoveHere, chapterNote, chapterNoteText, moveMessage } from './trimSummaryLogic.ts'

test('notisen på en kapitelrad: tas bort går före flyttad', () => {
  assert.equal(chapterNote(10, undefined, 20, 100), 'removed')
  assert.equal(chapterNote(10, 40, 20, 100), 'removed')
  assert.equal(chapterNote(50, 40, 20, 100), 'moved')
  assert.equal(chapterNote(50, 50, 20, 100), '')
  assert.equal(chapterNote(50, undefined, 20, 100), '')
  assert.equal(chapterNote(20, undefined, 20, 100), '')
  assert.equal(chapterNote(100, undefined, 20, 100), '')
  assert.equal(chapterNoteText('removed'), 'tas bort')
  assert.equal(chapterNoteText('moved'), 'flyttad')
  assert.equal(chapterNoteText(''), '')
})

test('meddelandet efter en flytt nämner kapitlet och den nya tiden', () => {
  assert.equal(
    moveMessage({ chapterId: 'c3', label: '§ 2 Budget 2027', from: 1275, to: 1290 }),
    'Kapitlet “§ 2 Budget 2027” flyttades till 00:21:30.',
  )
})

test('Flytta hit är avstängd när kapitlet redan ligger på positionen', () => {
  assert.equal(canMoveHere(100, 100), false)
  assert.equal(canMoveHere(100, 100.4), false)
  assert.equal(canMoveHere(100, 101), true)
})
