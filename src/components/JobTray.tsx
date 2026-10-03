import { useEffect, useRef, useState } from 'preact/hooks'
import type { MediaJob } from '../data/types'
import { downloadJobFile, jobTitle } from '../app/jobActions'
import { onOpenJobTray } from '../app/jobsBus'
import { formatAgo } from '../app/time'
import { useDismiss } from '../app/useDismiss'
import { Icon } from './Icon'
import { ShareDialog } from './ShareDialog'
import { JobProgress } from './JobProgress'
import './JobTray.css'

interface JobTrayProps {
  jobs: MediaJob[]
  onOpenProject: (projectId: string) => void
}

// UNG-80 steg 2: jobbfält i skalet — pågående och senaste mediajobb, synligt på alla vyer. Jobben körs av
// servern, så fältet överlever vybyte och omladdning. Döljs helt när det inte finns några jobb.
export function JobTray({ jobs, onOpenProject }: JobTrayProps) {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [shareFor, setShareFor] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, ref, () => setOpen(false))
  useEffect(() => onOpenJobTray(() => setOpen(true)), [])

  if (jobs.length === 0) return null
  const active = jobs.filter((job) => job.state === 'processing').length

  async function download(job: MediaJob) {
    setBusyId(job.id)
    setErrors((prev) => ({ ...prev, [job.id]: '' }))
    try {
      await downloadJobFile(job)
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
        <span class={`job-tray-count${active > 0 ? ' active' : ''}`}>{active > 0 ? `${active} pågår` : 'klara'}</span>
      </button>

      {open && (
        <div class="job-tray-panel" role="dialog" aria-label="Jobb">
          <ul>
            {jobs.map((job) => (
              <li key={job.id} class={`job-row ${job.state}`}>
                <div class="job-row-head">
                  <Icon name={job.kind === 'download' ? 'download' : 'upload'} size={16} />
                  <span class="job-row-title">{jobTitle(job)}</span>
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
        </div>
      )}
    </div>
  )
}
