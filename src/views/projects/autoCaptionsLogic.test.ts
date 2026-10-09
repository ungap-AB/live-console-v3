import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CaptionDraft, MediaJob } from '../../data/types.ts'
import { approveBlockedReason, autoCaptionsPhase, draftState, estimatedTotalMinutes, estimatedWaitText, groupCorrections, jobEstimateText } from './autoCaptionsLogic.ts'

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

test('ett äldre utkast (på trimmad tidslinje) får inte godkännas', () => {
  assert.match(approveBlockedReason({ stale: true }) ?? '', /äldre sätt/)
  assert.equal(approveBlockedReason({ stale: false }), null)
})

test('utkastets läge: ogranskat, publicerat eller publicerat med ändringar', () => {
  assert.equal(draftState({}), 'unreviewed')
  assert.equal(draftState({ approvedAtUtc: '2026-10-06T10:00:00Z', unpublishedChanges: false }), 'published')
  assert.equal(draftState({ approvedAtUtc: '2026-10-06T10:00:00Z', unpublishedChanges: true }), 'changed')
  assert.equal(draftState({ unpublishedChanges: true }), 'unreviewed')
})

// Tiderna byggs i lokal tid, så testerna gäller i vilken tidszon som helst.
const at = (hours: number, minutes: number) => new Date(2026, 9, 9, hours, minutes).getTime()
const input = (overrides: Partial<Parameters<typeof jobEstimateText>[0]> = {}) => ({
  videoDurationSeconds: 7200, includeSpeakers: false, startedAtUtc: new Date(at(11, 39)).toISOString(), progress: undefined, nowMs: at(11, 41), ...overrides,
})

test('uppskattningen: kort och lång video, med och utan talarbyten', () => {
  assert.equal(estimatedTotalMinutes(600, false), 2)
  assert.equal(estimatedTotalMinutes(7200, false), 10)
  assert.equal(estimatedTotalMinutes(7200, true), 32) // 2 timmar: ca 5 + 11 minuter per timme
  assert.equal(estimatedTotalMinutes(undefined, true), null)
  assert.equal(estimatedTotalMinutes(0, false), null)
})

test('texten under ljudsteget och tidigt visar bara den totala uppskattningen och starttiden', () => {
  assert.equal(jobEstimateText(input({ progress: 4 })), 'Beräknad tid: ungefär 10 minuter, startade 11:39.')
  assert.equal(jobEstimateText(input({ progress: undefined })), 'Beräknad tid: ungefär 10 minuter, startade 11:39.')
  assert.equal(jobEstimateText(input({ progress: 14 })), 'Beräknad tid: ungefär 10 minuter, startade 11:39.')
})

test('med talarbyten blir uppskattningen längre, och okänd längd ger "några minuter"', () => {
  assert.equal(jobEstimateText(input({ includeSpeakers: true })), 'Beräknad tid: ungefär 32 minuter, startade 11:39.')
  assert.equal(jobEstimateText(input({ videoDurationSeconds: undefined })), 'Beräknad tid: några minuter, startade 11:39.')
})

test('sent framsteg ger en återstående tid extrapolerad ur förfluten tid', () => {
  // 6 minuter gått och 40 % klart: 9 minuter kvar.
  assert.equal(jobEstimateText(input({ progress: 40, nowMs: at(11, 45) })), 'Beräknad tid: ungefär 10 minuter, startade 11:39. Ungefär 9 minuter kvar.')
  assert.match(jobEstimateText(input({ progress: 50, nowMs: at(11, 40) })), /Ungefär 1 minut kvar\./)
  assert.match(jobEstimateText(input({ progress: 99, nowMs: at(11, 49) })), /Klart om en liten stund\./)
  // Klart (100 %) eller ingen förfluten tid ger ingen återstående tid.
  assert.doesNotMatch(jobEstimateText(input({ progress: 100 })), /kvar/)
})
