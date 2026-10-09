import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TimelineEvent } from '../../data/types.ts'
import { forkFromOptions, forkSource, forkWarningText } from './forkLogic.ts'

const rec = (state: string, source?: string) => ({ id: 'r1', state: state as never, source })

test('ett fork går att göra av en pågående sändning, och av en färdig inspelning, men inte av en uppladdad eller extern video', () => {
  assert.equal(forkSource({ publicMode: 'live', recording: null }, 'Live'), 'live')
  assert.equal(forkSource({ publicMode: 'live', recording: null }, 'WaitingForStream'), null)
  assert.equal(forkSource({ publicMode: 'live', recording: null }, undefined), null)
  assert.equal(forkSource({ publicMode: 'after', recording: rec('recorded', 'Live-sändning (efterregistrerad)') }, undefined), 'recording')
  assert.equal(forkSource({ publicMode: 'ondemand', recording: rec('published') }, undefined), 'recording')
  assert.equal(forkSource({ publicMode: 'after', recording: rec('trimmed') }, undefined), 'recording')
  assert.equal(forkSource({ publicMode: 'after', recording: rec('processing') }, undefined), null)
  assert.equal(forkSource({ publicMode: 'after', recording: rec('recorded', 'upload') }, undefined), null)
  assert.equal(forkSource({ publicMode: 'ondemand', recording: rec('published', 'external') }, undefined), null)
  assert.equal(forkSource({ publicMode: 'before', recording: null }, undefined), null)
  assert.equal(forkSource({ publicMode: 'after', recording: null }, undefined), null)
})

const event = (id: string, kind: TimelineEvent['kind'], label: string, occurredAt: string, refId: string | null = id): TimelineEvent => ({ id, kind, refId, label, occurredAt, offsetSeconds: null })

test('förslagen är början, efter senaste pausen och senaste dagordningspunkten', () => {
  const options = forkFromOptions([
    event('a1', 'agendaItem', '§ 1 Öppnande', '2026-10-09T09:00:00Z'),
    event('p1', 'pauseIn', 'Lunch', '2026-10-09T10:00:00Z'),
    event('p2', 'pauseOut', 'Paus slut', '2026-10-09T11:00:00Z'),
    event('a2', 'agendaItem', '§ 2 Budget', '2026-10-09T11:05:00Z'),
    event('a3', 'agendaItem', 'Rensat', '2026-10-09T11:30:00Z', null),
  ])

  assert.deepEqual(options.map((o) => [o.key, o.fromUtc]), [['start', null], ['pause', '2026-10-09T11:00:00Z'], ['agenda', '2026-10-09T11:05:00Z']])
  assert.match(options[2].label, /§ 2 Budget/)
})

test('utan paus eller punkt finns bara början', () => {
  assert.deepEqual(forkFromOptions([]).map((o) => o.key), ['start'])
  assert.deepEqual(forkFromOptions([event('x', 'person', 'Mira', '2026-10-09T09:00:00Z')]).map((o) => o.key), ['start'])
})

test('varningstexten sätter ihop serverns meddelanden', () => {
  assert.equal(forkWarningText([]), '')
  assert.equal(forkWarningText([{ code: 'a', message: 'Ett.' }, { code: 'b', message: 'Två.' }]), 'Ett. Två.')
})
