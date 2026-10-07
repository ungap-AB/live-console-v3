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
    <div class="ce-corr" aria-label="Rättningar">
      <section>
        <h4>Dina rättningar ({own.length})</h4>
        {own.length === 0 ? (
          <p class="ce-corr-empty">Ord du byter ut i texten visas här, tills du sparat.</p>
        ) : (
          <ul>
            {own.map((item, position) => (
              <li key={`${item.index}-${position}`}>
                <button type="button" class="ce-corr-item" onClick={() => onJumpToRow(item.index)}>
                  <span class="ce-corr-from">{item.from}</span> → <strong>{item.to}</strong>
                  <span class="ce-corr-meta"> · replik {item.index + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4>Maskinella rättningar{machine ? ` (${machine.reduce((sum, group) => sum + group.count, 0)})` : ''}</h4>
        {machine === null ? (
          <p class="ce-corr-empty">Hämtar…</p>
        ) : machine.length === 0 ? (
          <p class="ce-corr-empty">Inga namn eller termer har rättats automatiskt i det här utkastet.</p>
        ) : (
          <ul>
            {machine.map((group) => (
              <li key={`${group.original}|${group.replacement}`}>
                <button type="button" class="ce-corr-item" onClick={() => onJumpToTime(group.firstTime)}>
                  <span class="ce-corr-from">{group.original}</span> → <strong>{group.replacement}</strong>
                  <span class="ce-corr-meta"> · {group.count > 1 ? `${group.count} gånger, första vid ` : 'vid '}{formatHms(group.firstTime)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
