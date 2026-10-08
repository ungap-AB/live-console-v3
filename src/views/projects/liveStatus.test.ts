import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encoderStatusOf, viewerCountOf } from './liveStatus.ts'

const live = { hasChannel: true, publicMode: 'live' as const }

test('utan ingest, med signal och med avbrott', () => {
  assert.deepEqual(encoderStatusOf({ ...live, hasChannel: false }), { label: 'Ingen ingest', tone: 'neutral' })
  assert.deepEqual(encoderStatusOf({ ...live, livePhase: 'Live' }), { label: 'Signal OK', tone: 'ok' })
  assert.deepEqual(encoderStatusOf({ ...live, healthState: 'live' }), { label: 'Signal OK', tone: 'ok' })
  assert.deepEqual(encoderStatusOf({ ...live, livePhase: 'SignalInterrupted' }), { label: 'Avbrott i signal', tone: 'danger' })
  assert.deepEqual(encoderStatusOf({ ...live, livePhase: 'SignalInterruptedDeclined' }), { label: 'Avbrott i signal', tone: 'danger' })
})

test('After väntar på att enkodern stoppar medan strömmen ännu är igång', () => {
  const after = { hasChannel: true, publicMode: 'after' as const }
  assert.equal(encoderStatusOf({ ...after, livePhase: 'Live' }).label, 'Väntar på att enkoder stoppar')
  assert.equal(encoderStatusOf({ ...after, livePhase: 'WaitingForStream' }).label, 'Väntar på att enkoder stoppar')
  assert.equal(encoderStatusOf({ ...after, livePhase: 'StreamEnded' }).label, 'Sändningen avslutad')
})

test('övriga lägen', () => {
  assert.equal(encoderStatusOf({ hasChannel: true, publicMode: 'ondemand' }).label, 'Ingen signal')
  assert.equal(encoderStatusOf({ hasChannel: true, publicMode: 'before' }).label, 'Väntar på signal')
  assert.equal(encoderStatusOf({ ...live, livePhase: 'WaitingForStream' }).label, 'Väntar på signal')
})

test('tittarantalet visas bara medan strömmen är live och siffran finns', () => {
  assert.equal(viewerCountOf({ state: 'live', viewerCount: 42 }), 42)
  assert.equal(viewerCountOf({ state: 'live', viewerCount: 0 }), 0)
  assert.equal(viewerCountOf({ state: 'offline', viewerCount: 42 }), null)
  assert.equal(viewerCountOf({ state: 'live' }), null)
  assert.equal(viewerCountOf(null), null)
})
