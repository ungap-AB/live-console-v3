import { useEffect, useRef, useState } from 'preact/hooks'
import { create, isPlayerSupported, PlayerEventType } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { Modal } from '../../components/Modal'
import { client } from '../../data'
import type { Recording } from '../../data/types'
import { formatDateTime, formatHms, parseHms } from '../../app/time'
import './TrimDialog.css'

interface TrimDialogProps {
  recording: Recording
  sessionId?: string
  initialRange?: { startOffsetSeconds: number; endOffsetSeconds: number }
  onCancel: () => void
  onSave: (range: { startOffsetSeconds: number; endOffsetSeconds: number; sessionId?: string }) => Promise<void>
}

export function TrimDialog({ recording, sessionId, initialRange, onCancel, onSave }: TrimDialogProps) {
  const defaultSessionId = sessionId ?? recording.sessions?.toSorted((a, b) => b.durationSeconds - a.durationSeconds)[0]?.id
  // `activeRecording` speglar VILKEN sessions manifest/längd som just nu
  // förhandsvisas — måste bytas ut när operatören väljer en annan session i
  // listan, annars trimmas offset:er som satts mot en video mot en helt
  // annan video (se granskningen 2026-09-17).
  const [activeRecording, setActiveRecording] = useState(recording)
  const [selectedSessionId, setSelectedSessionId] = useState(defaultSessionId)
  const [switchingSession, setSwitchingSession] = useState(false)
  const [from, setFrom] = useState(initialRange?.startOffsetSeconds ?? 0)
  const [to, setTo] = useState(initialRange?.endOffsetSeconds ?? activeRecording.durationSeconds)
  const [fromText, setFromText] = useState(formatHms(from))
  const [toText, setToText] = useState(formatHms(to))
  const [saving, setSaving] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const duration = activeRecording.durationSeconds

  useEffect(() => {
    if (defaultSessionId) void selectSession(defaultSessionId)
  }, [recording.id, defaultSessionId])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeRecording.hlsUrl) return
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
    player.load(activeRecording.hlsUrl)

    return () => {
      player.pause()
      player.delete()
    }
  }, [activeRecording.hlsUrl, switchingSession])

  async function selectSession(nextSessionId: string) {
    const previousSessionId = selectedSessionId
    setSelectedSessionId(nextSessionId)
    setSwitchingSession(true)
    setVideoError(null)
    try {
      const updated = await client.recordings.selectSession(recording.id, nextSessionId)
      const next = updated ?? recording
      setActiveRecording(next)
      // Tidigare satta start-/sluttider hörde till förra videon — nollställ
      // mot den nya, annars kan de peka bortom den faktiska längden.
      setFrom(0)
      setTo(next.durationSeconds)
      setFromText(formatHms(0))
      setToText(formatHms(next.durationSeconds))
    } catch (error) {
      setSelectedSessionId(previousSessionId)
      setVideoError(error instanceof Error ? error.message : 'Sessionen kunde inte laddas.')
    } finally {
      setSwitchingSession(false)
    }
  }

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
      await onSave({ startOffsetSeconds, endOffsetSeconds, sessionId: selectedSessionId })
    } finally {
      setSaving(false)
    }
  }

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
        {switchingSession ? (
          <div class="trim-video-empty">Byter session…</div>
        ) : activeRecording.hlsUrl ? (
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
              key={activeRecording.hlsUrl}
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
      {recording.sessions && recording.sessions.length > 0 && (
        <label class="trim-session-select">
          Inspelningssession
          <select
            value={selectedSessionId ?? ''}
            disabled={switchingSession}
            onChange={(e) => void selectSession(e.currentTarget.value)}
          >
            {recording.sessions.map((session) => (
              <option value={session.id} key={session.id}>
                {formatDateTime(session.startedAt)} · {formatHms(session.durationSeconds)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div class="trim-video-tools">
        <span class="trim-current">Aktuell tid {formatHms(currentTime)}</span>
        <button class="btn btn-sm" type="button" disabled={!activeRecording.hlsUrl || saving} onClick={setFromCurrent}>
          Sätt start här
        </button>
        <button class="btn btn-sm" type="button" disabled={!activeRecording.hlsUrl || saving} onClick={setToCurrent}>
          Sätt slut här
        </button>
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
          <button class="btn btn-sm" type="button" disabled={!activeRecording.hlsUrl} onClick={() => setVideoTime(from)}>
            Hoppa
          </button>
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
          <button class="btn btn-sm" type="button" disabled={!activeRecording.hlsUrl} onClick={() => setVideoTime(to)}>
            Hoppa
          </button>
        </label>
      </div>
      {rangeError && <p class="note warn">{rangeError}</p>}
    </Modal>
  )
}
