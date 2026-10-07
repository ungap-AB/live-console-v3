import { useEffect, useState } from 'preact/hooks'
import { Modal } from '../../components/Modal'
import type { TimelineEvent } from '../../data/types'
import { MAX_PAUSE_TEXT_LENGTH, pauseDurationText, suggestedPauseText } from './pauseLogic'
import { formatLocalTime } from '../../app/time'
import './PauseButton.css'

interface PauseButtonProps {
  /** Den pågående pausen (pauseIn), annars null. */
  pause: TimelineEvent | null
  timeline: readonly TimelineEvent[]
  onStart: (text: string) => void
  onResume: () => void
}

function PauseGlyph({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" class={`pv-pause-glyph${filled ? ' is-filled' : ''}`}>
      <rect x="6" y="5" width="4.5" height="14" rx="1.4" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.4" />
    </svg>
  )
}

// UNG-119: paus-knappen i lägesväljaren, precis till höger om Live. Vilande: neutral. Aktiv paus: fylld, varningsfärg och en
// svag, långsam pulsering (3 s per varv; med reducerad rörelse i stället en synlig text). Att starta kräver bekräftelse i en dialog
// med texten som visas över videon, att avsluta är ett klick.
export function PauseButton({ pause, timeline, onStart, onResume }: PauseButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [text, setText] = useState('')
  const [now, setNow] = useState(() => Date.now())

  // Hur länge pausen pågått i tooltipen; en uppdatering i halvminuten räcker.
  useEffect(() => {
    if (!pause) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [pause?.id])

  function open() {
    setText(suggestedPauseText(timeline))
    setDialogOpen(true)
  }

  function start() {
    onStart(text)
    setDialogOpen(false)
  }

  const label = pause ? `Avsluta paus (pausad sedan ${formatLocalTime(pause.occurredAt)}, ${pauseDurationText(pause.occurredAt, now)})` : 'Pausa sändningen'

  return (
    <>
      <button
        type="button"
        class={`pv-pause-btn${pause ? ' is-paused' : ''}`}
        aria-pressed={Boolean(pause)}
        aria-label={label}
        title={label}
        onClick={() => (pause ? onResume() : open())}
      >
        <PauseGlyph filled={Boolean(pause)} />
        {pause && <span class="pv-pause-label">Paus</span>}
      </button>
      {dialogOpen && (
        <Modal
          title="Pausa sändningen"
          subtitle="Tittarna ser texten över videon tills du avslutar pausen. En markör sätts i kapitellistan."
          onClose={() => setDialogOpen(false)}
          footer={
            <>
              <button class="btn btn-sm" type="button" onClick={() => setDialogOpen(false)}>Avbryt</button>
              <button class="btn btn-sm btn-primary" type="button" onClick={start}>Starta paus</button>
            </>
          }
        >
          <label class="pause-dialog-field">
            <span>Text som visas i spelaren</span>
            <textarea
              class="pause-dialog-text"
              rows={3}
              maxLength={MAX_PAUSE_TEXT_LENGTH}
              value={text}
              autofocus
              onFocus={(event) => event.currentTarget.select()}
              onInput={(event) => setText(event.currentTarget.value)}
              onKeyDown={(event) => {
                // Enter ger en ny rad i texten; Ctrl/Cmd+Enter startar pausen.
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  start()
                }
              }}
            />
          </label>
        </Modal>
      )}
    </>
  )
}
