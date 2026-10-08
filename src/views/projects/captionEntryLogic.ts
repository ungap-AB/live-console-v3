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

// UNG-187: undertextens tillstånd och hur det benämns. EN källa för knappen ovanför videon och knappen i projektlistan, så orden inte
// kan glida isär. Listan säger var undertexten står (Skapa, Genererar, Försök igen, Utkast, Publicerade); knappen ovanför videon har
// verb där det finns en åtgärd (Redigera utkast, Redigera undertexter). Utkast gäller även publicerade undertexter som ändrats efteråt.
export type CaptionState = 'none' | 'generating' | 'failed' | 'draft' | 'published'
export type CaptionTone = 'neutral' | 'progress' | 'warn' | 'draft' | 'published'

export interface CaptionStateView {
  kind: EntryKind
  tone: CaptionTone
  /** Texten i projektlistan. */
  listLabel: string
  /** Texten på knappen ovanför videon. */
  entryLabel: string
  /** Vad ett klick gör. */
  title: string
}

export function captionStateView(state: CaptionState, progress?: number | null): CaptionStateView {
  const percent = typeof progress === 'number' && progress > 0 ? ` ${Math.round(progress)} %` : ''
  switch (state) {
    case 'generating':
      return {
        kind: 'progress',
        tone: 'progress',
        listLabel: percent ? `Genererar${percent}` : 'Genererar…',
        entryLabel: percent ? `Genererar undertexter…${percent}` : 'Genererar undertexter…',
        title: 'Undertexterna genereras. Öppna för att följa framsteget.',
      }
    case 'failed':
      return { kind: 'create', tone: 'warn', listLabel: 'Försök igen', entryLabel: 'Försök igen', title: 'Förra försöket misslyckades. Skapa undertexterna igen.' }
    case 'draft':
      return {
        kind: 'edit',
        tone: 'draft',
        listLabel: 'Utkast',
        entryLabel: 'Redigera utkast',
        title: 'Redigera utkastet. Det syns inte för tittarna förrän det publicerats.',
      }
    case 'published':
      return { kind: 'edit', tone: 'published', listLabel: 'Publicerade', entryLabel: 'Redigera undertexter', title: 'Redigera de publicerade undertexterna' }
    default:
      return { kind: 'create', tone: 'neutral', listLabel: 'Skapa', entryLabel: 'Skapa undertexter', title: 'Skapa undertexter automatiskt' }
  }
}

/** Knappens läge, eller null medan serverns läge inte är hämtat. */
export function captionEntry(generation: CaptionGeneration | null): CaptionEntry | null {
  if (!generation) return null
  const phase = autoCaptionsPhase(generation)
  const unavailable = generation.canGenerate ? undefined : 'Undertexter går inte att skapa automatiskt för den här videon.'
  if (phase === 'running') return { kind: 'progress', label: captionStateView('generating', generation.job?.progress).entryLabel }
  if (phase === 'draft') {
    // Publicerade bara om den senast sparade versionen är den publicerade; allt annat (även ändringar efter en publicering) är ett utkast.
    const published = generation.draft?.unpublishedChanges === false
    return { kind: 'edit', label: captionStateView(published ? 'published' : 'draft').entryLabel }
  }
  if (phase === 'failed') return { kind: 'create', label: captionStateView('failed').entryLabel, disabledReason: unavailable }
  return { kind: 'create', label: captionStateView('none').entryLabel, disabledReason: unavailable }
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
  state: CaptionState
  progress?: number | null
}

export interface ListCaptionButton {
  label: string
  kind: EntryKind
  tone: CaptionTone
  title: string
}

/** Knappen i projektlistan: tillståndet som text (Skapa, Genererar N %, Försök igen, Utkast, Publicerade) och vad ett klick gör som tooltip. */
export function listCaptionButton(status: ProjectCaptionStatus | undefined): ListCaptionButton {
  const view = captionStateView(status?.state ?? 'none', status?.progress)
  return { label: view.listLabel, kind: view.kind, tone: view.tone, title: view.title }
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
