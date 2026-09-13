import type { CueKind, Visibility } from '../../data/types'

// Delas mellan ProjectDetail och Playout.
export interface ProjectActions {
  setVisibility: (visibility: Visibility) => void
  setAgenda: (agendaId: string | null) => void
  setNameList: (namelistId: string | null) => void
  createChannel: () => void
  teardownChannel: () => void
  setEncoderSending: (sending: boolean) => void
  trim: () => void
  createReviewLink: () => void
  publish: () => void
  cue: (kind: CueKind, refId: string, label: string) => void
  removeTimelineEvent: (eventId: string) => void
  reset: () => void
}
