import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PlayoutState } from '../../data/types.ts'
import { applyRehearsalCue, isRehearsal, isRehearsalEvent } from './rehearsalLogic.ts'

const empty: PlayoutState = { currentAgendaItemId: null, currentPersonId: null, timeline: [] }

test('bara Before är provkörning', () => {
  assert.equal(isRehearsal('before'), true)
  assert.equal(isRehearsal('live'), false)
  assert.equal(isRehearsal('after'), false)
  assert.equal(isRehearsal('ondemand'), false)
})

test('en provkörd punkt markeras men hamnar aldrig på tidslinjen', () => {
  const next = applyRehearsalCue(empty, 'agendaItem', 'i2', '2. Budget')
  assert.equal(next.currentAgendaItemId, 'i2')
  assert.equal(next.currentAgendaItem?.label, '2. Budget')
  assert.equal(next.rehearsal, true)
  assert.deepEqual(next.timeline, [])
})

test('en ny punkt döljer namnet, som i Live', () => {
  const withName = applyRehearsalCue(empty, 'person', 'p1', 'Anna Andersson')
  assert.equal(withName.currentPersonId, 'p1')
  const next = applyRehearsalCue(withName, 'agendaItem', 'i2', '2. Budget')
  assert.equal(next.currentPersonId, null)
  assert.equal(next.currentPerson, null)
})

test('rensning tar bort markeringen', () => {
  const marked = applyRehearsalCue(empty, 'person', 'p1', 'Anna Andersson')
  const cleared = applyRehearsalCue(marked, 'person', null, 'Rensat')
  assert.equal(cleared.currentPersonId, null)
  assert.equal(cleared.currentPerson, null)
})

test('paus och utrop ändrar inget i provkörning', () => {
  const marked = applyRehearsalCue(empty, 'agendaItem', 'i1', '1. Upprop')
  const next = applyRehearsalCue(marked, 'pauseIn', null, 'Paus')
  assert.equal(next.currentAgendaItemId, 'i1')
  assert.equal(next.currentPause, undefined)
  assert.deepEqual(next.timeline, [])
})

test('ett provkörningskvitto skiljs från en sparad händelse på id', () => {
  const at = '2026-10-15T20:00:00Z'
  assert.equal(isRehearsalEvent({ id: 'rh1a2b3c4d5e', kind: 'agendaItem', refId: 'i1', label: 'x', occurredAt: at, offsetSeconds: null }), true)
  assert.equal(isRehearsalEvent({ id: 'ev1a2b3c4d5e', kind: 'agendaItem', refId: 'i1', label: 'x', occurredAt: at, offsetSeconds: null }), false)
})
