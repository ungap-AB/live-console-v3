// UNG-233: ren logik för trimbalken (tidslinjen med två dragbara balkar för början och slutet). Testas utan DOM.
import { formatHms } from '../app/time.ts'

/** Minsta längd som får bli kvar när man flyttar en balk (sekunder). */
export const DEFAULT_MIN_KEEP_SECONDS = 10
/** Hur många sekunder före slutet den runda spelknappen under slutbalken börjar spela. */
export const PLAY_END_SECONDS = 8

export type Handle = 'start' | 'end'

export interface TrimRange {
  start: number
  end: number
}

/** Ny starttid: heltal, inte under noll och minst minKeep sekunder före slutet. */
export function clampStart(value: number, end: number, duration: number, minKeep = DEFAULT_MIN_KEEP_SECONDS): number {
  const limit = Math.max(0, Math.min(end, duration) - minKeep)
  return Math.min(limit, Math.max(0, Math.round(value)))
}

/** Ny sluttid: heltal, inte efter videons slut och minst minKeep sekunder efter början. */
export function clampEnd(value: number, start: number, duration: number, minKeep = DEFAULT_MIN_KEEP_SECONDS): number {
  const lowest = Math.min(duration, Math.max(0, start) + minKeep)
  return Math.max(lowest, Math.min(duration, Math.round(value)))
}

/** Flyttar en balk till en tid och lämnar den andra orörd. */
export function moveHandle(handle: Handle, time: number, range: TrimRange, duration: number, minKeep = DEFAULT_MIN_KEEP_SECONDS): TrimRange {
  return handle === 'start'
    ? { start: clampStart(time, range.end, duration, minKeep), end: range.end }
    : { start: range.start, end: clampEnd(time, range.start, duration, minKeep) }
}

/** Andel (0–1) av videons längd. */
export function fraction(time: number, duration: number): number {
  if (!(duration > 0)) return 0
  return Math.min(1, Math.max(0, time / duration))
}

/**
 * Tiden vid en pekarposition över spåret. inset = pixlar i vardera änden som balkens bredd tar (så att en balk vid noll och vid slutet
 * ligger helt inne i spåret).
 */
export function pointerTime(clientX: number, left: number, width: number, duration: number, inset = 0): number {
  const inner = Math.max(1, width - 2 * inset)
  const value = (clientX - left - inset) / inner
  return Math.min(1, Math.max(0, value)) * duration
}

/** Balken som ett tryck på spåret tar tag i: den närmaste. Utanför det som behålls gäller kanten, vid lika avstånd början. */
export function nearestHandle(time: number, start: number, end: number): Handle {
  if (time <= start) return 'start'
  if (time >= end) return 'end'
  return time - start <= end - time ? 'start' : 'end'
}

/** Pil höger/upp = framåt, vänster/ner = bakåt, ett steg per tryck (1 s, Skift 10 s). PageUp/PageDown flyttar alltid 10 s. Annars null. */
export function keyDelta(key: string, shiftKey: boolean): number | null {
  const step = shiftKey ? 10 : 1
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return step
    case 'ArrowLeft':
    case 'ArrowDown':
      return -step
    case 'PageUp':
      return 10
    case 'PageDown':
      return -10
    default:
      return null
  }
}

/** Där den runda spelknappen vid slutet börjar: de sista sekunderna före slutet, aldrig före början. */
export function playEndFrom(start: number, end: number, seconds = PLAY_END_SECONDS): number {
  return Math.max(start, end - seconds)
}

/** Ligger tiden utanför det som behålls (kapitel och spelhuvud tonas ned där). */
export function isOutside(time: number, start: number, end: number): boolean {
  return time < start || time > end
}

export function handleLabel(handle: Handle): string {
  return handle === 'start' ? 'Början' : 'Slutet'
}

/** Text för skärmläsare: "Början 00:03:12". */
export function handleValueText(handle: Handle, seconds: number): string {
  return `${handleLabel(handle)} ${formatHms(seconds)}`
}
