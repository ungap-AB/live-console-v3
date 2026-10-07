import type { TimelineEvent } from '../../data/types.ts'

// UNG-119. En paus är två händelser i tidslinjen: pauseIn (med texten som etikett) och pauseOut. Pausen pågår när den senaste
// paus-händelsen är en pauseIn. Samma regel som servern (PauseTimeline), så en optimistisk uppdatering aldrig hamnar i otakt.

export const DEFAULT_PAUSE_TEXT = 'Paus'
export const MAX_PAUSE_TEXT_LENGTH = 300

export function currentPauseFromTimeline(timeline: readonly TimelineEvent[]): TimelineEvent | null {
  const last = [...timeline].reverse().find((event) => event.kind === 'pauseIn' || event.kind === 'pauseOut')
  return last?.kind === 'pauseIn' ? last : null
}

/** Texten som skickas: trimmad, begränsad, och "Paus" om operatören lämnade den tom. */
export function normalizePauseText(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length === 0) return DEFAULT_PAUSE_TEXT
  return trimmed.length > MAX_PAUSE_TEXT_LENGTH ? trimmed.slice(0, MAX_PAUSE_TEXT_LENGTH) : trimmed
}

/** Förslag i dialogen: texten från senaste pausen, annars en standardtext. */
export function suggestedPauseText(timeline: readonly TimelineEvent[]): string {
  const last = [...timeline].reverse().find((event) => event.kind === 'pauseIn')
  return last && last.label !== DEFAULT_PAUSE_TEXT ? last.label : 'Ajournering. Sändningen fortsätter strax.'
}

/** Hur länge pausen pågått, i klartext: "just nu", "7 min", "1 h 5 min". */
export function pauseDurationText(sinceIso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(sinceIso)) / 60_000))
  if (minutes < 1) return 'nyss'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
