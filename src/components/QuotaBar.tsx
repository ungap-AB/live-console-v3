import type { ChipTone } from './StatusChip'
import './QuotaBar.css'

interface QuotaSegment {
  label: string
  value: number
  tone: ChipTone
}

interface QuotaBarProps {
  used: number
  limit: number
  segments?: QuotaSegment[]
}

export function QuotaBar({ used, limit, segments }: QuotaBarProps) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const hasSegments = segments && segments.length > 0

  return (
    <div class="quota">
      <div class="quota-head">
        <span class="quota-count">
          {used} av {limit} kanaler
        </span>
        {pct >= 100 && <span class="quota-full">Taket nått</span>}
      </div>
      <div class="quota-bar">
        {hasSegments ? (
          segments!.map((s) => (
            <div
              key={s.label}
              class={`quota-fill quota-fill-${s.tone}`}
              style={{ width: `${limit > 0 ? (s.value / limit) * 100 : 0}%` }}
            />
          ))
        ) : (
          <div class="quota-fill" style={{ width: `${pct}%` }} />
        )}
      </div>
      {hasSegments && (
        <div class="quota-legend">
          {segments.map((s) => (
            <span key={s.label} class={`legend-item legend-${s.tone}`}>
              <span class="legend-dot" aria-hidden="true" />
              {s.label}: {s.value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
