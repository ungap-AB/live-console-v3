import { t } from '@lingui/core/macro'
import type { MediaJob } from '../data/types'

// The server purges a job seven days after it finished (as long as the download file is kept).
export const JOB_RETENTION_DAYS = 7

/** Whole days until a finished job disappears from the list, or null for a job in progress. */
export function daysUntilPurge(job: Pick<MediaJob, 'state' | 'completedAtUtc'>, nowMs = Date.now()): number | null {
  if (job.state === 'processing' || !job.completedAtUtc) return null
  const left = JOB_RETENTION_DAYS - (nowMs - Date.parse(job.completedAtUtc)) / 86_400_000
  return Math.max(0, Math.ceil(left))
}

/** The text in the Jobs list's Disappears column (the heading already says what it is about). */
export function purgeText(days: number | null): string | null {
  if (days === null) return null
  if (days === 0) return t`today`
  if (days === 1) return t`tomorrow`
  return t`in ${days} days`
}
