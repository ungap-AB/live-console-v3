import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Channel, Chapter, CueKind, Project, Recording } from '../../data/types'
import { formatHms } from '../../app/time'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import type { ProjectActions } from './actions'
import { ProjectHeader } from './ProjectHeader'
import { useModeChange } from './useModeChange'
import './OndemandView.css'

interface OndemandViewProps {
  project: Project
  actions: ProjectActions
  onBack: () => void
}

const CHAPTER_KIND: Record<CueKind, string> = {
  agendaItem: 'Ärende',
  person: 'Talare',
  exclamation: 'Utrop',
}

function chaptersFor(recording: Recording, original: Recording | null): Chapter[] {
  const source = recording.kind === 'trimmed' ? original : recording
  if (!source) return []
  const range = recording.kind === 'trimmed' ? recording.trimRange : undefined
  return source.chapters
    .filter((chapter) => !range || (chapter.offsetSeconds >= range.startOffsetSeconds && chapter.offsetSeconds <= range.endOffsetSeconds))
    .map((chapter) => ({ ...chapter, offsetSeconds: chapter.offsetSeconds - (range?.startOffsetSeconds ?? 0) }))
    .sort((left, right) => left.offsetSeconds - right.offsetSeconds)
}

function chaptersForRange(source: Recording | null, startOffsetSeconds: number, endOffsetSeconds: number): Chapter[] {
  if (!source) return []
  return source.chapters
    .filter((chapter) => chapter.offsetSeconds >= startOffsetSeconds && chapter.offsetSeconds <= endOffsetSeconds)
    .map((chapter) => ({ ...chapter, offsetSeconds: chapter.offsetSeconds - startOffsetSeconds }))
    .sort((left, right) => left.offsetSeconds - right.offsetSeconds)
}

function chaptersChanged(source: Recording | null, startOffsetSeconds: number, endOffsetSeconds: number): boolean {
  if (!source) return false
  const original = chaptersForRange(source, 0, source.durationSeconds)
  const adjusted = chaptersForRange(source, startOffsetSeconds, endOffsetSeconds)
  return original.length !== adjusted.length || original.some((chapter, index) => {
    const next = adjusted[index]
    return !next || chapter.kind !== next.kind || chapter.label !== next.label || chapter.offsetSeconds !== next.offsetSeconds
  })
}

export function OndemandView({ project: p, actions, onBack }: OndemandViewProps) {
  const { selectMode, dialog } = useModeChange(p, actions)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [original, setOriginal] = useState<Recording | null>(null)
  const [channel, setChannel] = useState<Channel | null>(null)
  const [mockTrimStart, setMockTrimStart] = useState(0)
  const [mockTrimEnd, setMockTrimEnd] = useState(0)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const chapterInputRef = useRef<HTMLInputElement>(null)
  const [previewSeekSeconds, setPreviewSeekSeconds] = useState<number | null>(null)
  const [previewPlayRequest, setPreviewPlayRequest] = useState(0)
  const [previewPosition, setPreviewPosition] = useState(0)
  const [draftOffsets, setDraftOffsets] = useState<Record<number, number>>({})
  const [savedOffsets, setSavedOffsets] = useState<Record<number, number>>({})
  const [undoVisible, setUndoVisible] = useState(false)
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [chapterLabels, setChapterLabels] = useState<Record<number, string>>({})
  const [editingChapter, setEditingChapter] = useState<number | null>(null)
  const [chapterDraft, setChapterDraft] = useState('')
  const [confirmOndemand, setConfirmOndemand] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const recordingId = p.recording?.id
  const recordingState = p.recording?.state

  useEffect(() => {
    const active = recording
    if (!active) return
    setMockTrimStart(active.trimRange?.startOffsetSeconds ?? 0)
    setMockTrimEnd(active.trimRange?.endOffsetSeconds ?? active.durationSeconds)
  }, [recording?.id, recording?.durationSeconds, recording?.trimRange?.startOffsetSeconds, recording?.trimRange?.endOffsetSeconds, p.publicMode, recordingId])

  useEffect(() => {
    let cancelled = false
    if (!recordingId || recordingState === 'recording' || recordingState === 'processing') {
      setRecording(null)
      setOriginal(null)
      return
    }
    client.recordings.get(recordingId).then(async (nextRecording) => {
      if (!nextRecording || cancelled) return
      const parent = nextRecording.kind === 'trimmed' && nextRecording.parentId
        ? ((await client.recordings.get(nextRecording.parentId)) ?? null)
        : null
      if (cancelled) return
      setRecording(nextRecording)
      setOriginal(parent)
    })
    return () => {
      cancelled = true
    }
  }, [recordingId, recordingState])

  useEffect(() => {
    let cancelled = false
    if (!p.channel) {
      setChannel(null)
      return
    }
    client.channels.get(p.channel.id).then((nextChannel) => {
      if (!cancelled) setChannel(nextChannel ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [p.channel?.id])

  if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') return null

  const isAfter = p.publicMode === 'after'
  const broadcastInProgress = p.recording?.state === 'recording' || channel?.state === 'live' || p.technicalHealth.channelLivePhase === 'live'
  const displayedRecording = recording
  const displayedOriginal = original
  const chapters = displayedRecording ? chaptersFor(displayedRecording, displayedOriginal) : []
  const source = displayedOriginal ?? displayedRecording
  const mockTrimDuration = source?.durationSeconds ?? 0
  const previewUrl = displayedRecording?.hlsUrl ?? ''

  useEffect(() => {
    const video = previewVideoRef.current
    if (!video || !previewUrl || !isPlayerSupported) return
    const player = create({ wasmWorker, wasmBinary })
    player.attachHTMLVideoElement(video)
    player.load(previewUrl)
    return () => {
      player.pause()
      player.delete()
    }
  }, [previewUrl])

  useEffect(() => {
    const video = previewVideoRef.current
    if (!video || previewSeekSeconds === null) return
    const seek = () => {
      video.currentTime = previewSeekSeconds
      setPreviewSeekSeconds(null)
    }
    if (video.readyState >= 1) seek()
    else {
      video.addEventListener('loadedmetadata', seek, { once: true })
      return () => video.removeEventListener('loadedmetadata', seek)
    }
  }, [previewPlayRequest, previewSeekSeconds])

  useEffect(() => {
    const video = previewVideoRef.current
    if (!video) return
    const updatePosition = () => {
      setPreviewPosition(video.currentTime)
      if (!video.paused && selectedChapter !== null) {
        setDraftOffsets((current) => ({ ...current, [selectedChapter]: Math.round(video.currentTime) }))
      }
    }
    const updatePlayback = () => setPreviewPlaying(!video.paused && !video.ended)
    video.addEventListener('timeupdate', updatePosition)
    video.addEventListener('loadedmetadata', updatePosition)
    video.addEventListener('play', updatePlayback)
    video.addEventListener('pause', updatePlayback)
    video.addEventListener('ended', updatePlayback)
    return () => {
      video.removeEventListener('timeupdate', updatePosition)
      video.removeEventListener('loadedmetadata', updatePosition)
      video.removeEventListener('play', updatePlayback)
      video.removeEventListener('pause', updatePlayback)
      video.removeEventListener('ended', updatePlayback)
    }
  }, [previewUrl, selectedChapter])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      seekBy(event.key === 'ArrowLeft' ? (event.shiftKey ? -1 : -5) : (event.shiftKey ? 1 : 5))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewPosition])

  useEffect(() => {
    if (editingChapter !== null) chapterInputRef.current?.focus()
  }, [editingChapter])

  function seekBy(seconds: number) {
    const video = previewVideoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(video.duration || Number.MAX_SAFE_INTEGER, video.currentTime + seconds))
    setPreviewPosition(video.currentTime)
  }

  function setTrimIn() {
    setMockTrimStart(Math.round(previewPosition))
  }

  function setTrimOut() {
    setMockTrimEnd(Math.round(previewPosition))
  }

  function goToTrimIn() {
    const video = previewVideoRef.current
    if (!video) return
    video.currentTime = mockTrimStart
    setPreviewPosition(mockTrimStart)
  }

  function goToTrimOut() {
    const video = previewVideoRef.current
    if (!video) return
    video.currentTime = mockTrimEnd
    setPreviewPosition(mockTrimEnd)
  }

  function returnToSavedOffset() {
    if (selectedChapter === null) {
      setDraftOffsets({})
      return
    }
    const chapter = chapters[selectedChapter]
    if (!chapter) return
    const savedOffset = savedOffsets[selectedChapter] ?? chapter.offsetSeconds
    setDraftOffsets((current) => {
      const next = { ...current }
      delete next[selectedChapter]
      return next
    })
    const video = previewVideoRef.current
    if (video) {
      video.currentTime = savedOffset
      setPreviewPosition(savedOffset)
    }
  }

  function undoToOriginalOffset() {
    if (selectedChapter === null) return
    setUndoVisible(false)
    const chapter = chapters[selectedChapter]
    if (!chapter) return
    const originalOffset = chapter.offsetSeconds
    setDraftOffsets((current) => {
      const next = { ...current }
      delete next[selectedChapter]
      return next
    })
    setSavedOffsets((current) => {
      const next = { ...current }
      delete next[selectedChapter]
      return next
    })
    const video = previewVideoRef.current
    if (video) {
      video.currentTime = originalOffset
      setPreviewPosition(originalOffset)
    }
  }

  function undoAllOffsets() {
    setDraftOffsets({})
    setSavedOffsets({})
    setUndoVisible(false)
  }

  function pausePreview() {
    previewVideoRef.current?.pause()
    setPreviewPlaying(false)
  }

  function selectChapter(index: number) {
    const chapter = chapters[index]
    if (!chapter) return
    pausePreview()
    setUndoVisible(false)
    setSelectedChapter(index)
    setPreviewSeekSeconds(draftOffsets[index] ?? chapter.offsetSeconds)
    setPreviewPlayRequest((request) => request + 1)
  }

  function togglePreviewPlayback() {
    const video = previewVideoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().then(() => setPreviewPlaying(true)).catch(() => undefined)
    } else {
      video.pause()
      setPreviewPlaying(false)
    }
  }

  async function saveSelectedChapter() {
    if (selectedChapter === null || draftOffsets[selectedChapter] === undefined) return
    const nextOffset = draftOffsets[selectedChapter]
    try {
      if (p.publicMode === 'ondemand') {
        await client.projects.updateChapterOffset(p.id, selectedChapter, nextOffset)
      } else {
        const chapter = chapters[selectedChapter]
        const event = p.playout.timeline
          .filter((item) => item.kind === chapter.kind && item.refId !== null && item.label !== 'Rensat')
          .find((item) => item.label === chapter.label || item.offsetSeconds === chapter.offsetSeconds)
        if (event) await client.projects.updateTimelineEvent(p.id, event.id, { offsetSeconds: nextOffset })
      }
      setSavedOffsets((current) => ({ ...current, [selectedChapter]: nextOffset }))
      setUndoVisible(true)
      setDraftOffsets((current) => {
        const next = { ...current }
        delete next[selectedChapter]
        return next
      })
    } catch {
      // Keep the draft visible so the operator can retry.
    }
  }
  const defaultTrimStart = displayedRecording?.trimRange?.startOffsetSeconds ?? 0
  const defaultTrimEnd = displayedRecording?.trimRange?.endOffsetSeconds ?? mockTrimDuration
  const startChanged = mockTrimStart !== defaultTrimStart
  const endChanged = mockTrimEnd !== defaultTrimEnd
  const trimDirty = isAfter && (startChanged || endChanged)
  const chaptersAdjusted = trimDirty && chaptersChanged(source, mockTrimStart, mockTrimEnd)
  const confirmationChanges = [
    trimDirty ? 'Videon är trimmad' : '',
    chaptersAdjusted ? 'kapitel är justerade' : '',
  ].filter(Boolean).join(' och ')
  const confirmationText = trimDirty
    ? `${confirmationChanges}. Är du redo att publicera ändringarna för ondemand?`
    : 'Ingen trimning har gjorts. Är du redo att gå till ondemand med originalinspelningen?'
  const hasOffsetDrafts = Object.keys(draftOffsets).length > 0
  const videoDuration = previewVideoRef.current?.duration || mockTrimDuration
  const canReturnToSaved = selectedChapter !== null && draftOffsets[selectedChapter] !== undefined

  async function publishWithTrim() {
    setConfirmOndemand(false)
    setPublishing(true)
    try {
      if (trimDirty && p.recording) {
        if (!(await actions.trim({ startOffsetSeconds: mockTrimStart, endOffsetSeconds: mockTrimEnd }))) return
        await actions.refreshProject()
        await actions.publish()
        return
      }
      if (await actions.setPublicMode('ondemand')) {
        actions.setVisibility('open')
      }
    } finally {
      setPublishing(false)
    }
  }

  function handleModeSelect(mode: Project['publicMode']) {
    if (mode === 'ondemand' && isAfter) {
      setConfirmOndemand(true)
      return
    }
    selectMode(mode)
  }

  function startChapterEdit(index: number, label: string) {
    setEditingChapter(index)
    setChapterDraft(label)
  }

  function finishChapterEdit() {
    if (editingChapter !== null && chapterDraft.trim()) {
      setChapterLabels((current) => ({ ...current, [editingChapter]: chapterDraft.trim() }))
    }
    setEditingChapter(null)
    setChapterDraft('')
  }

  return (
    <div class="project-workspace doc">
      <ProjectHeader project={p} actions={actions} onBack={onBack} onModeSelect={handleModeSelect} />
      <div class="od">
        {!isAfter && (
          <div class="od-published" role="status">
            <span class="od-published-badge">PUBLICERAD</span>
            <span class="od-published-text">Ändringar du sparar syns direkt för publiken. Gör större ändringar i läget After.</span>
            <button class="btn" type="button" onClick={() => selectMode('after')}>Gå till After</button>
          </div>
        )}

        <div class="od-cols">
          <section class="od-col" aria-label="Trimning">
            {(displayedRecording || broadcastInProgress) && (
              <div class="od-mock-trim" aria-label={isAfter ? 'Trimning' : 'Trim-förhandsvisning'}>
                <div class="od-trim-preview">
                  {broadcastInProgress ? (
                    <div class="od-broadcast-warning" role="status">
                      <strong>Sändning pågår</strong>
                      <span>Stoppa enkodern för att trimma och publicera ondemand. Eller gå tillbaka till Before om detta bara var en test.</span>
                    </div>
                  ) : (
                    <video ref={previewVideoRef} controls playsInline preload="metadata" aria-label="Förhandsvisning" />
                  )}
                </div>
                <div class={`od-selected-chapter${selectedChapter !== null && chapters[selectedChapter] ? ' has-selected-chapter' : ''}${broadcastInProgress ? ' is-broadcasting' : ''}`}>
                  {selectedChapter !== null && chapters[selectedChapter] ? (
                    <div class="od-selected-chapter-heading">
                      <button class="od-chapter-nav" type="button" aria-label="Föregående kapitel" title="Föregående kapitel" disabled={selectedChapter <= 0} onClick={() => selectChapter(selectedChapter - 1)}>
                        <Icon name="chevron_left" size={20} />
                      </button>
                      <div class="od-selected-chapter-label">
                      {chapterLabels[selectedChapter] ?? chapters[selectedChapter].label}
                      </div>
                      <button class="od-chapter-nav" type="button" aria-label="Nästa kapitel" title="Nästa kapitel" disabled={selectedChapter >= chapters.length - 1} onClick={() => selectChapter(selectedChapter + 1)}>
                        <Icon name="chevron_right" size={20} />
                      </button>
                    </div>
                  ) : (
                    <span class="od-selected-chapter-empty">
                      Klicka på kapitlets <Icon name="skip_next" size={16} />-knapp för att justera det
                    </span>
                  )}
                  <div class="od-time-controls" aria-label="Videoposition">
                    <div class="od-trim-in-group">
                      <button class="od-trim-go-button od-trim-go-in" type="button" aria-label="Gå till trimningens start" title="Gå till IN" onClick={goToTrimIn}>
                        <Icon name="skip_previous" size={18} />
                      </button>
                      <button class="od-trim-boundary-button od-trim-in" type="button" onClick={setTrimIn}>IN</button>
                    </div>
                    <div class="od-controls-middle">
                      <button class="btn btn-sm" type="button" disabled={selectedChapter === null || previewPosition <= 0} onClick={() => seekBy(-10)}>−10 s</button>
                      <button class="btn btn-sm" type="button" disabled={selectedChapter === null || previewPosition <= 0} onClick={() => seekBy(-5)}>−5 s</button>
                      <output>{formatHms(previewPosition)}</output>
                      <button class="btn btn-sm" type="button" disabled={selectedChapter === null || previewPosition >= videoDuration} onClick={() => seekBy(5)}>+5 s</button>
                      <button class="btn btn-sm" type="button" disabled={selectedChapter === null || previewPosition >= videoDuration} onClick={() => seekBy(10)}>+10 s</button>
                    </div>
                    <div class="od-trim-out-group">
                      <button class="od-trim-boundary-button od-trim-out" type="button" onClick={setTrimOut}>OUT</button>
                      <button class="od-trim-go-button od-trim-go-out" type="button" aria-label="Gå till trimningens slut" title="Gå till OUT" onClick={goToTrimOut}>
                        <Icon name="skip_next" size={18} />
                      </button>
                    </div>
                  </div>
                  <div class="od-selected-chapter-controls">
                    <div class="od-selected-chapter-actions">
                      <div class="od-main-commit-group">
                        <button class="btn btn-sm od-commit-button" type="button" aria-label="Tillbaka till sparad tid" title="Tillbaka till sparad tid" disabled={!canReturnToSaved} onClick={returnToSavedOffset}>Tillbaka</button>
                        <button class="btn btn-sm od-commit-button" type="button" aria-label="Spela eller pausa" title="Spela eller pausa" onClick={togglePreviewPlayback}>
                          <Icon name={previewPlaying ? 'pause' : 'play_arrow'} size={18} />
                        </button>
                        <button class="btn btn-sm od-commit-button" type="button" aria-label="Spara tidsändring" title="Spara tidsändring" disabled={!hasOffsetDrafts} onClick={saveSelectedChapter}>Spara</button>
                      </div>
                      {undoVisible && <button class="btn btn-sm od-commit-button od-undo-button" type="button" aria-label="Ångra tidsändring" title="Ångra tidsändring" onClick={undoToOriginalOffset}>Ångra</button>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section class="od-col od-chapters-col" aria-labelledby="od-chapters-title">
            {chapters.length === 0 ? (
              <p class="od-empty">Inga kapitel än. De skapas från det som spelades ut under sändningen.</p>
            ) : (
              <ul class="od-chapters">
                {chapters.map((chapter, index) => (
                  <li
                    key={`${chapter.offsetSeconds}-${index}`}
                    class="od-chapter-row"
                  >
                    <button
                      class="od-chapter-play"
                      type="button"
                      aria-label={`Spela från ${chapter.label}`}
                      title="Spela från denna punkt"
                      onClick={() => selectChapter(index)}
                    >
                      <Icon name="skip_next" size={16} />
                    </button>
                    <span class={`od-time${draftOffsets[index] !== undefined ? ' is-draft' : ''}`}>
                      {formatHms(draftOffsets[index] ?? chapter.offsetSeconds)}
                    </span>
                    {editingChapter === index ? (
                      <span class="od-chapter-edit">
                        <input
                          ref={chapterInputRef}
                          aria-label="Kapiteltext"
                          value={chapterDraft}
                          autoFocus
                          onInput={(event) => setChapterDraft(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') finishChapterEdit()
                            if (event.key === 'Escape') finishChapterEdit()
                          }}
                        />
                        <button class="btn btn-sm" type="button" onClick={finishChapterEdit}>Klar</button>
                      </span>
                    ) : (
                      <span class="od-chapter-label" onDblClick={() => startChapterEdit(index, chapterLabels[index] ?? chapter.label)} title="Dubbelklicka för att redigera">
                        {chapterLabels[index] ?? chapter.label}
                      </span>
                    )}
                    <span class="od-chapter-kind">{CHAPTER_KIND[chapter.kind]}</span>
                  </li>
                ))}
              </ul>
            )}
            <footer class="od-chapters-footer">
              <button class="btn btn-sm" type="button" disabled={Object.keys(draftOffsets).length === 0 && Object.keys(savedOffsets).length === 0} onClick={undoAllOffsets}>
                Ångra alla justeringar
              </button>
            </footer>
          </section>
        </div>
      </div>
      {dialog}
      {confirmOndemand && (
        <Modal title="Publicera ändringarna?" onClose={() => setConfirmOndemand(false)}>
          <p>{confirmationText}</p>
          <div class="modal-actions">
            <button class="btn" type="button" onClick={() => setConfirmOndemand(false)}>Nej</button>
            <button class="btn btn-primary" type="button" onClick={() => void publishWithTrim()}>{trimDirty ? 'Ja, publicera' : 'Ja, gå till ondemand'}</button>
          </div>
        </Modal>
      )}
      {publishing && (
        <Modal title="Publicerar ondemand" onClose={() => undefined}>
          <p>Förbereder video och publicerar ändringarna. Vänta tills publiceringen är klar.</p>
        </Modal>
      )}
    </div>
  )
}
