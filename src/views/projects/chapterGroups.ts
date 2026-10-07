// UNG-103: kapitellistan är platt (punkt, talare, talare, punkt, …). Här grupperas den så att talarna kan fällas ihop under sin
// punkt. En punkt (agendaItem) är gruppens rubrik; talare och utrop efter den hör till den, tills nästa punkt kommer. Kapitel före
// första punkten tillhör ingen grupp och visas alltid. Pausmarkörer (pauseIn/pauseOut) står för sig och visas alltid.

export interface GroupableChapter {
  chapterId: string
  kind: string
}

export interface ChapterGroupInfo {
  /** chapterId för gruppens rubrik (punkten), eller null för kapitel före första punkten. */
  groupId: string | null
  isHeader: boolean
  /** Antal kapitel under rubriken (bara satt på rubriken). */
  childCount: number
}

export function chapterGroupInfo(chapters: GroupableChapter[]): ChapterGroupInfo[] {
  const info: ChapterGroupInfo[] = []
  let current: number | null = null
  chapters.forEach((chapter, index) => {
    // Pausmarkörer (UNG-119) hör inte till någon punkt och bryter inte gruppen: talarna efter en paus hör fortfarande till punkten före.
    if (chapter.kind === 'pauseIn' || chapter.kind === 'pauseOut') {
      info.push({ groupId: null, isHeader: false, childCount: 0 })
    } else if (chapter.kind === 'agendaItem') {
      current = index
      info.push({ groupId: chapter.chapterId, isHeader: true, childCount: 0 })
    } else if (current === null) {
      info.push({ groupId: null, isHeader: false, childCount: 0 })
    } else {
      info.push({ groupId: chapters[current].chapterId, isHeader: false, childCount: 0 })
      info[current].childCount += 1
    }
  })
  return info
}

/**
 * Vilka kapitel som visas. Rubriker och kapitel utanför grupper visas alltid. Ett kapitel i en hopfälld grupp döljs, utom när
 * något i gruppen måste synas (valt kapitel, förankring, redigering): då fälls hela gruppen ut.
 */
export function visibleChapters(chapters: GroupableChapter[], collapsed: ReadonlySet<string>, keepOpen: readonly (string | null | undefined)[]): boolean[] {
  const info = chapterGroupInfo(chapters)
  const forced = new Set<string>()
  chapters.forEach((chapter, index) => {
    const groupId = info[index].groupId
    if (groupId && keepOpen.includes(chapter.chapterId)) forced.add(groupId)
  })
  return info.map((entry) => entry.isHeader || entry.groupId === null || !collapsed.has(entry.groupId) || forced.has(entry.groupId))
}

/** Alla rubriker som har något under sig — det som går att fälla ihop. */
export function collapsibleGroupIds(chapters: GroupableChapter[]): string[] {
  const info = chapterGroupInfo(chapters)
  return chapters.filter((_, index) => info[index].isHeader && info[index].childCount > 0).map((chapter) => chapter.chapterId)
}
