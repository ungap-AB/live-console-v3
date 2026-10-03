import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Chapter, ChapterImportResult, CueKind, Project, ProjectRecording, Recording } from '../../data/types'
import { notifyJobsChanged, openJobsView } from '../../app/jobsBus'
import { readNotifyByEmail } from '../../app/notifyPreference'
import { formatBytes, formatDateTime, formatHms } from '../../app/time'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { Icon } from '../../components/Icon'
import { JobProgress } from '../../components/JobProgress'
import { NotifyCheckbox } from '../../components/NotifyCheckbox'
import { ShareDialog } from '../../components/ShareDialog'
import { CaptionsPanel } from './CaptionsPanel'
import { Modal } from '../../components/Modal'
import type { ProjectActions } from './actions'
import { ChapterImportDialog } from './ChapterImportDialog'
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

// Under denna längd flaggas en sändning som misstänkt kort (t.ex. ett test)
// i "Byt sändning"-dialogen, så operatören inte råkar välja fel av misstag.
const VERY_SHORT_RECORDING_SECONDS = 60

export function OndemandView({ project: p, actions, onBack }: OndemandViewProps) {
  const { selectMode, dialog } = useModeChange(p, actions)
  const live = useLiveChannel(p.channel?.id ?? null)
  const [showIngestInfo, setShowIngestInfo] = useState(false)
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
  const [projectRecordings, setProjectRecordings] = useState<ProjectRecording[]>([])
  const [switchingRecording, setSwitchingRecording] = useState(false)
  const [showRecordingPicker, setShowRecordingPicker] = useState(false)
  const [pendingRecordingId, setPendingRecordingId] = useState<string | null>(null)
  // UNG-58: nedladdning av original- och/eller trimmad inspelning — vanlig
  // operatör har ingen tillgång till Videoarkivet där samma funktion redan
  // finns, så den behövs här också. Nyckel = recording-id (original ELLER
  // trim har olika id:n). Servern kör jobbet; framsteget visas i jobbfältet (UNG-80).
  const [shareRecordingId, setShareRecordingId] = useState<string | null>(null)
  const [downloads, setDownloads] = useState<
    Record<string, { status: 'starting' | 'queued' | 'ready' | 'error'; url?: string; message?: string }>
  >({})

  // Misslyckad transkodning: servern tar bort inspelningsraden, så projektet går
  // från "bearbetas" (upload) till ingen inspelning alls — berätta varför.
  const [uploadFailed, setUploadFailed] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [guide, setGuide] = useState<{ step: 1 | 2 | 3; anchorId: string | null } | null>(null)
  const [guideDismissed, setGuideDismissed] = useState(false)
  const [showImport, setShowImport] = useState(false)
  // Synk-knappen: vilket kapitel som står på tur, vilka som hoppats över och vilket som sattes senast.
  const [stepTargetId, setStepTargetId] = useState<string | null>(null)
  const [skippedIds, setSkippedIds] = useState<string[]>([])
  const [lastSteppedId, setLastSteppedId] = useState<string | null>(null)
  const [orderWarning, setOrderWarning] = useState<string | null>(null)
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [uploadNote, setUploadNote] = useState('')
  const [syncNote, setSyncNote] = useState('')
  const wasUploadProcessing = useRef(false)

  const recordingId = p.recording?.id
  const recordingState = p.recording?.state

  // Guiden för att förankra kapitellistan mot en uppladdad video startar själv när
  // kapitel väntar på förankring, och återupptas i steg 3 om förankringen inte bekräftats.
  useEffect(() => {
    if (!projectChaptersLoaded || p.recording?.source !== 'upload') return
    const state = projectChapters.find((chapter) => chapter.syncState)?.syncState
    if (state === 'pending') {
      setGuide((current) => current ?? { step: 3, anchorId: projectChapters.find((chapter) => chapter.anchor)?.chapterId ?? null })
    } else if (state === 'none' && !guideDismissed && projectChapters.some((chapter) => chapter.timing === 'clock')) {
      setGuide((current) => current ?? { step: 1, anchorId: null })
    }
  }, [projectChaptersLoaded, projectChapters, p.recording?.source, guideDismissed])

  useEffect(() => {
    const processing = p.recording?.state === 'processing' && p.recording.source === 'upload'
    if (processing) setUploadFailed(false)
    else if (wasUploadProcessing.current && !p.recording) setUploadFailed(true)
    wasUploadProcessing.current = processing
  }, [p.recording?.id, p.recording?.state])

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

  useEffect(() => {
    let cancelled = false
    if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') {
      setProjectRecordings([])
      return
    }
    client.projects.recordings(p.id).then((list) => {
      if (!cancelled) setProjectRecordings(list)
    }).catch(() => {
      if (!cancelled) setProjectRecordings([])
    })
    return () => {
      cancelled = true
    }
  }, [p.id, p.publicMode, p.recording?.id, p.recording?.state])

  if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') return null

  const isAfter = p.publicMode === 'after'
  const livePhase = live.health?.livePhase?.toLowerCase()
  const broadcastInProgress = live.health?.state?.toLowerCase() === 'live' || livePhase === 'live'
  const recordingProcessing = !broadcastInProgress && (p.recording?.state === 'recording' || p.recording?.state === 'processing')
  const [processingStuck, setProcessingStuck] = useState(false)
  useEffect(() => {
    setProcessingStuck(false)
    if (!recordingProcessing) return
    // AWS hinner normalt klart inom en minut — om det tar mycket längre kan
    // sändningen ha varit för kort för att IVS skulle spara en inspelning alls.
    const timer = window.setTimeout(() => setProcessingStuck(true), 90_000)
    return () => window.clearTimeout(timer)
  }, [recordingProcessing, p.recording?.id])
  const chapters = !projectChaptersLoaded
    ? []
    : projectChapters
  const chaptersReadOnly = chapters.some((chapter) => chapter.readOnly)
  const syncState = chapters.find((chapter) => chapter.syncState)?.syncState
  const hasImportedChapters = chapters.some((chapter) => chapter.anchorable)
  const untimedChapters = chapters.filter((chapter) => chapter.timing === 'untimed')
  const anchorChapter = guide?.anchorId ? chapters.find((chapter) => chapter.chapterId === guide.anchorId) : undefined
  const source = original ?? (recording?.kind === 'original' ? recording : null)
  const mockTrimDuration = source?.durationSeconds ?? 0
  const previewUrl = source?.hlsUrl ?? ''
  // Uppladdning är bara aktuell innan något är publicerat — i Ondemand-läge utan
  // publicering ("Ladda upp video" från Before) eller medan ingenting finns.
  const awaitingApproval = p.recording?.state === 'awaitingApproval'
  // En uppladdning som väntar på bearbetning eller godkännande spärrar allt annat.
  const uploadPending = awaitingApproval || (recordingProcessing && p.recording?.source === 'upload')
  const canUpload = p.publication.state !== 'published' && !broadcastInProgress && !recordingProcessing && !awaitingApproval
  // Finns ingen inspelning är panelen öppen från början; annars bakom en knapp så att
  // det vanliga flödet (trimma, publicera) inte störs.
  const showUploadCard = canUpload && !source
  const showUploadEntry = canUpload && !!source
  const uploadedRecording = p.recording?.source === 'upload'
  const stepperVisible = !!uploadedRecording && !awaitingApproval && !chaptersReadOnly && !guide && untimedChapters.length > 0
  const stepTarget = chapters.find((chapter) => chapter.chapterId === stepTargetId)
    ?? untimedChapters.find((chapter) => !skippedIds.includes(chapter.chapterId))
    ?? untimedChapters[0]

  // Jobbet (HLS → MP4 via MediaConvert, UNG-58) kan ta flera minuter för en
  // hel sändning — client.recordings.download pollar internt tills klart.
  // En synlig länk (inte window.open) — ett sent popup-anrop blockeras ofta
  // tyst av webbläsaren efter en flerminuters väntan. Fungerar för BÅDE
  // original och trimmad inspelning — id:t avgör vilken.
  async function downloadRecording(recordingId: string) {
    setDownloads((prev) => ({ ...prev, [recordingId]: { status: 'starting' } }))
    try {
      const job = await client.recordings.startDownload(recordingId, { notifyByEmail: readNotifyByEmail() })
      if (job.url) {
        setDownloads((prev) => ({ ...prev, [recordingId]: { status: 'ready', url: job.url } }))
      } else {
        // Servern kör jobbet; framsteget visas i jobbfältet och en toast säger till när filen är klar.
        setDownloads((prev) => ({ ...prev, [recordingId]: { status: 'queued' } }))
        notifyJobsChanged()
      }
    } catch (error) {
      setDownloads((prev) => ({
        ...prev,
        [recordingId]: { status: 'error', message: error instanceof Error ? error.message : 'Nedladdningen kunde inte förberedas.' },
      }))
    }
  }

  async function cancelPendingUpload() {
    if (!p.recording) return
    setUploadNote('')
    try {
      await client.recordings.rejectUpload(p.recording.id)
      await actions.refreshProject()
    } catch (error) {
      setUploadNote(error instanceof Error ? error.message : 'Uppladdningen kunde inte avbrytas.')
    }
  }

  async function reloadChapters() {
    const next = await client.projects.chapters(p.id)
    setProjectChapters(next)
    setChapterLabels({})
    setProjectChaptersLoaded(true)
  }

  function startGuide() {
    setGuideDismissed(false)
    setSyncNote('')
    setGuide({ step: 1, anchorId: null })
  }

  function closeGuide() {
    setGuideDismissed(true)
    setGuide(null)
  }

  function chooseAnchor(index: number) {
    const chapter = chapters[index]
    if (!chapter?.anchorable) return
    setSyncNote('')
    setGuide({ step: 2, anchorId: chapter.chapterId })
    // Ett redan förankrat kapitel har en tid att utgå från — hoppa dit.
    if (chapter.synced !== false) selectChapter(index)
    else pausePreview()
  }

  function seekVideo(seconds: number) {
    const video = previewVideoRef.current
    if (!video) return
    video.currentTime = seconds
    setPreviewPosition(seconds)
  }

  async function applyAnchor(offsetSeconds: number) {
    if (!guide?.anchorId) return false
    setSyncing(true)
    setSyncNote('')
    try {
      const result = await client.projects.syncChapters(p.id, guide.anchorId, offsetSeconds)
      await reloadChapters()
      setHasUnpublishedChanges(true)
      if (result.outsideVideo > 0) {
        setSyncNote(`${result.outsideVideo} kapitel hamnade utanför videon och är dolda tills de ryms — justera ankaret eller ta bort dem.`)
      }
      return true
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : 'Förankringen misslyckades.')
      return false
    } finally {
      setSyncing(false)
    }
  }

  async function anchorHere() {
    if (await applyAnchor(Math.round(previewPosition))) setGuide((current) => (current ? { ...current, step: 3 } : current))
  }

  async function nudgeAnchor(deltaSeconds: number) {
    const anchor = chapters.find((chapter) => chapter.chapterId === guide?.anchorId)
    if (!anchor) return
    const next = Math.max(0, anchor.offsetSeconds + deltaSeconds)
    if (await applyAnchor(next)) seekVideo(next)
  }

  async function confirmAnchor() {
    setSyncing(true)
    try {
      await client.projects.confirmChapterSync(p.id)
      await reloadChapters()
      setGuide(null)
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : 'Bekräftelsen misslyckades.')
    } finally {
      setSyncing(false)
    }
  }

  // Nästa kapitel utan tid efter det angivna, i listans ordning (utan de överhoppade).
  function nextUntimedAfter(chapterId: string, skipped: string[]) {
    const index = untimedChapters.findIndex((chapter) => chapter.chapterId === chapterId)
    const rest = index >= 0 ? untimedChapters.slice(index + 1) : untimedChapters
    return rest.find((chapter) => !skipped.includes(chapter.chapterId)) ?? null
  }

  async function stepHere() {
    if (!stepTarget) return
    const offset = Math.round(previewPosition)
    const previous = chapters.find((chapter) => chapter.chapterId === lastSteppedId)
    // Ett kapitel som hamnar före det förra är oftast ett misstag — kräv ett klick till.
    if (previous && previous.chapterId !== stepTarget.chapterId && offset < previous.offsetSeconds && orderWarning !== stepTarget.chapterId) {
      setOrderWarning(stepTarget.chapterId)
      return
    }
    setSyncing(true)
    setSyncNote('')
    setOrderWarning(null)
    try {
      await client.projects.updateDraftChapter(p.id, stepTarget.chapterId, { offsetSeconds: offset })
      const next = nextUntimedAfter(stepTarget.chapterId, skippedIds)
      setLastSteppedId(stepTarget.chapterId)
      setStepTargetId(next?.chapterId ?? null)
      await reloadChapters()
      setHasUnpublishedChanges(true)
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : 'Tiden kunde inte sättas.')
    } finally {
      setSyncing(false)
    }
  }

  function skipStep() {
    if (!stepTarget) return
    const skipped = [...skippedIds, stepTarget.chapterId]
    setSkippedIds(skipped)
    setOrderWarning(null)
    setStepTargetId(nextUntimedAfter(stepTarget.chapterId, skipped)?.chapterId ?? null)
  }

  function undoStep() {
    const previous = chapters.find((chapter) => chapter.chapterId === lastSteppedId)
    if (!previous) return
    setOrderWarning(null)
    setStepTargetId(previous.chapterId)
    seekVideo(previous.offsetSeconds)
  }

  async function onChaptersImported(result: ChapterImportResult) {
    setShowImport(false)
    setGuide(null)
    setGuideDismissed(false)
    setSkippedIds([])
    setLastSteppedId(null)
    setStepTargetId(null)
    await reloadChapters()
    setHasUnpublishedChanges(true)
    setSyncNote(result.outsideVideo > 0 ? `${result.outsideVideo} kapitel låg efter videons slut och har ingen tid än.` : '')
  }

  async function addChapterHere(kind: CueKind, label: string) {
    await client.projects.addChapter(p.id, { kind, label, offsetSeconds: Math.round(previewPosition) })
    await reloadChapters()
    setHasUnpublishedChanges(true)
  }

  async function switchActiveRecording(recordingId: string) {
    setSwitchingRecording(true)
    try {
      await client.projects.setActiveRecording(p.id, recordingId)
      await actions.refreshProject()
      const [nextRecordings, nextChapters] = await Promise.all([
        client.projects.recordings(p.id),
        client.projects.chapters(p.id),
      ])
      setProjectRecordings(nextRecordings)
      setProjectChapters(nextChapters)
      setChapterLabels({})
      setProjectChaptersLoaded(true)
      setSelectedChapter(null)
      setDraftOffsets({})
      setSavedOffsets({})
    } catch {
      // Lämna nuvarande val; operatören kan försöka igen.
    } finally {
      setSwitchingRecording(false)
    }
  }

  function openRecordingPicker() {
    setPendingRecordingId(projectRecordings.find((item) => item.isActive)?.id ?? null)
    setShowRecordingPicker(true)
  }

  async function confirmRecordingSwitch() {
    if (!pendingRecordingId) return
    setShowRecordingPicker(false)
    await switchActiveRecording(pendingRecordingId)
  }

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
    setMockTrimEnd(source?.durationSeconds ?? mockTrimDuration)
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
  // Backend spärrar redan publish medan enkodern sänder (channel_live) — spärra
  // knappen här också så det inte ser ut som ett fungerande val.
  // Ondemand utan publicering = uppladdad video som väntar på granskning (Before → Ondemand).
  const stagedUpload = p.publicMode === 'ondemand' && p.publication.state !== 'published'
    && (p.recording?.state === 'recorded' || p.recording?.state === 'trimmed')
  const canPublishOndemand = !chaptersReadOnly && !broadcastInProgress && !uploadPending && syncState !== 'pending' && (isAfter || hasUnpublishedChanges || trimDirty || stagedUpload)
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
      const nextChapters = await client.projects.chapters(p.id)
      setProjectChapters(nextChapters)
      setChapterLabels({})
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
      <ProjectHeader
        project={p}
        actions={actions}
        onBack={onBack}
        onModeSelect={handleModeSelect}
        channel={live.channel}
        health={live.health}
        streamKey={live.streamKey}
        showIngestInfo={showIngestInfo}
        onShowIngestInfoChange={setShowIngestInfo}
      />
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
                      <strong>{p.recording?.source === 'upload' ? 'Videon bearbetas' : 'Inspelningen bearbetas'}</strong>
                      {p.recording?.source === 'upload' ? (
                        <>
                          <span>Videon konverteras för uppspelning, vilket kan ta några minuter beroende på längd. Du kan lämna sidan — bearbetningen fortsätter.</span>
                          <JobProgress progress={p.recording?.progress} phase={p.recording?.phase ?? 'QUEUED'} />
                        </>
                      ) : (
                        <span>Vänta tills inspelningen är klar innan du trimmar och publicerar ondemand.</span>
                      )}
                      {p.recording?.source === 'upload' && (
                        <>
                          <span>Övriga val är spärrade tills videon är klar eller uppladdningen avbryts.</span>
                          <button class="btn btn-sm" type="button" onClick={() => void cancelPendingUpload()}>Avbryt uppladdningen</button>
                          {uploadNote && <span class="od-download-error">{uploadNote}</span>}
                        </>
                      )}
                      {processingStuck && p.recording?.source !== 'upload' && (
                        <>
                          <span>Det här tar ovanligt lång tid — sändningen kan ha varit för kort för att AWS skulle spara en inspelning.</span>
                          {isAfter && projectRecordings.length > 1 && (
                            <button class="btn btn-sm" type="button" onClick={openRecordingPicker}>Byt sändning…</button>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <video ref={previewVideoRef} controls playsInline preload="metadata" aria-label="Förhandsvisning" />
                  )}
                </div>
                {!isAfter && source && !awaitingApproval && (
                  <div class="od-download">
                    <DownloadButton
                      label="Ladda ner originalinspelning"
                      fileName={`${p.name} (original)`}
                      download={downloads[source.id]}
                      onDownload={() => downloadRecording(source.id)}
                      onShare={() => setShareRecordingId(source.id)}
                    />
                    {recording?.kind === 'trimmed' && (
                      <DownloadButton
                        label="Ladda ner trimmad version"
                        fileName={`${p.name} (trimmad)`}
                        download={downloads[recording.id]}
                        onDownload={() => downloadRecording(recording.id)}
                        onShare={() => setShareRecordingId(recording.id)}
                      />
                    )}
                    {shareRecordingId && (
                      <ShareDialog initialRecordingIds={[shareRecordingId]} onClose={() => setShareRecordingId(null)} />
                    )}
                  </div>
                )}
                {(p.recording?.state === 'recorded' || p.recording?.state === 'trimmed' || p.recording?.state === 'published') && !awaitingApproval && !uploadPending && (
                  <CaptionsPanel
                    projectId={p.id}
                    captions={p.recording.captions ?? null}
                    videoDurationSeconds={recording?.durationSeconds}
                    onChanged={() => void actions.refreshProject()}
                  />
                )}
                {isAfter && projectRecordings.length > 1 && !uploadPending && (
                  <div class="od-recording-select">
                    <label>Sändning</label>
                    <span class="od-recording-current">
                      {formatDateTime(projectRecordings.find((item) => item.isActive)?.startedAt ?? '')} ·{' '}
                      {formatHms(projectRecordings.find((item) => item.isActive)?.durationSeconds ?? 0)}
                    </span>
                    <button class="btn btn-sm" type="button" disabled={switchingRecording} onClick={openRecordingPicker}>
                      Byt sändning…
                    </button>
                  </div>
                )}
                {isAfter && !awaitingApproval && <div class={`od-selected-chapter${selectedChapter !== null && chapters[selectedChapter] ? ' has-selected-chapter' : ''}${broadcastInProgress || recordingProcessing ? ' is-broadcasting' : ''}`}>
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
                {stepperVisible && stepTarget && (
                  <SyncStepper
                    target={stepTarget}
                    remaining={untimedChapters.length}
                    position={previewPosition}
                    playing={previewPlaying}
                    busy={syncing}
                    canUndo={!!lastSteppedId}
                    warning={orderWarning === stepTarget.chapterId}
                    onSeekBy={seekBy}
                    onTogglePlay={togglePreviewPlayback}
                    onStep={() => void stepHere()}
                    onSkip={skipStep}
                    onUndo={undoStep}
                  />
                )}
                {showUploadEntry && (showUploadPanel ? (
                  <UploadPanel
                    projectId={p.id}
                    projectName={p.name}
                    replacing
                    failed={false}
                    onCancel={() => setShowUploadPanel(false)}
                    onUploaded={() => { setShowUploadPanel(false); void actions.refreshProject() }}
                  />
                ) : (
                  <div class="od-download">
                    <button class="btn btn-sm" type="button" onClick={() => setShowUploadPanel(true)}>Ladda upp video...</button>
                  </div>
                ))}
              </div>
            )}
            {awaitingApproval && (
              <UploadApproval
                recording={recording}
                previous={projectRecordings}
                onDone={() => void actions.refreshProject()}
              />
            )}
            {showUploadCard && (
              <UploadPanel
                projectId={p.id}
                projectName={p.name}
                replacing={false}
                failed={uploadFailed}
                onUploaded={() => void actions.refreshProject()}
              />
            )}
            <footer class="od-trim-footer">
            </footer>
          </section>

          <section class={`od-col od-chapters-col${chaptersReadOnly ? ' is-readonly' : ''}`} aria-labelledby="od-chapters-title">
            {awaitingApproval ? (
              <p class="od-empty">Godkänn eller ignorera den uppladdade filen innan du arbetar med kapitlen.</p>
            ) : chaptersReadOnly && p.recording && <p class="od-empty">Kapitel går att redigera först när inspelningen är klar</p>}
            {guide && !awaitingApproval && !chaptersReadOnly && (
              <AnchorGuide
                step={guide.step}
                anchorLabel={anchorChapter ? (chapterLabels[chapters.indexOf(anchorChapter)] ?? anchorChapter.label) : null}
                anchorOffset={anchorChapter && anchorChapter.timing !== 'positioned' ? null : anchorChapter?.offsetSeconds ?? null}
                position={previewPosition}
                playing={previewPlaying}
                busy={syncing}
                onSeekBy={seekBy}
                onTogglePlay={togglePreviewPlayback}
                onChooseAgain={() => setGuide({ step: 1, anchorId: null })}
                onAnchor={() => void anchorHere()}
                onGoToAnchor={() => { if (anchorChapter) { seekVideo(anchorChapter.offsetSeconds); void previewVideoRef.current?.play().catch(() => undefined) } }}
                onNudge={(delta) => void nudgeAnchor(delta)}
                onConfirm={() => void confirmAnchor()}
                onClose={closeGuide}
              />
            )}
            {!guide && !awaitingApproval && !chaptersReadOnly && uploadedRecording && hasImportedChapters && !uploadPending && (
              <div class="od-sync-status">
                <span>
                  {syncState === 'pending'
                    ? 'Förankringen är inte bekräftad — publicering är spärrad.'
                    : syncState === 'confirmed'
                      ? 'Kapitlen är förankrade mot videon.'
                      : 'Kapitlen från sändningen är inte förankrade mot videon.'}
                </span>
                <button
                  class="btn btn-sm"
                  type="button"
                  onClick={() => (syncState === 'pending'
                    ? setGuide({ step: 3, anchorId: chapters.find((chapter) => chapter.anchor)?.chapterId ?? null })
                    : startGuide())}
                >
                  {syncState === 'pending' ? 'Fortsätt' : 'Förankra kapitel'}
                </button>
              </div>
            )}
            {syncNote && <p class="od-download-error">{syncNote}</p>}
            {awaitingApproval ? null : chapters.length === 0 ? (
              <p class="od-empty">
                {uploadedRecording
                  ? 'En uppladdad video har inga kapitel — de skapas från det som spelas ut under en livesändning.'
                  : !p.recording
                    ? 'Kapitel skapas från det som spelas ut under en livesändning.'
                    : 'Inga kapitel än. De skapas från det som spelades ut under sändningen.'}
              </p>
            ) : (
              <ul class="od-chapters">
                {chapters.map((chapter, index) => (
                  <li
                    key={chapter.chapterId}
                    class={`od-chapter-row${selectedChapter === index ? ' is-selected' : ''}${chapter.synced === false ? ' is-unsynced' : ''}${(guide?.step === 1 && chapter.anchorable) || stepperVisible ? ' is-pickable' : ''}${stepperVisible && stepTarget?.chapterId === chapter.chapterId ? ' is-step-target' : ''}${guide?.anchorId === chapter.chapterId ? ' is-anchor' : ''}`}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('button, input')) return
                      if (guide?.step === 1) chooseAnchor(index)
                      else if (stepperVisible) { setOrderWarning(null); setStepTargetId(chapter.chapterId) }
                    }}
                  >
                      {!chaptersReadOnly && guide?.anchorId === chapter.chapterId && <Icon name="anchor" size={16} />}
                      {!chaptersReadOnly && chapter.synced === false && <span class="od-chapter-unsynced">{chapter.timing === 'untimed' ? 'Ingen tid' : 'Ej förankrad'}</span>}
                      {!chaptersReadOnly && chapter.synced !== false && <button
                      class="od-chapter-play"
                      type="button"
                      aria-label={`Spela från ${chapter.label}`}
                      title="Spela från denna punkt"
                        onClick={() => selectChapter(index)}
                    >
                      <Icon name="skip_next" size={16} />
                    </button>}
                    {!chaptersReadOnly && chapter.synced !== false && <span class={`od-time${draftOffsets[index] !== undefined ? ' is-draft' : ''}`}>
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
            {uploadedRecording && !awaitingApproval && !chaptersReadOnly && (p.recording?.state === 'recorded' || p.recording?.state === 'trimmed') && (
              <AddChapterForm position={previewPosition} onAdd={addChapterHere} />
            )}
            {uploadedRecording && !awaitingApproval && !chaptersReadOnly && p.publication.state !== 'published' && (p.recording?.state === 'recorded' || p.recording?.state === 'trimmed') && (
              <div class="od-add-chapter">
                <button class="btn btn-sm" type="button" onClick={() => setShowImport(true)}>Importera kapitel…</button>
              </div>
            )}
            <footer class="od-chapters-footer">
              {(isAfter || p.publicMode === 'ondemand') && (
                <>
                  {isAfter && <button class="btn btn-sm" type="button" disabled={chaptersReadOnly || uploadPending} onClick={() => setConfirmUndoAll(true)}>
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
      {showRecordingPicker && (
        <Modal title="Välj vilken sändning som ska användas" onClose={() => setShowRecordingPicker(false)}>
          <ul class="od-recording-picker-list">
            {projectRecordings.map((item) => (
              <li key={item.id}>
                <label class="od-recording-picker-option">
                  <input
                    type="radio"
                    name="recording-picker"
                    checked={pendingRecordingId === item.id}
                    onChange={() => setPendingRecordingId(item.id)}
                  />
                  <span>{formatDateTime(item.startedAt)} · {formatHms(item.durationSeconds)}</span>
                </label>
              </li>
            ))}
          </ul>
          {(() => {
            const selected = projectRecordings.find((item) => item.id === pendingRecordingId)
            return selected && selected.durationSeconds < VERY_SHORT_RECORDING_SECONDS ? (
              <p class="note warn">Den valda sändningen är väldigt kort ({formatHms(selected.durationSeconds)}) — kontrollera att det inte var ett test innan du byter.</p>
            ) : null
          })()}
          <div class="modal-actions">
            <button class="btn" type="button" onClick={() => setShowRecordingPicker(false)}>Avbryt</button>
            <button class="btn btn-primary" type="button" disabled={!pendingRecordingId || switchingRecording} onClick={() => void confirmRecordingSwitch()}>
              Byt sändning
            </button>
          </div>
        </Modal>
      )}
      {showImport && (
        <ChapterImportDialog
          projectId={p.id}
          agendaId={p.agendaId}
          currentChapterCount={chapters.length}
          onClose={() => setShowImport(false)}
          onImported={(result) => void onChaptersImported(result)}
        />
      )}
      {publishing && (
        <Modal title="Publicerar ondemand" onClose={() => undefined}>
          <p>Förbereder video och publicerar ändringarna. Vänta tills publiceringen är klar.</p>
        </Modal>
      )}
    </div>
  )
}

interface DownloadButtonProps {
  label: string
  fileName: string
  download?: { status: 'starting' | 'queued' | 'ready' | 'error'; url?: string; message?: string }
  onDownload: () => void
  /** Delar den färdiga filen via en länk (visas när filen är klar). */
  onShare?: () => void
}

// UNG-58: samma "Förbereder… → riktig länk"-mönster som Videoarkivets
// nedladdningsknapp — utbrutet här eftersom original och trimmad version
// nu båda använder det, se ovan.
function DownloadButton({ label, fileName, download, onDownload, onShare }: DownloadButtonProps) {
  if (download?.status === 'starting') {
    return <button class="btn btn-sm" type="button" disabled>Startar…</button>
  }
  if (download?.status === 'queued') {
    return (
      <span class="od-download-ready">
        <span>Nedladdningen förbereds. Du får en avisering när den är klar.</span>
        <button class="btn btn-sm" type="button" onClick={openJobsView}>
          Visa jobb
        </button>
      </span>
    )
  }
  if (download?.status === 'ready' && download.url) {
    return (
      <span class="od-download-ready">
        <a class="btn btn-sm" href={download.url} download>
          Ladda ner {fileName}.mp4
        </a>
        <button class="btn btn-sm" type="button" onClick={onDownload}>
          Förbered på nytt
        </button>
        {onShare && (
          <button class="btn btn-sm" type="button" onClick={onShare}>
            Dela…
          </button>
        )}
      </span>
    )
  }
  return (
    <span class="od-download-start">
      <button
        class="btn btn-sm"
        type="button"
        onClick={onDownload}
        title="Förbereder en nedladdningsbar fil (kan ta några minuter). Filen sparas i 7 dagar."
      >
        {label}
      </button>
      <NotifyCheckbox />
      {download?.status === 'error' && <span class="od-download-error">{download.message}</span>}
    </span>
  )
}

interface UploadPanelProps {
  projectId: string
  projectName: string
  /** Det finns redan en (ännu opublicerad) video — kortet erbjuder då att ersätta den. */
  replacing: boolean
  failed: boolean
  onUploaded: () => void
  onCancel?: () => void
}

function withoutExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

// UNG-55/56/57: direktuppladdning till S3 med framsteg, sedan startar servern
// HLS-transkodningen. Inspelningar hör alltid till ett projekt (Anders,
// 2026-10-01) — därför finns uppladdningen bara här, inte som fristående bibliotek.
function UploadPanel({ projectId, projectName, replacing, failed, onUploaded, onCancel }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const uploading = status === 'uploading'

  // En flera GB stor uppladdning hänger på den här fliken tills den är klar.
  useEffect(() => {
    if (!uploading) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  function choose(next: File | null) {
    if (next && !next.type.startsWith('video/')) {
      setError('Det där verkar inte vara en videofil.')
      setStatus('error')
      return
    }
    setFile(next)
    setName(next ? withoutExtension(next.name) : '')
    setStatus('idle')
    setError('')
  }

  async function upload() {
    if (!file) return
    setStatus('uploading')
    setProgress(0)
    setError('')
    try {
      await client.recordings.upload(file, projectId, name.trim() || undefined, setProgress, { notifyByEmail: readNotifyByEmail() })
      setStatus('idle')
      setFile(null)
      setName('')
      onUploaded()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Uppladdningen misslyckades.')
    }
  }

  return (
    <div class="od-upload" aria-label="Ladda upp video">
      <p class="od-upload-title">
        {replacing ? 'Ladda upp en annan video i stället' : `Ladda upp en färdig video till ${projectName}`}
      </p>
      {replacing && <p class="od-empty">Nuvarande inspelning ersätts först när du har godkänt den uppladdade filen.</p>}
      {failed && <p class="od-download-error">Bearbetningen av den uppladdade videon misslyckades. Försök igen, eller prova en annan fil.</p>}
      <label
        class={`od-dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}${uploading ? ' is-disabled' : ''}`}
        onDragOver={(event) => { event.preventDefault(); if (!uploading) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!uploading) choose(event.dataTransfer?.files?.[0] ?? null)
        }}
      >
        <input
          type="file"
          accept="video/*"
          aria-label="Välj videofil"
          disabled={uploading}
          onChange={(event) => choose(event.currentTarget.files?.[0] ?? null)}
        />
        <Icon name="upload_file" size={28} />
        {file ? (
          <span><strong>{file.name}</strong> · {formatBytes(file.size)}</span>
        ) : (
          <span>Dra hit en videofil, eller klicka för att välja</span>
        )}
      </label>
      {file && (
        <div class="od-upload-panel">
          <input
            type="text"
            placeholder="Namn på inspelningen"
            aria-label="Namn på inspelningen"
            value={name}
            disabled={uploading}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <button class="btn btn-sm btn-primary" type="button" disabled={uploading} onClick={() => void upload()}>
            {uploading ? 'Laddar upp…' : 'Ladda upp'}
          </button>
          <NotifyCheckbox disabled={uploading} />
          {onCancel && !uploading && (
            <button class="btn btn-sm" type="button" onClick={onCancel}>Avbryt</button>
          )}
        </div>
      )}
      {onCancel && !file && !uploading && (
        <div class="od-upload-panel">
          <button class="btn btn-sm" type="button" onClick={onCancel}>Avbryt</button>
        </div>
      )}
      {uploading && (
        <div class="od-upload-progress" role="status">
          <progress value={progress} max={1} />
          <span>{Math.round(progress * 100)} % — lämna inte sidan förrän uppladdningen är klar</span>
        </div>
      )}
      {status === 'error' && <span class="od-download-error">{error}</span>}
    </div>
  )
}

interface UploadApprovalProps {
  recording: Recording | null
  /** Projektets tidigare inspelningar — raderas om filen godkänns. */
  previous: ProjectRecording[]
  onDone: () => void
}

function UploadApproval({ recording, previous, onDone }: UploadApprovalProps) {
  const previousCount = previous.length
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState('')
  const [retentionDays, setRetentionDays] = useState<number | null>(null)

  useEffect(() => {
    client.trash.policy().then((policy) => setRetentionDays(policy.retentionDays)).catch(() => undefined)
  }, [])

  async function decide(action: 'accept' | 'reject') {
    setBusy(action)
    setError('')
    try {
      if (action === 'accept') await client.recordings.acceptUpload(recording!.id)
      else await client.recordings.rejectUpload(recording!.id)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Något gick fel.')
      setBusy(null)
    }
  }

  const grace = retentionDays ? ` och kan återställas av en administratör från Papperskorgen inom ${retentionDays} dagar` : ''
  return (
    <div class="od-upload" aria-label="Godkänn uppladdad video">
      <p class="od-upload-title">Är det här rätt fil?</p>
      {recording && (
        <p class="od-empty">
          <strong>{recording.name}</strong> · {formatHms(recording.durationSeconds)} · {recording.resolution} · {formatBytes(recording.sizeBytes)}
        </p>
      )}
      <p class="od-empty">
        Kontrollera i förhandsvisningen ovan. Du kan inte gå vidare med kapitel, trimning eller publicering förrän du valt.
      </p>
      {previousCount > 0 && (
        <div class="od-empty">
          <p class="od-empty">Om du använder filen raderas projektets tidigare inspelningar (och eventuella trimmade versioner){grace}:</p>
          <ul>
            {previous.map((item) => (
              <li key={item.id}>{item.name} — {formatDateTime(item.startedAt)} · {formatHms(item.durationSeconds)}</li>
            ))}
          </ul>
        </div>
      )}
      <div class="od-upload-panel">
        <button class="btn btn-sm btn-primary" type="button" disabled={busy !== null || !recording} onClick={() => void decide('accept')}>
          {busy === 'accept' ? 'Sparar…' : 'Använd den här filen'}
        </button>
        <button class="btn btn-sm" type="button" disabled={busy !== null || !recording} onClick={() => void decide('reject')}>
          {previousCount > 0 ? 'Behåll tidigare — ignorera filen' : 'Ignorera filen'}
        </button>
      </div>
      {error && <span class="od-download-error">{error}</span>}
    </div>
  )
}

interface AddChapterFormProps {
  position: number
  onAdd: (kind: CueKind, label: string) => Promise<void>
}

// Eget kapitel på nuvarande videoposition — för uppladdade videor, där inga
// cues gjordes live (eller där några saknas).
function AddChapterForm({ position, onAdd }: AddChapterFormProps) {
  const [kind, setKind] = useState<CueKind>('agendaItem')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    if (!label.trim()) return
    setBusy(true)
    setError('')
    try {
      await onAdd(kind, label.trim())
      setLabel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kapitlet kunde inte läggas till.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="od-add-chapter">
      <select aria-label="Typ av kapitel" value={kind} disabled={busy} onChange={(event) => setKind(event.currentTarget.value as CueKind)}>
        {(Object.keys(CHAPTER_KIND) as CueKind[]).map((value) => (
          <option key={value} value={value}>{CHAPTER_KIND[value]}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Text för nytt kapitel"
        aria-label="Text för nytt kapitel"
        value={label}
        disabled={busy}
        onInput={(event) => setLabel(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') void add() }}
      />
      <button class="btn btn-sm" type="button" disabled={busy || !label.trim()} onClick={() => void add()}>
        Lägg till vid {formatHms(Math.round(position))}
      </button>
      {error && <span class="od-download-error">{error}</span>}
    </div>
  )
}

interface AnchorGuideProps {
  step: 1 | 2 | 3
  anchorLabel: string | null
  anchorOffset: number | null
  position: number
  playing: boolean
  busy: boolean
  onSeekBy: (seconds: number) => void
  onTogglePlay: () => void
  onChooseAgain: () => void
  onAnchor: () => void
  onGoToAnchor: () => void
  onNudge: (deltaSeconds: number) => void
  onConfirm: () => void
  onClose: () => void
}

// Guidat flöde för att förankra kapitellistan mot en uppladdad video: välj ett kapitel,
// spela fram till var det börjar, kontrollera ankaret. Ankarets kvalitet avgör — övriga
// kapitel följer sändningens tider och finjusteras enskilt i listan.
function AnchorGuide(props: AnchorGuideProps) {
  const { step, anchorLabel, anchorOffset, position, playing, busy } = props
  return (
    <div class="od-guide" role="region" aria-label="Förankra kapitel">
      <div class="od-guide-head">
        <strong>Förankra kapitel · steg {step} av 3</strong>
        <button class="btn btn-sm" type="button" onClick={props.onClose}>Stäng</button>
      </div>
      {step === 1 && (
        <p class="od-empty">
          <strong>Välj kapitel.</strong> Klicka på ett kapitel i listan vars start du tydligt hör eller ser i videon, till exempel första punkten.
        </p>
      )}
      {step === 2 && (
        <>
          <p class="od-empty">
            <strong>Spela fram till där ”{anchorLabel}” börjar</strong> i videon och klicka Förankra.
          </p>
          <PositionControls position={position} playing={playing} onSeekBy={props.onSeekBy} onTogglePlay={props.onTogglePlay} />
          <div class="od-guide-controls">
            <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={props.onAnchor}>
              {busy ? 'Förankrar…' : 'Förankra'}
            </button>
            <button class="btn btn-sm" type="button" disabled={busy} onClick={props.onChooseAgain}>Välj annat kapitel</button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <p class="od-empty">
            <strong>Kontrollera ankaret</strong> ”{anchorLabel}”{anchorOffset !== null ? ` vid ${formatHms(anchorOffset)}` : ''}. Gå till ankaret, lyssna och justera. Justeringen flyttar alla kapitel. Övriga kapitel följer tiderna från sändningen — finjustera enskilda kapitel i listan vid behov.
          </p>
          <div class="od-guide-controls">
            <button class="btn btn-sm" type="button" disabled={busy || anchorOffset === null} onClick={props.onGoToAnchor}>Gå till ankare</button>
            <button class="btn btn-sm" type="button" disabled={busy} title="Flyttar alla kapitel" onClick={() => props.onNudge(-1)}>−1 s</button>
            <button class="btn btn-sm" type="button" disabled={busy} title="Flyttar alla kapitel" onClick={() => props.onNudge(1)}>+1 s</button>
          </div>
          <div class="od-guide-controls">
            <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={props.onConfirm}>Bekräfta ankaret</button>
            <button class="btn btn-sm" type="button" disabled={busy} onClick={props.onChooseAgain}>Förankra om</button>
          </div>
        </>
      )}
    </div>
  )
}

interface PositionControlsProps {
  position: number
  playing: boolean
  onSeekBy: (seconds: number) => void
  onTogglePlay: () => void
}

function PositionControls({ position, playing, onSeekBy, onTogglePlay }: PositionControlsProps) {
  return (
    <div class="od-guide-controls">
      <button class="btn btn-sm" type="button" onClick={() => onSeekBy(-5)}>−5 s</button>
      <button class="btn btn-sm" type="button" onClick={() => onSeekBy(-1)}>−1 s</button>
      <button class="btn btn-sm" type="button" aria-label="Spela eller pausa" onClick={onTogglePlay}>
        <Icon name={playing ? 'pause' : 'play_arrow'} size={18} />
      </button>
      <output>{formatHms(Math.round(position))}</output>
      <button class="btn btn-sm" type="button" onClick={() => onSeekBy(1)}>+1 s</button>
      <button class="btn btn-sm" type="button" onClick={() => onSeekBy(5)}>+5 s</button>
    </div>
  )
}

interface SyncStepperProps {
  target: Chapter
  remaining: number
  position: number
  playing: boolean
  busy: boolean
  canUndo: boolean
  warning: boolean
  onSeekBy: (seconds: number) => void
  onTogglePlay: () => void
  onStep: () => void
  onSkip: () => void
  onUndo: () => void
}

// Kapitel utan tid: spela videon och klicka Synka när nästa kapitel börjar — tiden sätts till
// nuvarande position och nästa kapitel står på tur. Klicka på ett kapitel i listan för att välja ett annat.
function SyncStepper(props: SyncStepperProps) {
  const { target, remaining, position, playing, busy, canUndo, warning } = props
  return (
    <div class="od-guide" role="region" aria-label="Sätt tider på kapitlen">
      <div class="od-guide-head">
        <strong>Sätt tider på kapitlen · {remaining} kvar</strong>
      </div>
      <p class="od-empty">Nästa: <strong>{target.label}</strong></p>
      <PositionControls position={position} playing={playing} onSeekBy={props.onSeekBy} onTogglePlay={props.onTogglePlay} />
      {warning && <p class="od-download-error">Kapitlet hamnar före det förra. Klicka Synka igen om det är rätt.</p>}
      <div class="od-guide-controls">
        <button class="btn btn-sm btn-primary" type="button" disabled={busy} onClick={props.onStep}>
          {busy ? 'Sätter…' : `Synka här · ${formatHms(Math.round(position))}`}
        </button>
        <button class="btn btn-sm" type="button" disabled={busy} onClick={props.onSkip}>Hoppa över</button>
        <button class="btn btn-sm" type="button" disabled={busy || !canUndo} onClick={props.onUndo}>Ångra förra</button>
      </div>
    </div>
  )
}
