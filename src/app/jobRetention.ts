import type { MediaJob } from '../data/types'

// Servern rensar ett jobb sju dagar efter att det blivit klart (lika länge som nedladdningsfilen ligger kvar).
export const JOB_RETENTION_DAYS = 7

/** Hela dagar tills ett klart jobb försvinner ur listan, eller null för pågående jobb. */
export function daysUntilPurge(job: Pick<MediaJob, 'state' | 'completedAtUtc'>, nowMs = Date.now()): number | null {
  if (job.state === 'processing' || !job.completedAtUtc) return null
  const left = JOB_RETENTION_DAYS - (nowMs - Date.parse(job.completedAtUtc)) / 86_400_000
  return Math.max(0, Math.ceil(left))
}

export function purgeText(days: number | null): string | null {
  if (days === null) return null
  if (days === 0) return 'försvinner idag'
  if (days === 1) return 'försvinner imorgon'
  return `försvinner om ${days} dagar`
}
