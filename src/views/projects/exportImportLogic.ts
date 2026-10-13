import { plural, t } from '@lingui/core/macro'
import type { Project } from '../../data/types'
import { canExportChapters } from './chapterExport.ts'
import { isExternalSource } from './recordingSource.ts'

// Dialogen Exportera och importera: vad som går att göra för ett projekt just nu, och förklaringen när något inte gör det. Allt här är rena
// funktioner; dialogen ritar bara raderna. Nya exporter (manus och protokoll i UNG-141, domänkopiering i UNG-195) blir nya rader.

export interface Availability {
  enabled: boolean
  /** Förklaring som visas på raden när den inte går att använda. */
  reason?: string
}

type Facts = Pick<Project, 'publicMode' | 'recording'>
type CaptionFacts = Pick<Project, 'recording' | 'captionStatus'>

const OK: Availability = { enabled: true }

export function chaptersExportAvailability(project: Facts): Availability {
  if (canExportChapters(project)) return OK
  if (!project.recording) return { enabled: false, reason: t`The project has no video yet.` }
  if (project.recording.state === 'awaitingApproval') return { enabled: false, reason: t`Approve or ignore the uploaded video first.` }
  if (project.publicMode === 'before' || project.publicMode === 'live') return { enabled: false, reason: t`The chapters can be exported when the broadcast has ended.` }
  return { enabled: false, reason: t`The video is not ready yet.` }
}

/** MP4-nedladdning: samma regler som när den låg som flik under videon (UNG-132). */
export function videoDownloadAvailability(project: Facts): Availability {
  const recording = project.recording
  if (!recording) return { enabled: false, reason: t`There is no video to download.` }
  if (recording.state === 'awaitingApproval') return { enabled: false, reason: t`Approve or ignore the uploaded video first.` }
  if (isExternalSource(recording.source)) {
    return { enabled: false, reason: t`The video is at an external address and cannot be downloaded as MP4 until it has been copied to ungap.` }
  }
  if (project.publicMode === 'after') return { enabled: false, reason: t`The video can be downloaded when it is published as on demand.` }
  if (project.publicMode !== 'ondemand') return { enabled: false, reason: t`The video can be downloaded when the broadcast has ended and been published.` }
  const ready = recording.state === 'recorded' || recording.state === 'trimmed' || recording.state === 'published'
  return ready ? OK : { enabled: false, reason: t`The video is not ready yet.` }
}

/** De publicerade undertexterna (VTT och SRT) finns när videon har en publicerad undertext. */
export function publishedCaptionsAvailability(project: CaptionFacts): Availability {
  return project.recording?.captions
    ? OK
    : { enabled: false, reason: t`There are no published captions. Create and approve them under Video and captions.` }
}

/** Utkastet (hela mastern i originalets tid) finns när undertexter skapats, även om de inte publicerats. */
export function captionDraftAvailability(project: CaptionFacts): Availability {
  const state = project.captionStatus?.state
  return state === 'draft' || state === 'published' ? OK : { enabled: false, reason: t`There is no caption draft.` }
}

export interface ImportHandlers {
  onImportChapters?: () => void
  /** Öppnar undertexterna (egen VTT-fil eller automatiska). */
  onOpenCaptions?: () => void
  /** Uppladdning av video direkt i dialogen (inne i projektet). blockedReason: varför det inte går just nu. */
  upload?: { blockedReason: string | null; replacing: boolean; onUploaded: () => void }
}

/** Import görs inne i projektet (kapitel, undertexter, video); från projektlistan visas en väg dit i stället. */
export function importAvailability(handlers: ImportHandlers): { chapters: Availability; captions: Availability; upload: Availability } {
  const inProject = (has: boolean): Availability => (has ? OK : { enabled: false, reason: t`Done inside the project.` })
  return {
    chapters: inProject(Boolean(handlers.onImportChapters)),
    captions: inProject(Boolean(handlers.onOpenCaptions)),
    upload: !handlers.upload ? inProject(false) : handlers.upload.blockedReason ? { enabled: false, reason: handlers.upload.blockedReason } : OK,
  }
}

export function copiedMessage(count: number): string {
  return plural(count, { one: '# chapter was copied. Paste it into the video description on YouTube.', other: '# chapters were copied. Paste them into the video description on YouTube.' })
}

export function savedMessage(fileName: string): string {
  return t`Saved as "${fileName}". The file is among your downloaded files.`
}
