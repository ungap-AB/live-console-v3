import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toCaptionStatus } from './captionStatus.ts'

test('för vidare serverns undertextläge med framsteg', () => {
  assert.deepEqual(toCaptionStatus({ state: 'generating', progress: 40 }), { state: 'generating', progress: 40 })
  assert.deepEqual(toCaptionStatus({ state: 'published' }), { state: 'published', progress: null })
  for (const state of ['none', 'failed', 'draft'] as const) assert.equal(toCaptionStatus({ state })?.state, state)
})

test('saknat eller okänt läge ger undefined', () => {
  assert.equal(toCaptionStatus(null), undefined)
  assert.equal(toCaptionStatus(undefined), undefined)
  assert.equal(toCaptionStatus({ state: 'okänt' }), undefined)
})
