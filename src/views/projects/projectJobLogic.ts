import type { MediaJob } from '../../data/types.ts'

export interface ProjectJobIndicator {
  /** Det senast startade pågående jobbet för projektet. */
  job: MediaJob
  /** Hur många fler pågående jobb projektet har (visas som "+1"). */
  extra: number
}

/** Pågående jobb per projekt för projektlistan (UNG-127). Data kommer från skalets jobblista, ingen egen pollning. */
export function activeJobsByProject(jobs: readonly MediaJob[]): Map<string, ProjectJobIndicator> {
  const grouped = new Map<string, MediaJob[]>()
  for (const job of jobs) {
    if (job.state !== 'processing' || !job.projectId) continue
    const list = grouped.get(job.projectId)
    if (list) list.push(job)
    else grouped.set(job.projectId, [job])
  }
  const result = new Map<string, ProjectJobIndicator>()
  for (const [projectId, list] of grouped) {
    const latest = list.reduce((a, b) => (b.createdAtUtc > a.createdAtUtc ? b : a))
    result.set(projectId, { job: latest, extra: list.length - 1 })
  }
  return result
}

export function jobKindIcon(kind: MediaJob['kind']): string {
  return kind === 'download' ? 'download' : kind === 'captions' ? 'closed_caption' : kind === 'speakers' ? 'record_voice_over' : 'upload'
}

export function jobKindLabel(kind: MediaJob['kind']): string {
  return kind === 'download' ? 'Nedladdning' : kind === 'captions' ? 'Undertexter' : kind === 'speakers' ? 'Talarbyten' : 'Uppladdning'
}
