import type { CaptionGeneration } from '../../data/types'
import { autoCaptionsPhase, type AutoCaptionsPhase } from './autoCaptionsLogic.ts'

// UNG-165: knappen "Skapa/Redigera undertexter" ovanför videon och vad som visas när den öppnas. Rena funktioner över
// serverns läge (jobb + utkast), så att etikett och vy alltid följer samma regler.

export type EntryKind = 'create' | 'progress' | 'edit'

export interface CaptionEntry {
  kind: EntryKind
  label: string
  /** Satt när knappen inte går att använda, med förklaring. */
  disabledReason?: string
}

/** Knappens läge, eller null medan serverns läge inte är hämtat. */
export function captionEntry(generation: CaptionGeneration | null): CaptionEntry | null {
  if (!generation) return null
  const phase = autoCaptionsPhase(generation)
  if (phase === 'running') {
    const progress = generation.job?.progress
    return { kind: 'progress', label: typeof progress === 'number' && progress > 0 ? `Genererar undertexter… ${Math.round(progress)} %` : 'Genererar undertexter…' }
  }
  if (phase === 'draft') return { kind: 'edit', label: 'Redigera undertexter' }
  return {
    kind: 'create',
    label: 'Skapa undertexter',
    disabledReason: generation.canGenerate ? undefined : 'Undertexter går inte att skapa automatiskt för den här videon.',
  }
}

export type StudioView = 'start' | 'progress' | 'editor'

/** Vad som visas när knappen öppnats: start (skapa), framsteg (overlay över redigeraren) eller själva redigeraren. */
export function studioView(phase: AutoCaptionsPhase): StudioView {
  if (phase === 'running') return 'progress'
  if (phase === 'draft') return 'editor'
  return 'start'
}
