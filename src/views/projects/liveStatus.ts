import type { PublicMode } from '../../data/types.ts'

// Signalstatus och tittarantal i projektets huvud (och i det expanderade live-läget, UNG-179). Ren logik, flyttad ut ur ProjectHeader så
// att båda ställena visar exakt samma sak.

export interface EncoderStatus {
  label: string
  tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'ended'
}

export function encoderStatusOf(input: { hasChannel: boolean; publicMode: PublicMode; livePhase?: string | null; healthState?: string | null }): EncoderStatus {
  const phase = input.livePhase?.toLowerCase()
  const healthLive = input.healthState?.toLowerCase() === 'live'
  if (!input.hasChannel) return { label: 'Ingen ingest', tone: 'neutral' }
  if (input.publicMode === 'after' && (phase === 'live' || phase === 'waitingforstream' || healthLive)) return { label: 'Väntar på att enkoder stoppar', tone: 'warn' }
  if (phase === 'live' || healthLive) return { label: 'Signal OK', tone: 'ok' }
  if (phase === 'signalinterrupted' || phase === 'signalinterrupteddeclined') return { label: 'Avbrott i signal', tone: 'danger' }
  if (input.publicMode === 'after' && phase === 'waitingforstream') return { label: 'Väntar på att enkoder stoppar', tone: 'warn' }
  if (phase === 'streamended') return { label: 'Sändningen avslutad', tone: 'ended' }
  if (input.publicMode === 'ondemand') return { label: 'Ingen signal', tone: 'warn' }
  return { label: 'Väntar på signal', tone: 'warn' }
}

/** UNG-22: bara medan strömmen är live och IVS har gett en siffra. */
export function viewerCountOf(health: { state?: string | null; viewerCount?: number | null } | null | undefined): number | null {
  return health?.state?.toLowerCase() === 'live' && typeof health.viewerCount === 'number' ? health.viewerCount : null
}
