import type { Project, TextPlacement } from '../../data/types'

export type PlayerTextKey = 'beforeText' | 'liveText' | 'afterText' | 'ondemandText'
export type PlayerTexts = Record<PlayerTextKey, string>

export interface PlayerTextField {
  key: PlayerTextKey
  label: string
  /** När spelaren visar texten — förklaras under fältet så operatören vet vad hen redigerar. */
  when: string
  /** Vad spelaren visar om fältet lämnas tomt (spelarens egen standardtext), eller null om inget visas. */
  fallback: string | null
}

// Fallback-texterna måste följa spelarens stateMessage() (live-player-v3/src/domain/playback-status.ts).
export const PLAYER_TEXT_FIELDS: PlayerTextField[] = [
  { key: 'beforeText', label: 'Before', when: 'Visas innan sändningen har startat.', fallback: 'Sändningen har inte startat ännu.' },
  { key: 'liveText', label: 'Live', when: 'Visas i Live-läget medan videon ännu inte spelar, t.ex. när strömmen startar.', fallback: null },
  { key: 'afterText', label: 'After', when: 'Visas när sändningen är avslutad och ingen inspelning spelas upp.', fallback: 'Sändningen är avslutad.' },
  { key: 'ondemandText', label: 'Ondemand', when: 'Visas i Ondemand-läget medan inspelningen inte går att spela upp.', fallback: null },
]

export const MAX_PLAYER_TEXT_LENGTH = 500

// UNG-96: var texterna placeras i videofönstret. En placering för alla fyra, så texten inte konkurrerar med posterns grafik.
export const TEXT_PLACEMENT_OPTIONS: { value: TextPlacement; label: string }[] = [
  { value: 'top', label: 'Överkant' },
  { value: 'middle', label: 'Mitten' },
  { value: 'bottom', label: 'Underkant' },
]

export const POSTER_MAX_BYTES = 5 * 1024 * 1024
export const POSTER_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function textsOf(project: Pick<Project, PlayerTextKey>): PlayerTexts {
  return {
    beforeText: project.beforeText,
    liveText: project.liveText,
    afterText: project.afterText,
    ondemandText: project.ondemandText,
  }
}

/** Bara de fält som ändrats mot projektet, eller null om inget ändrats. */
export function changedTexts(project: Pick<Project, PlayerTextKey>, draft: PlayerTexts): Partial<PlayerTexts> | null {
  const current = textsOf(project)
  const changed: Partial<PlayerTexts> = {}
  for (const field of PLAYER_TEXT_FIELDS) {
    if (draft[field.key] !== current[field.key]) changed[field.key] = draft[field.key]
  }
  return Object.keys(changed).length > 0 ? changed : null
}

export type PlayerSettingsChanges = Partial<PlayerTexts> & { textPlacement?: TextPlacement; muxEnabled?: boolean; muxRespectDoNotTrack?: boolean; dvrEnabled?: boolean; exclamationsAsSpeakers?: boolean; liveOnly?: boolean }

/** Texter, placering och mätning som ändrats mot projektet, eller null om inget ändrats. */
export function changedSettings(
  project: Pick<Project, PlayerTextKey | 'textPlacement' | 'muxEnabled' | 'muxRespectDoNotTrack' | 'dvrEnabled' | 'exclamationsAsSpeakers' | 'liveOnly'>,
  texts: PlayerTexts,
  placement: TextPlacement,
  muxEnabled: boolean,
  muxRespectDoNotTrack: boolean,
  dvrEnabled: boolean = project.dvrEnabled,
  exclamationsAsSpeakers: boolean = project.exclamationsAsSpeakers,
  liveOnly: boolean = project.liveOnly,
): PlayerSettingsChanges | null {
  const changed: PlayerSettingsChanges = { ...changedTexts(project, texts) }
  if (placement !== project.textPlacement) changed.textPlacement = placement
  if (muxEnabled !== project.muxEnabled) changed.muxEnabled = muxEnabled
  if (muxRespectDoNotTrack !== project.muxRespectDoNotTrack) changed.muxRespectDoNotTrack = muxRespectDoNotTrack
  if (dvrEnabled !== project.dvrEnabled) changed.dvrEnabled = dvrEnabled
  if (exclamationsAsSpeakers !== project.exclamationsAsSpeakers) changed.exclamationsAsSpeakers = exclamationsAsSpeakers
  if (liveOnly !== project.liveOnly) changed.liveOnly = liveOnly
  return Object.keys(changed).length > 0 ? changed : null
}

/** Klientsidans förkontroll — servern avgör slutgiltigt på filens innehåll. */
export function validatePosterFile(file: { type: string; size: number }): string | null {
  if (!POSTER_ACCEPTED_TYPES.includes(file.type)) return 'Välj en JPG-, PNG- eller WebP-bild.'
  if (file.size <= 0) return 'Filen är tom.'
  if (file.size > POSTER_MAX_BYTES) return 'Bilden är för stor. Högst 5 MB.'
  return null
}
