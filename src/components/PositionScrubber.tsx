import { formatHms } from '../app/time'
import { DEFAULT_MIN_KEEP_SECONDS, fraction, type TrimRange } from './trimBarLogic'
import { setBoundaryHere } from './trimPositionLogic'
import './TrimPosition.css'

/** Halva reglagets knapp (px): ringarna följer knappens mitt längs reglaget. */
const THUMB_INSET = 8
/** Ringarna hålls så här långt (px) från kanterna, så att båda ryms inom synlig yta. */
const RING_GROUP_HALF = 46

interface PositionScrubberProps {
  position: number
  duration: number
  start: number
  end: number
  minKeep?: number
  disabled?: boolean
  onSeek: (seconds: number) => void
  /** Nytt intervall efter Start här / Slut här. */
  onChange: (range: TrimRange) => void
}

// UNG-234 (trimvyn, UNG-134): reglaget för videons position, med ringarna Start här (grön) och Slut här (röd) som följer spelhuvudet.
// Ringarna är fasta (ingen utfällning) och har namnet som tooltip och ARIA-etikett. Att sätta en gräns flyttar också positionen dit.
export function PositionScrubber({ position, duration, start, end, minKeep = DEFAULT_MIN_KEEP_SECONDS, disabled = false, onSeek, onChange }: PositionScrubberProps) {
  const range: TrimRange = { start, end }
  const along = `calc(${THUMB_INSET}px + (100% - ${THUMB_INSET * 2}px) * ${fraction(position, duration).toFixed(5)})`

  function setHere(handle: 'start' | 'end') {
    const next = setBoundaryHere(handle, position, range, duration, minKeep)
    if (next.range.start !== start || next.range.end !== end) onChange(next.range)
    onSeek(next.seek)
  }

  return (
    <div class="pscrub">
      <div class="pscrub-rings">
        <div class="pscrub-group" style={{ left: `clamp(${RING_GROUP_HALF}px, ${along}, calc(100% - ${RING_GROUP_HALF}px))` }}>
          <button
            class="pscrub-ring pscrub-ring-start"
            type="button"
            title="Start här"
            aria-label="Start här: börja ondemand vid videons position"
            disabled={disabled}
            onClick={() => setHere('start')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="1" y="2" width="2.5" height="12" fill="currentColor" />
              <path d="M6 2 L14 8 L6 14 Z" fill="currentColor" />
            </svg>
          </button>
          <button
            class="pscrub-ring pscrub-ring-end"
            type="button"
            title="Slut här"
            aria-label="Slut här: sluta ondemand vid videons position"
            disabled={disabled}
            onClick={() => setHere('end')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 2 L2 8 L10 14 Z" fill="currentColor" />
              <rect x="12.5" y="2" width="2.5" height="12" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      <input
        class="pscrub-range"
        type="range"
        min={0}
        max={duration}
        step={1}
        value={position}
        disabled={disabled}
        aria-label="Videons position"
        aria-valuetext={formatHms(position)}
        onInput={(event) => onSeek(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <div class="pscrub-ends">
        <span>{formatHms(0)}</span>
        <span>{formatHms(duration)}</span>
      </div>
    </div>
  )
}
