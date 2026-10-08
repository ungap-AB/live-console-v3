import type { AfterReason, CueKind, Project, PublicMode, Visibility } from '../../data/types'

// Delas mellan ProjectDetail och Playout.
export interface ProjectActions {
  refreshProject: () => Promise<void>
  refreshPlayout: () => Promise<void>
  /** Metoderna som returnerar boolean resolvar true när anropet lyckades (fel visas som toast). */
  rename: (name: string, texts?: Partial<Pick<Project, 'beforeText' | 'liveText' | 'afterText' | 'ondemandText' | 'textPlacement' | 'muxEnabled' | 'muxRespectDoNotTrack'>>) => Promise<boolean>
  setPoster: (file: File) => Promise<boolean>
  removePoster: () => Promise<boolean>
  setVisibility: (visibility: Visibility) => Promise<void>
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
  /** Ersätter projektets spelarlayout med en kopia av ett annat projekts (UNG-180). Svarar om det lyckades. */
  inheritLayout: (sourceProjectId: string) => Promise<boolean>
  /** Startar en paus med texten som visas över videon (UNG-119), eller byter texten på en pågående paus. */
  pause: (text: string) => void
  /** Avslutar en pågående paus. */
  resume: () => void
}
