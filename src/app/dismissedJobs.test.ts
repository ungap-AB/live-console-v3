import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MediaJob } from '../data/types.ts'
import { groupJobs, pruneDismissed } from './dismissedJobs.ts'

function job(id: string, state: MediaJob['state']): MediaJob {
  return { id, kind: 'download', state, recordingId: `r-${id}`, createdAtUtc: '2026-10-03T12:00:00Z' }
}

test('pågående jobb ligger alltid kvar, även om id:t råkar finnas bland de dolda', () => {
  const groups = groupJobs([job('a', 'processing'), job('b', 'done')], ['a'])
  assert.deepEqual(groups.active.map((j) => j.id), ['a'])
  assert.deepEqual(groups.dismissed.map((j) => j.id), [])
})

test('dolda klara jobb tas ur listan och hamnar under "dolda"', () => {
  const groups = groupJobs([job('a', 'done'), job('b', 'error'), job('c', 'done')], ['b'])
  assert.deepEqual(groups.recent.map((j) => j.id), ['a', 'c'])
  assert.deepEqual(groups.dismissed.map((j) => j.id), ['b'])
})

test('bara de senaste visas som standard, resten ligger bakom "Visa fler"', () => {
  const jobs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => job(id, 'done'))
  const groups = groupJobs(jobs, [], 5)
  assert.deepEqual(groups.recent.map((j) => j.id), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(groups.older.map((j) => j.id), ['f', 'g'])
})

test('att dölja ett jobb ger plats åt ett äldre i listan', () => {
  const jobs = ['a', 'b', 'c'].map((id) => job(id, 'done'))
  const groups = groupJobs(jobs, ['a'], 2)
  assert.deepEqual(groups.recent.map((j) => j.id), ['b', 'c'])
  assert.deepEqual(groups.older, [])
})

test('id:n för jobb som servern rensat tas bort, och dubbletter försvinner', () => {
  const jobs = [job('a', 'done'), job('b', 'done')]
  assert.deepEqual(pruneDismissed(['a', 'gammalt', 'a', 'b'], jobs), ['a', 'b'])
})
