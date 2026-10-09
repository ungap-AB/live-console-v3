import type { CaptionGeneration } from '../../data/types'

// UNG-205: raden "Talarbyten" i undertextpanelen. Talarbyten (diarization) används för att bryta stycke vid talarbyte i manuset (Word).
// Rena funktioner så att texterna och när knappen går att trycka på kan testas utan att rita något.

export interface SpeakersView {
  /** Raden ska synas alls: talarbyten är påslagna i miljön, eller det finns redan analyserade talarbyten att visa. */
  visible: boolean
  state: 'none' | 'analyzing' | 'ready' | 'failed'
  /** Beskrivning av läget, på en rad. */
  text: string
  /** Knappens etikett, eller null om det inte går att starta nu. */
  actionLabel: string | null
  /** Procent medan analysen pågår. */
  progress?: number
  /** Varför knappen saknas (visas som förklaring), annars null. */
  blockedReason: string | null
}

export function speakersView(generation: Pick<CaptionGeneration, 'draft' | 'job' | 'speakers' | 'speakersAvailable'>, formatDate: (iso: string) => string): SpeakersView {
  const speakers = generation.speakers
  const state = speakers?.state ?? 'none'
  const available = generation.speakersAvailable === true
  const visible = available || state === 'ready' || state === 'analyzing'
  const captionsRunning = generation.job?.state === 'processing'
  const noCaptions = !generation.draft

  if (state === 'analyzing') {
    return { visible, state, text: 'Talarbyten analyseras…', actionLabel: null, progress: speakers?.progress, blockedReason: null }
  }

  const blockedReason = noCaptions
    ? 'Skapa undertexter först.'
    : captionsRunning
      ? 'Undertexter skapas just nu.'
      : null

  if (state === 'ready') {
    const count = speakers!.turnCount
    const when = speakers!.createdAtUtc ? ` ${formatDate(speakers!.createdAtUtc)}` : ''
    return { visible, state, text: `${count.toLocaleString('sv-SE')} talarturer analyserade${when}.`, actionLabel: available ? 'Analysera igen' : null, blockedReason }
  }
  if (state === 'failed') {
    return { visible, state, text: `Analysen misslyckades: ${speakers?.error ?? 'okänt fel.'}`, actionLabel: available ? 'Försök igen' : null, blockedReason }
  }
  return { visible, state: 'none', text: 'Talarbyten har inte analyserats.', actionLabel: available ? 'Analysera talarbyten' : null, blockedReason }
}

/** Panelen ska fortsätta fråga servern medan ett undertextjobb eller en talaranalys pågår. */
export function shouldPollGeneration(generation: Pick<CaptionGeneration, 'job' | 'speakers'> | null): boolean {
  return generation?.job?.state === 'processing' || generation?.speakers?.state === 'analyzing'
}
