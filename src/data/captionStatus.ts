import type { Project } from './types.ts'

const STATES = ['none', 'generating', 'failed', 'draft', 'published'] as const

// UNG-167/187: serverns undertextläge per projekt. Okänt eller saknat läge ger undefined (projektlistan behandlar det som inga undertexter).
export function toCaptionStatus(dto: { state: string; progress?: number | null } | null | undefined): Project['captionStatus'] {
  if (!dto) return undefined
  const state = STATES.find((known) => known === dto.state)
  return state ? { state, progress: dto.progress ?? null } : undefined
}
