import { useEffect, useRef, useState } from 'preact/hooks'
import { notifyJobsChanged } from '../../app/jobsBus'
import { client } from '../../data'
import type { CaptionGeneration, ProjectCaptions } from '../../data/types'
import { formatDateTime } from '../../app/time'
import { ConfirmModal } from '../../components/ConfirmModal'
import { JobProgress } from '../../components/JobProgress'
import { CaptionEditor } from './CaptionEditor'
import { approveBlockedReason, autoCaptionsPhase, draftState, estimatedWaitText } from './autoCaptionsLogic'
import { shouldPollGeneration, speakersView } from './speakersLogic'

interface AutoCaptionsProps {
  projectId: string
  projectName?: string
  /** Längden på den publicerade videon, för att varna om utkastet inte hör till den. */
  videoDurationSeconds?: number
  /** Redan publicerade undertexter (uppladdade eller godkända), för att varna innan de ersätts. */
  published: ProjectCaptions | null
  /** Anropas när något publicerats, så projektet kan hämtas om. */
  onChanged: () => void
  onBusyChange?: (busy: boolean) => void
}

const POLL_MS = 4000

// UNG-126: automatiska undertexter. Operatören startar en generering (MediaConvert tar fram ljudet, en undertextmotor
// transkriberar), följer framsteget, granskar utkastet och godkänner det — först då syns det för tittarna. Rättningarna
// (namn och termer som ersatts) visas så de går att kontrollera. Den råa texten sparas alltid på servern.
export function AutoCaptions({ projectId, projectName = '', videoDurationSeconds, published, onChanged, onBusyChange }: AutoCaptionsProps) {
  const [generation, setGeneration] = useState<CaptionGeneration | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notify, setNotify] = useState(false)
  const [includeSpeakers, setIncludeSpeakers] = useState(false)
  const [confirm, setConfirm] = useState<'approve' | 'discard' | 'cancel' | null>(null)
  const [editing, setEditing] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy])
  useEffect(() => () => onBusyChange?.(false), [])

  async function refresh() {
    try {
      const next = await client.projects.getCaptionGeneration(projectId)
      if (alive.current) setGeneration(next)
    } catch {
      // Ett missat svar under pollningen är ofarligt; nästa försök hämtar rätt läge.
    }
  }

  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
    }
  }, [projectId])

  const phase = generation ? autoCaptionsPhase(generation) : 'idle'
  // När ett jobb blir klart eller misslyckas i panelens egen pollning ska jobblistan följa med (UNG-159).
  const previousPhase = useRef<typeof phase | null>(null)
  useEffect(() => {
    if (generation && previousPhase.current !== null && previousPhase.current !== phase) notifyJobsChanged()
    if (generation) previousPhase.current = phase
  }, [phase, generation !== null])

  // Pollar medan ett undertextjobb eller en talaranalys pågår (UNG-205).
  const polling = shouldPollGeneration(generation)
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [polling, projectId])

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : failure)
    } finally {
      setBusy(false)
    }
  }

  // Jobblistan hämtas om direkt så jobbet syns i jobbfältet och Jobb-vyn (UNG-159).
  const start = () =>
    run(async () => {
      setGeneration(await client.projects.generateCaptions(projectId, notify, includeSpeakers && generation?.speakersAvailable === true))
      notifyJobsChanged()
    }, 'Det gick inte att starta undertextningen.')
  const analyzeSpeakers = () =>
    run(async () => {
      setGeneration(await client.projects.analyzeSpeakers(projectId))
      notifyJobsChanged()
    }, 'Det gick inte att starta analysen av talarbyten.')
  const approve = () =>
    run(async () => {
      setConfirm(null)
      setGeneration(await client.projects.approveCaptionDraft(projectId, generation?.draft?.version))
      onChanged()
    }, 'Utkastet kunde inte godkännas.')
  const discard = () =>
    run(async () => {
      setConfirm(null)
      await client.projects.discardCaptionDraft(projectId)
      await refresh()
    }, 'Utkastet kunde inte kasseras.')
  const download = () => run(() => client.projects.downloadCaptionDraft(projectId), 'Filen kunde inte hämtas.')
  const cancel = () =>
    run(async () => {
      setConfirm(null)
      if (generation?.job) await client.jobs.cancel(generation.job.id)
      await refresh()
      notifyJobsChanged()
    }, 'Jobbet kunde inte avbrytas.')

  if (!generation) return null
  const { job, draft } = generation

  return (
    <div class="auto-captions">
      <h4>Automatiska undertexter</h4>

      {phase === 'running' && job && (
        <>
          <JobProgress progress={job.progress} phase={job.phase} />
          <div class="captions-actions">
            <button class="btn btn-sm" type="button" disabled={busy} onClick={() => setConfirm('cancel')}>
              Avbryt
            </button>
          </div>
          <p class="captions-help">Du kan stänga den här rutan, jobbet fortsätter. Följ det i Jobb eller kom tillbaka hit.</p>
        </>
      )}

      {phase === 'failed' && job && (
        <>
          <p class="captions-error" role="alert">Undertexterna kunde inte skapas: {job.errorMessage ?? 'okänt fel.'}</p>
          <StartButton busy={busy} disabled={!generation.canGenerate} label="Försök igen" onStart={start} />
        </>
      )}

      {phase === 'draft' && draft && (
        <DraftView
          draft={draft}
          busy={busy}
          canGenerate={generation.canGenerate}
          onEdit={() => setEditing(true)}
          onApprove={() => setConfirm('approve')}
          onDiscard={() => setConfirm('discard')}
          onDownload={download}
          onRegenerate={start}
        />
      )}

      {(phase === 'draft' || generation.speakers?.state === 'analyzing') && speakersView(generation, formatDateTime).visible && (
        <SpeakersRow generation={generation} busy={busy} onAnalyze={analyzeSpeakers} />
      )}

      {phase === 'idle' && (
        <>
          <StartButton busy={busy} disabled={!generation.canGenerate} label="Skapa undertexter automatiskt" onStart={start} />
          <label class="captions-notify">
            <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.currentTarget.checked)} />
            Mejla mig när det är klart
          </label>
          {generation.speakersAvailable && (
            <label class="captions-notify">
              <input type="checkbox" checked={includeSpeakers} onChange={(event) => setIncludeSpeakers(event.currentTarget.checked)} />
              Analysera också talarbyten (för manus i Word)
            </label>
          )}
          <p class="captions-help">
            Tar {estimatedWaitText(videoDurationSeconds)}. Du får ett utkast att granska. Det syns inte för tittarna förrän du godkänner det.
          </p>
        </>
      )}

      {error && <p class="captions-error" role="alert">{error}</p>}

      {editing && (
        <CaptionEditor
          projectId={projectId}
          projectName={projectName}
          onClose={() => {
            setEditing(false)
            void refresh()
          }}
          onSaved={() => void refresh()}
          onRegenerated={(next) => {
            setGeneration(next)
            setEditing(false)
          }}
        />
      )}

      {confirm === 'approve' && (
        <ConfirmModal title="Godkänna och publicera undertexterna?" confirmLabel="Godkänn och publicera" onCancel={() => setConfirm(null)} onConfirm={() => void approve()}>
          <p>
            Undertexterna blir synliga för tittarna direkt{published ? ' och ersätter de nuvarande undertexterna' : ''}. De är gjorda
            av AI och kan innehålla fel, så granska dem först.
          </p>
        </ConfirmModal>
      )}
      {confirm === 'discard' && (
        <ConfirmModal title="Kassera utkastet?" confirmLabel="Kassera" danger onCancel={() => setConfirm(null)} onConfirm={() => void discard()}>
          <p>
            Utkastet, den råa texten och alla versioner raderas. Publicerade undertexter ligger kvar, men följer inte längre med om videon
            trimmas om. Du kan skapa nya när som helst.
          </p>
        </ConfirmModal>
      )}
      {confirm === 'cancel' && (
        <ConfirmModal title="Avbryta?" confirmLabel="Avbryt jobbet" danger onCancel={() => setConfirm(null)} onConfirm={() => void cancel()}>
          <p>Skapandet stoppas och inget utkast sparas. Du kan starta det igen när som helst.</p>
        </ConfirmModal>
      )}
    </div>
  )
}

// UNG-205: talarbyten för manus (Word). Analyseras i efterhand med en knapp, eller följer med när undertexterna skapas.
function SpeakersRow({ generation, busy, onAnalyze }: { generation: CaptionGeneration; busy: boolean; onAnalyze: () => void }) {
  const view = speakersView(generation, formatDateTime)
  return (
    <div class="captions-speakers">
      <h4>Talarbyten</h4>
      <p class="captions-current">{view.text}</p>
      {view.state === 'analyzing' && <JobProgress progress={view.progress} phase="SPEAKERS" />}
      {view.actionLabel && (
        <div class="captions-actions">
          <button class="btn btn-sm" type="button" disabled={busy || view.blockedReason !== null} onClick={onAnalyze}>
            {view.actionLabel}
          </button>
        </div>
      )}
      {view.blockedReason && view.actionLabel && <p class="captions-help">{view.blockedReason}</p>}
      {view.state === 'none' && !view.blockedReason && (
        <p class="captions-help">Används för att bryta stycke när talaren byter i manuset. Tar några minuter och ändrar inte undertexterna.</p>
      )}
    </div>
  )
}

function StartButton({ busy, disabled, label, onStart }: { busy: boolean; disabled: boolean; label: string; onStart: () => void }) {
  return (
    <div class="captions-actions">
      <button class="btn btn-sm" type="button" disabled={busy || disabled} onClick={onStart}>
        {busy ? 'Startar…' : label}
      </button>
    </div>
  )
}

interface DraftViewProps {
  draft: NonNullable<CaptionGeneration['draft']>
  busy: boolean
  canGenerate: boolean
  onEdit: () => void
  onApprove: () => void
  onDiscard: () => void
  onDownload: () => void
  onRegenerate: () => void
}

function DraftView({ draft, busy, canGenerate, onEdit, onApprove, onDiscard, onDownload, onRegenerate }: DraftViewProps) {
  const blocked = approveBlockedReason(draft)
  const state = draftState(draft)
  const heading =
    state === 'unreviewed' ? 'Automatiskt genererat, ej granskat' : state === 'changed' ? 'Publicerat, men med ändringar som inte är publicerade' : 'Godkänt och publicerat'

  return (
    <>
      <p class="captions-current">
        <strong>{heading}</strong> · {draft.cueCount.toLocaleString('sv-SE')} repliker · skapat {formatDateTime(draft.createdAtUtc)}
        {draft.version && draft.version > 1 ? ` · version ${draft.version}` : ''}
        {state !== 'unreviewed' && draft.approvedAtUtc ? ` · godkänt ${formatDateTime(draft.approvedAtUtc)}` : ''}
      </p>
      {state === 'unreviewed' && <p class="captions-help">Utkastet syns inte för tittarna förrän du godkänner det. Det gäller hela inspelningen, och den trimmade delen publiceras.</p>}
      {state === 'changed' && <p class="captions-help">Tittarna ser den senast godkända versionen tills du godkänner de nya ändringarna.</p>}
      {blocked && <p class="captions-warning" role="alert">{blocked}</p>}
      <div class="captions-actions">
        <button class="btn btn-sm" type="button" disabled={busy || Boolean(blocked)} onClick={onEdit}>
          Redigera…
        </button>
        {state !== 'published' && (
          <button class="btn btn-sm btn-primary" type="button" disabled={busy || Boolean(blocked)} onClick={onApprove}>
            Godkänn och publicera
          </button>
        )}
        <button class="btn btn-sm" type="button" disabled={busy} onClick={onDownload}>
          Ladda ner VTT
        </button>
        <button class="btn btn-sm" type="button" disabled={busy || !canGenerate} onClick={onRegenerate}>
          Skapa nytt
        </button>
        <button class="btn btn-sm" type="button" disabled={busy} onClick={onDiscard}>
          Kassera
        </button>
      </div>
      {state === 'unreviewed' && (
        <p class="captions-help">
          Vill du rätta något kan du redigera här, eller ladda ner filen, redigera den i ett valfritt verktyg och ladda upp den nedan, så
          ersätter den utkastet.
        </p>
      )}
    </>
  )
}
