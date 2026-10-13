import { t } from '@lingui/core/macro'
import type { CaptionGeneration } from '../../data/types'
import { autoCaptionsPhase, type AutoCaptionsPhase } from './autoCaptionsLogic.ts'

// UNG-165: knappen "Skapa/Redigera undertexter" ovanför videon och vad som visas när den öppnas. Rena funktioner över
// serverns läge (jobb + utkast), så att etikett och vy alltid följer samma regler.

export type EntryKind = 'create' | 'progress' | 'edit'

export interface CaptionEntry {
  kind: EntryKind
  label: string
  /** Kort läge (som i projektlistan), t.ex. "Genererar 42 %". */
  status?: string
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
        listLabel: percent ? t`Generating${percent}` : t({ message: 'Generating…', context: 'caption status' }),
        entryLabel: percent ? t`Generating captions…${percent}` : t`Generating captions…`,
        title: t`The captions are being generated. Open to follow the progress.`,
      }
    case 'failed':
      return { kind: 'create', tone: 'warn', listLabel: t`Try again`, entryLabel: t`Try again`, title: t`The last attempt failed. Create the captions again.` }
    case 'draft':
      return {
        kind: 'edit',
        tone: 'draft',
        listLabel: t`Draft`,
        entryLabel: t`Edit draft`,
        title: t`Edit the draft. It is not visible to the viewers until it has been published.`,
      }
    case 'published':
      return { kind: 'edit', tone: 'published', listLabel: t({ message: 'Published', context: 'caption status' }), entryLabel: t`Edit captions`, title: t`Edit the published captions` }
    default:
      return { kind: 'create', tone: 'neutral', listLabel: t`Create`, entryLabel: t`Create captions`, title: t`Create captions automatically` }
  }
}

/** Knappens läge, eller null medan serverns läge inte är hämtat. */
export function captionEntry(generation: CaptionGeneration | null): CaptionEntry | null {
  if (!generation) return null
  const phase = autoCaptionsPhase(generation)
  if (phase === 'running') {
    const view = captionStateView('generating', generation.job?.progress)
    return { kind: 'progress', label: view.entryLabel, status: view.listLabel }
  }
  if (phase === 'draft') {
    // Publicerade bara om den senast sparade versionen är den publicerade; allt annat (även ändringar efter en publicering) är ett utkast.
    const published = generation.draft?.unpublishedChanges === false
    return { kind: 'edit', label: captionStateView(published ? 'published' : 'draft').entryLabel }
  }
  // UNG-248: utan undertexter öppnar knappen redigeraren (trim och kapitel); undertexter skapas därifrån.
  return { kind: 'create', label: t`Edit` }
}

export type StudioView = 'progress' | 'editor'

/** Vad som visas när knappen öppnats: framsteg (overlay över redigeraren) eller själva redigeraren (UNG-248: även utan undertexter). */
export function studioView(phase: AutoCaptionsPhase): StudioView {
  return phase === 'running' ? 'progress' : 'editor'
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
