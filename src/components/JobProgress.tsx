import { jobPhaseLabel } from '../app/jobPhase'
import './JobProgress.css'

interface JobProgressProps {
  /** 0–100 enligt MediaConvert (en uppskattning). Saknas den visas en obestämd bar (köad eller fasbyte). */
  progress?: number | null
  phase?: string | null
}

// Progressbar för ett serverkört mediajobb. Procenten kan stå still en stund (t.ex. under läsning och
// sparande) — därför visas fasen som text bredvid.
export function JobProgress({ progress, phase }: JobProgressProps) {
  const known = typeof progress === 'number' && progress > 0
  return (
    <span class="job-progress" role="status">
      <progress value={known ? progress / 100 : undefined} max={1} />
      <span>{jobPhaseLabel(phase)}{known ? ` · ${Math.round(progress)} %` : ''}</span>
    </span>
  )
}
