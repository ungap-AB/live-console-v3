import assert from 'node:assert/strict'
import { test } from 'node:test'
import { timeAtRow } from './captionWaveformLogic.ts'
import { chapterKindText, chapterLayout, currentChapters, mergeRows, positionedChapters, type ChapterInput, type EditorChapter } from './chapterRows.ts'
import { rowPosition } from './rowLayout.ts'

const input = (partial: Partial<ChapterInput> & { chapterId: string; offsetSeconds: number }): ChapterInput => ({ kind: 'agendaItem', label: partial.chapterId, ...partial })
const chapter = (id: string, kind: string, time: number): EditorChapter => ({ id, kind, label: id, time })

test('bara kapitel med position visas, sorterade på tid', () => {
  const result = positionedChapters([
    input({ chapterId: 'c', offsetSeconds: 300 }),
    input({ chapterId: 'a', offsetSeconds: 10, timing: 'positioned' }),
    input({ chapterId: 'untimed', offsetSeconds: 0, timing: 'untimed', synced: false }),
    input({ chapterId: 'clock', offsetSeconds: 0, timing: 'clock', synced: false }),
    input({ chapterId: 'b', offsetSeconds: 120, kind: 'person' }),
  ])
  assert.deepEqual(result.map((c) => c.id), ['a', 'b', 'c'])
  assert.equal(result[1].kind, 'person')
  assert.equal(result[1].time, 120)
})

test('en skrivskyddad kapitellista (historiken utan HLS-tid) visas inte alls', () => {
  assert.deepEqual(positionedChapters([input({ chapterId: 'a', offsetSeconds: 0, readOnly: true }), input({ chapterId: 'b', offsetSeconds: 0 })]), [])
})

test('kapitel vävs in före första repliken som startar efter kapitlets tid, och lika tid ger kapitlet först', () => {
  const cues = [{ start: 0 }, { start: 10 }, { start: 20 }, { start: 30 }]
  const rows = mergeRows(cues, [chapter('x', 'agendaItem', 10), chapter('y', 'person', 15), chapter('z', 'person', 99)])
  assert.deepEqual(rows.map((row) => (row.kind === 'cue' ? `k${row.index}` : row.chapter.id)), ['k0', 'x', 'k1', 'y', 'k2', 'k3', 'z'])
})

test('kapitel före första repliken kommer först, och utan kapitel är raderna replikerna', () => {
  const cues = [{ start: 5 }, { start: 9 }]
  assert.deepEqual(mergeRows(cues, [chapter('a', 'agendaItem', 1)]).map((row) => row.kind), ['chapter', 'cue', 'cue'])
  assert.deepEqual(mergeRows(cues, []).map((row) => (row.kind === 'cue' ? row.index : -1)), [0, 1])
  assert.deepEqual(mergeRows([], [chapter('a', 'agendaItem', 1)]).map((row) => row.kind), ['chapter'])
})

test('oordnade repliker behåller sin ordning', () => {
  const cues = [{ start: 20 }, { start: 5 }, { start: 30 }]
  const rows = mergeRows(cues, [chapter('x', 'agendaItem', 10)])
  // Kapitlet (10 s) ligger före första repliken i listan (20 s), så det hamnar först; replikernas ordning ändras inte.
  assert.deepEqual(rows.map((row) => (row.kind === 'cue' ? `k${row.index}` : row.chapter.id)), ['x', 'k0', 'k1', 'k2'])
})

test('layouten ger kapitelraderna sin höjd och lämnar replikindex orörda', () => {
  const cues = [{ start: 0, end: 4 }, { start: 10, end: 14 }, { start: 20, end: 24 }]
  const rows = mergeRows(cues, [chapter('x', 'agendaItem', 12), chapter('y', 'person', 22)])
  const layout = chapterLayout(cues, rows, 84, 40)
  assert.equal(layout.count, 5)
  assert.equal(layout.total, 3 * 84 + 2 * 40)
  assert.deepEqual([0, 1, 2, 3, 4].map((row) => layout.cueIndex(row)), [0, 1, -1, 2, -1])
  assert.deepEqual([0, 1, 2].map((cue) => layout.top(layout.cueRow(cue))), [0, 84, 84 + 84 + 40])
  // Kapitelradens överkant är kapitlets tid; mitt i den halvvägs mot nästa rad (12 → 20).
  assert.equal(timeAtRow(layout.spans, rowPosition(layout, layout.top(2))), 12)
  assert.equal(timeAtRow(layout.spans, rowPosition(layout, layout.top(2) + 20)), 16)
})

test('pågående punkt och person vid en tid', () => {
  const list = [
    chapter('a1', 'agendaItem', 10),
    chapter('p1', 'person', 20),
    chapter('p2', 'person', 40),
    chapter('a2', 'agendaItem', 100),
    chapter('p3', 'person', 120),
  ]
  assert.deepEqual(currentChapters(list, 5), { agenda: null, person: null })
  assert.equal(currentChapters(list, 10).agenda?.id, 'a1')
  assert.equal(currentChapters(list, 10).person, null)
  assert.equal(currentChapters(list, 50).person?.id, 'p2')
  // Ny punkt nollställer personen.
  assert.equal(currentChapters(list, 100).agenda?.id, 'a2')
  assert.equal(currentChapters(list, 100).person, null)
  assert.equal(currentChapters(list, 999).person?.id, 'p3')
})

test('typtexter', () => {
  assert.equal(chapterKindText('agendaItem'), 'Punkt')
  assert.equal(chapterKindText('person'), 'Person')
  assert.equal(chapterKindText('exclamation'), 'Utrop')
  assert.equal(chapterKindText('pauseIn'), 'Paus')
  assert.equal(chapterKindText('x'), '')
})
