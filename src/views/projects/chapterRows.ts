// UNG-228: kapitel i undertextredigerarens lista. Kapitel (punkter och personer) läggs som egna rader mellan replikraderna, i tidsordning.
// Ren logik (testas utan DOM).
import { mixedLayout, type LayoutEntry, type RowLayout } from './rowLayout.ts'

/** Ett kapitel med position i videon (originalets tidslinje), som det visas i editorn. */
export interface EditorChapter {
  id: string
  kind: string
  label: string
  time: number
}

export type ListRow = { kind: 'cue'; index: number } | { kind: 'chapter'; chapter: EditorChapter }

/** Strukturell form av serverns kapitel: bara det editorn behöver. */
export interface ChapterInput {
  chapterId: string
  kind: string
  label: string
  offsetSeconds: number
  timing?: 'positioned' | 'clock' | 'untimed'
  synced?: boolean
  readOnly?: boolean
}

/**
 * Kapitlen som har en egen plats på tidslinjen, sorterade på tid. Är listan skrivskyddad (historiklistan utan HLS-tid, alla på noll)
 * eller saknar kapitlet position (utan tid, klockslag som ännu inte förankrats) visas det inte här.
 */
export function positionedChapters(chapters: readonly ChapterInput[]): EditorChapter[] {
  if (chapters.some((chapter) => chapter.readOnly)) return []
  return chapters
    .filter((chapter) => chapter.synced !== false && (chapter.timing === undefined || chapter.timing === 'positioned'))
    .map((chapter) => ({ id: chapter.chapterId, kind: chapter.kind, label: chapter.label, time: chapter.offsetSeconds }))
    .sort((a, b) => a.time - b.time)
}

/**
 * Raderna i listan: replikerna i sin ordning med kapitlen invävda. Ett kapitel hamnar före första repliken som startar efter (eller
 * samtidigt med) kapitlets tid; kapitel efter sista repliken kommer sist. Replikerna behåller sin ordning även om den är oordnad
 * under redigering.
 */
export function mergeRows(cues: readonly { start: number }[], chapters: readonly EditorChapter[]): ListRow[] {
  const rows: ListRow[] = []
  let next = 0
  cues.forEach((cue, index) => {
    while (next < chapters.length && chapters[next].time <= cue.start) {
      rows.push({ kind: 'chapter', chapter: chapters[next] })
      next += 1
    }
    rows.push({ kind: 'cue', index })
  })
  while (next < chapters.length) {
    rows.push({ kind: 'chapter', chapter: chapters[next] })
    next += 1
  }
  return rows
}

/** Layouten för raderna: repliker i sin höjd, kapitel enkelradiga. Ett kapitels ankartid är dess tid (start = slut). */
export function chapterLayout(
  cues: readonly { start: number; end: number }[],
  rows: readonly ListRow[],
  cueHeight: number,
  chapterHeight: number,
): RowLayout {
  const entries: LayoutEntry[] = rows.map((row) =>
    row.kind === 'cue'
      ? { kind: 'cue', height: cueHeight, start: cues[row.index].start, end: cues[row.index].end }
      : { kind: 'chapter', height: chapterHeight, start: row.chapter.time, end: row.chapter.time },
  )
  return mixedLayout(entries)
}

/** Punkten och personen som pågår vid en tid: senaste punkten, och senaste personen efter den. Kapitel är sorterade på tid. */
export function currentChapters(chapters: readonly EditorChapter[], time: number): { agenda: EditorChapter | null; person: EditorChapter | null } {
  let agenda: EditorChapter | null = null
  let person: EditorChapter | null = null
  for (const chapter of chapters) {
    if (chapter.time > time) break
    if (chapter.kind === 'agendaItem') {
      agenda = chapter
      person = null
    } else if (chapter.kind === 'person') {
      person = chapter
    }
  }
  return { agenda, person }
}

/** Typ som kort text på raden. */
export function chapterKindText(kind: string): string {
  switch (kind) {
    case 'agendaItem':
      return 'Punkt'
    case 'person':
      return 'Person'
    case 'exclamation':
      return 'Utrop'
    case 'pauseIn':
    case 'pauseOut':
      return 'Paus'
    default:
      return ''
  }
}

// ---- UNG-229: redigering av kapitel i editorn ----

/** Ett kapitel som skapats i editorn och ännu inte sparats har ett temporärt id. */
export const NEW_CHAPTER_PREFIX = 'new-'

export function isNewChapter(id: string): boolean {
  return id.startsWith(NEW_CHAPTER_PREFIX)
}

/** Tid i hela sekunder, aldrig före noll. */
function wholeSeconds(time: number): number {
  return Math.max(0, Math.round(time))
}

/** Sorterade på tid; lika tid behåller sin inbördes ordning. */
export function sortChapters(list: readonly EditorChapter[]): EditorChapter[] {
  return list.map((chapter, order) => ({ chapter, order })).sort((a, b) => a.chapter.time - b.chapter.time || a.order - b.order).map((item) => item.chapter)
}

export function setChapterTime(list: readonly EditorChapter[], id: string, time: number): EditorChapter[] {
  return sortChapters(list.map((chapter) => (chapter.id === id ? { ...chapter, time: wholeSeconds(time) } : chapter)))
}

export function renameChapter(list: readonly EditorChapter[], id: string, label: string): EditorChapter[] {
  return list.map((chapter) => (chapter.id === id ? { ...chapter, label } : chapter))
}

export function removeChapter(list: readonly EditorChapter[], id: string): EditorChapter[] {
  return list.filter((chapter) => chapter.id !== id)
}

export function addChapter(list: readonly EditorChapter[], chapter: EditorChapter): EditorChapter[] {
  return sortChapters([...list, { ...chapter, time: wholeSeconds(chapter.time) }])
}

export interface ChapterChanges {
  /** Sparade kapitel som tagits bort. */
  removed: string[]
  /** Sparade kapitel med ny tid och/eller ny text. Bara de fält som ändrats är satta. */
  changed: { id: string; label?: string; time?: number }[]
  /** Nya kapitel (temporärt id). */
  added: EditorChapter[]
}

/**
 * Vad som skiljer arbetskopian från det sparade. Ett kapitel som finns i det sparade men inte i arbetskopian är borttaget, och ett
 * i arbetskopian som inte finns i det sparade är nytt (även ett med riktigt id som servern fått under tiden, så en ny sparning rättar till).
 */
export function diffChapters(saved: readonly EditorChapter[], current: readonly EditorChapter[]): ChapterChanges {
  const savedById = new Map(saved.map((chapter) => [chapter.id, chapter]))
  const currentIds = new Set(current.map((chapter) => chapter.id))
  const changes: ChapterChanges = { removed: [], changed: [], added: [] }
  for (const chapter of saved) if (!currentIds.has(chapter.id)) changes.removed.push(chapter.id)
  for (const chapter of current) {
    const before = savedById.get(chapter.id)
    if (!before) {
      changes.added.push(chapter)
      continue
    }
    const label = before.label !== chapter.label ? chapter.label : undefined
    const time = before.time !== chapter.time ? chapter.time : undefined
    if (label !== undefined || time !== undefined) {
      changes.changed.push({ id: chapter.id, ...(label !== undefined ? { label } : {}), ...(time !== undefined ? { time } : {}) })
    }
  }
  return changes
}

export function changeCount(changes: ChapterChanges): number {
  return changes.removed.length + changes.changed.length + changes.added.length
}
