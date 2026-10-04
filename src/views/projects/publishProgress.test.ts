import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPublishSteps, formatElapsed } from './publishProgress.ts'

test('förfluten tid visas som sekunder eller minuter och sekunder', () => {
  assert.equal(formatElapsed(0), '0 s')
  assert.equal(formatElapsed(42), '42 s')
  assert.equal(formatElapsed(60), '1 min 0 s')
  assert.equal(formatElapsed(185), '3 min 5 s')
})

test('stegen följer konsolens ordning och spara/trimma tas bara med när de behövs', () => {
  assert.deepEqual(buildPublishSteps({ saveDraft: true, trim: true }).map((s) => s.key), ['save', 'trim', 'publish', 'chapters'])
  assert.deepEqual(buildPublishSteps({ saveDraft: false, trim: false }).map((s) => s.key), ['publish', 'chapters'])
  assert.deepEqual(buildPublishSteps({ saveDraft: true, trim: false }).map((s) => s.key), ['save', 'publish', 'chapters'])
})
