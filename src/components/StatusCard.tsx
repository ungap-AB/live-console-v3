import type { ComponentChildren } from 'preact'
import './StatusCard.css'

type StatusCardTone = 'neutral' | 'live' | 'warn' | 'danger' | 'accent'

interface StatusCardProps {
  tone: StatusCardTone
  title: string
  children?: ComponentChildren
  actions?: ComponentChildren
}

// Ersätter mönstret "status + Skapa ingest (disabled) + Riv ingest på samma
// rad" (tre budskap samtidigt) med ett kort: rubrik, förklaring, och bara de
// knappar som är giltiga i just det läget. Se granskningen 2026-09-17.
export function StatusCard({ tone, title, children, actions }: StatusCardProps) {
  return (
    <div class={`status-card status-card-${tone}`}>
      <div class="status-card-head">
        <span class="status-card-dot" />
        <h3>{title}</h3>
      </div>
      {children && <p class="status-card-body">{children}</p>}
      {actions && <div class="status-card-actions">{actions}</div>}
    </div>
  )
}
