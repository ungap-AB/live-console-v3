import { useEffect, useRef, useState } from 'preact/hooks'
import { formatHms } from '../app/time'
import { Icon } from './Icon'
import { NUDGE_SECONDS, nudgePosition, parseTimeInput } from './trimPositionLogic'
import './TrimPosition.css'

interface VideoPositionControlsProps {
  position: number
  duration: number
  playing: boolean
  disabled?: boolean
  /** Läggs ovanpå videofönstret (halvgenomskinlig, utan spela/paus: videons egna kontroller finns där). */
  overlay?: boolean
  /** Videon ska hoppa till en position (sekunder). Föräldern sätter positionen. */
  onSeek: (seconds: number) => void
  onTogglePlay: () => void
}

// UNG-234 (trimvyn, UNG-134): tidsvisning med −5 s/+5 s och spela/paus, avsedd att ligga ovanpå videofönstret. Dubbelklick på tiden (eller
// Enter när den är fokuserad) öppnar ett fält för att skriva in en tid: det är en sällan använd funktion, så lite friktion är OK.
export function VideoPositionControls({ position, duration, playing, disabled = false, overlay = false, onSeek, onTogglePlay }: VideoPositionControlsProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Enter och blur kan båda träffa; bara den första avslutar inskrivningen.
  const finished = useRef(false)

  useEffect(() => {
    if (!editing) return
    finished.current = false
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  function begin() {
    if (disabled) return
    setDraft(formatHms(position))
    setEditing(true)
  }

  function finish(commit: boolean) {
    if (finished.current) return
    finished.current = true
    setEditing(false)
    if (!commit) return
    const seconds = parseTimeInput(draft, duration)
    if (seconds !== null) onSeek(seconds)
  }

  return (
    <div class={`vpc${disabled ? ' is-disabled' : ''}${overlay ? ' is-overlay' : ''}`}>
      <button
        class="vpc-nudge"
        type="button"
        aria-label={`${NUDGE_SECONDS} sekunder bakåt`}
        disabled={disabled || position <= 0}
        onClick={() => onSeek(nudgePosition(position, -NUDGE_SECONDS, duration))}
      >
        −{NUDGE_SECONDS} s
      </button>
      <div class="vpc-center">
        {editing ? (
          <input
            ref={inputRef}
            class="vpc-input"
            type="text"
            inputMode="numeric"
            value={draft}
            aria-label="Videons position, hh:mm:ss"
            onInput={(event) => setDraft((event.currentTarget as HTMLInputElement).value)}
            onBlur={() => finish(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                finish(true)
              } else if (event.key === 'Escape') {
                event.preventDefault()
                finish(false)
              }
            }}
          />
        ) : (
          <div
            class="vpc-time"
            role="button"
            tabIndex={disabled ? -1 : 0}
            title="Dubbelklicka för att skriva in en tid"
            aria-label={`Videons position ${formatHms(position)}. Tryck Enter för att skriva in en tid.`}
            onDblClick={begin}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'F2') {
                event.preventDefault()
                begin()
              }
            }}
          >
            {formatHms(position)}
          </div>
        )}
      </div>
      <button
        class="vpc-nudge"
        type="button"
        aria-label={`${NUDGE_SECONDS} sekunder framåt`}
        disabled={disabled || position >= duration}
        onClick={() => onSeek(nudgePosition(position, NUDGE_SECONDS, duration))}
      >
        +{NUDGE_SECONDS} s
      </button>
      {!overlay && (
        <button class="vpc-play" type="button" aria-label={playing ? 'Pausa' : 'Spela'} title={playing ? 'Pausa' : 'Spela'} disabled={disabled} onClick={onTogglePlay}>
          <Icon name={playing ? 'pause' : 'play_arrow'} size={24} />
        </button>
      )}
    </div>
  )
}
