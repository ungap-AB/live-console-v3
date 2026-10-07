import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSessionLost } from './sessionLogic.ts'

test('401 med token är en förlorad session, oavsett om kroppen saknas eller koden är en annan', () => {
  assert.equal(isSessionLost(401, 'unknown_error', true), true)
  assert.equal(isSessionLost(401, 'invalid_token', true), true)
  assert.equal(isSessionLost(401, 'user_not_found', true), true)
  assert.equal(isSessionLost(401, 'domain_not_found', true), true)
})

test('403 och andra fel loggar inte ut', () => {
  assert.equal(isSessionLost(403, 'forbidden', true), false)
  assert.equal(isSessionLost(404, 'not_found', true), false)
  assert.equal(isSessionLost(500, 'unknown_error', true), false)
})

test('utan token, eller vid fel PIN, finns ingen session att tappa', () => {
  assert.equal(isSessionLost(401, 'unknown_error', false), false)
  assert.equal(isSessionLost(401, 'invalid_credentials', true), false)
})
