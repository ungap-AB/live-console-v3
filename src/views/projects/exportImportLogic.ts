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

const OK: Availability = { enabled: true }

export function chaptersExportAvailability(project: Facts): Availability {
  if (canExportChapters(project)) return OK
  if (!project.recording) return { enabled: false, reason: 'Projektet har ingen video än.' }
  if (project.recording.state === 'awaitingApproval') return { enabled: false, reason: 'Godkänn eller ignorera den uppladdade videon först.' }
  if (project.publicMode === 'before' || project.publicMode === 'live') return { enabled: false, reason: 'Kapitlen går att exportera när sändningen är avslutad.' }
  return { enabled: false, reason: 'Videon är inte klar än.' }
}

/** MP4-nedladdning: samma regler som när den låg som flik under videon (UNG-132). */
export function videoDownloadAvailability(project: Facts): Availability {
  const recording = project.recording
  if (!recording) return { enabled: false, reason: 'Det finns ingen video att ladda ner.' }
  if (recording.state === 'awaitingApproval') return { enabled: false, reason: 'Godkänn eller ignorera den uppladdade videon först.' }
  if (isExternalSource(recording.source)) {
    return { enabled: false, reason: 'Videon ligger på en extern adress och kan inte laddas ned som MP4 förrän den kopierats till ungap.' }
  }
  if (project.publicMode === 'after') return { enabled: false, reason: 'Videon går att ladda ner när den är publicerad som ondemand.' }
  if (project.publicMode !== 'ondemand') return { enabled: false, reason: 'Videon går att ladda ner när sändningen är avslutad och publicerad.' }
  const ready = recording.state === 'recorded' || recording.state === 'trimmed' || recording.state === 'published'
  return ready ? OK : { enabled: false, reason: 'Videon är inte klar än.' }
}

export interface ImportHandlers {
  onImportChapters?: () => void
  onOpenVideoActions?: (tab: 'captions' | 'upload') => void
}

/** Import görs inne i projektet (kapitel, undertexter, video); från projektlistan visas en väg dit i stället. */
export function importAvailability(handlers: ImportHandlers): { chapters: Availability; captions: Availability; upload: Availability } {
  const inProject = (has: boolean): Availability => (has ? OK : { enabled: false, reason: 'Görs inne i projektet.' })
  return {
    chapters: inProject(Boolean(handlers.onImportChapters)),
    captions: inProject(Boolean(handlers.onOpenVideoActions)),
    upload: inProject(Boolean(handlers.onOpenVideoActions)),
  }
}

export function savedMessage(fileName: string): string {
  return `Sparad som "${fileName}". Filen ligger bland dina hämtade filer.`
}
