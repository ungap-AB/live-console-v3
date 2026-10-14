import assert from 'node:assert/strict'
import { test } from 'node:test'
import { holdActivity, lastActivity, markActivity } from './activity.ts'

const hour = 60 * 60_000

test('en pågående sändning räknas som aktivitet hela tiden, och tiden räknas från när den slutar', () => {
  const release = holdActivity()
  const later = Date.now() + 5 * hour
  assert.equal(lastActivity(later), later)
  const before = Date.now()
  release()
  assert.ok(lastActivity(later) >= before)
  release() // dubbelt släpp är ofarligt
  assert.ok(lastActivity(later) < later)
})

test('aktivitet flyttar fram tiden, aldrig bakåt', () => {
  const now = Date.now()
  markActivity(now + hour)
  markActivity(now)
  assert.equal(lastActivity(now + 2 * hour), now + hour)
})
