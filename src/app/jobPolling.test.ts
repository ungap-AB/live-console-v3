import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ACTIVE_POLL_MS, IDLE_POLL_MS, nextPollDelay } from './jobPolling.ts'

test('pågående jobb pollas tätt, annars lugnt', () => {
  assert.equal(nextPollDelay([{ state: 'processing' }], true), ACTIVE_POLL_MS)
  assert.equal(nextPollDelay([{ state: 'done' }, { state: 'error' }], true), IDLE_POLL_MS)
  assert.equal(nextPollDelay([], true), IDLE_POLL_MS)
})

test('ett dolt fönster pollar inte alls', () => {
  assert.equal(nextPollDelay([{ state: 'processing' }], false), null)
  assert.equal(nextPollDelay([], false), null)
})
