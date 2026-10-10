import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rowCenterY, timeAtRow, viewWindow, viewWindowForLayout } from './captionWaveformLogic.ts'
import { scrollToReveal, windowRange } from './captionEditorLogic.ts'
import { mixedLayout, rowCenter, rowPosition, scrollToRevealRow, uniformCueLayout, windowRows, type LayoutEntry } from './rowLayout.ts'

// Replikerna ligger glest och tätt om vartannat, så att interpoleringen inte råkar stämma av en slump.
const cues = Array.from({ length: 40 }, (_, index) => {
  const start = index * 3 + (index % 5) * 0.7 + (index > 20 ? 40 : 0)
  return { start, end: start + 2 + (index % 3) }
})
const ROW = 84

test('uniform layout: toppar, höjder och rad vid y är index × radhöjd', () => {
  const layout = uniformCueLayout(cues, ROW)
  assert.equal(layout.count, 40)
  assert.equal(layout.total, 40 * ROW)
  assert.equal(layout.top(0), 0)
  assert.equal(layout.top(7), 7 * ROW)
  assert.equal(layout.top(40), 40 * ROW)
  assert.equal(layout.height(3), ROW)
  assert.equal(layout.rowAt(-5), 0)
  assert.equal(layout.rowAt(ROW - 0.01), 0)
  assert.equal(layout.rowAt(ROW), 1)
  assert.equal(layout.rowAt(1e9), 39)
  assert.equal(layout.cueIndex(5), 5)
  assert.equal(layout.cueIndex(40), -1)
  assert.equal(layout.cueRow(5), 5)
})

test('en tom lista har inga rader', () => {
  const layout = uniformCueLayout([], ROW)
  assert.equal(layout.rowAt(100), -1)
  assert.deepEqual(windowRows(layout, 0, 600), { first: 0, last: 0 })
  assert.deepEqual(viewWindowForLayout(layout, 0, 600), { t0: 0, t1: 8 })
  assert.equal(rowPosition(layout, 50), 0)
})

test('uniform layout ger samma tidsfönster som den gamla viewWindow för alla scrollpositioner', () => {
  const layout = uniformCueLayout(cues, ROW)
  for (let scrollTop = -ROW; scrollTop <= layout.total + 3 * ROW; scrollTop += 37) {
    for (const viewport of [300, 600, 1000]) {
      assert.deepEqual(viewWindowForLayout(layout, scrollTop, viewport), viewWindow(cues, scrollTop, viewport, ROW), `scrollTop ${scrollTop}, höjd ${viewport}`)
    }
  }
})

test('uniform layout ger samma raderna att rita och samma scrollposition som windowRange och scrollToReveal', () => {
  const layout = uniformCueLayout(cues, ROW)
  for (let scrollTop = 0; scrollTop <= layout.total; scrollTop += 41) {
    for (const viewport of [250, 600, 913]) {
      assert.deepEqual(windowRows(layout, scrollTop, viewport), windowRange(scrollTop, viewport, ROW, cues.length), `scrollTop ${scrollTop}, höjd ${viewport}`)
      for (const row of [0, 3, 17, 39]) {
        assert.equal(scrollToRevealRow(layout, row, scrollTop, viewport), scrollToReveal(row, scrollTop, viewport, ROW))
      }
    }
  }
})

test('radpositionen är y delat med radhöjden i en uniform layout, även utanför listan', () => {
  const layout = uniformCueLayout(cues, ROW)
  for (const y of [-100, 0, 10, 84, 1000, layout.total, layout.total + 200]) {
    assert.equal(rowPosition(layout, y), y / ROW)
  }
  assert.equal(rowCenter(layout, 3, 100), 3 * ROW - 100 + ROW / 2)
  assert.equal(rowCenter(layout, 3, 100), rowCenterY(3, 100, ROW))
})

// Replik, replik, kapitel (36 px), replik, kapitel, kapitel, replik.
const entries: LayoutEntry[] = [
  { kind: 'cue', height: 84, start: 0, end: 4 },
  { kind: 'cue', height: 84, start: 10, end: 14 },
  { kind: 'chapter', height: 36, start: 12, end: 12 },
  { kind: 'cue', height: 84, start: 20, end: 24 },
  { kind: 'chapter', height: 36, start: 22, end: 22 },
  { kind: 'chapter', height: 36, start: 22, end: 22 },
  { kind: 'cue', height: 84, start: 30, end: 36 },
]

test('blandade radhöjder: toppar är löpande summor och total är summan', () => {
  const layout = mixedLayout(entries)
  assert.equal(layout.count, 7)
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((row) => layout.top(row)), [0, 84, 168, 204, 288, 324, 360, 444])
  assert.equal(layout.total, 444)
  assert.equal(layout.height(2), 36)
})

test('blandade radhöjder: rad vid y följer radernas verkliga höjd', () => {
  const layout = mixedLayout(entries)
  assert.equal(layout.rowAt(0), 0)
  assert.equal(layout.rowAt(83.9), 0)
  assert.equal(layout.rowAt(84), 1)
  assert.equal(layout.rowAt(167.9), 1)
  assert.equal(layout.rowAt(168), 2)
  assert.equal(layout.rowAt(203.9), 2)
  assert.equal(layout.rowAt(204), 3)
  assert.equal(layout.rowAt(443), 6)
  assert.equal(layout.rowAt(1e6), 6)
  assert.equal(layout.rowAt(-3), 0)
})

test('replikindex påverkas inte av kapitelrader emellan', () => {
  const layout = mixedLayout(entries)
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((row) => layout.cueIndex(row)), [0, 1, -1, 2, -1, -1, 3])
  assert.deepEqual([0, 1, 2, 3].map((cue) => layout.cueRow(cue)), [0, 1, 3, 6])
  assert.equal(layout.cueRow(9), -1)
})

test('blandade radhöjder: tiden interpoleras mellan radernas ankartider, oavsett radens höjd', () => {
  const layout = mixedLayout(entries)
  // Överkanten av en rad är dess ankartid.
  assert.equal(timeAtRow(layout.spans, rowPosition(layout, layout.top(2))), 12)
  assert.equal(timeAtRow(layout.spans, rowPosition(layout, layout.top(3))), 20)
  // Mitt i kapitelraden (18 px av 36) är halvvägs mot nästa rads ankartid: 12 + 0,5 × (20 − 12).
  assert.equal(timeAtRow(layout.spans, rowPosition(layout, layout.top(2) + 18)), 16)
  // Mitt i en replikrad: 10 + 0,5 × (12 − 10).
  assert.equal(timeAtRow(layout.spans, rowPosition(layout, layout.top(1) + 42)), 11)
})

test('blandade radhöjder: tiden aldrig går bakåt när man scrollar nedåt', () => {
  const layout = mixedLayout(entries)
  let previous = -Infinity
  for (let y = 0; y <= layout.total + 100; y += 5) {
    const time = timeAtRow(layout.spans, rowPosition(layout, y))
    assert.ok(time >= previous, `y ${y}: ${time} < ${previous}`)
    previous = time
  }
})

test('blandade radhöjder: tidsfönstret följer scrollen och ett minsta fönster hindrar absurd zoom', () => {
  const layout = mixedLayout(entries)
  const window = viewWindowForLayout(layout, 168, 120)
  assert.ok(window.t1 > window.t0)
  const narrow = viewWindowForLayout(mixedLayout([{ kind: 'cue', height: 84, start: 5, end: 5.2 }, { kind: 'cue', height: 84, start: 5.1, end: 5.3 }]), 0, 168)
  assert.ok(narrow.t1 - narrow.t0 >= 8 - 1e-9)
})

test('blandade radhöjder: raderna att rita räknar delvis synliga rader med, och scrollToReveal använder radens verkliga höjd', () => {
  const layout = mixedLayout(entries)
  // Visar y 100–200: rad 1 (84–168) och rad 2 (168–204, delvis) syns, rad 3 börjar först vid 204. Utan extra rader.
  assert.deepEqual(windowRows(layout, 100, 100, 0), { first: 1, last: 3 })
  // Några pixlar längre ner når fönstret in i rad 3.
  assert.deepEqual(windowRows(layout, 100, 105, 0), { first: 1, last: 4 })
  // Nederkanten precis vid en rads överkant: den raden syns inte.
  assert.deepEqual(windowRows(layout, 0, 168, 0), { first: 0, last: 2 })
  assert.deepEqual(windowRows(layout, 0, 600, 0), { first: 0, last: 7 })
  // Rad 3 (204–288) ligger under ett 100 px högt fönster som börjar vid 0.
  assert.equal(scrollToRevealRow(layout, 3, 0, 100), 288 - 100)
  // Rad 2 (168–204) ligger över ett fönster som börjar vid 200.
  assert.equal(scrollToRevealRow(layout, 2, 200, 100), 168)
  // Redan synlig.
  assert.equal(scrollToRevealRow(layout, 1, 50, 200), 50)
})

test('blandade radhöjder: mittlinjen använder radens egen höjd', () => {
  const layout = mixedLayout(entries)
  assert.equal(rowCenter(layout, 2, 100), 168 - 100 + 18)
})
