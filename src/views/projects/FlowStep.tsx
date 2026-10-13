import type { ComponentChildren } from 'preact'
import { Icon } from '../../components/Icon'
import './FlowStep.css'

export interface FlowStepProps {
  n: number
  label: string
  /** Kort läge till höger (t.ex. "3 kapitel"). */
  status: string
  done?: boolean
  /** Momentet görs i ett annat läge (Trimma video i Ondemand): lås i stället för pil, och en kort förklaring i stället för läget. */
  locked?: boolean
  note?: string
  /** Publiceringen, sista steget: publiceringsikon i stället för nummer och pil. */
  publish?: boolean
  /** UNG-278: något pågår (undertexter genereras): snurra i stället för numret, läget i accentfärg och inte avkortat. */
  busy?: boolean
  disabled?: boolean
  title?: string
  /** Before: fler åtgärder (⋯-meny) i stället för pilen; raden själv gör huvudåtgärden. */
  menu?: ComponentChildren
  onClick: () => void
}

// Ett guidat steg (flödesknapp): en rad med nummer (bock när något är gjort), stegets namn, läget och en pil till momentet.
export function FlowStep({ n, label, status, done = false, busy = false, disabled = false, locked = false, note, publish = false, title, menu, onClick }: FlowStepProps) {
  const state = [busy ? 'is-busy' : done && !publish ? 'is-done' : '', locked ? 'is-locked' : '', publish ? 'is-publish' : '', menu ? 'has-menu' : ''].filter(Boolean).join(' ')
  return (
    <li class={state || undefined}>
      <button class="od-flow-step" type="button" disabled={disabled || locked} title={title} onClick={onClick}>
        <span class="od-flow-num" aria-hidden="true">
          {busy ? <span class="od-flow-spinner" /> : publish ? <Icon name="publish" size={16} /> : done ? <Icon name="check" size={16} /> : n}
        </span>
        <span class="od-flow-label">{label}</span>
        <span class="od-flow-status">{note ?? status}</span>
        {!menu && <Icon name={locked ? 'lock' : 'chevron_right'} size={18} />}
      </button>
      {menu && <span class="od-flow-menu">{menu}</span>}
    </li>
  )
}
