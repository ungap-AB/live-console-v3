import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Chapter, CueKind, Project, Recording } from '../../data/types'
import { formatHms } from '../../app/time'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import type { ProjectActions } from './actions'
import { ProjectHeader } from './ProjectHeader'
import { useModeChange } from './useModeChange'
import { useLiveChannel } from './useLiveChannel'
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

export function OndemandView({ project: p, actions, onBack }: OndemandViewProps) {
  const { selectMode, dialog } = useModeChange(p, actions)
  const live = useLiveChannel(p.channel?.id ?? null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [original, setOriginal] = useState<Recording | null>(null)
  const [projectChapters, setProjectChapters] = useState<Chapter[]>([])
  const [projectChaptersLoaded, setProjectChaptersLoaded] = useState(false)
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
  const [deletingChapter, setDeletingChapter] = useState<number | null>(null)
  const deleteConfirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [confirmOndemand, setConfirmOndemand] = useState(false)
  const [confirmUndoAll, setConfirmUndoAll] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false)

  const recordingId = p.recording?.id
  const recordingState = p.recording?.state

  useEffect(() => {
    const active = recording
    if (!active) return
    setMockTrimStart(active.trimRange?.startOffsetSeconds ?? 0)
    setMockTrimEnd(active.trimRange?.endOffsetSeconds ?? active.durationSeconds)
  }, [recording?.id, recording?.durationSeconds, recording?.trimRange?.startOffsetSeconds, recording?.trimRange?.endOffsetSeconds, p.publicMode, recordingId])

  useEffect(() => {
    if (!p.trimDraft) return
    setMockTrimStart(p.trimDraft.startOffsetSeconds)
    setMockTrimEnd(p.trimDraft.endOffsetSeconds)
    setSavedOffsets(Object.fromEntries(p.trimDraft.chapters.map((chapter) => [chapter.index, chapter.offsetSeconds])))
  }, [p.trimDraft])

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
    if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') {
      setProjectChapters([])
      setProjectChaptersLoaded(false)
      return
    }
    setProjectChaptersLoaded(false)
    client.projects.chapters(p.id).then((nextChapters) => {
      if (!cancelled) {
        setProjectChapters(nextChapters)
        setChapterLabels({})
        setProjectChaptersLoaded(true)
      }
    }).catch(() => {
      if (!cancelled) {
        setProjectChapters([])
        setProjectChaptersLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [p.id, p.publicMode, p.recording?.state, p.recording?.hlsUrl])

  useEffect(() => {
    if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') return
    const recordingReady = p.recording?.state === 'recorded' || p.recording?.state === 'trimmed' || p.recording?.state === 'published'
    if (recordingReady && !projectChapters.some((chapter) => chapter.readOnly)) return

    const refresh = () => {
      void actions.refreshProject().catch(() => undefined)
      void client.projects.chapters(p.id).then((nextChapters) => {
        setProjectChapters(nextChapters)
        setChapterLabels({})
        setProjectChaptersLoaded(true)
      }).catch(() => undefined)
    }
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [actions.refreshProject, p.id, p.publicMode, p.recording?.state, projectChapters])

  if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') return null

  const isAfter = p.publicMode === 'after'
  const livePhase = live.health?.livePhase?.toLowerCase()
  const broadcastInProgress = live.health?.state?.toLowerCase() === 'live' || livePhase === 'live'
  const recordingProcessing = !broadcastInProgress && (p.recording?.state === 'recording' || p.recording?.state === 'processing')
  const chapters = !projectChaptersLoaded
    ? []
    : projectChapters
  const chaptersReadOnly = chapters.some((chapter) => chapter.readOnly)
  const source = original ?? (recording?.kind === 'original' ? recording : null)
  const mockTrimDuration = source?.durationSeconds ?? 0
  const previewUrl = source?.hlsUrl ?? ''

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
    const nextTrimStart = Math.round(previewPosition)
    setMockTrimStart(nextTrimStart)
    if (isAfter && nextTrimStart !== defaultTrimStart) setHasUnpublishedChanges(true)
  }

  function setTrimOut() {
    const nextTrimEnd = Math.round(previewPosition)
    setMockTrimEnd(nextTrimEnd)
    if (isAfter && nextTrimEnd !== defaultTrimEnd) setHasUnpublishedChanges(true)
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

  async function resetVideoToOriginal(): Promise<boolean> {
    if (isAfter && !(await actions.restoreOriginal())) return false
    setMockTrimStart(0)
    setMockTrimEnd(original?.durationSeconds ?? mockTrimDuration)
    setDraftOffsets({})
    setSavedOffsets({})
    setUndoVisible(false)
    setChapterLabels({})
    setSelectedChapter(null)
    setPreviewSeekSeconds(null)
    setProjectChaptersLoaded(false)
    void client.projects.chapters(p.id).then((nextChapters) => {
      setProjectChapters(nextChapters)
      setProjectChaptersLoaded(true)
    }).catch(() => setProjectChaptersLoaded(true))
    return true
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
    setPreviewSeekSeconds(draftOffsets[index] ?? savedOffsets[index] ?? chapter.offsetSeconds)
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
    if (selectedChapter === null) return
    const nextOffset = Math.round(previewPosition)
    setDraftOffsets((current) => ({ ...current, [selectedChapter]: nextOffset }))
    try {
      if (p.publicMode === 'ondemand') {
        const chapter = chapters[selectedChapter]
        await client.projects.updateDraftChapter(p.id, chapter.chapterId, { offsetSeconds: nextOffset })
      } else {
        const chapter = chapters[selectedChapter]
        await client.projects.updateDraftChapter(p.id, chapter.chapterId, { offsetSeconds: nextOffset })
      }
      setSavedOffsets((current) => ({ ...current, [selectedChapter]: nextOffset }))
      setHasUnpublishedChanges(true)
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

  async function saveTrimDraft() {
    const nextDraft = {
      startOffsetSeconds: mockTrimStart,
      endOffsetSeconds: mockTrimEnd,
      chapters: chapters.map((chapter, index) => ({
        index,
        label: chapterLabels[index] ?? chapter.label,
        offsetSeconds: savedOffsets[index] ?? draftOffsets[index] ?? chapter.offsetSeconds,
      })),
    }
    try {
      await client.projects.saveTrimDraft(p.id, nextDraft)
      await actions.refreshProject()
    } catch {
      // Behåll draften lokalt så operatören kan försöka spara igen.
    }
  }
  const defaultTrimStart = recording?.trimRange?.startOffsetSeconds ?? 0
  const defaultTrimEnd = recording?.trimRange?.endOffsetSeconds ?? mockTrimDuration
  const startChanged = mockTrimStart !== defaultTrimStart
  const endChanged = mockTrimEnd !== defaultTrimEnd
  const trimDirty = isAfter && (startChanged || endChanged)
  const draftDirty = trimDirty || Object.entries(chapterLabels).some(([index, label]) => label !== chapters[Number(index)]?.label)
  const canPublishOndemand = !chaptersReadOnly && (isAfter || hasUnpublishedChanges || trimDirty)
  const videoDuration = previewVideoRef.current?.duration || mockTrimDuration
  const canReturnToSaved = selectedChapter !== null && draftOffsets[selectedChapter] !== undefined

  async function publishWithTrim() {
    setConfirmOndemand(false)
    setPublishing(true)
    try {
      if (draftDirty) await saveTrimDraft()
      if (trimDirty && p.recording) {
        if (!(await actions.trim({ startOffsetSeconds: mockTrimStart, endOffsetSeconds: mockTrimEnd }))) return
        await actions.refreshProject()
        if (await actions.publish()) setHasUnpublishedChanges(false)
        return
      }
      if (p.recording) {
        if (await actions.publish()) setHasUnpublishedChanges(false)
      } else if (await actions.setPublicMode('ondemand')) {
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

  async function undoAllAndClose() {
    setConfirmUndoAll(false)
    if (await resetVideoToOriginal()) setHasUnpublishedChanges(true)
  }

  function startChapterEdit(index: number, label: string) {
    setEditingChapter(index)
    setChapterDraft(label)
  }

  async function finishChapterEdit() {
    if (editingChapter !== null && chapterDraft.trim()) {
      setChapterLabels((current) => ({ ...current, [editingChapter]: chapterDraft.trim() }))
      if (p.publicMode === 'ondemand') {
        const chapter = chapters[editingChapter]
        await client.projects.updateDraftChapter(p.id, chapter.chapterId, { label: chapterDraft.trim() })
        const nextChapters = await client.projects.chapters(p.id)
        setProjectChapters(nextChapters)
        setChapterLabels({})
        setHasUnpublishedChanges(true)
      } else if (p.publicMode === 'after') {
        const chapter = chapters[editingChapter]
        if (chapter) {
          await client.projects.updateDraftChapter(p.id, chapter.chapterId, { label: chapterDraft.trim() })
          const nextChapters = await client.projects.chapters(p.id)
          setProjectChapters(nextChapters)
          setChapterLabels({})
          setHasUnpublishedChanges(true)
        }
      }
    }
    setEditingChapter(null)
    setChapterDraft('')
  }

  async function deleteChapter(index: number) {
    if (deleteConfirmationTimer.current) clearTimeout(deleteConfirmationTimer.current)
    setDeletingChapter(null)
    if (p.publicMode === 'ondemand') {
      const chapter = chapters[index]
      if (!chapter) return
      await client.projects.deleteDraftChapter(p.id, chapter.chapterId)
      setProjectChapters((current) => current.filter((_, chapterIndex) => chapterIndex !== index))
      setHasUnpublishedChanges(true)
      setChapterLabels((current) => Object.fromEntries(
        Object.entries(current)
          .filter(([chapterIndex]) => Number(chapterIndex) !== index)
          .map(([chapterIndex, label]) => [Number(chapterIndex) > index ? Number(chapterIndex) - 1 : Number(chapterIndex), label]),
      ))
      setDraftOffsets((current) => Object.fromEntries(
        Object.entries(current)
          .filter(([chapterIndex]) => Number(chapterIndex) !== index)
          .map(([chapterIndex, offset]) => [Number(chapterIndex) > index ? Number(chapterIndex) - 1 : Number(chapterIndex), offset]),
      ))
      setSavedOffsets((current) => Object.fromEntries(
        Object.entries(current)
          .filter(([chapterIndex]) => Number(chapterIndex) !== index)
          .map(([chapterIndex, offset]) => [Number(chapterIndex) > index ? Number(chapterIndex) - 1 : Number(chapterIndex), offset]),
      ))
    } else if (p.publicMode === 'after') {
      const chapter = chapters[index]
      if (chapter) await client.projects.deleteDraftChapter(p.id, chapter.chapterId)
      await actions.refreshPlayout()
      setHasUnpublishedChanges(true)
    } else return
    setSelectedChapter(null)
    setEditingChapter(null)
  }

  function requestChapterDelete(index: number) {
    if (deleteConfirmationTimer.current) clearTimeout(deleteConfirmationTimer.current)
    setDeletingChapter(index)
    deleteConfirmationTimer.current = setTimeout(() => {
      setDeletingChapter(null)
      deleteConfirmationTimer.current = null
    }, 3000)
  }

  return (
    <div class="project-workspace doc">
      <ProjectHeader project={p} actions={actions} onBack={onBack} onModeSelect={handleModeSelect} channel={live.channel} health={live.health} streamKey={live.streamKey} />
      <div class="od">
        <div class="od-cols">
          <section class="od-col" aria-label="Trimning">
            {(source || previewUrl || broadcastInProgress || recordingProcessing) && (
              <div class="od-mock-trim" aria-label={isAfter ? 'Trimning' : 'Trim-förhandsvisning'}>
                <div class="od-trim-preview">
                  {broadcastInProgress ? (
                    <div class="od-broadcast-warning" role="status">
                      <strong>{isAfter ? 'Sändningen avslutad' : 'Sändning pågår'}</strong>
                      <span>Stoppa enkodern för att trimma och publicera ondemand. Eller gå tillbaka till Before om detta bara var en test.</span>
                    </div>
                  ) : recordingProcessing ? (
                    <div class="od-broadcast-warning" role="status">
                      <strong>Inspelningen bearbetas</strong>
                      <span>Vänta tills inspelningen är klar innan du trimmar och publicerar ondemand.</span>
                    </div>
                  ) : (
                    <video ref={previewVideoRef} controls playsInline preload="metadata" aria-label="Förhandsvisning" />
                  )}
                </div>
                {isAfter && <div class={`od-selected-chapter${selectedChapter !== null && chapters[selectedChapter] ? ' has-selected-chapter' : ''}${broadcastInProgress || recordingProcessing ? ' is-broadcasting' : ''}`}>
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
                  {!chaptersReadOnly && <div class="od-time-controls" aria-label="Videoposition">
                    <div class="od-trim-in-group">
                      <button class="od-trim-go-button od-trim-go-in" type="button" aria-label="Gå till trimningens start" title="Gå till IN" disabled={!isAfter} onClick={goToTrimIn}>
                        <Icon name="skip_previous" size={18} />
                      </button>
                      <button class="od-trim-boundary-button od-trim-in" type="button" disabled={!isAfter} onClick={setTrimIn}>IN</button>
                    </div>
                    <div class="od-controls-middle">
                      <button class="btn btn-sm" type="button" disabled={selectedChapter === null || previewPosition <= 0} onClick={() => seekBy(-10)}>−10 s</button>
                      <button class="btn btn-sm" type="button" disabled={selectedChapter === null || previewPosition <= 0} onClick={() => seekBy(-5)}>−5 s</button>
                      <output>{formatHms(previewPosition)}</output>
                      <button class="btn btn-sm" type="button" disabled={selectedChapter === null || previewPosition >= videoDuration} onClick={() => seekBy(5)}>+5 s</button>
                      <button class="btn btn-sm" type="button" disabled={selectedChapter === null || previewPosition >= videoDuration} onClick={() => seekBy(10)}>+10 s</button>
                    </div>
                    <div class="od-trim-out-group">
                      <button class="od-trim-boundary-button od-trim-out" type="button" disabled={!isAfter} onClick={setTrimOut}>OUT</button>
                      <button class="od-trim-go-button od-trim-go-out" type="button" aria-label="Gå till trimningens slut" title="Gå till OUT" disabled={!isAfter} onClick={goToTrimOut}>
                        <Icon name="skip_next" size={18} />
                      </button>
                    </div>
                  </div>}
                  {!chaptersReadOnly && <div class="od-selected-chapter-controls">
                    <div class="od-selected-chapter-actions">
                      <div class="od-main-commit-group">
                        <button class="btn btn-sm od-commit-button" type="button" aria-label="Tillbaka till sparad tid" title="Tillbaka till sparad tid" disabled={!canReturnToSaved} onClick={returnToSavedOffset}>Tillbaka</button>
                        <button class="btn btn-sm od-commit-button" type="button" aria-label="Spela eller pausa" title="Spela eller pausa" onClick={togglePreviewPlayback}>
                          <Icon name={previewPlaying ? 'pause' : 'play_arrow'} size={18} />
                        </button>
                        <button class="btn btn-sm od-commit-button" type="button" aria-label="Cue tidsändring" title="Cue tidsändring" disabled={selectedChapter === null} onClick={() => void saveSelectedChapter()}>Cue</button>
                      </div>
                      {undoVisible && <button class="btn btn-sm od-commit-button od-undo-button" type="button" aria-label="Ångra tidsändring" title="Ångra tidsändring" onClick={undoToOriginalOffset}>Ångra</button>}
                    </div>
                  </div>}
                </div>}
              </div>
            )}
            <footer class="od-trim-footer">
            </footer>
          </section>

          <section class={`od-col od-chapters-col${chaptersReadOnly ? ' is-readonly' : ''}`} aria-labelledby="od-chapters-title">
            {chaptersReadOnly && <p class="od-empty">Kapitlen är registrerade. Videopositioner och redigering blir tillgängliga när inspelningen är klar.</p>}
            {chapters.length === 0 ? (
              <p class="od-empty">Inga kapitel än. De skapas från det som spelades ut under sändningen.</p>
            ) : (
              <ul class="od-chapters">
                {chapters.map((chapter, index) => (
                  <li
                    key={chapter.chapterId}
                    class={`od-chapter-row${selectedChapter === index ? ' is-selected' : ''}`}
                  >
                      {!chaptersReadOnly && <button
                      class="od-chapter-play"
                      type="button"
                      aria-label={`Spela från ${chapter.label}`}
                      title="Spela från denna punkt"
                        onClick={() => selectChapter(index)}
                    >
                      <Icon name="skip_next" size={16} />
                    </button>}
                    {!chaptersReadOnly && <span class={`od-time${draftOffsets[index] !== undefined ? ' is-draft' : ''}`}>
                      {formatHms(draftOffsets[index] ?? savedOffsets[index] ?? chapter.offsetSeconds)}
                    </span>}
                    {!chaptersReadOnly && editingChapter === index ? (
                      <span class="od-chapter-edit">
                        <input
                          ref={chapterInputRef}
                          aria-label="Kapiteltext"
                          value={chapterDraft}
                          autoFocus
                          onInput={(event) => setChapterDraft(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void finishChapterEdit()
                            if (event.key === 'Escape') void finishChapterEdit()
                          }}
                        />
                        <button class="btn btn-sm" type="button" onClick={() => void finishChapterEdit()}>Klar</button>
                      </span>
                    ) : (
                      <span class="od-chapter-label" onDblClick={chaptersReadOnly ? undefined : () => startChapterEdit(index, chapterLabels[index] ?? chapter.label)} title={chaptersReadOnly ? undefined : 'Dubbelklicka för att redigera'}>
                        {chapterLabels[index] ?? chapter.label}
                      </span>
                    )}
                    <span class="od-chapter-kind">{CHAPTER_KIND[chapter.kind]}</span>
                    {!chaptersReadOnly && (p.publicMode === 'ondemand' || p.publicMode === 'after') && (
                      deletingChapter === index ? (
                        <button class="od-chapter-delete is-confirm" type="button" aria-label={`Bekräfta radering av ${chapter.label}`} title="Bekräfta radering" onClick={() => void deleteChapter(index)}>
                          <Icon name="check" size={16} />
                        </button>
                      ) : (
                        <button class="od-chapter-delete" type="button" aria-label={`Radera ${chapter.label}`} title="Radera kapitel" onClick={() => requestChapterDelete(index)}>
                          <Icon name="delete" size={16} />
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
            <footer class="od-chapters-footer">
              {(isAfter || p.publicMode === 'ondemand') && (
                <>
                  {isAfter && <button class="btn btn-sm" type="button" disabled={chaptersReadOnly} onClick={() => setConfirmUndoAll(true)}>
                    Ångra allt
                  </button>}
                  <button class="btn btn-sm btn-primary od-publish-button" type="button" disabled={!canPublishOndemand} onClick={() => setConfirmOndemand(true)}>
                    Publicera ondemand
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      </div>
      {dialog}
      {confirmOndemand && (
        <Modal title="Publicera ändringarna?" onClose={() => setConfirmOndemand(false)}>
          <p>Sändningen sätts i Ondemand-läge när du publicerar.</p>
          <div class="modal-actions">
            <button class="btn" type="button" onClick={() => setConfirmOndemand(false)}>Avbryt</button>
            <button class="btn btn-primary" type="button" onClick={() => void publishWithTrim()}>Publicera</button>
          </div>
        </Modal>
      )}
      {confirmUndoAll && (
        <Modal title="Ångra allt?" onClose={() => setConfirmUndoAll(false)}>
          <p>Alla ändringar i After återställs till läget när sändningen gick över till After. Originalinspelningen används igen.</p>
          <div class="modal-actions">
            <button class="btn" type="button" onClick={() => setConfirmUndoAll(false)}>Avbryt</button>
            <button class="btn btn-danger" type="button" onClick={() => void undoAllAndClose()}>Ångra allt</button>
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
