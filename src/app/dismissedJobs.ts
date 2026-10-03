import type { MediaJob } from '../data/types'

// UNG-95: vilka klara jobb operatören är färdig med och har dolt i jobbfältet. Jobben delas av hela domänen, men
// att man är färdig med ett jobb gäller en person, så valet sparas i webbläsaren per användare. (Ett dolt jobb
// finns kvar på servern och går att hitta under Nedladdningar, och det visas igen med "Visa dolda".)
const KEY_PREFIX = 'ungap-live-console:dismissed-jobs:'

// Så många klara jobb visas som standard; resten ligger bakom "Visa fler".
export const RECENT_JOB_LIMIT = 5

export function readDismissedJobs(userId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY_PREFIX + userId) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function storeDismissedJobs(userId: string, ids: string[]): void {
  try {
    if (ids.length > 0) localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(ids))
    else localStorage.removeItem(KEY_PREFIX + userId)
  } catch {
    // Privat läge eller blockerad lagring: valet gäller bara den här sidvisningen.
  }
}

// Behåller bara id:n för jobb som fortfarande finns (servern rensar dem efter en vecka), så listan inte växer.
export function pruneDismissed(ids: string[], jobs: MediaJob[]): string[] {
  const existing = new Set(jobs.map((job) => job.id))
  return ids.filter((id, index) => existing.has(id) && ids.indexOf(id) === index)
}

export interface JobGroups {
  /** Pågående jobb — går aldrig att dölja. */
  active: MediaJob[]
  /** De senaste klara eller misslyckade jobben som inte är dolda. */
  recent: MediaJob[]
  /** Fler klara jobb som inte är dolda, bakom "Visa fler". */
  older: MediaJob[]
  /** Klara jobb som operatören dolt. */
  dismissed: MediaJob[]
}

// Förutsätter att jobben kommer nyast först, som servern levererar dem.
export function groupJobs(jobs: MediaJob[], dismissedIds: string[], limit = RECENT_JOB_LIMIT): JobGroups {
  const dismissedSet = new Set(dismissedIds)
  const finished = jobs.filter((job) => job.state !== 'processing')
  const fresh = finished.filter((job) => !dismissedSet.has(job.id))
  return {
    active: jobs.filter((job) => job.state === 'processing'),
    recent: fresh.slice(0, limit),
    older: fresh.slice(limit),
    dismissed: finished.filter((job) => dismissedSet.has(job.id)),
  }
}
