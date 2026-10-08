import type { Chapter, CueKind, Project, Recording } from '../../data/types'

// UNG-193: export av kapitel. Presenters interna kapitelmodell är den kanoniska; formaten nedan (WebVTT, ungap JSON) är bara serialiserare. Allt här är
// rena funktioner. Tiderna räknas från den PUBLICERADE videons start: kapitlen ligger i originalets tid, så trimstarten dras av.

export interface VideoWindow {
  /** Var den publicerade videon börjar i originalets tid (0 för en otrimmad video). */
  startOffsetSeconds: number
  /** Den publicerade videons längd. */
  durationSeconds: number
}

export interface ExportChapter {
  id: string
  kind: 'agendaItem' | 'person' | 'exclamation'
  title: string
  /** Sekunder från den publicerade videons start. */
  start: number
  /** Nästa kapitels start, eller videons slut för det sista. */
  end: number
}

export interface ChapterExportOptions {
  /** Ta med talare och utrop som egna kapitel. Av som standard: kapitel ska vara en grov indelning. */
  includeSpeakers?: boolean
}

/** Den publicerade videons fönster i originalets tid: en trimmad version börjar vid trimstarten, en otrimmad vid 0. */
export function videoWindowOf(recording: Pick<Recording, 'kind' | 'durationSeconds' | 'trimRange'>): VideoWindow {
  if (recording.kind === 'trimmed' && recording.trimRange) {
    return {
      startOffsetSeconds: recording.trimRange.startOffsetSeconds,
      durationSeconds: Math.max(0, recording.trimRange.endOffsetSeconds - recording.trimRange.startOffsetSeconds),
    }
  }
  return { startOffsetSeconds: 0, durationSeconds: recording.durationSeconds }
}

/** Kapitel går att exportera när sändningen är avslutad (After eller Ondemand) och videon är klar. */
export function canExportChapters(project: Pick<Project, 'publicMode' | 'recording'>): boolean {
  const state = project.recording?.state
  return (project.publicMode === 'after' || project.publicMode === 'ondemand')
    && Boolean(project.recording?.id) && (state === 'recorded' || state === 'trimmed' || state === 'published')
}

const EXPORT_KINDS: readonly CueKind[] = ['agendaItem', 'person', 'exclamation']
const CLEARED_LABEL = 'Rensat'

function cleanTitle(label: string): string {
  return label.replace(/\s+/g, ' ').trim()
}

/**
 * Kapitlen som ska exporteras, i den publicerade videons tid. Kapitel utan känd position, rensningar och pauser tas inte med. Det
 * kapitel som var aktivt när videon börjar (men startade före trimstarten) flyttas till 0, så listan börjar där videon börjar.
 */
export function buildExportChapters(chapters: readonly Chapter[], window: VideoWindow, options: ChapterExportOptions = {}): ExportChapter[] {
  const includeSpeakers = options.includeSpeakers === true
  const candidates = chapters
    .filter((chapter) => EXPORT_KINDS.includes(chapter.kind))
    .filter((chapter) => chapter.kind === 'agendaItem' || includeSpeakers)
    .filter((chapter) => chapter.synced !== false && chapter.timing !== 'untimed' && Number.isFinite(chapter.offsetSeconds))
    .map((chapter) => ({ chapter, title: cleanTitle(chapter.label), start: chapter.offsetSeconds - window.startOffsetSeconds }))
    .filter((entry) => entry.title.length > 0 && entry.title !== CLEARED_LABEL)
    .sort((left, right) => left.start - right.start)

  // Det som redan pågick när videon börjar: ett kapitel per sort räknas (punkt, talare), det sista före starten.
  const result: { chapter: Chapter; title: string; start: number }[] = []
  const lastBefore = new Map<string, { chapter: Chapter; title: string; start: number }>()
  for (const entry of candidates) {
    if (entry.start < 0) {
      lastBefore.set(entry.chapter.kind === 'agendaItem' ? 'agenda' : 'speaker', entry)
      continue
    }
    if (entry.start >= window.durationSeconds) continue
    result.push(entry)
  }
  const carried = [...lastBefore.values()]
    .filter((entry) => !result.some((other) => other.chapter.kind === entry.chapter.kind && other.start < 1))
    .map((entry) => ({ ...entry, start: 0 }))
  const all = [...carried, ...result].sort((left, right) => left.start - right.start)

  return all.map((entry, index) => ({
    id: entry.chapter.chapterId,
    kind: entry.chapter.kind as ExportChapter['kind'],
    title: entry.title,
    start: Math.max(0, entry.start),
    end: all[index + 1]?.start ?? window.durationSeconds,
  }))
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

// ---- WebVTT-kapitel ----------------------------------------------------------

function vttTime(totalSeconds: number): string {
  const millis = Math.max(0, Math.round(totalSeconds * 1000))
  const hours = Math.floor(millis / 3_600_000)
  const minutes = Math.floor((millis % 3_600_000) / 60_000)
  const seconds = Math.floor((millis % 60_000) / 1000)
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis % 1000, 3)}`
}

// Cue-text får inte innehålla "-->" och tolkar < och & som markering.
function vttText(title: string): string {
  return title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/-->/g, '–>')
}

/** WebVTT Chapters: samma filformat som undertexter, men med kapitel (tidsintervall och titel) som innehåll. */
export function toWebVttChapters(chapters: readonly ExportChapter[]): string {
  const cues = chapters
    .filter((chapter) => chapter.end > chapter.start)
    .map((chapter) => `${vttTime(chapter.start)} --> ${vttTime(chapter.end)}\n${vttText(chapter.title)}`)
  return `WEBVTT\n\n${cues.join('\n\n')}${cues.length > 0 ? '\n' : ''}`
}

// ---- ungap Chapters (.json) -----------------------------------------------------

export const UNGAP_CHAPTERS_VERSION = 1

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

/**
 * Presenters eget, versionssatta format: alla sorters kapitel (punkt, talare, utrop) med sin sort, så att det går att läsa in igen och
 * kan utökas. Pauser tas inte med i version 1.
 */
export function toUngapChaptersJson(chapters: readonly ExportChapter[], meta: { title: string; durationSeconds: number }): string {
  return JSON.stringify(
    {
      version: UNGAP_CHAPTERS_VERSION,
      title: meta.title,
      durationSeconds: round(meta.durationSeconds),
      chapters: chapters.map((chapter) => ({
        id: chapter.id,
        kind: chapter.kind,
        start: round(chapter.start),
        end: round(chapter.end),
        title: chapter.title,
      })),
    },
    null,
    2,
  ) + '\n'
}

/** Filnamn som fungerar överallt: utan snedstreck, kolon och andra tecken som operativsystemen inte tål. */
export function exportFileName(projectName: string, suffix: string, extension: string): string {
  const base = projectName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() || 'projekt'
  return `${base} - ${suffix}.${extension}`
}
