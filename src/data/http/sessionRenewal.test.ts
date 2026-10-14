import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inactivityPhase, renewalDue, tokenLifetime } from './sessionLogic.ts'

function jwt(payload: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

test('livstiden läses ur token (nbf/exp i sekunder)', () => {
  assert.deepEqual(tokenLifetime(jwt({ nbf: 1000, exp: 2800 })), { validFrom: 1_000_000, expiresAt: 2_800_000 })
  assert.deepEqual(tokenLifetime(jwt({ iat: 1000, exp: 2800 })), { validFrom: 1_000_000, expiresAt: 2_800_000 })
  assert.equal(tokenLifetime('inte-ett-token'), null)
  assert.equal(tokenLifetime(jwt({ exp: 2800 })), null)
})

test('token förnyas först när halva livstiden gått', () => {
  const token = jwt({ nbf: 1000, exp: 2800 }) // 30 min
  assert.equal(renewalDue(token, 1_000_000 + 14 * 60_000), false)
  assert.equal(renewalDue(token, 1_000_000 + 15 * 60_000), true)
  assert.equal(renewalDue('inte-ett-token', 9_999_999_999), false)
})

test('inaktivitet: aktiv, varning de sista 2 minuterna, sedan utloggning efter 2 h', () => {
  const hour = 60 * 60_000
  assert.deepEqual(inactivityPhase(0, 1 * hour), { phase: 'active' })
  assert.deepEqual(inactivityPhase(0, 2 * hour - 120_001), { phase: 'active' })
  assert.deepEqual(inactivityPhase(0, 2 * hour - 90_000), { phase: 'warning', remainingMs: 90_000 })
  assert.deepEqual(inactivityPhase(0, 2 * hour), { phase: 'expired' })
  assert.deepEqual(inactivityPhase(0, 30 * hour), { phase: 'expired' })
})
