import { useEffect, useState } from 'preact/hooks'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/Icon'
import { SLOW_PUBLISH_SECONDS, formatElapsed } from './publishProgress'
import type { PublishStep, PublishStepKey } from './publishProgress'
import './PublishProgressDialog.css'

interface PublishProgressDialogProps {
  steps: PublishStep[]
  /** Nyckeln på steget som pågår just nu. */
  activeKey: PublishStepKey
}

// UNG-106: publicering består av flera steg som var och ett kan ta tid. Dialogen visar vilket steg som pågår, vilka som är
// klara och hur länge det har hållit på, så att operatören ser att systemet arbetar.
export function PublishProgressDialog({ steps, activeKey }: PublishProgressDialogProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === activeKey))

  return (
    <Modal title="Publicerar ondemand" onClose={() => undefined} closeDisabled>
      <ol class="publish-steps" aria-label="Steg i publiceringen">
        {steps.map((step, index) => {
          const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending'
          return (
            <li key={step.key} class={`publish-step is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
              <span class="publish-step-icon" aria-hidden="true">
                {state === 'done' ? <Icon name="check_circle" size={20} /> : state === 'active' ? <progress /> : <Icon name="radio_button_unchecked" size={20} />}
              </span>
              <span>{step.label}</span>
              <span class="publish-step-state">{state === 'done' ? 'Klart' : state === 'active' ? 'Pågår' : 'Väntar'}</span>
            </li>
          )
        })}
      </ol>
      <p class="publish-elapsed" role="status">
        Steg {activeIndex + 1} av {steps.length} · {formatElapsed(elapsed)}
      </p>
      <p class="publish-note">
        {elapsed >= SLOW_PUBLISH_SECONDS
          ? 'Det här tar längre tid än vanligt, men arbetet pågår. Lämna den här rutan öppen tills publiceringen är klar.'
          : 'Det kan ta några minuter för långa sändningar. Lämna den här rutan öppen tills publiceringen är klar.'}
      </p>
    </Modal>
  )
}
