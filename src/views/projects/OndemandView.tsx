import { plural, t } from '@lingui/core/macro'
import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CaptionDraft, Chapter, DraftStatus, ForkResult, Project, ProjectRecording, Recording } from '../../data/types'
import { formatBytes, formatDateTime, formatHms } from '../../app/time'
import { formatNumber } from '../../i18n'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { VideoStatusRow } from './VideoStatusRow'
import { CaptionEntry } from './CaptionEntry'
import type { EditorFocus } from './CaptionEditor'
import type { CaptionEntry as CaptionEntryState } from './captionEntryLogic'
import { Icon } from '../../components/Icon'
import { PlayerFooter } from './PlayerLinkField'
import { ModeSelector } from './ModeSelector'
import { PlayerSettingsDialog, type PlayerSettingsCategory } from './PlayerSettingsDialog'
import { ExportImportDialog } from './ExportImportDialog'
import { PublishProgressDialog } from './PublishProgressDialog'
import { PublishOutcomeDialog } from './PublishOutcomeDialog'
import { stepLabel as publishStepLabel } from './publishOutcome'
import type { PublishedFacts } from './publishOutcome'
import { buildPublishSteps } from './publishProgress'
import type { PublishStep, PublishStepKey } from './publishProgress'
import { UploadPanel } from './UploadPanel'
import { isExternalSource, isOperatorSupplied } from './recordingSource'
import type { TrimRange } from '../../components/trimBarLogic'
import { overviewTrim, trimDraftPayload } from './draftActions'
import { Modal } from '../../components/Modal'
import type { ProjectActions } from './actions'
import { ProjectHeader } from './ProjectHeader'
import { ForkButton } from './ForkButton'
import { OverviewShell } from './OverviewShell'
import { useModeChange } from './useModeChange'
import { useLiveChannel } from './useLiveChannel'
import { FlowStep } from './FlowStep'
import './OndemandView.css'

interface OndemandViewProps {
  project: Project
  actions: ProjectActions
  onBack: () => void
  onForked?: (result: ForkResult) => void
}

// Under denna längd flaggas en sändning som misstänkt kort (t.ex. ett test)
// i "Byt sändning"-dialogen, så operatören inte råkar välja fel av misstag.
const VERY_SHORT_RECORDING_SECONDS = 60

// Publiceringshistorikens åtgärder som säger när innehållet senast publicerades.
const PUBLISH_ACTIONS = new Set(['publish', 'publish-changes'])

// UNG-251: After- och Ondemand-vyn är översikt och publicering. All redigering (trim, kapitel, undertexter) sker i editorn,
// som öppnas med Redigera; vyn visar läget, en sammanfattning, förhandsvisningen och publiceringsknapparna.
export function OndemandView({ project: p, actions, onBack, onForked }: OndemandViewProps) {
  const { selectMode, dialog } = useModeChange(p, actions)
  const live = useLiveChannel(p.channel?.id ?? null)
  const [showIngestInfo, setShowIngestInfo] = useState(false)
  // Spelarinställningarna och fliken de öppnas på (Ingest info öppnar fliken Ingest).
  const [playerSettings, setPlayerSettings] = useState<PlayerSettingsCategory | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [original, setOriginal] = useState<Recording | null>(null)
  const [projectChapters, setProjectChapters] = useState<Chapter[]>([])
  const [projectChaptersLoaded, setProjectChaptersLoaded] = useState(false)
  // Trimningen som editorn visar och ändrar. Ägs här, eftersom Publicera i After trimmar med den.
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  // Videon i vyn finns bara för att granska en uppladdad fil innan den godkänns.
  const approvalVideoRef = useRef<HTMLVideoElement>(null)
  const [confirmOndemand, setConfirmOndemand] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishSteps, setPublishSteps] = useState<PublishStep[]>([])
  const [publishStep, setPublishStep] = useState<PublishStepKey>('publish')
  // UNG-181: kvittot efter publiceringen. Står kvar tills det stängs.
  const [publishOutcome, setPublishOutcome] = useState<{ kind: 'published'; wasPublished: boolean } | { kind: 'failed'; step: PublishStepKey } | null>(null)
  const chaptersProjectRef = useRef<string | null>(null)
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false)
  // UNG-245: servern avgör om utkastet skiljer sig från det publicerade (överlever omladdning, och gäller ändringar gjorda i editorn).
  const [draftStatus, setDraftStatus] = useState<DraftStatus | null>(null)
  // UNG-252: ökar när något publicerats eller sparats, så att den inbäddade spelaren laddas om.
  const [previewVersion, setPreviewVersion] = useState(0)
  // UNG-267: editorn ligger över vyn; spelaren stängs av så länge.
  const [editorOpen, setEditorOpen] = useState(false)
  const [projectRecordings, setProjectRecordings] = useState<ProjectRecording[]>([])
  const [switchingRecording, setSwitchingRecording] = useState(false)
  const [showRecordingPicker, setShowRecordingPicker] = useState(false)
  const [pendingRecordingId, setPendingRecordingId] = useState<string | null>(null)

  // Misslyckad transkodning: servern tar bort inspelningsraden, så projektet går
  // från "bearbetas" (upload) till ingen inspelning alls — berätta varför.
  const [uploadFailed, setUploadFailed] = useState(false)
  // UNG-272: Undertexter i Exportera & importera öppnar redigeraren med undertexterna i fokus (seq ökar per begäran).
  const [editorRequest, setEditorRequest] = useState<{ focus: EditorFocus; seq: number } | undefined>(undefined)
  // Flik som "Video och undertexter" öppnas på när den öppnas från Exportera och importera.
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [uploadNote, setUploadNote] = useState('')
  const [actionNote, setActionNote] = useState('')
  const wasUploadProcessing = useRef(false)

  const recordingId = p.recording?.id
  const recordingState = p.recording?.state

  useEffect(() => {
    const processing = p.recording?.state === 'processing' && p.recording.source === 'upload'
    if (processing) setUploadFailed(false)
    else if (wasUploadProcessing.current && !p.recording) setUploadFailed(true)
    wasUploadProcessing.current = processing
  }, [p.recording?.id, p.recording?.state])

  // UNG-290: en enda effekt, så att inspelningen som hämtas efter ommontering inte skriver över det sparade trimutkastet.
  useEffect(() => {
    const next = overviewTrim(p.trimDraft, recording)
    if (!next) return
    setTrimStart(next.start)
    setTrimEnd(next.end)
  }, [p.trimDraft, recording?.id, recording?.durationSeconds, recording?.trimRange?.startOffsetSeconds, recording?.trimRange?.endOffsetSeconds, p.publicMode, recordingId])

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
    // UNG-106: byter vi projekt töms listan; annars ligger den förra kvar tills den nya är hämtad.
    if (chaptersProjectRef.current !== p.id) {
      chaptersProjectRef.current = p.id
      setProjectChapters([])
      setProjectChaptersLoaded(false)
    }
    client.projects.chapters(p.id).then((nextChapters) => {
      if (!cancelled) {
        setProjectChapters(nextChapters)
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

  // UNG-245: utkastets läge från servern. Hämtas vid byte av projekt/publiceringsläge och efter varje publicering eller spar.
  const draftStatusKey = `${p.id}|${p.publication.state}|${p.publicMode}|${previewVersion}|${p.draftRevision ?? ''}`
  useEffect(() => {
    if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') return
    let cancelled = false
    client.projects.draftStatus(p.id).then(
      (status) => { if (!cancelled) setDraftStatus(status) },
      () => { if (!cancelled) setDraftStatus(null) },
    )
    return () => { cancelled = true }
  }, [draftStatusKey])

  // Undertexternas arbetsversion (utkastet), så att sammanfattningen visar även inlästa och opublicerade undertexter.
  const [captionDraft, setCaptionDraft] = useState<CaptionDraft | null>(null)
  // UNG-278: undertextläget enligt CaptionEntry (som pollar jobbet); när ett jobb blir klart hämtas utkastet om.
  const [captionKind, setCaptionKind] = useState<CaptionEntryState['kind'] | null>(null)
  const captionsGenerating = captionKind === 'progress'
  useEffect(() => {
    if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') return
    let cancelled = false
    client.projects.getCaptionGeneration(p.id).then(
      (generation) => { if (!cancelled) setCaptionDraft(generation.draft ?? null) },
      () => { if (!cancelled) setCaptionDraft(null) },
    )
    return () => { cancelled = true }
  }, [draftStatusKey, p.recording?.captions?.cueCount, captionsGenerating])

  if (p.publicMode !== 'after' && p.publicMode !== 'ondemand') return null

  const isAfter = p.publicMode === 'after'
  const published = p.publication.state === 'published'
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
  const chapters = projectChaptersLoaded ? projectChapters : []
  const chaptersReadOnly = chapters.some((chapter) => chapter.readOnly)
  const syncState = chapters.find((chapter) => chapter.syncState)?.syncState
  const source = original ?? (recording?.kind === 'original' ? recording : null)
  const sourceDuration = source?.durationSeconds ?? 0
  const previewUrl = source?.hlsUrl ?? ''
  const awaitingApproval = p.recording?.state === 'awaitingApproval'
  // En uppladdning som väntar på bearbetning eller godkännande spärrar allt annat.
  const uploadPending = awaitingApproval || (recordingProcessing && isOperatorSupplied(p.recording?.source))
  const canUpload = !published && !broadcastInProgress && !recordingProcessing && !awaitingApproval
  // Finns ingen inspelning är uppladdningspanelen öppen från början; annars nås den via Exportera & importera.
  // UNG-292: avgörs på projektets inspelning (finns direkt), inte på source som hämtas efteråt — annars blinkar panelen vid öppning.
  const showUploadCard = canUpload && !p.recording
  const uploadedRecording = isOperatorSupplied(p.recording?.source)
  // UNG-102: en extern HLS-adress kopieras inte — den kan inte trimmas och inte laddas ned som MP4.
  const externalVideo = isExternalSource(p.recording?.source)
  const recordingReady = p.recording?.state === 'recorded' || p.recording?.state === 'trimmed' || p.recording?.state === 'published'
  const editorAvailable = recordingReady && !uploadPending
  const uploadBlockedReason = published
    ? t`The project is published. Withdraw the publication if you want to change the video.`
    : broadcastInProgress
      ? t`A broadcast is in progress. Wait until it has ended.`
      : t`A video is being processed or waiting for your approval. Finish that first.`

  // Sändningens datum (lokalt), som klockslag utan datum tolkas mot vid import till en inspelad sändning.
  const activeStartedAt = projectRecordings.find((item) => item.isActive)?.startedAt
  const importDefaultDate = activeStartedAt
    ? (() => {
        const date = new Date(activeStartedAt)
        const pad = (value: number) => String(value).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
      })()
    : undefined

  async function cancelPendingUpload() {
    if (!p.recording) return
    setUploadNote('')
    try {
      await client.recordings.rejectUpload(p.recording.id)
      await actions.refreshProject()
    } catch (error) {
      setUploadNote(error instanceof Error ? error.message : t`The upload could not be canceled.`)
    }
  }

  async function switchActiveRecording(nextRecordingId: string) {
    setSwitchingRecording(true)
    try {
      await client.projects.setActiveRecording(p.id, nextRecordingId)
      await actions.refreshProject()
      const [nextRecordings, nextChapters] = await Promise.all([
        client.projects.recordings(p.id),
        client.projects.chapters(p.id),
      ])
      setProjectRecordings(nextRecordings)
      setProjectChapters(nextChapters)
      setProjectChaptersLoaded(true)
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

  // Videon som granskas innan en uppladdad fil godkänns.
  useEffect(() => {
    const video = approvalVideoRef.current
    if (!video || !previewUrl || !awaitingApproval || !isPlayerSupported) return
    const player = create({ wasmWorker, wasmBinary })
    player.attachHTMLVideoElement(video)
    player.load(previewUrl)
    return () => {
      player.pause()
      player.delete()
    }
  }, [previewUrl, awaitingApproval])

  // UNG-233/234: editorn ger ett nytt intervall. Ändrat mot den gällande trimningen räknas som en opublicerad ändring.
  function changeTrim(range: TrimRange) {
    setTrimStart(range.start)
    setTrimEnd(range.end)
    if (isAfter && (range.start !== defaultTrimStart || range.end !== defaultTrimEnd)) setHasUnpublishedChanges(true)
  }

  const defaultTrimStart = recording?.trimRange?.startOffsetSeconds ?? 0
  const defaultTrimEnd = recording?.trimRange?.endOffsetSeconds ?? sourceDuration
  // UNG-245: det som är sparat som trimutkast (annars den trimning som gäller); skillnaden mot den pågående är osparad i editorn.
  const savedTrimStart = p.trimDraft?.startOffsetSeconds ?? defaultTrimStart
  const savedTrimEnd = p.trimDraft?.endOffsetSeconds ?? defaultTrimEnd
  const trimDirty = isAfter && (trimStart !== defaultTrimStart || trimEnd !== defaultTrimEnd)
  // Trimningen som publiceras skiljer sig från den sparade (ändrad i editorn men inte sparad): sparas först vid Publicera.
  const draftDirty = isAfter && (trimStart !== savedTrimStart || trimEnd !== savedTrimEnd)
  // Ondemand utan publicering = uppladdad video som väntar på granskning (Before → Ondemand).
  const stagedUpload = p.publicMode === 'ondemand' && !published
    && (p.recording?.state === 'recorded' || p.recording?.state === 'trimmed')
  // UNG-245: servern säger om det finns ändringar sedan publiceringen (även sådana som gjorts i editorn eller före en omladdning).
  const serverChanges = Boolean(draftStatus?.published && draftStatus.hasUnpublishedChanges)
  const anyUnpublished = hasUnpublishedChanges || serverChanges
  // Backend spärrar redan publish medan enkodern sänder (channel_live) — spärra knappen här också.
  const publishBlocked = chaptersReadOnly || broadcastInProgress || uploadPending || syncState === 'pending'
  const canPublish = !publishBlocked && (isAfter || trimDirty || stagedUpload)
  const showTrim = isAfter && !awaitingApproval && !chaptersReadOnly && !broadcastInProgress && !recordingProcessing && sourceDuration > 0

  // Sammanfattningen.
  // Bara kapitel som syns för tittarna (med tid i videon) räknas.
  const visibleChapters = chapters.filter((chapter) => chapter.synced !== false && (chapter.timing === undefined || chapter.timing === 'positioned'))
  const chapterCount = visibleChapters.filter((chapter) => chapter.kind !== 'pauseIn' && chapter.kind !== 'pauseOut').length
  const pauseCount = visibleChapters.filter((chapter) => chapter.kind === 'pauseIn').length
  const isTrimmed = sourceDuration > 0 && (trimStart > 0 || trimEnd < sourceDuration)
  const lastPublish = [...p.publicationHistory]
    .filter((entry) => PUBLISH_ACTIONS.has(entry.action))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]

  // Hämtar kapitlen direkt (och väntar in dem) så att publiceringsdialogen kan stå kvar tills sammanfattningen är rätt.
  async function reloadChaptersNow() {
    try {
      const next = await client.projects.chapters(p.id)
      setProjectChapters(next)
      setProjectChaptersLoaded(true)
    } catch {
      // Den vanliga hämtningen (och pollningen) tar över.
    }
  }

  async function saveTrimDraft() {
    await client.projects.saveTrimDraft(p.id, trimDraftPayload(trimStart, trimEnd, chapters))
    await actions.refreshProject()
  }

  // UNG-242/245: i ett redan publicerat projekt släpper Publicera ändringar kapitel och godkända undertexter (ingen ny trimmad kopia).
  async function publishChangesOnly() {
    setConfirmOndemand(false)
    setActionNote('')
    setPublishSteps([
      { key: 'publish', label: t`Publishing the changes and updating the player` },
      { key: 'chapters', label: t`Fetching the chapters` },
    ])
    setPublishStep('publish')
    setPublishOutcome(null)
    setPublishing(true)
    let failed = false
    let succeeded = false
    try {
      // Villkorat på utkastets version: har någon annan ändrat sedan läget hämtades publiceras inget.
      await client.projects.publishChanges(p.id, draftStatus?.draftRevision)
      await actions.refreshProject()
      setHasUnpublishedChanges(false)
      setPublishStep('chapters')
      await reloadChaptersNow()
      succeeded = true
      setActionNote('')
    } catch (error) {
      failed = true
      setActionNote(error instanceof Error ? error.message : t`The changes could not be published.`)
    } finally {
      setPublishing(false)
      if (failed) {
        setPublishOutcome({ kind: 'failed', step: 'publish' })
        setPreviewVersion((version) => version + 1)
      } else if (succeeded) {
        setPublishOutcome({ kind: 'published', wasPublished: true })
        setPreviewVersion((version) => version + 1)
      }
    }
  }

  async function publishWithTrim() {
    if (published && p.publicMode === 'ondemand') {
      await publishChangesOnly()
      return
    }
    setConfirmOndemand(false)
    setActionNote('')
    const willTrim = trimDirty && !!p.recording
    const wasPublished = published
    const steps = buildPublishSteps({ saveDraft: draftDirty, trim: willTrim })
    setPublishSteps(steps)
    setPublishStep(draftDirty ? 'save' : willTrim ? 'trim' : 'publish')
    setPublishOutcome(null)
    setPublishing(true)
    // Steget som stannade flödet (annars null). Ett misslyckat steg visas i kvittot i stället för att dialogen bara försvinner.
    let failedStep: PublishStepKey | null = null
    let succeeded = false
    try {
      if (draftDirty) {
        try {
          await saveTrimDraft()
        } catch {
          failedStep = 'save'
          return
        }
      }
      let didPublish = false
      if (willTrim) {
        setPublishStep('trim')
        if (!(await actions.trim({ startOffsetSeconds: trimStart, endOffsetSeconds: trimEnd }))) {
          failedStep = 'trim'
          return
        }
        await actions.refreshProject()
        setPublishStep('publish')
        didPublish = await actions.publish()
        if (!didPublish) failedStep = 'publish'
      } else if (p.recording) {
        setPublishStep('publish')
        didPublish = await actions.publish()
        if (!didPublish) failedStep = 'publish'
      } else if (await actions.setPublicMode('ondemand')) {
        actions.setVisibility('open')
        succeeded = true
      } else {
        failedStep = 'publish'
      }
      if (didPublish) {
        setHasUnpublishedChanges(false)
        setPublishStep('chapters')
        await reloadChaptersNow()
        succeeded = true
      }
    } finally {
      setPublishing(false)
      if (failedStep) setPublishOutcome({ kind: 'failed', step: failedStep })
      else if (succeeded) {
        setPublishOutcome({ kind: 'published', wasPublished })
        setPreviewVersion((version) => version + 1)
      }
    }
  }

  // UNG-243: Förkasta ändringar: kapitel och undertexter tillbaka till det publicerade. Trimmen är låst och rörs inte.
  function handleModeSelect(mode: Project['publicMode']) {
    if (mode === 'ondemand' && isAfter) {
      setConfirmOndemand(true)
      return
    }
    selectMode(mode)
  }

  // Varför publicering inte går just nu (visas vid knapparna).
  const publishHint = chaptersReadOnly
    ? t`The recording is being processed. Publishing is possible when it is done.`
    : broadcastInProgress
      ? t`Stop the encoder to publish on demand.`
      : uploadPending
        ? t`Approve or ignore the uploaded file first.`
        : syncState === 'pending'
          ? t`The chapters' anchoring to the video is not confirmed. Confirm it in the editor.`
          : ''

  // Redigeraren (CaptionEntry äger den och dess adress). I After visas den som de guidade stegen, annars som knappen Redigera.
  const editorEntry = (renderTrigger?: (open: (focus?: EditorFocus) => void, entry: CaptionEntryState) => ComponentChildren) => (
            <CaptionEntry
              projectId={p.id}
              projectName={p.name}
              label={t`Edit project`}
              onEntryKindChange={setCaptionKind}
            renderTrigger={renderTrigger}
              videoDurationSeconds={recording?.durationSeconds}
              onChanged={() => {
                setPreviewVersion((version) => version + 1)
                void actions.refreshProject()
              }}
              onChaptersChanged={() => {
                // UNG-229: kapitel ändrade i editorn: hämta om dem och markera ändringen som opublicerad.
                setHasUnpublishedChanges(true)
                void reloadChaptersNow()
              }}
              // Trimningen följer med in i editorn (tillämpas vid Publicera).
              trim={showTrim && !externalVideo
                ? { start: trimStart, end: trimEnd, savedStart: savedTrimStart, savedEnd: savedTrimEnd, onChange: changeTrim, onSaved: () => void actions.refreshProject(), onReload: () => void actions.refreshProject() }
                : undefined}
              // UNG-247: publicerat: trimningen visas låst i editorn, med Avpublicera (samma bekräftelse som lägesväljaren).
              trimLock={p.publicMode === 'ondemand' && published ? { onUnpublish: () => selectMode('after') } : undefined}
              // UNG-249: import och förankring i editorn.
              chapterTools={{ uploadedRecording, agendaId: p.agendaId, importDefaultDate }}
              onOpenChange={setEditorOpen}
              openRequest={editorRequest}
            />
  )

  // UI-finslipning omgång 1: stegen leder till respektive moment i stället för en Redigera-knapp. Efter prod-provet 2026-10-13: även i
  // Ondemand, med publiceringen som sista steg (Publicera ändringar när projektet redan är publicerat). Trimning görs bara i After.
  const trimOnlyInAfter = !isAfter && !externalVideo
  const guideSteps = (open: ((focus?: EditorFocus) => void) | null, entry: CaptionEntryState | null) => (
    <div class="od-flow">
      <ol class="od-flow-steps" aria-label={t`Get ready for on demand`}>
        <FlowStep
          n={1}
          label={t`Trim video`}
          status={externalVideo ? t`External video` : isTrimmed ? trimmedStatus(trimEnd - trimStart) : t`The whole recording`}
          done={isTrimmed}
          disabled={!open || !showTrim || externalVideo}
          locked={trimOnlyInAfter}
          note={trimOnlyInAfter ? t`Only in After` : undefined}
          title={externalVideo ? t`An external video cannot be trimmed.` : trimOnlyInAfter ? t`The video is trimmed in the After mode.` : undefined}
          onClick={() => open?.('trim')}
        />
        <FlowStep
          n={2}
          label={t`Edit chapters`}
          status={chapterCount === 0 ? t`No chapters` : chaptersText(chapterCount)}
          done={chapterCount > 0}
          disabled={!open}
          onClick={() => open?.('chapters')}
        />
        <FlowStep
          n={3}
          label={entry?.kind === 'edit' ? t`Edit captions` : t`Create captions`}
          status={!entry ? '' : entry.kind === 'progress' ? (entry.status ?? entry.label) : entry.kind === 'edit' ? (p.recording?.captions?.label ?? t`Present`) : t`None`}
          done={entry?.kind === 'edit'}
          busy={entry?.kind === 'progress'}
          disabled={!open || Boolean(entry?.disabledReason)}
          title={entry?.disabledReason}
          onClick={() => open?.('captions')}
        />
        {published ? (
          <FlowStep
            n={4}
            label={t`Publish changes`}
            status={anyUnpublished ? t`Unpublished changes` : t`No changes`}
            publish
            disabled={!anyUnpublished || publishing || publishBlocked}
            onClick={() => void publishChangesOnly()}
          />
        ) : (
          <FlowStep
            n={4}
            label={t`Publish on demand`}
            status=""
            publish
            disabled={!canPublish}
            onClick={() => setConfirmOndemand(true)}
          />
        )}
      </ol>
    </div>
  )

  return (
    <OverviewShell
      projectId={p.id}
      header={<ProjectHeader
        project={p}
        actions={actions}
        onBack={onBack}
        channel={live.channel}
        health={live.health}
        showIngestInfo={showIngestInfo}
        onShowIngestInfoChange={setShowIngestInfo}
        onIngestInfo={live.channel ? () => setPlayerSettings('ingest') : undefined}
      />}
      modes={<ModeSelector project={p} actions={actions} onModeSelect={handleModeSelect} />}
      player={p.playerUrl && !awaitingApproval
        ? { url: p.playerUrl, version: previewVersion, preview: isAfter && recording ? { label: t`Preview (ondemand)`, variant: 'draft', mode: 'ondemand' } : undefined,
            footer: <PlayerFooter project={p} actions={actions} onSettings={() => setPlayerSettings('link')} /> }
        : null}
      workOpen={editorOpen}
      overlays={<>
        {dialog}
        {confirmOndemand && (
          <Modal title={published ? t`Publish the changes?` : t`Publish on demand?`} onClose={() => setConfirmOndemand(false)}>
            <p>{published ? t`The changes to chapters and captions are released to the viewers.` : t`The broadcast is set to Ondemand mode and everything below becomes visible to the viewers.`}</p>
            {/* Allt i arbetsversionen publiceras i ett steg: video, kapitel och undertexter (ingen separat godkännande för undertexterna). */}
            <ul class="od-publish-contents">
              <li>{videoLine(externalVideo ? t`external address` : isTrimmed ? t`trimmed` : t`not trimmed`)}</li>
              <li>{chaptersLine(chapterCount === 0 ? t`none` : String(chapterCount))}</li>
              <li>{captionsLine(captionDraft && !captionDraft.stale ? cuesText(captionDraft.cueCount) : p.recording?.captions ? cuesText(p.recording.captions.cueCount) : t`none`)}</li>
            </ul>
            {captionDraft?.unreviewed && <p class="od-publish-warning">{t`The captions are machine-generated and not reviewed.`}</p>}
            <div class="modal-actions">
              <button class="btn" type="button" onClick={() => setConfirmOndemand(false)}>{t`Cancel`}</button>
              <button class="btn btn-primary" type="button" onClick={() => void publishWithTrim()}>{published ? t`Publish` : t`Publish on demand`}</button>
            </div>
          </Modal>
        )}
        {showRecordingPicker && (
          <Modal title={t`Choose which broadcast to use`} onClose={() => setShowRecordingPicker(false)}>
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
                <p class="note warn">{veryShortText(formatHms(selected.durationSeconds))}</p>
              ) : null
            })()}
            <div class="modal-actions">
              <button class="btn" type="button" onClick={() => setShowRecordingPicker(false)}>{t`Cancel`}</button>
              <button class="btn btn-primary" type="button" disabled={!pendingRecordingId || switchingRecording} onClick={() => void confirmRecordingSwitch()}>
                {t`Switch broadcast`}
              </button>
            </div>
          </Modal>
        )}
        {publishing && <PublishProgressDialog steps={publishSteps} activeKey={publishStep} />}
        {!publishing && publishOutcome?.kind === 'published' && (
          <PublishOutcomeDialog
            kind="published"
            facts={{
              wasPublished: publishOutcome.wasPublished,
              visibility: p.visibility,
              chapterCount,
              captions: p.recording?.captions ? { label: p.recording.captions.label, cueCount: p.recording.captions.cueCount } : null,
            } satisfies PublishedFacts}
            onOpenForViewers={() => void actions.setVisibility('open')}
            onClose={() => setPublishOutcome(null)}
          />
        )}
        {!publishing && publishOutcome?.kind === 'failed' && (
          <PublishOutcomeDialog kind="failed" stepLabel={publishStepLabel(publishSteps, publishOutcome.step)} onClose={() => setPublishOutcome(null)} />
        )}
      </>}
    >
            {/* Bearbetning och väntande godkännande; undertexternas läge står i sammanfattningen och åtgärderna är knappar under den. */}
            {uploadPending && <VideoStatusRow recording={p.recording} />}
            {broadcastInProgress ? (
              <div class="od-broadcast-warning" role="status">
                <strong>{isAfter ? t`The broadcast has ended` : t`Broadcast in progress`}</strong>
                <span>{t`Stop the encoder to trim and publish on demand. Or go back to Before if this was only a test.`}</span>
              </div>
            ) : recordingProcessing && (
              <div class="od-broadcast-warning" role="status">
                <strong>{p.recording?.source === 'upload' ? t`The video is being processed` : t`The recording is being processed`}</strong>
                {p.recording?.source === 'upload' ? (
                  <>
                    <span>{t`The video is being converted for playback, which can take a few minutes depending on its length. You can leave the page — processing continues.`}</span>
                    <span>{t`Other choices are locked until the video is done or the upload is canceled.`}</span>
                    <button class="btn btn-sm" type="button" onClick={() => void cancelPendingUpload()}>{t`Cancel the upload`}</button>
                    {uploadNote && <span class="od-download-error">{uploadNote}</span>}
                  </>
                ) : (
                  <span>{t`Wait until the recording is done before you trim and publish on demand.`}</span>
                )}
                {processingStuck && p.recording?.source !== 'upload' && (
                  <>
                    <span>{t`This is taking unusually long — the broadcast may have been too short for AWS to save a recording.`}</span>
                    {isAfter && projectRecordings.length > 1 && (
                      <button class="btn btn-sm" type="button" onClick={openRecordingPicker}>{t`Switch broadcast…`}</button>
                    )}
                  </>
                )}
              </div>
            )}
            {awaitingApproval && (
              <>
                <div class="od-trim-preview">
                  <video ref={approvalVideoRef} controls playsInline preload="metadata" aria-label={t`Uploaded video`} />
                </div>
                <UploadApproval
                  recording={recording}
                  previous={projectRecordings}
                  onDone={() => void actions.refreshProject()}
                />
              </>
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

            {(source || published) && !awaitingApproval && (
              <>
                {editorAvailable ? editorEntry(guideSteps) : guideSteps(null, null)}
                {publishHint && <p class="od-summary-sub od-publish-hint">{publishHint}</p>}
              </>
            )}

            {(source || published) && !awaitingApproval && (
              <dl class="od-summary" aria-label={t`Summary`}>
                <dt>{t`Status`}</dt>
                <dd>
                  {published ? <strong class="od-state is-published">{t({ message: 'Published', context: 'project state' })}</strong> : <strong class="od-state">{t`Not published`}</strong>}
                  {published && lastPublish && (
                    <span class="od-summary-sub">{lastPublishText(formatDateTime(lastPublish.occurredAt), lastPublish.actorName)}</span>
                  )}
                  {published && anyUnpublished && (
                    <span class="od-unpublished-row">
                      <span class="od-unpublished">{t`Unpublished changes`}</span>
                    </span>
                  )}
                </dd>
                {source && (
                  <>
                    <dt>{t`Video`}</dt>
                    <dd>
                      {externalVideo
                        ? t`External address · cannot be trimmed`
                        : isTrimmed
                          ? t`Trimmed`
                          : t`Not trimmed`}
                      {trimDirty && <span class="od-summary-sub">{t`The trim is applied when you publish.`}</span>}
                    </dd>
                  </>
                )}
                {isAfter && projectRecordings.length > 1 && !uploadPending && (
                  <>
                    <dt>{t`Broadcast`}</dt>
                    <dd class="od-recording-select">
                      <span class="od-recording-current">
                        {formatDateTime(projectRecordings.find((item) => item.isActive)?.startedAt ?? '')} ·{' '}
                        {formatHms(projectRecordings.find((item) => item.isActive)?.durationSeconds ?? 0)}
                      </span>
                      <button class="btn btn-sm" type="button" disabled={switchingRecording} onClick={openRecordingPicker}>
                        {t`Switch broadcast…`}
                      </button>
                    </dd>
                  </>
                )}
                <dt>{t`Chapters`}</dt>
                <dd>
                  {!projectChaptersLoaded
                    ? t`Fetching…`
                    : chaptersReadOnly
                      ? t`Can be edited when the recording is done`
                      : chapterCount === 0
                        ? t`No chapters`
                        : pauseCount > 0 ? chaptersAndBreaksText(chapterCount, pauseCount) : chaptersText(chapterCount)}
                  {syncState === 'pending' && <span class="od-summary-sub is-warn">{t`The anchoring to the video is not confirmed.`}</span>}
                </dd>
                <dt>{t`Captions`}</dt>
                <dd>
                  {captionsGenerating
                    ? <span class="od-summary-busy">{t`Generating…`}</span>
                    : captionDraft && !captionDraft.stale
                    ? <>
                        {cuesText(captionDraft.cueCount)}
                        {captionDraft.unpublishedChanges && <span class="od-summary-sub">{published ? t`Not published yet.` : t`Published with the project.`}</span>}
                        {captionDraft.unreviewed && <span class="od-summary-sub is-warn">{t`Machine-generated, not reviewed.`}</span>}
                      </>
                    : p.recording?.captions
                      ? cuesText(p.recording.captions.cueCount)
                      : t`None`}
                </dd>
              </dl>
            )}

            {(source || published) && !awaitingApproval && (
              <div class="od-secondary-actions">
                <button class="btn btn-sm" type="button" onClick={() => setShowExportDialog(true)}>
                  <Icon name="ios_share" size={18} /> {t`Export & import…`}
                </button>
                {onForked && <ForkButton project={p} livePhase={live.health?.livePhase} onForked={onForked} />}
              </div>
            )}

            {actionNote && <p class="od-download-error">{actionNote}</p>}

            {playerSettings && (
              <PlayerSettingsDialog
                project={p}
                actions={actions}
                liveHlsUrl={live.channel?.playbackUrl ?? null}
                ingest={live.channel ? { channel: live.channel, streamKey: live.streamKey, onTeardown: () => actions.teardownChannel() } : null}
                initialCategory={playerSettings}
                onClose={() => setPlayerSettings(null)}
              />
            )}

            {showExportDialog && (
              <ExportImportDialog
                project={p}
                onClose={() => setShowExportDialog(false)}
                onOpenCaptions={editorAvailable ? () => setEditorRequest((request) => ({ focus: 'captions', seq: (request?.seq ?? 0) + 1 })) : undefined}
                // Uppladdning av video (fil eller HLS-adress) görs här; en ny video ersätter den gamla först när den godkänts.
                upload={{ blockedReason: canUpload ? null : uploadBlockedReason, replacing: !!source, onUploaded: () => void actions.refreshProject() }}
              />
            )}

    </OverviewShell>
  )
}

interface UploadApprovalProps {
  recording: Recording | null
  /** Projektets tidigare inspelningar — raderas om filen godkänns. */
  previous: ProjectRecording[]
  onDone: () => void
}

function trimmedStatus(seconds: number): string {
  const duration = formatHms(seconds)
  return t`Trimmed · ${duration}`
}

function chaptersText(count: number): string {
  return plural(count, { one: '# chapter', other: '# chapters' })
}

function chaptersAndBreaksText(chapters: number, breaks: number): string {
  const chapterText = chaptersText(chapters)
  return plural(breaks, { one: `${chapterText} · # break`, other: `${chapterText} · # breaks` })
}

function cuesText(count: number): string {
  const cues = formatNumber(count)
  return plural(count, { one: `${cues} line`, other: `${cues} lines` })
}

function videoLine(value: string): string {
  return t`Video: ${value}`
}

function chaptersLine(value: string): string {
  return t`Chapters: ${value}`
}

function captionsLine(value: string): string {
  return t`Captions: ${value}`
}

function veryShortText(duration: string): string {
  return t`The chosen broadcast is very short (${duration}) — check that it was not a test before you switch.`
}

function lastPublishText(when: string, actor: string): string {
  return t`Last ${when} by ${actor}`
}

function replaceWarningText(retentionDays: number | null): string {
  return retentionDays
    ? t`If you use the file, the project's earlier recordings (and any trimmed versions) are deleted and can be restored by an administrator from the Trash within ${retentionDays} days:`
    : t`If you use the file, the project's earlier recordings (and any trimmed versions) are deleted:`
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
      setError(err instanceof Error ? err.message : t`Something went wrong.`)
      setBusy(null)
    }
  }

  return (
    <div class="od-upload" aria-label={t`Approve uploaded video`}>
      <p class="od-upload-title">{t`Is this the right file?`}</p>
      {recording && (
        <p class="od-empty">
          <strong>{recording.name}</strong> · {formatHms(recording.durationSeconds)} · {recording.resolution}{recording.sizeBytes > 0 ? ` · ${formatBytes(recording.sizeBytes)}` : ''}
        </p>
      )}
      <p class="od-empty">
        {t`Check in the preview above. You cannot continue with chapters, trimming or publishing until you have chosen.`}
      </p>
      {previousCount > 0 && (
        <div class="od-empty">
          <p class="od-empty">{replaceWarningText(retentionDays)}</p>
          <ul>
            {previous.map((item) => (
              <li key={item.id}>{item.name} — {formatDateTime(item.startedAt)} · {formatHms(item.durationSeconds)}</li>
            ))}
          </ul>
        </div>
      )}
      <div class="od-upload-panel">
        <button class="btn btn-sm btn-primary" type="button" disabled={busy !== null || !recording} onClick={() => void decide('accept')}>
          {busy === 'accept' ? t`Saving…` : t`Use this file`}
        </button>
        <button class="btn btn-sm" type="button" disabled={busy !== null || !recording} onClick={() => void decide('reject')}>
          {previousCount > 0 ? t`Keep the earlier one — ignore the file` : t`Ignore the file`}
        </button>
      </div>
      {error && <span class="od-download-error">{error}</span>}
    </div>
  )
}
