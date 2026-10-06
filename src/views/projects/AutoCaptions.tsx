import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { CaptionGeneration, ProjectCaptions } from '../../data/types'
import { formatDateTime, formatHms } from '../../app/time'
import { ConfirmModal } from '../../components/ConfirmModal'
import { JobProgress } from '../../components/JobProgress'
import { captionsLengthWarning } from './captionsCheck'
import { approveBlockedReason, autoCaptionsPhase, estimatedWaitText, groupCorrections } from './autoCaptionsLogic'

interface AutoCaptionsProps {
  projectId: string
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
export function AutoCaptions({ projectId, videoDurationSeconds, published, onChanged, onBusyChange }: AutoCaptionsProps) {
  const [generation, setGeneration] = useState<CaptionGeneration | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notify, setNotify] = useState(false)
  const [confirm, setConfirm] = useState<'approve' | 'discard' | 'cancel' | null>(null)
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
  useEffect(() => {
    if (phase !== 'running') return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [phase, projectId])

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

  const start = () => run(async () => setGeneration(await client.projects.generateCaptions(projectId, notify)), 'Det gick inte att starta undertextningen.')
  const approve = () =>
    run(async () => {
      setConfirm(null)
      setGeneration(await client.projects.approveCaptionDraft(projectId))
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
          videoDurationSeconds={videoDurationSeconds}
          busy={busy}
          canGenerate={generation.canGenerate}
          onApprove={() => setConfirm('approve')}
          onDiscard={() => setConfirm('discard')}
          onDownload={download}
          onRegenerate={start}
        />
      )}

      {phase === 'idle' && (
        <>
          <StartButton busy={busy} disabled={!generation.canGenerate} label="Skapa undertexter automatiskt" onStart={start} />
          <label class="captions-notify">
            <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.currentTarget.checked)} />
            Mejla mig när det är klart
          </label>
          <p class="captions-help">
            Tar {estimatedWaitText(videoDurationSeconds)}. Du får ett utkast att granska. Det syns inte för tittarna förrän du godkänner det.
          </p>
        </>
      )}

      {error && <p class="captions-error" role="alert">{error}</p>}

      {confirm === 'approve' && (
        <ConfirmModal title="Godkänna och publicera undertexterna?" confirmLabel="Godkänn och publicera" onCancel={() => setConfirm(null)} onConfirm={() => void approve()}>
          <p>
            Undertexterna blir synliga för tittarna direkt{published ? ' och ersätter de nuvarande undertexterna' : ''}. De är gjorda
            av en dator och kan innehålla fel, så granska dem först.
          </p>
        </ConfirmModal>
      )}
      {confirm === 'discard' && (
        <ConfirmModal title="Kassera utkastet?" confirmLabel="Kassera" danger onCancel={() => setConfirm(null)} onConfirm={() => void discard()}>
          <p>Utkastet och den råa texten raderas. Publicerade undertexter påverkas inte. Du kan skapa nya när som helst.</p>
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
  videoDurationSeconds?: number
  busy: boolean
  canGenerate: boolean
  onApprove: () => void
  onDiscard: () => void
  onDownload: () => void
  onRegenerate: () => void
}

function DraftView({ draft, videoDurationSeconds, busy, canGenerate, onApprove, onDiscard, onDownload, onRegenerate }: DraftViewProps) {
  const blocked = approveBlockedReason(draft)
  const lengthWarning = draft.stale ? null : captionsLengthWarning(draft, videoDurationSeconds)
  const groups = groupCorrections(draft.corrections)
  const approved = Boolean(draft.approvedAtUtc)

  return (
    <>
      <p class="captions-current">
        <strong>{approved ? 'Godkänt och publicerat' : 'Automatiskt genererat, ej granskat'}</strong> · {draft.cueCount.toLocaleString('sv-SE')} repliker ·
        skapat {formatDateTime(draft.createdAtUtc)}
        {approved && draft.approvedAtUtc ? ` · godkänt ${formatDateTime(draft.approvedAtUtc)}` : ''}
      </p>
      {!approved && <p class="captions-help">Utkastet syns inte för tittarna förrän du godkänner det.</p>}
      {groups.length > 0 && (
        <details class="captions-corrections">
          <summary>Maskinella rättningar ({draft.corrections.length})</summary>
          <ul>
            {groups.map((group) => (
              <li key={`${group.original}|${group.replacement}`}>
                {group.original} → <strong>{group.replacement}</strong>
                <span class="captions-correction-meta">
                  {' '}
                  · {group.count > 1 ? `${group.count} gånger, första vid ` : 'vid '}
                  {formatHms(group.firstTime)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {blocked && <p class="captions-warning" role="alert">{blocked}</p>}
      {lengthWarning && <p class="captions-warning" role="alert">{lengthWarning}</p>}
      <div class="captions-actions">
        {!approved && (
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
      {!approved && (
        <p class="captions-help">
          Vill du rätta något? Ladda ner filen, redigera den i ett valfritt verktyg och ladda upp den nedan, så ersätter den utkastet.
        </p>
      )}
    </>
  )
}
