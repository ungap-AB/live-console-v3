import { t } from '@lingui/core/macro'
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
  // Live utan ingest går inte att sända: varning i rött (UI-finslipning efter prod-prov 2026-10-13).
  if (!input.hasChannel) return { label: t`No ingest`, tone: input.publicMode === 'live' ? 'danger' : 'neutral' }
  if (input.publicMode === 'after' && (phase === 'live' || phase === 'waitingforstream' || healthLive)) return { label: t`Waiting for the encoder to stop`, tone: 'warn' }
  if (phase === 'live' || healthLive) return { label: t`Signal OK`, tone: 'ok' }
  if (phase === 'signalinterrupted' || phase === 'signalinterrupteddeclined') return { label: t`Signal interrupted`, tone: 'danger' }
  if (input.publicMode === 'after' && phase === 'waitingforstream') return { label: t`Waiting for the encoder to stop`, tone: 'warn' }
  if (phase === 'streamended') return { label: t`The broadcast has ended`, tone: 'ended' }
  if (input.publicMode === 'ondemand') return { label: t`No signal`, tone: 'warn' }
  return { label: t`Waiting for signal`, tone: 'warn' }
}

/** UNG-22: bara medan strömmen är live och IVS har gett en siffra. */
export function viewerCountOf(health: { state?: string | null; viewerCount?: number | null } | null | undefined): number | null {
  return health?.state?.toLowerCase() === 'live' && typeof health.viewerCount === 'number' ? health.viewerCount : null
}
