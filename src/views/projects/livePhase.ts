import type { ChipTone } from '../../components/StatusChip'
import type { LivePhase } from '../../data/types'

// signalInterruptedDeclined har ingen egen UI-hantering än — v3 saknar en
// explicit "avböj återanslutning"-endpoint som skulle sätta den, så den
// visas som samma "väntar"-läge som waitingForStream tills vidare.
const META: Record<LivePhase, { label: string; tone: ChipTone }> = {
  waitingForStream: { label: 'Väntar på signal', tone: 'neutral' },
  signalInterruptedDeclined: { label: 'Väntar på signal', tone: 'neutral' },
  live: { label: 'Sänder', tone: 'live' },
  signalInterrupted: { label: 'Signalavbrott', tone: 'warn' },
  streamEnded: { label: 'Sändning avslutad', tone: 'danger' },
}

export function phaseMeta(phase: LivePhase | undefined): { label: string; tone: ChipTone } {
  return phase ? META[phase] : META.waitingForStream
}
