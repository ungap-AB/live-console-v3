import type { MediaJob } from '../data/types'

// UNG-100: när operatören senast tittade i Jobb-vyn. Klara och misslyckade jobb som blev klara efter det visas som
// "nya" i panelen och på menyraden. En enda tidsstämpel per användare i webbläsaren, inte ett id per jobb.
const KEY_PREFIX = 'ungap-live-console:jobs-seen:'

export function readJobsSeenAt(userId: string): number | null {
  try {
    const value = Number(localStorage.getItem(KEY_PREFIX + userId))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function storeJobsSeenAt(userId: string, atMs: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + userId, String(atMs))
  } catch {
    // Privat läge eller blockerad lagring: markeringen gäller bara den här sidvisningen.
  }
}

/**
 * Antal jobb som blivit klara eller misslyckats efter senaste besöket. Avbrutna räknas inte — operatören gjorde det
 * själv — och inte heller pågående.
 */
export function countNewFinished(jobs: MediaJob[], seenAtMs: number): number {
  return jobs.filter((job) => {
    if (job.state !== 'done' && job.state !== 'error') return false
    const finishedAt = job.completedAtUtc ? Date.parse(job.completedAtUtc) : NaN
    return Number.isFinite(finishedAt) && finishedAt > seenAtMs
  }).length
}
