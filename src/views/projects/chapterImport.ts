import type { ChapterImportItem } from '../../data/types'

// En rad per kapitel, med valfri tidsangivelse först på raden:
// "00:12:34 Punkt 3", "[14:03:12] Punkt 3", "12:34 - Punkt 3" (tab- och bindestrecksseparerat går också).
export interface ParsedChapterLine {
  /** [t, m] eller [t, m, s] — tolkas först när operatören valt tidsbas. */
  time: number[] | null
  text: string
}

export type TimeMode = 'video' | 'clock'

const TIME_PREFIX = /^[[(]?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?[\])]?\s*(?:[-–—|:]\s*|\s+)?(.*)$/

export function parseChapterLines(text: string): ParsedChapterLine[] {
  const lines: ParsedChapterLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const match = TIME_PREFIX.exec(line)
    if (match && match[4].trim()) {
      const parts = [Number(match[1]), Number(match[2]), ...(match[3] !== undefined ? [Number(match[3])] : [])]
      const validMinutesAndSeconds = parts.slice(1).every((value) => value < 60)
      if (validMinutesAndSeconds) {
        lines.push({ time: parts, text: match[4].trim() })
        continue
      }
    }
    lines.push({ time: null, text: line })
  }
  return lines
}

// Förslag på tolkning — operatören kan alltid byta. Börjar listan på noll är det troligen
// positioner i videon (00:00:00, 00:12:34); annars troligen klockslag (09:00, 14:03:12).
export function guessTimeMode(lines: ParsedChapterLine[]): TimeMode | null {
  const first = lines.find((line) => line.time)?.time
  if (!first) return null
  return first[0] === 0 ? 'video' : 'clock'
}

export function toOffsetSeconds(time: number[]): number {
  return time.length === 3 ? time[0] * 3600 + time[1] * 60 + time[2] : time[0] * 60 + time[1]
}

// Klockslag på valt datum i operatörens lokala tid → UTC. Null om klockslaget inte finns (t.ex. 25:00).
export function toClockIso(time: number[], date: string): string | null {
  const [hours, minutes, seconds = 0] = time
  if (hours > 23) return null
  const pad = (value: number) => String(value).padStart(2, '0')
  const local = new Date(`${date}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`)
  return Number.isNaN(local.getTime()) ? null : local.toISOString()
}

export function buildImportItems(lines: ParsedChapterLine[], mode: TimeMode | null, date: string): ChapterImportItem[] {
  return lines.map((line) => {
    const item: ChapterImportItem = { kind: 'agendaItem', label: line.text }
    if (line.time && mode === 'video') item.offsetSeconds = toOffsetSeconds(line.time)
    else if (line.time && mode === 'clock') {
      const clockUtc = toClockIso(line.time, date)
      if (clockUtc) item.clockUtc = clockUtc
    }
    return item
  })
}
