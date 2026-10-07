import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CaptionGeneration } from '../../data/types'
import { autoCaptionsPhase, type AutoCaptionsPhase } from './autoCaptionsLogic'

const POLL_MS = 4000

/** Serverns läge för projektets automatiska undertexter (jobb + utkast), med pollning medan ett jobb pågår. */
export function useCaptionGeneration(projectId: string): {
  generation: CaptionGeneration | null
  setGeneration: (next: CaptionGeneration) => void
  refresh: () => Promise<void>
  phase: AutoCaptionsPhase
} {
  const [generation, setGeneration] = useState<CaptionGeneration | null>(null)
  const alive = useRef(true)

  async function refresh() {
    try {
      const next = await client.projects.getCaptionGeneration(projectId)
      if (alive.current) setGeneration(next)
    } catch {
      // Ett missat svar (t.ex. under pollningen) är ofarligt; nästa försök hämtar rätt läge.
    }
  }

  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
    }
  }, [projectId])

  const phase = generation ? autoCaptionsPhase(generation) : 'idle'
  useEffect(() => {
    if (phase !== 'running') return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [phase, projectId])

  return { generation, setGeneration, refresh, phase }
}
