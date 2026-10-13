import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CaptionGeneration } from '../../data/types'
import { ConfirmModal } from '../../components/ConfirmModal'
import { JobProgress } from '../../components/JobProgress'
import type { AutoCaptionsPhase } from './autoCaptionsLogic'
import { jobEstimateText } from './autoCaptionsLogic'
import { studioView } from './captionEntryLogic'
import { CaptionEditor, type EditorChapterTools, type EditorFocus, type EditorTrim } from './CaptionEditor'
import './CaptionStudio.css'

interface CaptionStudioProps {
  projectId: string
  projectName: string
  videoDurationSeconds?: number
  generation: CaptionGeneration | null
  phase: AutoCaptionsPhase
  setGeneration: (next: CaptionGeneration) => void
  refresh: () => Promise<void>
  onChanged: () => void
  /** Kapitel sparades i redigeraren (utkastet ändrat). */
  onChaptersChanged?: () => void
  /** Trimningen (originalets tid) och hur den ändras. Saknas den visas inga trimkontroller i redigeraren. */
  trim?: EditorTrim
  /** UNG-247: trimningen är låst (publicerat), med en väg till Avpublicera. */
  trimLock?: { onUnpublish: () => void }
  /** UNG-249: projektets uppgifter för kapitelverktygen i redigeraren. */
  chapterTools?: EditorChapterTools
  /** UNG-250: ökas när editorn ska stängas utifrån (bakåtknappen). */
  closeSignal?: number
  /** Momentet som redigeraren öppnas med. */
  focus?: EditorFocus
  onClose: () => void
}

// UNG-165: undertextstudion. Medan undertexterna skapas visas framsteget som en dialog över redigeraren (UNG-274: den riktiga, bara som
// bakgrund; Stäng stänger båda); annars öppnas redigeraren. UNG-248: även utan undertexter (trim och kapitel), och undertexter skapas därifrån.
export function CaptionStudio({ projectId, projectName, videoDurationSeconds, generation, phase, setGeneration, refresh, onChanged, onChaptersChanged, trim, trimLock, chapterTools, closeSignal, focus, onClose }: CaptionStudioProps) {
  const view = studioView(phase)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  // UNG-213: klockan som den återstående tiden räknas mot, tickar medan jobbet går.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (view !== 'progress') return
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [view])

  const job = generation?.job
  const showEditor = view === 'editor' || !job
  // Framstegsvyn har inget osparat: bakåt stänger direkt (redigeraren hanterar signalen själv).
  useEffect(() => {
    if (closeSignal && !showEditor) onClose()
  }, [closeSignal])

  if (showEditor) {
    const createFailed = phase === 'failed' ? (job?.errorMessage ?? t`unknown error.`) : undefined
    return <CaptionEditor key="editor" projectId={projectId} projectName={projectName} onClose={onClose} onSaved={() => { onChanged(); void refresh() }} onRegenerated={setGeneration} onChaptersSaved={onChaptersChanged} trim={trim} trimLock={trimLock} createFailed={createFailed} chapterTools={chapterTools} closeSignal={closeSignal} focus={focus} />
  }

  async function cancel() {
    setConfirmCancel(false)
    setBusy(true)
    setError('')
    try {
      if (generation?.job) await client.jobs.cancel(generation.job.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t`The job could not be cancelled.`)
    } finally {
      setBusy(false)
    }
  }

  // Redigeraren monteras om när jobbet är klart (annan nyckel), så att den läser in maskinutkastet.
  return (
    <>
      <CaptionEditor key="background" projectId={projectId} projectName={projectName} onClose={onClose} trim={trim} trimLock={trimLock} chapterTools={chapterTools} background />
      <div class="cs-scrim" role="dialog" aria-modal="true" aria-label={t`The captions are being created`}>
        <div class="cs-card">
          <h3>{t`The captions are being created`}</h3>
          <JobProgress progress={job.progress} phase={job.phase} />
          <p class="cs-text cs-estimate" aria-live="polite">
            {jobEstimateText({ videoDurationSeconds, includeSpeakers: job.includeSpeakers === true, startedAtUtc: job.createdAtUtc, progress: job.progress, nowMs: now })}
          </p>
          <p class="cs-text">{t`The audio is extracted, transcribed and split into lines. Then you can edit them here. You can close the window: the job continues, and you follow it on the button above the video.`}</p>
          <div class="cs-actions">
            <button class="btn btn-sm" type="button" disabled={busy} onClick={() => setConfirmCancel(true)}>{t`Cancel`}</button>
            <button class="btn btn-sm" type="button" onClick={onClose}>{t`Close, continue in the background`}</button>
          </div>
          {error && <p class="cs-error" role="alert">{error}</p>}
        </div>

        {confirmCancel && (
          <ConfirmModal title={t`Cancel?`} confirmLabel={t`Cancel the job`} danger onCancel={() => setConfirmCancel(false)} onConfirm={() => void cancel()}>
            <p>{t`The creation is stopped and no draft is saved. You can start it again at any time.`}</p>
          </ConfirmModal>
        )}
      </div>
    </>
  )
}
