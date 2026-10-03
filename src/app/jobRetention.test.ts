import assert from 'node:assert/strict'
import { test } from 'node:test'
import { daysUntilPurge, purgeText } from './jobRetention.ts'

const now = Date.parse('2026-10-10T12:00:00Z')

test('ett nyligen klart jobb har sju dagar kvar och ett gammalt färre', () => {
  assert.equal(daysUntilPurge({ state: 'done', completedAtUtc: '2026-10-10T11:00:00Z' }, now), 7)
  assert.equal(daysUntilPurge({ state: 'done', completedAtUtc: '2026-10-07T12:00:00Z' }, now), 4)
  assert.equal(daysUntilPurge({ state: 'error', completedAtUtc: '2026-10-04T00:00:00Z' }, now), 1)
})

test('ett jobb som passerat sju dagar visas som idag, aldrig negativt', () => {
  assert.equal(daysUntilPurge({ state: 'done', completedAtUtc: '2026-10-01T00:00:00Z' }, now), 0)
})

test('pågående jobb eller jobb utan sluttid har ingen rensningstid', () => {
  assert.equal(daysUntilPurge({ state: 'processing' }, now), null)
  assert.equal(daysUntilPurge({ state: 'done' }, now), null)
})

test('texten följer antalet dagar', () => {
  assert.equal(purgeText(null), null)
  assert.equal(purgeText(0), 'försvinner idag')
  assert.equal(purgeText(1), 'försvinner imorgon')
  assert.equal(purgeText(5), 'försvinner om 5 dagar')
})
