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

const MOCK_ONDEMAND_HLS_URL = 'https://dev.media.ungap.net/ivs/v1/471112617922/LDHByX7JxjGF/2026/9/19/16/10/KRuUDSAVxa8x/media/hls/_odm_20260919161006_20260919170951.m3u8'

const MOCK_FALLBACK_RECORDING: Recording = {
  id: 'mock-ondemand-recording',
  kind: 'original',
  name: 'Mockad inspelning',
  createdAt: '2026-09-19T16:10:06Z',
  durationSeconds: 5995,
  sizeBytes: 8_240_000_000,
  resolution: '1920×1080p50',
  source: 'Mockad inspelning',
  hlsUrl: MOCK_ONDEMAND_HLS_URL,
  project: null,
  segments: [{ startedAt: '2026-09-19T16:10:06Z', durationSeconds: 5995 }],
  chapters: [
    { kind: 'agendaItem', label: '1. Mötet öppnas', offsetSeconds: 0 },
    { kind: 'agendaItem', label: '2. Föredragningslista', offsetSeconds: 180 },
    { kind: 'person', label: 'Ordförande', offsetSeconds: 720 },
    { kind: 'agendaItem', label: '3. Beslutsärenden', offsetSeconds: 1560 },
    { kind: 'agendaItem', label: '4. Mötet avslutas', offsetSeconds: 5760 },
  ],
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
  const [mockTrimStart, setMockTrimStart] = useState(0)
  const [mockTrimEnd, setMockTrimEnd] = useState(0)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const chapterInputRef = useRef<HTMLInputElement>(null)
  const [previewSeekSeconds, setPreviewSeekSeconds] = useState<number | null>(null)
  const [previewPlayRequest, setPreviewPlayRequest] = useState(0)
  const [chapterLabels, setChapterLabels] = useState<Record<number, string>>({})
  const [editingChapter, setEditingChapter] = useState<number | null>(null)
  const [chapterDraft, setChapterDraft] = useState('')
  const [confirmOndemand, setConfirmOndemand] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const recordingId = p.recording?.id
  const recordingState = p.recording?.state

  useEffect(() => {
    const active = recording ?? ((p.publicMode === 'after' || p.publicMode === 'ondemand') && !recordingId ? MOCK_FALLBACK_RECORDING : null)
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

  if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') return null

  const isAfter = p.publicMode === 'after'
  const fallbackOriginal = (isAfter || p.publicMode === 'ondemand') && !p.recording ? MOCK_FALLBACK_RECORDING : null
  const displayedRecording = recording ?? fallbackOriginal
  const displayedOriginal = original ?? fallbackOriginal
  const canTrim = isAfter && (p.capabilities.trimRecording.status === 'allowed' || !!fallbackOriginal)
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
    if (editingChapter !== null) chapterInputRef.current?.focus()
  }, [editingChapter])
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
            {displayedRecording && (
              <div class="od-mock-trim" aria-label={isAfter ? 'Mockad trimning' : 'Trim-förhandsvisning'}>
                <div class="od-trim-preview">
                  <video ref={previewVideoRef} controls playsInline preload="metadata" aria-label="Förhandsvisning" />
                </div>
                {isAfter && canTrim && source && (
                  <>
                    <div class="od-mock-trim-head">
                      <span>Trimning</span>
                      <span>{formatHms(mockTrimStart)} – {formatHms(mockTrimEnd)}</span>
                    </div>
                    <div class="od-mock-trim-track">
                      <input aria-label="Trimningens start" type="range" min="0" max={Math.max(1, mockTrimDuration - 1)} value={mockTrimStart} onInput={(event) => setMockTrimStart(Math.min(Number(event.currentTarget.value), mockTrimEnd - 1))} />
                      <input aria-label="Trimningens slut" type="range" min="1" max={mockTrimDuration} value={mockTrimEnd} onInput={(event) => setMockTrimEnd(Math.max(Number(event.currentTarget.value), mockTrimStart + 1))} />
                    </div>
                    <div class="od-mock-trim-actions">
                      <button class="btn" type="button" onClick={() => setMockTrimStart(Math.min(Math.round(mockTrimDuration * 0.1), mockTrimEnd - 1))}>Sätt start här</button>
                      <button class="btn" type="button" onClick={() => setMockTrimEnd(Math.max(Math.round(mockTrimDuration * 0.9), mockTrimStart + 1))}>Sätt slut här</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          <section class="od-col" aria-labelledby="od-chapters-title">
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
                      onClick={() => {
                        setPreviewSeekSeconds(chapter.offsetSeconds)
                        setPreviewPlayRequest((request) => request + 1)
                      }}
                    >
                      <Icon name="vertical_align_bottom" size={16} />
                    </button>
                    <span class="od-time">{formatHms(chapter.offsetSeconds)}</span>
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
            <p class="od-readonly-note">Kapitel från livesändningen. Redigering kommer senare.</p>
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
