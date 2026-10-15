import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusStripView } from './statusStripLogic.ts'

test('the strip waits for the session, then asks for a login', () => {
  assert.equal(statusStripView('loading', 'p1'), 'loading')
  assert.equal(statusStripView('anon', 'p1'), 'signIn')
})

test('the strip shows the open project, or points to Projects when none is open', () => {
  assert.equal(statusStripView('authed', 'p1'), 'project')
  assert.equal(statusStripView('authed', null), 'noProject')
})
