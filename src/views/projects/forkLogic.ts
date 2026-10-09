import type { Project, TimelineEvent } from '../../data/types'
import { isOperatorSupplied } from './recordingSource.ts'

// UNG-198: skapa ett ondemand-projekt ur en sändning. Ren logik: varifrån ett fork kan göras, vilka "från"-förslag som finns, och texterna.

export type ForkSource = 'live' | 'recording'

/** live = den pågående sändningen, recording = projektets färdiga inspelning (ej uppladdad eller extern video), null = går inte. */
export function forkSource(project: Pick<Project, 'publicMode' | 'recording'>, livePhase: string | undefined): ForkSource | null {
  if (project.publicMode === 'live') return livePhase?.toLowerCase() === 'live' ? 'live' : null
  if (project.publicMode !== 'after' && project.publicMode !== 'ondemand') return null
  const state = project.recording?.state
  const ready = state === 'recorded' || state === 'trimmed' || state === 'published'
  return ready && !isOperatorSupplied(project.recording?.source) ? 'recording' : null
}

export interface ForkFromOption {
  key: string
  label: string
  /** ISO-tid att skicka som fromUtc, eller null för "från början". */
  fromUtc: string | null
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

/** "Från början" och två förslag ur tidslinjen: efter senaste pausen och från senaste dagordningspunkten. */
export function forkFromOptions(timeline: readonly TimelineEvent[]): ForkFromOption[] {
  const options: ForkFromOption[] = [{ key: 'start', label: 'Från början av sändningen', fromUtc: null }]
  const byTime = [...timeline].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
  const pauseOut = [...byTime].reverse().find((event) => event.kind === 'pauseOut')
  if (pauseOut) options.push({ key: 'pause', label: `Efter senaste pausen (${clock(pauseOut.occurredAt)})`, fromUtc: pauseOut.occurredAt })
  const agenda = [...byTime].reverse().find((event) => event.kind === 'agendaItem' && event.refId !== null && event.label !== 'Rensat')
  if (agenda) options.push({ key: 'agenda', label: `Från senaste punkten: ${agenda.label} (${clock(agenda.occurredAt)})`, fromUtc: agenda.occurredAt })
  return options
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Klockslaget (hh:mm, lokal tid) som en tidväljare visar för en ISO-tid. */
export function clockValue(iso: string): string {
  const date = new Date(iso)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Gör ett klockslag (hh:mm, lokal tid) från tidväljaren till en tid inom fönstret: den första dag i fönstret där klockslaget ligger i det.
 * Ett klockslag som ligger mindre än en minut utanför kanten räknas som kanten (tidväljaren har bara hela minuter).
 */
export function timeInWindow(hhmm: string, window: { startUtc: string; endUtc: string }): { iso: string } | { error: string } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  const hours = match ? Number(match[1]) : NaN
  const minutes = match ? Number(match[2]) : NaN
  if (!match || hours > 23 || minutes > 59) return { error: 'Ange en tid som hh:mm.' }
  const start = new Date(window.startUtc)
  const end = new Date(window.endUtc)
  for (let day = 0; day <= 31; day++) {
    const candidate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day, hours, minutes)
    if (candidate.getTime() > end.getTime() + 60_000) break
    if (candidate.getTime() >= start.getTime() - 60_000 && candidate.getTime() <= end.getTime() + 60_000) {
      const clamped = new Date(Math.min(Math.max(candidate.getTime(), start.getTime()), end.getTime()))
      return { iso: clamped.toISOString() }
    }
  }
  return { error: `Tiden ligger utanför det som finns att välja (${clockValue(window.startUtc)}–${clockValue(window.endUtc)}).` }
}

export function forkWarningText(warnings: readonly { code: string; message: string }[]): string {
  return warnings.map((warning) => warning.message).join(' ')
}
