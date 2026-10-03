import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shareEventText } from './shareEvents.ts'

const at = '2026-10-03T16:31:34Z'

test('loggrader får läsbar text', () => {
  assert.equal(shareEventText({ kind: 'created', occurredAtUtc: at, detail: '2 fil(er) till 1 mottagare' }), 'Delningen skapades (2 fil(er) till 1 mottagare)')
  assert.equal(shareEventText({ kind: 'downloaded', occurredAtUtc: at, detail: 'Testar fasövergångar' }), 'Hämtade "Testar fasövergångar"')
  assert.equal(shareEventText({ kind: 'revoked', occurredAtUtc: at, detail: 'Anders Mårtén' }), 'Återkallades av Anders Mårtén')
})

test('ett mejl som inte gick iväg visar adress och orsak', () => {
  assert.equal(
    shareEventText({ kind: 'mail_failed', occurredAtUtc: at, detail: 'a@example.com: email_rate_limited' }),
    'Mejlet till a@example.com gick inte iväg (för många mejl till adressen den senaste timmen)',
  )
})
