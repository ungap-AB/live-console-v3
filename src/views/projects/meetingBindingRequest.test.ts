import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consumeMeetingBindingRequest, requestMeetingBinding } from './meetingBindingRequest.ts'

test('önskemålet gäller en gång, för rätt projekt och en kort stund', () => {
  requestMeetingBinding('p1', 1000)
  assert.equal(consumeMeetingBindingRequest('p2', 2000), false) // fel projekt (och förbrukat)
  requestMeetingBinding('p1', 1000)
  assert.equal(consumeMeetingBindingRequest('p1', 5000), true)
  assert.equal(consumeMeetingBindingRequest('p1', 5000), false) // bara en gång
  requestMeetingBinding('p1', 1000)
  assert.equal(consumeMeetingBindingRequest('p1', 20_000), false) // för gammalt
})
