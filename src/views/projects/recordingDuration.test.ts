import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordingDurationLabel } from './recordingDuration.ts'

const recording = (durationSeconds?: number) => ({ id: 'r', state: 'recorded' as const, durationSeconds })

test('formaterar längden som hh:mm:ss', () => {
  assert.equal(recordingDurationLabel(recording(59)), '00:00:59')
  assert.equal(recordingDurationLabel(recording(3725)), '01:02:05')
  assert.equal(recordingDurationLabel(recording(36_000)), '10:00:00')
})

test('tomt utan inspelning eller utan känd längd', () => {
  assert.equal(recordingDurationLabel(null), '')
  assert.equal(recordingDurationLabel(recording()), '')
  assert.equal(recordingDurationLabel(recording(0)), '')
})
