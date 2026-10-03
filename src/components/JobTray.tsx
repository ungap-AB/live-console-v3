import { useEffect, useRef, useState } from 'preact/hooks'
import type { MediaJob } from '../data/types'
import { downloadJobFile, jobTitle } from '../app/jobActions'
import { groupJobs, pruneDismissed, readDismissedJobs, storeDismissedJobs } from '../app/dismissedJobs'
import { onOpenJobTray } from '../app/jobsBus'
import { formatAgo } from '../app/time'
import { useDismiss } from '../app/useDismiss'
import { Icon } from './Icon'
import { ShareDialog } from './ShareDialog'
import { JobProgress } from './JobProgress'
import './JobTray.css'

interface JobTrayProps {
  jobs: MediaJob[]
  /** Den inloggade användaren — vilka jobb som är dolda gäller en person. */
  userId: string
  onOpenProject: (projectId: string) => void
}

// UNG-80 steg 2: jobbfält i skalet — pågående och senaste mediajobb, synligt på alla vyer. Jobben körs av
// servern, så fältet överlever vybyte och omladdning. Döljs helt när det inte finns några jobb.
// UNG-95: klara jobb kan döljas (enskilt, via "Rensa klara" eller när man agerat på dem), bara de senaste visas som
// standard, och dolda jobb kan visas igen.
export function JobTray({ jobs, userId, onOpenProject }: JobTrayProps) {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [shareFor, setShareFor] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState(() => readDismissedJobs(userId))
  const [showAll, setShowAll] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, ref, () => setOpen(false))
  useEffect(() => onOpenJobTray(() => setOpen(true)), [])

  if (jobs.length === 0) return null
  const groups = groupJobs(jobs, dismissedIds)
  const active = groups.active.length
  const fresh = groups.recent.length + groups.older.length
  const shown = [
    ...groups.active,
    ...groups.recent,
    ...(showAll ? groups.older : []),
    ...(showDismissed ? groups.dismissed : []),
  ]

  function dismiss(ids: string[]) {
    const next = pruneDismissed([...dismissedIds, ...ids], jobs)
    setDismissedIds(next)
    storeDismissedJobs(userId, next)
  }

  async function download(job: MediaJob) {
    setBusyId(job.id)
    setErrors((prev) => ({ ...prev, [job.id]: '' }))
    try {
      await downloadJobFile(job)
      // Man har hämtat filen: jobbet är hanterat. Den ligger kvar under Nedladdningar i sju dagar.
      dismiss([job.id])
    } catch (error) {
      setErrors((prev) => ({ ...prev, [job.id]: error instanceof Error ? error.message : 'Nedladdningen misslyckades.' }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div class="job-tray" ref={ref}>
      {shareFor && <ShareDialog initialRecordingId={shareFor} onClose={() => setShareFor(null)} />}
      <button
        class="job-tray-toggle"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={active > 0 ? 'sync' : 'task_alt'} size={18} />
        <span class="job-tray-label">Jobb</span>
        <span class={`job-tray-count${active > 0 ? ' active' : ''}`}>
          {active > 0 ? `${active} pågår` : fresh > 0 ? `${fresh} klara` : 'inga nya'}
        </span>
      </button>

      {open && (
        <div class="job-tray-panel" role="dialog" aria-label="Jobb">
          <div class="job-tray-head">
            <span>Jobb</span>
            {fresh > 0 && (
              <button class="btn btn-sm" type="button" onClick={() => dismiss([...groups.recent, ...groups.older].map((job) => job.id))}>
                Rensa klara
              </button>
            )}
          </div>
          {shown.length === 0 && <p class="job-tray-empty">Inga nya jobb.</p>}
          <ul>
            {shown.map((job) => (
              <li key={job.id} class={`job-row ${job.state}${dismissedIds.includes(job.id) ? ' dismissed' : ''}`}>
                <div class="job-row-head">
                  <Icon name={job.kind === 'download' ? 'download' : 'upload'} size={16} />
                  <span class="job-row-title">{jobTitle(job)}</span>
                  {job.state !== 'processing' && !dismissedIds.includes(job.id) && (
                    <button class="ib job-row-dismiss" type="button" title="Dölj" aria-label="Dölj jobbet" onClick={() => dismiss([job.id])}>
                      ×
                    </button>
                  )}
                </div>
                <div class="job-row-meta">
                  {job.startedByName ? `${job.startedByName} · ` : ''}
                  {formatAgo(job.completedAtUtc ?? job.createdAtUtc)}
                </div>
                {job.state === 'processing' && <JobProgress progress={job.progress} phase={job.phase} />}
                {job.state === 'error' && <div class="job-row-error">{job.errorMessage ?? 'Bearbetningen misslyckades.'}</div>}
                {job.state === 'done' && job.kind === 'download' && (
                  <div class="job-row-actions">
                    <button class="btn btn-sm" type="button" disabled={busyId === job.id} onClick={() => void download(job)}>
                      Ladda ner
                    </button>
                    <button
                      class="btn btn-sm"
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        setShareFor(job.recordingId)
                      }}
                    >
                      Dela…
                    </button>
                  </div>
                )}
                {job.state === 'done' && job.kind === 'upload' && job.projectId && (
                  <div class="job-row-actions">
                    <button
                      class="btn btn-sm"
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        dismiss([job.id])
                        onOpenProject(job.projectId!)
                      }}
                    >
                      Öppna projektet
                    </button>
                  </div>
                )}
                {errors[job.id] && <div class="job-row-error">{errors[job.id]}</div>}
              </li>
            ))}
          </ul>
          {(groups.older.length > 0 || groups.dismissed.length > 0) && (
            <div class="job-tray-foot">
              {groups.older.length > 0 && (
                <button class="job-tray-link" type="button" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? 'Visa färre' : `Visa fler (${groups.older.length})`}
                </button>
              )}
              {groups.dismissed.length > 0 && (
                <button class="job-tray-link" type="button" onClick={() => setShowDismissed((value) => !value)}>
                  {showDismissed ? 'Dölj de dolda' : `Visa dolda (${groups.dismissed.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
