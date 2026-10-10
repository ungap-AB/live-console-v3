// UNG-234: ren logik för videons position i trimvyn (tidsvisning, −5/+5 s, Start här / Slut här). Testas utan DOM.
import { moveHandle, type Handle, type TrimRange } from './trimBarLogic.ts'

/** Stegen i videofönstret (sekunder). */
export const NUDGE_SECONDS = 5

/** Positionen hålls inom videon. */
export function clampPosition(value: number, duration: number): number {
  return Math.min(Math.max(0, duration), Math.max(0, value))
}

export function nudgePosition(position: number, delta: number, duration: number): number {
  return clampPosition(position + delta, duration)
}

/**
 * Läser en inskriven tid: h:mm:ss, m:ss eller bara sekunder. Minuter och sekunder efter första delen ska vara 0–59. Ogiltigt eller tomt
 * ger null (inskrivningen ignoreras). Tiden hålls inom videon.
 */
export function parseTimeInput(text: string, duration: number): number | null {
  const value = text.trim()
  if (!/^\d+(:\d{1,2}){0,2}$/.test(value)) return null
  const parts = value.split(':').map(Number)
  if (parts.length > 1 && parts.slice(1).some((part) => part > 59)) return null
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return clampPosition(seconds, duration)
}

/**
 * Start här / Slut här: balken flyttas till videons position (klämd mot den andra balken och videons ändar), och videons position
 * flyttas dit balken faktiskt hamnade.
 */
export function setBoundaryHere(handle: Handle, position: number, range: TrimRange, duration: number, minKeep?: number): { range: TrimRange; seek: number } {
  const next = moveHandle(handle, position, range, duration, minKeep)
  return { range: next, seek: handle === 'start' ? next.start : next.end }
}
