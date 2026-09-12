import type { ComponentChildren } from 'preact'
import './StatusChip.css'

export type ChipTone = 'neutral' | 'accent' | 'live' | 'warn' | 'danger'

interface StatusChipProps {
  tone?: ChipTone
  dot?: boolean
  children?: ComponentChildren
}

export function StatusChip({ tone = 'neutral', dot = false, children }: StatusChipProps) {
  return (
    <span class={`chip chip-${tone}`}>
      {dot && <span class="chip-dot" aria-hidden="true" />}
      {children}
    </span>
  )
}
