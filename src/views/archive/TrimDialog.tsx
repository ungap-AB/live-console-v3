import { useEffect, useRef, useState } from 'preact/hooks'
import { create, isPlayerSupported, PlayerEventType } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { Modal } from '../../components/Modal'
import type { Recording } from '../../data/types'
import { formatHms, parseHms } from '../../app/time'
import './TrimDialog.css'

interface TrimDialogProps {
  recording: Recording
  initialRange?: { startOffsetSeconds: number; endOffsetSeconds: number }
  onCancel: () => void
  onSave: (range: { startOffsetSeconds: number; endOffsetSeconds: number }) => Promise<void>
}

export function TrimDialog({ recording, initialRange, onCancel, onSave }: TrimDialogProps) {
  const [from, setFrom] = useState(initialRange?.startOffsetSeconds ?? 0)
  const [to, setTo] = useState(initialRange?.endOffsetSeconds ?? recording.durationSeconds)
  const [fromText, setFromText] = useState(formatHms(from))
  const [toText, setToText] = useState(formatHms(to))
  const [saving, setSaving] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const duration = recording.durationSeconds

  useEffect(() => {
    const video = videoRef.current
    if (!video || !recording.hlsUrl) return
    if (!isPlayerSupported) {
      setVideoError('AWS IVS Player kan inte köras i den här webbläsaren.')
      return
    }

    const player = create({ wasmWorker, wasmBinary })
    setVideoError(null)
    player.attachHTMLVideoElement(video)
    player.addEventListener(PlayerEventType.ERROR, (error) => {
      setVideoError(error.message || 'Originalvideon kunde inte laddas.')
    })
    player.load(recording.hlsUrl)

    return () => {
      player.pause()
      player.delete()
    }
  }, [recording.hlsUrl])

  function setVideoTime(value: number) {

    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(value, duration))
    setCurrentTime(video.currentTime)
  }

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

  function setFromCurrent() {
    updateFrom(currentTime)
  }

  function setToCurrent() {
    updateTo(currentTime)
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

  async function save() {
    const parsedFrom = parseHms(fromText)
    const parsedTo = parseHms(toText)
    if (
      parsedFrom === null ||
      parsedTo === null ||
      !Number.isFinite(parsedFrom) ||
      !Number.isFinite(parsedTo) ||
      parsedFrom < 0 ||
      parsedTo > duration ||
      parsedTo <= parsedFrom
    ) {
      setRangeError('Start- och sluttid måste vara giltiga och slutpunkten måste ligga efter startpunkten.')
      return
    }

    const startOffsetSeconds = Math.round(parsedFrom)
    const endOffsetSeconds = Math.round(parsedTo)
    if (endOffsetSeconds <= startOffsetSeconds) {
      setRangeError('Trimintervallet måste vara minst en sekund långt.')
      return
    }

    setRangeError(null)
    setSaving(true)
    try {
      await onSave({ startOffsetSeconds, endOffsetSeconds })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Trimma inspelning"
      subtitle={`Original ${formatHms(duration)}`}
      onClose={onCancel}
      wide
      bodyClassName="trim-body"
      footer={
        <>
          <button class="btn" type="button" disabled={saving} onClick={onCancel}>
            Avbryt
          </button>
          <button
            class="btn btn-primary"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Bearbetar' : 'Spara trimmad version'}
          </button>
        </>
      }
    >
      <div class="trim-editor-video">
        {recording.hlsUrl ? (
          <>
            {videoError && (
              <div class="trim-video-error">
                <p>{videoError}</p>
                {duration < 90 && (
                  <p>
                    Korta sändningar kan ta upp till en minut innan AWS gjort inspelningen tillgänglig. Vänta en
                    stund och öppna trimningen igen.
                  </p>
                )}
              </div>
            )}
            <video
              key={recording.hlsUrl}
              ref={videoRef}
              controls
              playsInline
              preload="auto"
              onError={() => setVideoError('Originalvideon kunde inte spelas upp.')}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          </>
        ) : (
          <div class="trim-video-empty">Ingen förhandsvisning</div>
        )}
      </div>
      <div class="trim-range-row">
        <div class="time-row">
          <label>Start</label>
          <input
            value={fromText}
            aria-label="Startpunkt som tid"
            onInput={(e) => setFromText(e.currentTarget.value)}
            onBlur={commitFromText}
            onKeyDown={(e) => e.key === 'Enter' && commitFromText()}
          />
          <button class="btn btn-sm" type="button" disabled={!recording.hlsUrl || saving} onClick={setFromCurrent}>
            Sätt här
          </button>
          <button class="btn btn-sm" type="button" disabled={!recording.hlsUrl} onClick={() => setVideoTime(from)}>
            Hoppa
          </button>
        </div>
        <div class="time-row">
          <label>Slut</label>
          <input
            value={toText}
            aria-label="Slutpunkt som tid"
            onInput={(e) => setToText(e.currentTarget.value)}
            onBlur={commitToText}
            onKeyDown={(e) => e.key === 'Enter' && commitToText()}
          />
          <button class="btn btn-sm" type="button" disabled={!recording.hlsUrl || saving} onClick={setToCurrent}>
            Sätt här
          </button>
          <button class="btn btn-sm" type="button" disabled={!recording.hlsUrl} onClick={() => setVideoTime(to)}>
            Hoppa
          </button>
        </div>
        <span class="trim-length">Längd {formatHms(to - from)}</span>
      </div>
      {rangeError && <p class="note warn">{rangeError}</p>}
    </Modal>
  )
}
