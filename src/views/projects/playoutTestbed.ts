import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Project } from '../../data/types'
import type { ProjectActions } from './actions'
import { buildPlayoutTestPlan, TESTBED_INTERVAL_SECONDS } from './playoutTestPlan'

export { buildPlayoutTestPlan, TESTBED_INTERVAL_SECONDS } from './playoutTestPlan'

export interface PlayoutTestbedState {
  running: boolean
  totalSteps: number
  completedSteps: number
  failedSteps: number
  durationSeconds: number
  startedAt: Date | null
}

const IDLE_STATE: PlayoutTestbedState = {
  running: false,
  totalSteps: 0,
  completedSteps: 0,
  failedSteps: 0,
  durationSeconds: 0,
  startedAt: null,
}

function waitForInterval(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, TESTBED_INTERVAL_SECONDS * 1000)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      reject(new DOMException('Testet stoppades.', 'AbortError'))
    }, { once: true })
  })
}

export function usePlayoutTestbed(project: Project, actions: ProjectActions) {
  const controllerRef = useRef<AbortController | null>(null)
  const [state, setState] = useState<PlayoutTestbedState>(IDLE_STATE)

  useEffect(() => () => controllerRef.current?.abort(), [project.id])

  async function start() {
    if (controllerRef.current || project.publicMode !== 'live' || !project.agendaId || !project.namelistId) return
    const [agenda, nameList] = await Promise.all([
      client.agendas.get(project.agendaId),
      client.namelists.get(project.namelistId),
    ])
    if (!agenda || !nameList || agenda.items.length === 0 || nameList.people.length === 0) return

    const plan = buildPlayoutTestPlan(agenda, nameList)
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ running: true, totalSteps: plan.steps.length, completedSteps: 0, failedSteps: 0, durationSeconds: plan.durationSeconds, startedAt: new Date() })

    try {
      for (const step of plan.steps) {
        if (controller.signal.aborted) return
        try {
          await client.projects.cue(project.id, step.kind, step.refId, step.label)
        } catch {
          setState((current) => ({ ...current, failedSteps: current.failedSteps + 1 }))
        }
        setState((current) => ({ ...current, completedSteps: current.completedSteps + 1 }))
        await actions.refreshPlayout().catch(() => undefined)
        await waitForInterval(controller.signal)
      }
      if (!controller.signal.aborted) await actions.setPublicMode('after')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setState((current) => ({ ...current, running: false }))
    }
  }

  function stop() {
    controllerRef.current?.abort()
  }

  return { state, start, stop }
}
