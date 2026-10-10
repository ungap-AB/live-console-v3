// UNG-235: ren logik för kapitelraderna i trimvyn (notis, Flytta hit, Ångra). Testas utan DOM.
import { formatHms } from '../../app/time.ts'

export type ChapterNote = 'removed' | 'moved' | ''

/** Notisen på en kapitelrad: tas bort (utanför trimmen) går före flyttad (rättad mot sparad tid). */
export function chapterNote(time: number, originalTime: number | undefined, start: number, end: number): ChapterNote {
  if (time < start || time > end) return 'removed'
  if (originalTime !== undefined && originalTime !== time) return 'moved'
  return ''
}

export function chapterNoteText(note: ChapterNote): string {
  if (note === 'removed') return 'tas bort'
  if (note === 'moved') return 'flyttad'
  return ''
}

/** En flytt av ett kapitel som kan ångras. from = tiden före, to = tiden efter. */
export interface ChapterMove {
  chapterId: string
  label: string
  from: number
  to: number
}

export function moveMessage(move: ChapterMove): string {
  return `Kapitlet “${move.label}” flyttades till ${formatHms(move.to)}.`
}

/** Flytta hit är meningslöst när kapitlet redan ligger på positionen (hela sekunder). */
export function canMoveHere(time: number, position: number): boolean {
  return Math.round(position) !== time
}
