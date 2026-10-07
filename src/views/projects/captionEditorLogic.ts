import type { CaptionCue } from '../../data/types'

/** Gräns för tecken per rad (bekräftad av operatören) och antal rader per replik. Bara varningar, aldrig spärrar. */
export const MAX_LINE_LENGTH = 42
export const MAX_LINES = 2

/** Index för repliken som visas vid tiden (listan är sorterad efter start), eller -1 mellan repliker. */
export function activeCueIndex(cues: readonly Pick<CaptionCue, 'start' | 'end'>[], time: number): number {
  let low = 0
  let high = cues.length - 1
  let candidate = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (cues[mid].start <= time) {
      candidate = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  // Överlappande repliker: gå några steg bakåt och ta den senast startade som fortfarande pågår.
  for (let index = candidate; index >= 0 && index > candidate - 6; index--) {
    if (cues[index].end > time) return index
  }
  return -1
}

export interface LineInfo {
  length: number
  tooLong: boolean
}

/** Längd per rad, för teckenräknaren ("34/42"). */
export function lineInfo(text: string): LineInfo[] {
  return text.split('\n').map((line) => ({ length: line.length, tooLong: line.length > MAX_LINE_LENGTH }))
}

export function hasLineWarning(text: string): boolean {
  const lines = lineInfo(text)
  return lines.length > MAX_LINES || lines.some((line) => line.tooLong)
}

/** Fönster att rendera i en lång lista med fast radhöjd (virtualisering). Last är exklusivt. */
export function windowRange(scrollTop: number, viewportHeight: number, rowHeight: number, total: number, overscan = 6): { first: number; last: number } {
  if (total <= 0 || rowHeight <= 0) return { first: 0, last: 0 }
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const last = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
  return { first: Math.min(first, total), last: Math.max(last, Math.min(first, total)) }
}

/** Scrollposition som gör rad index synlig (eller samma som idag om den redan syns). */
export function scrollToReveal(index: number, scrollTop: number, viewportHeight: number, rowHeight: number): number {
  const top = index * rowHeight
  const bottom = top + rowHeight
  if (top < scrollTop) return top
  if (bottom > scrollTop + viewportHeight) return Math.max(0, bottom - viewportHeight)
  return scrollTop
}

/** Index på rader vars text skiljer sig från den sparade. */
export function changedIndexes(saved: readonly string[], current: readonly string[]): number[] {
  const changed: number[] = []
  for (let index = 0; index < current.length; index++) {
    if (current[index] !== saved[index]) changed.push(index)
  }
  return changed
}

export type RangeStatus = 'inside' | 'outside' | 'edge'

/** Hur en replik förhåller sig till den publicerade delen (trimmen). Utan intervall räknas allt som inuti. */
export function rangeStatus(cue: Pick<CaptionCue, 'start' | 'end'>, publishedStart?: number, publishedEnd?: number): RangeStatus {
  if (publishedStart === undefined || publishedEnd === undefined) return 'inside'
  if (cue.end <= publishedStart || cue.start >= publishedEnd) return 'outside'
  if (cue.start < publishedStart || cue.end > publishedEnd) return 'edge'
  return 'inside'
}

/** Tid som hh:mm:ss (hel sekund, avrundad nedåt), för listans kolumner. Interna tider behåller millisekunder. */
export function formatCueTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds + 1e-9))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total / 60) % 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
}

/** Det som skickas till servern: bara tid och text, i listans ordning. */
export function savePayload(cues: readonly Pick<CaptionCue, 'start' | 'end' | 'text'>[]): { start: number; end: number; text: string }[] {
  return cues.map(({ start, end, text }) => ({ start, end, text }))
}

/** Radbrytning för "Enter" i en replik: tillåts bara om texten har färre än två rader. */
export function canInsertLineBreak(text: string): boolean {
  return text.split('\n').length < MAX_LINES
}
