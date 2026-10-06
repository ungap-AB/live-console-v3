import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CaptionDraft, MediaJob } from '../../data/types.ts'
import { approveBlockedReason, autoCaptionsPhase, estimatedWaitText, groupCorrections } from './autoCaptionsLogic.ts'

function job(state: MediaJob['state'], createdAtUtc = '2026-10-06T10:00:00Z'): MediaJob {
  return { id: 'cj1', kind: 'captions', state, recordingId: 'r1', createdAtUtc }
}

function draft(createdAtUtc = '2026-10-06T09:00:00Z', stale = false): CaptionDraft {
  return { recordingId: 'r1', language: 'sv', createdAtUtc, cueCount: 10, lastCueEndSeconds: 60, audioSeconds: 60, stale, corrections: [] }
}

test('inget jobb och inget utkast: inget har startats', () => {
  assert.equal(autoCaptionsPhase({}), 'idle')
})

test('ett pågående jobb visas även om ett äldre utkast finns', () => {
  assert.equal(autoCaptionsPhase({ job: job('processing'), draft: draft() }), 'running')
})

test('ett misslyckat jobb visas bara om det är nyare än utkastet', () => {
  assert.equal(autoCaptionsPhase({ job: job('error', '2026-10-06T10:00:00Z') }), 'failed')
  assert.equal(autoCaptionsPhase({ job: job('error', '2026-10-06T10:00:00Z'), draft: draft('2026-10-06T09:00:00Z') }), 'failed')
  assert.equal(autoCaptionsPhase({ job: job('error', '2026-10-06T08:00:00Z'), draft: draft('2026-10-06T09:00:00Z') }), 'draft')
})

test('ett klart eller avbrutet jobb ger utkastet (eller ingenting)', () => {
  assert.equal(autoCaptionsPhase({ job: job('done'), draft: draft() }), 'draft')
  assert.equal(autoCaptionsPhase({ job: job('canceled'), draft: draft() }), 'draft')
  assert.equal(autoCaptionsPhase({ job: job('canceled') }), 'idle')
})

test('identiska rättningar samlas och räknas, i ordning efter första förekomst', () => {
  const groups = groupCorrections([
    { time: 300, original: 'Per Eriksen', replacement: 'Per Eriksson', similarity: 0.93 },
    { time: 49.3, original: 'Susanne Örn', replacement: 'Susanne Öhrn', similarity: 1 },
    { time: 10, original: 'Per Eriksen', replacement: 'Per Eriksson', similarity: 0.93 },
  ])
  assert.deepEqual(groups, [
    { original: 'Per Eriksen', replacement: 'Per Eriksson', count: 2, firstTime: 10 },
    { original: 'Susanne Örn', replacement: 'Susanne Öhrn', count: 1, firstTime: 49.3 },
  ])
})

test('väntetiden följer videons längd och blir aldrig under två minuter', () => {
  assert.equal(estimatedWaitText(undefined), 'några minuter')
  assert.equal(estimatedWaitText(600), 'ungefär 2 minuter')
  assert.equal(estimatedWaitText(7200), 'ungefär 10 minuter')
})

test('ett inaktuellt utkast får inte godkännas', () => {
  assert.match(approveBlockedReason({ stale: true }) ?? '', /trimmats om/)
  assert.equal(approveBlockedReason({ stale: false }), null)
})
