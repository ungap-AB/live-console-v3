import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { client } from '../../data'
import { ApiError } from '../../data/http/fetchJson'
import type { CaptionCue, CaptionMaster } from '../../data/types'
import { ConfirmModal } from '../../components/ConfirmModal'
import { formatHms } from '../../app/time'
import {
  MAX_LINE_LENGTH, activeCueIndex, canInsertLineBreak, changedIndexes, formatCueTime, hasLineWarning, lineInfo, rangeStatus, savePayload, scrollToReveal, windowRange,
} from './captionEditorLogic'
import './CaptionEditor.css'

const ROW_HEIGHT = 76

interface CaptionEditorProps {
  projectId: string
  projectName: string
  onClose: () => void
  /** Anropas efter en lyckad sparning, så att omgivande vy kan hämta om status. */
  onSaved?: () => void
}

// UNG-140: redigerare för undertexterna (mastern, original-tidslinje). Video med aktuell replik över bilden, och en radlista
// där texten rättas på plats. Listan är virtualiserad (2 000+ rader). Tider ändras inte här än (UNG-143), bara text.
export function CaptionEditor({ projectId, projectName, onClose, onSaved }: CaptionEditorProps) {
  const [master, setMaster] = useState<CaptionMaster | null>(null)
  const [loadError, setLoadError] = useState('')
  const [cues, setCues] = useState<CaptionCue[]>([])
  const [savedTexts, setSavedTexts] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [follow, setFollow] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [focusTick, setFocusTick] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const areas = useRef(new Map<number, HTMLTextAreaElement>())
  const pendingFocus = useRef<number | null>(null)

  function adopt(next: CaptionMaster) {
    setMaster(next)
    setCues(next.cues)
    setSavedTexts(next.cues.map((cue) => cue.text))
  }

  async function load() {
    setLoadError('')
    try {
      adopt(await client.projects.getCaptionMaster(projectId))
      setConflict(false)
      setSaveError('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Undertexterna kunde inte hämtas.')
    }
  }

  useEffect(() => {
    void load()
  }, [projectId])

  const changed = useMemo(() => changedIndexes(savedTexts, cues.map((cue) => cue.text)), [savedTexts, cues])
  const dirty = changed.length > 0
  const readOnly = master?.legacy ?? false

  // ---- Video ----
  const hlsUrl = master?.originalHlsUrl
  useEffect(() => {
    const video = videoRef.current
    if (!video || !hlsUrl) return
    if (!isPlayerSupported) {
      setVideoError('Videospelaren kan inte köras i den här webbläsaren.')
      return
    }
    const player = create({ wasmWorker, wasmBinary })
    player.attachHTMLVideoElement(video)
    player.load(hlsUrl)
    const onTime = () => setCurrentTime(video.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      player.pause()
      player.delete()
    }
  }, [hlsUrl])

  function seekTo(seconds: number, play: boolean) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, seconds)
    setCurrentTime(video.currentTime)
    if (play) void video.play().catch(() => undefined)
  }

  const activeIndex = useMemo(() => activeCueIndex(cues, currentTime), [cues, currentTime])
  const activeCue = activeIndex >= 0 ? cues[activeIndex] : null

  // ---- Lista (virtualiserad) ----
  useEffect(() => {
    const element = listRef.current
    if (!element) return
    const update = () => setViewportHeight(element.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [master])

  const { first, last } = windowRange(scrollTop, viewportHeight, ROW_HEIGHT, cues.length)

  function revealRow(index: number) {
    const element = listRef.current
    if (!element) return
    const next = scrollToReveal(index, element.scrollTop, element.clientHeight, ROW_HEIGHT)
    if (next !== element.scrollTop) {
      element.scrollTop = next
      setScrollTop(next)
    }
  }

  function focusRow(index: number) {
    if (index < 0 || index >= cues.length) return
    revealRow(index)
    pendingFocus.current = index
    setFocusTick((tick) => tick + 1)
  }

  useEffect(() => {
    const index = pendingFocus.current
    if (index === null) return
    const area = areas.current.get(index)
    if (area) {
      pendingFocus.current = null
      area.focus()
    }
  }, [focusTick, scrollTop, first, last])

  // Listan följer med uppspelningen, men inte medan operatören skriver.
  useEffect(() => {
    if (!follow || !playing || activeIndex < 0) return
    if (document.activeElement instanceof HTMLTextAreaElement) return
    revealRow(activeIndex)
  }, [activeIndex, follow, playing])

  // "Följ med" slås av när operatören själv scrollar (hjul, touch eller drag i rullningslisten), inte av vår egen scroll.
  // Slås den på igen hoppar listan direkt till den rad som spelas.
  function stopFollowing() {
    setFollow(false)
  }

  useEffect(() => {
    if (follow && activeIndex >= 0) revealRow(activeIndex)
  }, [follow])

  function setText(index: number, text: string) {
    setCues((current) => current.map((cue, position) => (position === index ? { ...cue, text } : cue)))
  }

  // ---- Spara och stäng ----
  async function save() {
    if (!master || !dirty || saving || readOnly) return
    setSaving(true)
    setSaveError('')
    try {
      adopt(await client.projects.saveCaptionMaster(projectId, { ifVersion: master.version, cues: savePayload(cues) }))
      onSaved?.()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'version_conflict') setConflict(true)
      else setSaveError(err instanceof Error ? err.message : 'Undertexterna kunde inte sparas.')
    } finally {
      setSaving(false)
    }
  }

  function requestClose() {
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || confirmClose) return
      if (event.target instanceof HTMLTextAreaElement) return
      requestClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function onAreaKeyDown(event: KeyboardEvent, index: number) {
    const area = event.currentTarget as HTMLTextAreaElement
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setText(index, savedTexts[index] ?? '')
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) {
        if (canInsertLineBreak(area.value)) {
          const start = area.selectionStart
          const end = area.selectionEnd
          setText(index, `${area.value.slice(0, start)}\n${area.value.slice(end)}`)
          requestAnimationFrame(() => area.setSelectionRange(start + 1, start + 1))
        }
      } else {
        focusRow(index + 1)
      }
    } else if (event.key === 'Tab') {
      event.preventDefault()
      focusRow(event.shiftKey ? index - 1 : index + 1)
    }
  }

  const publishedStart = master?.publishedStartSeconds
  const publishedEnd = master?.publishedEndSeconds

  return (
    <div class="ce-scrim" role="dialog" aria-modal="true" aria-label="Redigera undertexter">
      <header class="ce-head">
        <div class="ce-title">
          <h2>Redigera undertexter</h2>
          <div class="ce-sub">
            {projectName}
            {master && <> · version {master.version}{master.updatedByName ? ` (${master.updatedByName})` : ''}</>}
            {publishedStart !== undefined && publishedEnd !== undefined && (
              <> · publiceras: {formatHms(publishedStart)}–{formatHms(publishedEnd)}</>
            )}
          </div>
        </div>
        <div class="ce-actions">
          {publishedStart !== undefined && (
            <button class="btn btn-sm" type="button" onClick={() => seekTo(publishedStart, false)}>
              Hoppa till publicerad del
            </button>
          )}
          <label class="ce-follow">
            <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.currentTarget.checked)} />
            Följ med
          </label>
          <span class="ce-dirty" aria-live="polite">{dirty ? `${changed.length} osparade ändringar` : master ? 'Sparat' : ''}</span>
          <button class="btn btn-sm btn-primary" type="button" disabled={!dirty || saving || readOnly} onClick={() => void save()}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
          <button class="ib" type="button" aria-label="Stäng" title="Stäng" onClick={requestClose}>✕</button>
        </div>
      </header>

      {loadError && (
        <div class="ce-banner ce-error" role="alert">
          {loadError}
          <button class="btn btn-sm" type="button" onClick={() => void load()}>Försök igen</button>
        </div>
      )}
      {readOnly && (
        <div class="ce-banner ce-warn" role="alert">
          Det här utkastet är skapat på ett äldre sätt och går inte att redigera här. Skapa nya undertexter i undertextpanelen.
        </div>
      )}
      {conflict && (
        <div class="ce-banner ce-error" role="alert">
          Någon annan har sparat undertexterna sedan du öppnade dem. Dina ändringar är inte sparade.
          <button class="btn btn-sm" type="button" onClick={() => void load()}>Ladda om (dina ändringar går förlorade)</button>
        </div>
      )}
      {saveError && <div class="ce-banner ce-error" role="alert">{saveError}</div>}

      {!master && !loadError && <div class="ce-loading">Hämtar undertexter…</div>}

      {master && (
        <div class="ce-body">
          <section class="ce-video" aria-label="Video">
            <div class="ce-stage">
              <video ref={videoRef} controls playsInline preload="metadata" />
              {activeCue && <div class="ce-overlay" aria-hidden="true">{activeCue.text}</div>}
            </div>
            {videoError && <p class="ce-error-text" role="alert">{videoError}</p>}
            <p class="ce-help">
              Enter = nästa rad · Skift+Enter = ny rad · Esc = ångra raden · Tab = nästa rad. Klicka på en rads tid för att spela den.
              Gräns: {MAX_LINE_LENGTH} tecken per rad och två rader.
            </p>
          </section>

          <section class="ce-list-wrap" aria-label="Repliker">
            <div class="ce-list-head" aria-hidden="true">
              <span>#</span><span>Start</span><span>Text</span>
            </div>
            <div
              class="ce-list"
              ref={listRef}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              onWheel={stopFollowing}
              onTouchMove={stopFollowing}
              onPointerDown={(event) => {
                // Ett tryck direkt på listan (inte på en rad) är ett drag i rullningslisten.
                if (event.target === event.currentTarget) stopFollowing()
              }}
            >
              <div class="ce-spacer" style={{ height: `${cues.length * ROW_HEIGHT}px` }}>
                {cues.slice(first, last).map((cue, offset) => {
                  const index = first + offset
                  const lines = lineInfo(cue.text)
                  const status = rangeStatus(cue, publishedStart, publishedEnd)
                  const classes = [
                    'ce-row',
                    index === activeIndex ? 'is-active' : '',
                    status === 'outside' ? 'is-outside' : status === 'edge' ? 'is-edge' : '',
                    changed.includes(index) ? 'is-changed' : '',
                    hasLineWarning(cue.text) ? 'has-warning' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <div key={cue.id} class={classes} style={{ top: `${index * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }}>
                      <button class="ce-time ce-num" type="button" title="Spela den här repliken" onClick={() => seekTo(cue.start, true)}>{index + 1}</button>
                      <button
                        class="ce-time"
                        type="button"
                        title={`Spela den här repliken (${formatCueTime(cue.start)}–${formatCueTime(cue.end)}, ${(cue.end - cue.start).toFixed(1)} s)`}
                        onClick={() => seekTo(cue.start, true)}
                      >
                        {formatCueTime(cue.start)}
                      </button>
                      <div class="ce-text">
                        <textarea
                          ref={(element) => {
                            if (element) areas.current.set(index, element)
                            else areas.current.delete(index)
                          }}
                          rows={2}
                          value={cue.text}
                          readOnly={readOnly}
                          aria-label={`Text för replik ${index + 1}`}
                          onInput={(event) => setText(index, event.currentTarget.value)}
                          onFocus={() => seekTo(cue.start, false)}
                          onKeyDown={(event) => onAreaKeyDown(event, index)}
                        />
                        <div class="ce-counters" aria-hidden="true">
                          {lines.map((line, lineIndex) => (
                            <span key={lineIndex} class={line.tooLong ? 'is-over' : ''}>{line.length}/{MAX_LINE_LENGTH}</span>
                          ))}
                          {lines.length > 2 && <span class="is-over">{lines.length} rader</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        </div>
      )}

      {confirmClose && (
        <ConfirmModal
          title="Stänga utan att spara?"
          confirmLabel="Stäng utan att spara"
          danger
          onCancel={() => setConfirmClose(false)}
          onConfirm={onClose}
        >
          <p>Du har {changed.length} osparade ändringar. De går förlorade om du stänger nu.</p>
        </ConfirmModal>
      )}
    </div>
  )
}
