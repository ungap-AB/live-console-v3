import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultLayoutSource, describeLayoutValue, LAYOUT_FIELDS, layoutDiff, layoutOf, layoutSourceOptions } from './layoutInherit.ts'
import type { LayoutFields } from './layoutInherit.ts'

const base: LayoutFields = { beforeText: '', liveText: '', afterText: '', ondemandText: '', textPlacement: 'middle', muxEnabled: false, muxRespectDoNotTrack: false }

test('källorna är senast skapade först, och projektet som ska få layouten utelämnas', () => {
  const projects = [
    { id: 'a', name: 'Äldst', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'c', name: 'Nyast', createdAt: '2026-03-01T00:00:00Z' },
    { id: 'b', name: 'Mitten', createdAt: '2026-02-01T00:00:00Z' },
  ]
  assert.deepEqual(layoutSourceOptions(projects).map((o) => o.id), ['c', 'b', 'a'])
  assert.deepEqual(layoutSourceOptions(projects, 'c').map((o) => o.id), ['b', 'a'])
})

test('förvalet är det senast skapade projektet, och ingen källa finns i den första domänen', () => {
  assert.equal(defaultLayoutSource([{ id: 'c', name: 'Nyast' }, { id: 'a', name: 'Äldst' }]), 'c')
  assert.equal(defaultLayoutSource([]), null)
})

test('listan över layoutfält täcker exakt typen (ett nytt attribut måste läggas till i båda)', () => {
  const sample = layoutOf({ ...base })
  assert.deepEqual(LAYOUT_FIELDS.map((field) => field.key).sort(), Object.keys(sample).sort())
})

test('layoutOf tar bara layoutfälten', () => {
  const project = { ...base, beforeText: 'Hej', id: 'p1', name: 'Projekt' } as LayoutFields & { id: string; name: string }
  assert.deepEqual(Object.keys(layoutOf(project)).includes('id'), false)
  assert.equal(layoutOf(project).beforeText, 'Hej')
})

test('bekräftelsen listar bara det som skiljer sig, med gammalt och nytt värde', () => {
  const current: LayoutFields = { ...base, beforeText: 'Gammal text', muxEnabled: false }
  const source: LayoutFields = { ...base, beforeText: 'Vi börjar snart.', muxEnabled: true, textPlacement: 'bottom' }
  assert.deepEqual(layoutDiff(current, source).map((change) => [change.key, change.from, change.to]), [
    ['beforeText', 'Gammal text', 'Vi börjar snart.'],
    ['textPlacement', 'Mitten', 'Underkant'],
    ['muxEnabled', 'Av', 'På'],
  ])
  assert.deepEqual(layoutDiff(current, current), [])
})

test('värden visas läsbart: tom text, placering, på/av och kortade texter', () => {
  assert.equal(describeLayoutValue('liveText', ''), '(tom)')
  assert.equal(describeLayoutValue('liveText', '   '), '(tom)')
  assert.equal(describeLayoutValue('textPlacement', 'top'), 'Överkant')
  assert.equal(describeLayoutValue('muxRespectDoNotTrack', true), 'På')
  assert.ok(describeLayoutValue('afterText', 'x'.repeat(200)).length <= 71)
})
