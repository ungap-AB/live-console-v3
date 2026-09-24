import type { AfterReason, CueKind, Project, PublicMode, Visibility } from '../../data/types'

// Delas mellan ProjectDetail och Playout.
export interface ProjectActions {
  refreshProject: () => Promise<void>
  refreshPlayout: () => Promise<void>
  /** Metoderna som returnerar boolean resolvar true när anropet lyckades (fel visas som toast). */
  rename: (name: string, texts?: Partial<Pick<Project, 'beforeText' | 'liveText' | 'afterText' | 'ondemandText'>>) => Promise<boolean>
  setVisibility: (visibility: Visibility) => void
  setPublicMode: (publicMode: PublicMode, afterReason?: AfterReason) => Promise<boolean>
  setAgenda: (agendaId: string | null) => Promise<void>
  setNameList: (namelistId: string | null) => void
  setMeetingBinding: (meetingDomain: string, meetingId: string, eventsEnabled?: boolean) => Promise<void>
  clearMeetingBinding: () => Promise<void>
  createChannel: () => Promise<void>
  teardownChannel: () => Promise<void>
  interruptionDecision: (decision: 'wait_for_reconnect' | 'end') => Promise<void>
  trim: (range: { startOffsetSeconds: number; endOffsetSeconds: number }) => Promise<boolean>
  publish: () => Promise<boolean>
  unpublish: () => Promise<boolean>
  restoreOriginal: () => Promise<boolean>
  returnToLive: () => Promise<boolean>
  cue: (kind: CueKind, refId: string, label: string) => void
  /** Rensar aktiv dagordningspunkt/namnskylt — loggas som en egen händelse, tar inte bort tidigare utspelningar. */
  clear: (kind: CueKind) => void
}
