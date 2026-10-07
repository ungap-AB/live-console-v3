import type { MediaJob } from '../data/types.ts'

export const ACTIVE_POLL_MS = 3000
// Jobb som startats någon annanstans (en annan flik, en kollega) syns först när listan hämtas om, så den hämtas om med
// lugn takt även när inget pågår — men bara medan fönstret är synligt.
export const IDLE_POLL_MS = 30000

/** När jobblistan nästa gång ska hämtas om på egen hand (ms), eller null om den bara ska hämtas vid händelser (dolt fönster). */
export function nextPollDelay(jobs: readonly Pick<MediaJob, 'state'>[], windowVisible: boolean): number | null {
  if (!windowVisible) return null
  return jobs.some((job) => job.state === 'processing') ? ACTIVE_POLL_MS : IDLE_POLL_MS
}
