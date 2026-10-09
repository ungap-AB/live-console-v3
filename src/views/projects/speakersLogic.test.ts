import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldPollGeneration, speakersView } from './speakersLogic.ts'
import type { CaptionGeneration } from '../../data/types'

const date = (iso: string) => iso.slice(0, 10)
const draft = { recordingId: 'r', language: 'sv' } as unknown as NonNullable<CaptionGeneration['draft']>

test('utan analys och utan undertexter går det inte att starta, och orsaken sägs', () => {
  const view = speakersView({ speakersAvailable: true }, date)
  assert.equal(view.state, 'none')
  assert.equal(view.blockedReason, 'Skapa undertexter först.')
  assert.equal(view.actionLabel, 'Analysera talarbyten')
})

test('med undertexter går analysen att starta', () => {
  const view = speakersView({ draft, speakersAvailable: true }, date)
  assert.equal(view.blockedReason, null)
  assert.equal(view.actionLabel, 'Analysera talarbyten')
})

test('medan undertexter skapas går analysen inte att starta', () => {
  const view = speakersView({ draft, speakersAvailable: true, job: { state: 'processing' } as CaptionGeneration['job'] }, date)
  assert.equal(view.blockedReason, 'Undertexter skapas just nu.')
})

test('pågående analys visar framsteg och ingen knapp', () => {
  const view = speakersView({ draft, speakers: { state: 'analyzing', progress: 40, turnCount: 0 } }, date)
  assert.deepEqual([view.state, view.progress, view.actionLabel], ['analyzing', 40, null])
})

test('klar analys visar antalet turer och datum och erbjuder att köra om', () => {
  const view = speakersView({ draft, speakersAvailable: true, speakers: { state: 'ready', turnCount: 1234, createdAtUtc: '2026-10-09T10:00:00Z' } }, date)
  assert.equal(view.text, '1 234 talarturer analyserade 2026-10-09.')
  assert.equal(view.actionLabel, 'Analysera igen')
})

test('misslyckad analys visar orsaken och erbjuder nytt försök', () => {
  const view = speakersView({ draft, speakersAvailable: true, speakers: { state: 'failed', turnCount: 0, error: 'Ljudet saknas' } }, date)
  assert.equal(view.text, 'Analysen misslyckades: Ljudet saknas')
  assert.equal(view.actionLabel, 'Försök igen')
})

test('när talarbyten är avstängda i miljön syns raden inte, och bara redan analyserade talarbyten visas utan knapp', () => {
  assert.equal(speakersView({ draft }, date).visible, false)
  assert.equal(speakersView({ draft, speakers: { state: 'none', turnCount: 0 } }, date).visible, false)
  const ready = speakersView({ draft, speakers: { state: 'ready', turnCount: 5 } }, date)
  assert.deepEqual([ready.visible, ready.actionLabel], [true, null])
})

test('pollningen fortsätter medan ett undertextjobb eller en talaranalys pågår', () => {
  assert.equal(shouldPollGeneration(null), false)
  assert.equal(shouldPollGeneration({ speakers: { state: 'ready', turnCount: 1 } }), false)
  assert.equal(shouldPollGeneration({ job: { state: 'processing' } as CaptionGeneration['job'] }), true)
  assert.equal(shouldPollGeneration({ speakers: { state: 'analyzing', turnCount: 0 } }), true)
})
