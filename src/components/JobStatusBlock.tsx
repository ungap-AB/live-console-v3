import type { MediaJob } from '../data/types'
import { jobTitle } from '../app/jobActions'
import { routeHref } from '../app/router'
import { Icon } from './Icon'
import { JobProgress } from './JobProgress'
import './JobStatusBlock.css'

const MAX_SHOWN = 3

interface JobStatusBlockProps {
  jobs: MediaJob[]
  /** Jobb som blivit klara eller misslyckats sedan senaste besöket i Jobb-vyn. */
  newFinished: number
}

// UNG-100: ett kompakt block i vänstermenyn som visar pågående jobb, så operatören kan slänga ett öga på status utan
// att öppna något. Klara jobb markeras tydligt. Hela blocket är en länk till Jobb-vyn, där allt hanteras. Inget block
// alls när inget pågår och inget är nytt.
export function JobStatusBlock({ jobs, newFinished }: JobStatusBlockProps) {
  const active = jobs.filter((job) => job.state === 'processing')
  if (active.length === 0 && newFinished === 0) return null
  const shown = active.slice(0, MAX_SHOWN)

  return (
    <a class="job-block" href={routeHref('jobs')} title="Öppna Jobb">
      <div class="job-block-head">
        <Icon name={active.length > 0 ? 'sync' : 'task_alt'} size={16} />
        <span class="job-block-label">{active.length > 0 ? `${active.length} pågår` : 'Jobb'}</span>
        {newFinished > 0 && <span class="job-block-new">{newFinished} {newFinished === 1 ? 'klart' : 'klara'}</span>}
      </div>
      {shown.map((job) => (
        <div class="job-block-row" key={job.id}>
          <span class="job-block-title">{jobTitle(job)}</span>
          <JobProgress progress={job.progress} phase={job.phase} />
        </div>
      ))}
      {active.length > shown.length && <div class="job-block-more">+{active.length - shown.length} till</div>}
    </a>
  )
}
