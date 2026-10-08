import assert from 'node:assert/strict'
import { test } from 'node:test'
import { failedCopy, publishedCopy, stepLabel } from './publishOutcome.ts'

const base = { wasPublished: false, visibility: 'open' as const, chapterCount: 12, captions: { label: 'Svenska', cueCount: 1240 } }

test('första publiceringen heter "Ondemand publicerad", en ompublicering "Ondemand uppdaterad"', () => {
  assert.equal(publishedCopy(base).title, 'Ondemand publicerad')
  assert.equal(publishedCopy({ ...base, wasPublished: true }).title, 'Ondemand uppdaterad')
})

test('ett stängt projekt säger att tittarna inte ser inspelningen och erbjuder att öppna det', () => {
  const copy = publishedCopy({ ...base, visibility: 'closed' })
  assert.equal(copy.closed, true)
  assert.match(copy.intro, /stängt/)
  assert.equal(publishedCopy(base).closed, false)
})

test('sammanfattningen visar kapitel och undertexter, och säger det när de saknas', () => {
  assert.deepEqual(publishedCopy(base).facts, ['12 kapitel', 'Undertexter: Svenska (1 240 repliker)'])
  assert.deepEqual(publishedCopy({ ...base, chapterCount: 0, captions: null }).facts, ['Inga kapitel', 'Inga undertexter'])
  assert.equal(publishedCopy({ ...base, chapterCount: 1 }).facts[0], '1 kapitel')
})

test('ett misslyckat steg namnges i texten', () => {
  const steps = [{ key: 'trim' as const, label: 'Förbereder den trimmade videon' }, { key: 'publish' as const, label: 'Publicerar och uppdaterar spelaren' }]
  assert.match(failedCopy(stepLabel(steps, 'trim')).text, /Förbereder den trimmade videon/)
  assert.equal(stepLabel(steps, 'chapters'), 'Publicerar')
})
