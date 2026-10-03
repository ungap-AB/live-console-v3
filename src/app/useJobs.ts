import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../data'
import type { MediaJob } from '../data/types'
import { onJobsChanged } from './jobsBus'

const ACTIVE_POLL_MS = 3000

// Domänens mediajobb för jobbfältet. Pollar bara medan något jobb pågår (jobben körs av servern, så inget
// hänger på den här fliken); annars hämtas listan vid start, när fönstret får fokus och när en vy säger till
// via notifyJobsChanged. onFinished anropas när ett jobb som vi sett pågå blir klart eller misslyckas.
export function useJobs(onFinished: (job: MediaJob) => void) {
  const [jobs, setJobs] = useState<MediaJob[]>([])
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // Senast kända status per jobb; null före första hämtningen så att redan klara jobb inte ger toast.
    let known: Map<string, MediaJob['state']> | null = null

    async function refresh() {
      clearTimeout(timer)
      try {
        const next = await client.jobs.list()
        if (cancelled) return
        if (known) {
          for (const job of next) {
            if (known.get(job.id) === 'processing' && job.state !== 'processing') onFinishedRef.current(job)
          }
        }
        known = new Map(next.map((job) => [job.id, job.state]))
        setJobs(next)
        if (next.some((job) => job.state === 'processing')) timer = setTimeout(refresh, ACTIVE_POLL_MS)
      } catch {
        // Tillfälligt fel (nätverk, utgången session hanteras av resten av appen): försök igen vid nästa
        // fokus eller händelse. Jobbfältet är ett komplement och ska aldrig störa arbetet.
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void refresh()
    }

    void refresh()
    const stopBus = onJobsChanged(() => void refresh())
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      stopBus()
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return jobs
}
