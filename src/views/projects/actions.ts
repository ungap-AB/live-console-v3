import type { CueKind, Visibility } from '../../data/types'

// Delas mellan ProjectDetail, Playout och StateControlPanel — samma
// handlingar går att trigga från både den vanliga UI:n och demopanelen.
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
  reset: () => void
}
