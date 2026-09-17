import type { LivePhase, Project, RecordingState } from '../../data/types'

export type GuidedPhase = 'prepare' | 'waiting' | 'live' | 'processing' | 'ended' | 'readyToPublish' | 'published'

// Härledd, inte lagrad — ingen ny backend-data behövs. Se plan-diskussionen
// (2026-09-16): Playout ska vara ett fasmedvetet guidat flöde för själva
// sändningsdagen, med en dominant CTA per fas.
export function resolveGuidedPhase(p: Project, phase: LivePhase | undefined, rec: RecordingState): GuidedPhase {
  if (p.publication.state === 'published') return 'published'
  if (rec === 'trimmed') return 'readyToPublish'
  if (phase === 'streamEnded' && rec === 'processing') return 'processing'
  if (phase === 'streamEnded' && rec === 'recorded') return 'ended'
  if (phase === 'live') return 'live'
  if (!p.channel) return 'prepare'
  // Ingest finns, väntar på (åter)anslutning — signalInterrupted visas som en
  // varningsbanner inom det här läget, inte som en egen fas.
  return 'waiting'
}
