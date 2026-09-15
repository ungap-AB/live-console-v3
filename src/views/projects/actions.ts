import type { CueKind, Visibility } from '../../data/types'

// Delas mellan ProjectDetail och Playout.
export interface ProjectActions {
  setVisibility: (visibility: Visibility) => void
  setAgenda: (agendaId: string | null) => void
  setNameList: (namelistId: string | null) => void
  createChannel: () => Promise<void>
  teardownChannel: () => Promise<void>
  setEncoderSending: (sending: boolean) => Promise<void>
  trim: () => void
  createReviewLink: () => void
  publish: () => void
  cue: (kind: CueKind, refId: string, label: string) => void
  /** Rensar aktiv dagordningspunkt/namnskylt — loggas som en egen händelse, tar inte bort tidigare utspelningar. */
  clear: (kind: CueKind) => void
  reset: () => Promise<void>
}
