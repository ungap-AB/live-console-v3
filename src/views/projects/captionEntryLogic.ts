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

/** Undertextläget per projekt ur projektlistan (servern räknar ut det för hela listan med få frågor, UNG-167). */
export interface ProjectCaptionStatus {
  state: 'none' | 'generating' | 'failed' | 'draft' | 'published'
  progress?: number | null
}

export interface ListCaptionButton {
  label: string
  kind: EntryKind
  title: string
}

/** Knappen i projektlistan: skapa när inga undertexter finns, framsteg medan de genereras, redigera när utkast eller publicerade finns. */
export function listCaptionButton(status: ProjectCaptionStatus | undefined): ListCaptionButton {
  switch (status?.state) {
    case 'generating':
      return {
        label: typeof status.progress === 'number' && status.progress > 0 ? `Genererar ${Math.round(status.progress)} %` : 'Genererar…',
        kind: 'progress',
        title: 'Undertexterna genereras. Öppna för att följa framsteget.',
      }
    case 'draft':
    case 'published':
      return { label: 'Redigera', kind: 'edit', title: 'Redigera undertexterna' }
    case 'failed':
      return { label: 'Skapa', kind: 'create', title: 'Förra försöket misslyckades. Skapa undertexterna igen.' }
    default:
      return { label: 'Skapa', kind: 'create', title: 'Skapa undertexter automatiskt' }
  }
}

// Ett önskemål om att öppna undertextstudion direkt när projektet öppnats (knappen i projektlistan). Gäller en kort stund, så att ett
// önskemål för ett projekt som inte kan visa studion inte öppnar den långt senare.
let pendingStudio: { projectId: string; at: number } | null = null
const STUDIO_REQUEST_MS = 10_000

export function requestCaptionStudio(projectId: string, now: number = Date.now()): void {
  pendingStudio = { projectId, at: now }
}

/** Sant (en gång) om studion ska öppnas direkt för projektet. */
export function consumeCaptionStudio(projectId: string, now: number = Date.now()): boolean {
  const request = pendingStudio
  pendingStudio = null
  return request !== null && request.projectId === projectId && now - request.at <= STUDIO_REQUEST_MS
}
