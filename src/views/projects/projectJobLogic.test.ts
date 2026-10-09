import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MediaJob } from '../../data/types.ts'
import { activeJobsByProject, jobKindIcon } from './projectJobLogic.ts'

function job(id: string, projectId: string | undefined, state: MediaJob['state'], createdAtUtc: string, kind: MediaJob['kind'] = 'captions'): MediaJob {
  return { id, kind, state, recordingId: `r-${id}`, projectId, createdAtUtc }
}

test('bara pågående jobb med projekt räknas, grupperade per projekt', () => {
  const map = activeJobsByProject([
    job('a', 'p1', 'processing', '2026-10-07T10:00:00Z'),
    job('b', 'p2', 'done', '2026-10-07T10:00:00Z'),
    job('c', undefined, 'processing', '2026-10-07T10:00:00Z'),
    job('d', 'p3', 'error', '2026-10-07T10:00:00Z'),
  ])
  assert.deepEqual([...map.keys()], ['p1'])
  assert.equal(map.get('p1')?.extra, 0)
})

test('flera jobb för samma projekt: det senast startade visas, resten räknas', () => {
  const map = activeJobsByProject([
    job('old', 'p1', 'processing', '2026-10-07T09:00:00Z', 'download'),
    job('new', 'p1', 'processing', '2026-10-07T11:00:00Z', 'captions'),
    job('mid', 'p1', 'processing', '2026-10-07T10:00:00Z', 'upload'),
  ])
  assert.equal(map.get('p1')?.job.id, 'new')
  assert.equal(map.get('p1')?.extra, 2)
})

test('ikon per jobbtyp', () => {
  assert.equal(jobKindIcon('download'), 'download')
  assert.equal(jobKindIcon('captions'), 'closed_caption')
  assert.equal(jobKindIcon('upload'), 'upload')
  assert.equal(jobKindIcon('speakers'), 'record_voice_over')
})
