import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import { ApiError } from '../../data/http/fetchJson'
import type { ChannelHealth, CueKind, Project } from '../../data/types'

const PLAYOUT_POLL_MS = 2000
const PROJECT_POLL_MS = 5000

export interface StatusProject {
  project: Project | null
  health: ChannelHealth | null
  /** The project no longer exists (deleted, or another domain). */
  missing: boolean
  error: string | null
  clear: (kind: CueKind) => void
  resume: () => void
}

/**
 * The status strip's data (UNG-322): the open project, its playout state and the channel's health. The strip is an operator
 * view like the playout view, so it polls the same way (playout and presence every 2 s) and keeps the channel's phase
 * machine moving (health every 5 s). Actions are not optimistic: the next poll shows the server's answer.
 */
export function useStatusProject(projectId: string): StatusProject {
  const [project, setProject] = useState<Project | null>(null)
  const [health, setHealth] = useState<ChannelHealth | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelId = project?.channel?.id ?? null

  useEffect(() => {
    setProject(null)
    setMissing(false)
    setError(null)
    let cancelled = false
    const loadProject = () =>
      client.projects.get(projectId).then(
        (full) => {
          if (cancelled) return
          if (full) setProject(full)
          else setMissing(true)
        },
        () => undefined,
      )
    const pollPlayout = () => {
      void client.projects.touchPlayout(projectId).catch(() => undefined)
      client.projects.playout(projectId).then(
        (playout) => {
          if (!cancelled) setProject((current) => (current ? { ...current, playout } : current))
        },
        (err) => {
          if (!cancelled && err instanceof ApiError && err.code === 'project_not_found') setMissing(true)
        },
      )
    }
    void loadProject()
    pollPlayout()
    const playoutTimer = window.setInterval(pollPlayout, PLAYOUT_POLL_MS)
    // The mode and the channel change seldom; the whole project is read less often.
    const projectTimer = window.setInterval(() => void loadProject(), PROJECT_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(playoutTimer)
      window.clearInterval(projectTimer)
    }
  }, [projectId])

  useEffect(() => {
    setHealth(null)
    if (!channelId) return
    let cancelled = false
    const poll = () =>
      client.channels.health(channelId).then(
        (next) => {
          if (!cancelled) setHealth(next)
        },
        () => {
          if (!cancelled) setHealth(null)
        },
      )
    void poll()
    const timer = window.setInterval(() => void poll(), PROJECT_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [channelId])

  async function run(call: () => Promise<unknown>, failure: string) {
    setError(null)
    try {
      await call()
      const playout = await client.projects.playout(projectId)
      setProject((current) => (current ? { ...current, playout } : current))
    } catch (err) {
      // Someone else ended the break first: the state is "no break" anyway.
      if (err instanceof ApiError && err.code === 'not_paused') return
      setError(err instanceof Error ? err.message : failure)
    }
  }

  return {
    project,
    health,
    missing,
    error,
    clear: (kind) => void run(() => client.projects.clear(projectId, kind), t`Could not clear.`),
    resume: () => void run(() => client.projects.resume(projectId), t`Could not end the break.`),
  }
}
