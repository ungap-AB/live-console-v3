import type { WordImportConflict, WordImportResult, WordImportWarning } from '../../data/types'
import type { EditCue } from './captionEditOps'

// UNG-147: granskning av rättningar inlästa från Word. Förslaget från servern läggs in som osparade redigeringar (samma mekanism som
// vanliga redigeringar), och det här är den rena logiken runt det: vilka rader som är ändrade (Tab hoppar mellan dem), vilka som är
// låsta, vilka konflikter som återstår och rubriken i granskningsfältet.

export interface WordReview {
  baseVersion: number
  currentVersion: number
  baseVerified: boolean | undefined
  warnings: WordImportWarning[]
  summary: WordImportResult['summary']
  /** Id på rader som ändrats i Word: ändrade, nya och borttagna (tömda). */
  changedIds: Set<number>
  /** Rader som tömts av Word (texten togs bort). De följer med som tomma rader tills de lämnas tomma vid sparning. */
  removedIds: Set<number>
  /** Texten före rättningen, per rad-id. */
  before: Map<number, string>
  flags: Map<number, string[]>
  conflicts: Map<number, WordImportConflict[]>
  /** Låsta rader som operatören låst upp. */
  unlocked: Set<number>
  /** Konflikter som operatören markerat som lösta, nyckel `${id}:${index}`. */
  resolved: Set<string>
}

export interface BuiltReview {
  cues: EditCue[]
  review: WordReview
}

/** Gör serverns förslag till redigerarens radlista (nya rutor får tillfälliga id) och granskningsläget. */
export function buildReview(result: WordImportResult, newId: () => number): BuiltReview {
  const entries: { key: number; order: number; cue: EditCue }[] = []
  const changedIds = new Set<number>()
  const removedIds = new Set<number>()
  const before = new Map<number, string>()
  const flags = new Map<number, string[]>()

  result.cues.forEach((cue, position) => {
    const id = cue.state === 'added' ? newId() : cue.id
    entries.push({ key: cue.id, order: position, cue: { id, start: cue.start, end: cue.end, text: cue.text } })
    if (cue.state !== 'unchanged') changedIds.add(id)
    if (cue.before !== undefined) before.set(id, cue.before)
    if (cue.flags.length > 0) flags.set(id, [...cue.flags])
  })
  result.removed.forEach((cue, position) => {
    entries.push({ key: cue.id, order: result.cues.length + position, cue: { id: cue.id, start: cue.start, end: cue.end, text: '' } })
    changedIds.add(cue.id)
    removedIds.add(cue.id)
    before.set(cue.id, cue.text)
  })
  // Samma ordning som mastern: efter ursprungsreplik, och en delad rutas delar direkt efter den första.
  entries.sort((a, b) => a.key - b.key || a.order - b.order)

  const conflicts = new Map<number, WordImportConflict[]>()
  for (const conflict of result.conflicts) conflicts.set(conflict.id, [...(conflicts.get(conflict.id) ?? []), conflict])

  return {
    cues: entries.map((entry) => entry.cue),
    review: {
      baseVersion: result.baseVersion,
      currentVersion: result.currentVersion,
      baseVerified: result.baseVerified,
      warnings: result.warnings,
      summary: result.summary,
      changedIds,
      removedIds,
      before,
      flags,
      conflicts,
      unlocked: new Set(),
      resolved: new Set(),
    },
  }
}

export const conflictKey = (id: number, index: number) => `${id}:${index}`

/** Konflikter på en rad som ännu inte markerats som lösta. */
export function openConflicts(review: WordReview, id: number): WordImportConflict[] {
  return (review.conflicts.get(id) ?? []).filter((_, index) => !review.resolved.has(conflictKey(id, index)))
}

export function openConflictCount(review: WordReview): number {
  let count = 0
  for (const id of review.conflicts.keys()) count += openConflicts(review, id).length
  return count
}

/** En rad är låst om den inte ändrats i Word och inte har en olöst konflikt, tills operatören låst upp den. */
export function isLocked(review: WordReview, id: number): boolean {
  return !review.changedIds.has(id) && openConflicts(review, id).length === 0 && !review.unlocked.has(id)
}

/** Index på rader som ska granskas: ändrade i Word, eller med olöst konflikt. Tab hoppar mellan dessa. */
export function reviewIndexes(cues: readonly Pick<EditCue, 'id'>[], review: WordReview): number[] {
  const indexes: number[] = []
  cues.forEach((cue, index) => {
    if (review.changedIds.has(cue.id) || openConflicts(review, cue.id).length > 0) indexes.push(index)
  })
  return indexes
}

/** Nästa (eller föregående) rad att granska från origin. Null om det inte finns någon åt det hållet (då stannar man). */
export function nextReviewIndex(stops: readonly number[], origin: number, backwards: boolean): number | null {
  if (backwards) {
    for (let position = stops.length - 1; position >= 0; position--) if (stops[position] < origin) return stops[position]
    return null
  }
  for (const stop of stops) if (stop > origin) return stop
  return null
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Rubriken i granskningsfältet, t.ex. "31 ändrade rutor · 2 nya · 3 konflikter · 2 att kontrollera". */
export function reviewHeadline(review: WordReview): string {
  const { summary } = review
  const parts: string[] = []
  const changed = summary.changedCues
  parts.push(changed === 0 && summary.addedCues === 0 && summary.removedCues === 0 ? 'Inga ändrade rutor' : plural(changed, 'ändrad ruta', 'ändrade rutor'))
  if (summary.addedCues > 0) parts.push(plural(summary.addedCues, 'ny ruta', 'nya rutor'))
  if (summary.removedCues > 0) parts.push(`${plural(summary.removedCues, 'borttagen', 'borttagna')}`)
  const conflicts = openConflictCount(review)
  if (conflicts > 0) parts.push(plural(conflicts, 'konflikt', 'konflikter'))
  if (summary.checkCues > 0) parts.push(`${summary.checkCues} att kontrollera`)
  return parts.join(' · ')
}
