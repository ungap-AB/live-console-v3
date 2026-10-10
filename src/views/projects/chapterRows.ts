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
