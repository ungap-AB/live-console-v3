import { useState } from 'preact/hooks'
import { Modal } from '../../components/Modal'
import type { Recording } from '../../data/types'
import { formatHms, parseHms } from '../../app/time'
import './TrimDialog.css'

interface TrimDialogProps {
  recording: Recording
  initialRange?: { startOffsetSeconds: number; endOffsetSeconds: number }
  onCancel: () => void
  onSave: (range: { startOffsetSeconds: number; endOffsetSeconds: number }) => void
}

export function TrimDialog({ recording, initialRange, onCancel, onSave }: TrimDialogProps) {
  const [from, setFrom] = useState(initialRange?.startOffsetSeconds ?? 0)
  const [to, setTo] = useState(initialRange?.endOffsetSeconds ?? recording.durationSeconds)
  const [fromText, setFromText] = useState(formatHms(from))
  const [toText, setToText] = useState(formatHms(to))

  const duration = recording.durationSeconds
  const pct = (t: number) => (t / duration) * 100

  function updateFrom(v: number) {
    const clamped = Math.max(0, Math.min(v, to - 1))
    setFrom(clamped)
    setFromText(formatHms(clamped))
  }

  function updateTo(v: number) {
    const clamped = Math.min(duration, Math.max(v, from + 1))
    setTo(clamped)
    setToText(formatHms(clamped))
  }

  function commitFromText() {
    const v = parseHms(fromText)
    if (v === null) {
      setFromText(formatHms(from))
      return
    }
    updateFrom(v)
  }

  function commitToText() {
    const v = parseHms(toText)
    if (v === null) {
      setToText(formatHms(to))
      return
    }
    updateTo(v)
  }

  const chapters = recording.chapters
  const dropped = chapters.filter((c) => c.offsetSeconds < from || c.offsetSeconds > to)
  const note = chapters.length
    ? dropped.length
      ? `${dropped.length} kapitel hamnar utanför klippet och följer inte med till den trimmade versionen.`
      : `Alla ${chapters.length} kapitel ligger inom klippet. Offset räknas om mot den nya startpunkten.`
    : 'Inspelningen har inga kapitelmärken.'

  return (
    <Modal
      title="Trimma inspelning"
      subtitle={`${recording.name} · original ${formatHms(duration)}`}
      onClose={onCancel}
      wide
      footer={
        <>
          <span class="lenout">Längd efter trim: {formatHms(to - from)}</span>
          <span class="spacer" />
          <button class="btn" type="button" onClick={onCancel}>
            Avbryt
          </button>
          <button
            class="btn btn-primary"
            type="button"
            onClick={() => onSave({ startOffsetSeconds: from, endOffsetSeconds: to })}
          >
            Spara trimmad version
          </button>
        </>
      }
    >
      <div class="bar">
        <div class="keep" style={{ left: `${pct(from)}%`, width: `${pct(to - from)}%` }} />
        {chapters.map((c) => (
          <div
            key={c.offsetSeconds + c.label}
            class={`mark ${c.offsetSeconds >= from && c.offsetSeconds <= to ? 'inside' : ''}`}
            style={{ left: `${pct(c.offsetSeconds)}%` }}
          />
        ))}
        <span class="lbl" style={{ left: `${pct(from)}%` }}>
          {formatHms(from)}
        </span>
      </div>
      <div class="ranges">
        <input
          type="range"
          min={0}
          max={duration}
          value={from}
          aria-label="Startpunkt"
          onInput={(e) => updateFrom(Number(e.currentTarget.value))}
        />
        <input
          type="range"
          min={0}
          max={duration}
          value={to}
          aria-label="Slutpunkt"
          onInput={(e) => updateTo(Number(e.currentTarget.value))}
        />
      </div>
      <div class="times">
        <label>
          Start{' '}
          <input
            value={fromText}
            aria-label="Startpunkt som tid"
            onInput={(e) => setFromText(e.currentTarget.value)}
            onBlur={commitFromText}
            onKeyDown={(e) => e.key === 'Enter' && commitFromText()}
          />
        </label>
        <label>
          Slut{' '}
          <input
            value={toText}
            aria-label="Slutpunkt som tid"
            onInput={(e) => setToText(e.currentTarget.value)}
            onBlur={commitToText}
            onKeyDown={(e) => e.key === 'Enter' && commitToText()}
          />
        </label>
      </div>
      <p class={`note ${dropped.length ? 'warn' : ''}`}>{note}</p>
    </Modal>
  )
}
