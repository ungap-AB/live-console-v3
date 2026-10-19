import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import { ApiError } from '../../data/http/fetchJson'
import type { ChannelHealth, CueKind, Project, PublicMode } from '../../data/types'
import { beginModeSwitch, endModeSwitch } from '../projects/modeSwitch'
import { afterReasonFor } from '../projects/projectMode'

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
  /**
   * ungap Presenter spike B1: Before → Live and Live → After from the strip (the caller confirms Live → After, as the
   * mode selector does). afterText: the After message to save with the switch.
   */
  setMode: (to: PublicMode, afterText?: string) => void
  /** A mode switch is under way (the button shows it and stays disabled). */
  switching: boolean
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

  const [switching, setSwitching] = useState(false)
  async function setMode(to: PublicMode, afterText?: string) {
    if (!project || project.publicMode === to || !beginModeSwitch(projectId, to)) return
    setSwitching(true)
    setError(null)
    try {
      if (afterText !== undefined && afterText !== project.afterText) await client.projects.rename(projectId, project.name, { afterText })
      const updated = await client.projects.setPublicMode(projectId, to, afterReasonFor(project.publicMode, to))
      setProject((current) => (current ? { ...updated, playout: current.playout } : updated))
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not change the mode.`)
    } finally {
      endModeSwitch(projectId)
      setSwitching(false)
    }
  }

  return {
    project,
    health,
    missing,
    error,
    switching,
    setMode: (to, afterText) => void setMode(to, afterText),
    clear: (kind) => void run(() => client.projects.clear(projectId, kind), t`Could not clear.`),
    resume: () => void run(() => client.projects.resume(projectId), t`Could not end the break.`),
  }
}
