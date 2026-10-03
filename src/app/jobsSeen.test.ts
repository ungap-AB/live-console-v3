import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MediaJob } from '../data/types.ts'
import { countNewFinished } from './jobsSeen.ts'

function job(id: string, state: MediaJob['state'], completedAtUtc?: string): MediaJob {
  return { id, kind: 'download', state, recordingId: `r-${id}`, createdAtUtc: '2026-10-03T10:00:00Z', completedAtUtc }
}

const seen = Date.parse('2026-10-03T12:00:00Z')

test('klara och misslyckade jobb efter senaste besöket räknas som nya', () => {
  const jobs = [job('a', 'done', '2026-10-03T12:00:01Z'), job('b', 'error', '2026-10-03T13:00:00Z')]
  assert.equal(countNewFinished(jobs, seen), 2)
})

test('jobb som blev klara före eller exakt vid senaste besöket är inte nya', () => {
  const jobs = [job('a', 'done', '2026-10-03T11:59:59Z'), job('b', 'done', '2026-10-03T12:00:00Z')]
  assert.equal(countNewFinished(jobs, seen), 0)
})

test('pågående och avbrutna jobb räknas aldrig', () => {
  const jobs = [job('a', 'processing'), job('b', 'canceled', '2026-10-03T13:00:00Z')]
  assert.equal(countNewFinished(jobs, seen), 0)
})

test('ett klart jobb utan sluttid räknas inte', () => {
  assert.equal(countNewFinished([job('a', 'done')], seen), 0)
})
