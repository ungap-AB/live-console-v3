import { t } from '@lingui/core/macro'
import { formatHms } from '../../app/time'
import type { CorrectionGroup } from './autoCaptionsLogic'

export interface OwnCorrectionItem {
  /** Radens index i listan, för att hoppa dit. */
  index: number
  from: string
  to: string
}

interface CorrectionsPanelProps {
  /** Maskinella rättningar, grupperade; null medan de hämtas. */
  machine: CorrectionGroup[] | null
  own: OwnCorrectionItem[]
  onJumpToTime: (time: number) => void
  onJumpToRow: (index: number) => void
}

// UNG-166: rättningar i redigeraren. Dels det datorn rättat (namn och termer), dels orden operatören ändrat under redigeringen.
// Ett klick hoppar till rutan.
export function CorrectionsPanel({ machine, own, onJumpToTime, onJumpToRow }: CorrectionsPanelProps) {
  return (
    <div class="ce-corr" aria-label={t`Corrections`}>
      <section>
        <h4>{t`Your corrections (${own.length})`}</h4>
        {own.length === 0 ? (
          <p class="ce-corr-empty">{t`Words you replace in the text are shown here, until you have saved.`}</p>
        ) : (
          <ul>
            {own.map((item, position) => (
              <li key={`${item.index}-${position}`}>
                <button type="button" class="ce-corr-item" onClick={() => onJumpToRow(item.index)}>
                  <span class="ce-corr-from">{item.from}</span> → <strong>{item.to}</strong>
                  <span class="ce-corr-meta"> · {t`line ${item.index + 1}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4>{machine ? t`Machine corrections (${machine.reduce((sum, group) => sum + group.count, 0)})` : t`Machine corrections`}</h4>
        {machine === null ? (
          <p class="ce-corr-empty">{t`Fetching…`}</p>
        ) : machine.length === 0 ? (
          <p class="ce-corr-empty">{t`No names or terms have been corrected automatically in this draft.`}</p>
        ) : (
          <ul>
            {machine.map((group) => (
              <li key={`${group.original}|${group.replacement}`}>
                <button type="button" class="ce-corr-item" onClick={() => onJumpToTime(group.firstTime)}>
                  <span class="ce-corr-from">{group.original}</span> → <strong>{group.replacement}</strong>
                  <span class="ce-corr-meta"> · {group.count > 1 ? t`${group.count} times, first at ${formatHms(group.firstTime)}` : t`at ${formatHms(group.firstTime)}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
