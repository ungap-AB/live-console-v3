import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chapterGroupInfo, collapsibleGroupIds, visibleChapters } from './chapterGroups.ts'

const list = [
  { chapterId: 'p0', kind: 'person' },
  { chapterId: 'a1', kind: 'agendaItem' },
  { chapterId: 'p1', kind: 'person' },
  { chapterId: 'e1', kind: 'exclamation' },
  { chapterId: 'a2', kind: 'agendaItem' },
  { chapterId: 'p2', kind: 'person' },
  { chapterId: 'a3', kind: 'agendaItem' },
]

test('talare och utrop hör till punkten före dem; kapitel före första punkten har ingen grupp', () => {
  const info = chapterGroupInfo(list)
  assert.deepEqual(info.map((i) => i.groupId), [null, 'a1', 'a1', 'a1', 'a2', 'a2', 'a3'])
  assert.deepEqual(info.map((i) => i.childCount), [0, 2, 0, 0, 1, 0, 0])
  assert.deepEqual(info.map((i) => i.isHeader), [false, true, false, false, true, false, true])
})

test('bara punkter med något under sig går att fälla ihop', () => {
  assert.deepEqual(collapsibleGroupIds(list), ['a1', 'a2'])
})

test('en hopfälld grupp döljer sina talare men aldrig rubriken eller kapitel utanför grupper', () => {
  assert.deepEqual(visibleChapters(list, new Set(['a1']), []), [true, true, false, false, true, true, true])
  assert.deepEqual(visibleChapters(list, new Set(['a1', 'a2']), []), [true, true, false, false, true, false, true])
  assert.deepEqual(visibleChapters(list, new Set(), []), [true, true, true, true, true, true, true])
})

test('ett valt, förankrat eller redigerat kapitel fäller ut sin grupp', () => {
  assert.deepEqual(visibleChapters(list, new Set(['a1', 'a2']), ['e1']), [true, true, true, true, true, false, true])
  assert.deepEqual(visibleChapters(list, new Set(['a2']), [null, undefined]), [true, true, true, true, true, false, true])
})
