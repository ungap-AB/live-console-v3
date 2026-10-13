import { t } from '@lingui/core/macro'
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
    <Modal title={t`Publishing on demand`} onClose={() => undefined} closeDisabled>
      <ol class="publish-steps" aria-label={t`Publishing steps`}>
        {steps.map((step, index) => {
          const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending'
          return (
            <li key={step.key} class={`publish-step is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
              <span class="publish-step-icon" aria-hidden="true">
                {state === 'done' ? <Icon name="check_circle" size={20} /> : state === 'active' ? <progress /> : <Icon name="radio_button_unchecked" size={20} />}
              </span>
              <span>{step.label}</span>
              <span class="publish-step-state">{state === 'done' ? t`Done` : state === 'active' ? t`In progress` : t`Waiting`}</span>
            </li>
          )
        })}
      </ol>
      <p class="publish-elapsed" role="status">
        Steg {activeIndex + 1} av {steps.length} · {formatElapsed(elapsed)}
      </p>
      <p class="publish-note">
        {elapsed >= SLOW_PUBLISH_SECONDS
          ? t`This is taking longer than usual, but the work is in progress. Leave this box open until publishing is done.`
          : t`It can take a few minutes for long broadcasts. Leave this box open until publishing is done.`}
      </p>
    </Modal>
  )
}
