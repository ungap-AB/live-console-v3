import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TimelineEvent } from '../../data/types.ts'
import { currentPauseFromTimeline, MAX_PAUSE_TEXT_LENGTH, normalizePauseText, pauseDurationText, suggestedPauseText } from './pauseLogic.ts'

function event(id: string, kind: TimelineEvent['kind'], label: string): TimelineEvent {
  return { id, kind, refId: null, label, occurredAt: '2026-10-07T12:00:00Z', offsetSeconds: null }
}

test('pausen pågår när den senaste paus-händelsen är en pauseIn', () => {
  assert.equal(currentPauseFromTimeline([]), null)
  assert.equal(currentPauseFromTimeline([event('a', 'agendaItem', 'Punkt 1')]), null)
  assert.equal(currentPauseFromTimeline([event('a', 'pauseIn', 'Lunch'), event('b', 'agendaItem', 'Punkt 2')])?.label, 'Lunch')
  assert.equal(currentPauseFromTimeline([event('a', 'pauseIn', 'Lunch'), event('b', 'pauseOut', 'Paus slut')]), null)
  assert.equal(currentPauseFromTimeline([event('a', 'pauseIn', 'Lunch'), event('b', 'pauseOut', 'Paus slut'), event('c', 'pauseIn', 'Fika')])?.id, 'c')
})

test('texten trimmas och begränsas, och tom text blir Paus', () => {
  assert.equal(normalizePauseText('  Lunch till 13.00 '), 'Lunch till 13.00')
  assert.equal(normalizePauseText('   '), 'Paus')
  assert.equal(normalizePauseText('x'.repeat(1000)).length, MAX_PAUSE_TEXT_LENGTH)
})

test('förslaget i dialogen är senaste pausens text, annars en standardtext', () => {
  assert.equal(suggestedPauseText([event('a', 'pauseIn', 'Lunch till 13.00')]), 'Lunch till 13.00')
  assert.equal(suggestedPauseText([]), 'Ajournering. Sändningen fortsätter strax.')
  assert.equal(suggestedPauseText([event('a', 'pauseIn', 'Paus')]), 'Ajournering. Sändningen fortsätter strax.')
})

test('hur länge pausen pågått skrivs i klartext', () => {
  const since = '2026-10-07T12:00:00Z'
  const at = (minutes: number, seconds = 0) => Date.parse(since) + minutes * 60_000 + seconds * 1000
  assert.equal(pauseDurationText(since, at(0, 30)), 'nyss')
  assert.equal(pauseDurationText(since, at(7)), '7 min')
  assert.equal(pauseDurationText(since, at(60)), '1 h')
  assert.equal(pauseDurationText(since, at(65)), '1 h 5 min')
  assert.equal(pauseDurationText(since, at(-5)), 'nyss') // klockan går före: aldrig negativt
})
