import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inactivityPhase } from './sessionLogic.ts'

test('inaktivitet: aktiv, varning de sista 2 minuterna, sedan utloggning efter 2 h', () => {
  const hour = 60 * 60_000
  assert.deepEqual(inactivityPhase(0, 1 * hour), { phase: 'active' })
  assert.deepEqual(inactivityPhase(0, 2 * hour - 120_001), { phase: 'active' })
  assert.deepEqual(inactivityPhase(0, 2 * hour - 90_000), { phase: 'warning', remainingMs: 90_000 })
  assert.deepEqual(inactivityPhase(0, 2 * hour), { phase: 'expired' })
  assert.deepEqual(inactivityPhase(0, 30 * hour), { phase: 'expired' })
})
