import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMeetingId } from './meetingLink.ts'

const id = '0b6f3d2e-7a51-4c2b-9d0e-5f1a2b3c4d5e'

test('a bare meeting id is accepted and lower-cased', () => {
  assert.equal(parseMeetingId(` ${id.toUpperCase()} `), id)
})

test('the id is taken from a pasted secretary view address', () => {
  assert.equal(parseMeetingId(`https://test.meeting.ungap.net/#meeting/${id}`), id)
})

test('anything without a meeting id is refused', () => {
  assert.equal(parseMeetingId(''), null)
  assert.equal(parseMeetingId('12345'), null)
  assert.equal(parseMeetingId('https://test.meeting.ungap.net/#meetings'), null)
})
