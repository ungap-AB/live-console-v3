import { test } from 'node:test'
import assert from 'node:assert/strict'
import { meetingLinkStatus, statusStripView } from './statusStripLogic.ts'

test('the strip waits for the session, then asks for a login', () => {
  assert.equal(statusStripView('loading', 'p1'), 'loading')
  assert.equal(statusStripView('anon', 'p1'), 'signIn')
})

test('the strip shows the open project, or points to Projects when none is open', () => {
  assert.equal(statusStripView('authed', 'p1'), 'project')
  assert.equal(statusStripView('authed', null), 'noProject')
})

const M = '0b6f5c3e-1111-4222-8333-944455556666'

test('UNG-332: the strip says whether the open meeting drives the project', () => {
  assert.equal(meetingLinkStatus(null, M), 'unknown')
  assert.equal(meetingLinkStatus({ available: false, meetingId: null }, M), 'unavailable')
  assert.equal(meetingLinkStatus({ available: true, meetingId: null }, M), 'notLinked')
  assert.equal(meetingLinkStatus({ available: true, meetingId: null }, null), 'notLinked')
  assert.equal(meetingLinkStatus({ available: true, meetingId: M }, null), 'notOpen')
  assert.equal(meetingLinkStatus({ available: true, meetingId: M }, 'aaaaaaaa-1111-4222-8333-944455556666'), 'other')
  assert.equal(meetingLinkStatus({ available: true, meetingId: M }, M.toUpperCase()), 'drives')
})
