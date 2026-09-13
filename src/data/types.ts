// Domäntyper, formade efter mockup/API-ENDPOINTS.md — det tilltänkta API-kontraktet.
// Fältnamnen ska kunna mappas direkt mot en framtida fetch-baserad klient.

export type Role = 'admin' | 'operator' | 'editor' | 'reviewer'

export interface DomainRef {
  id: string
  host: string
  org: string
}

export interface Domain extends DomainRef {
  userCount: number
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  domain: DomainRef
  roles: Role[]
}

// ---- Dagordningar ----

export interface AgendaItem {
  id: string
  position: number
  title: string
  reference?: string
}

export interface Agenda {
  id: string
  name: string
  description: string
  itemCount: number
  usedInProjects: number
  changedAt: string
  isTemplate: boolean
  items: AgendaItem[]
}

// ---- Namnlistor ----

export interface NameListPerson {
  id: string
  position: number
  name: string
  party?: string
  role?: string
}

export interface NameList {
  id: string
  name: string
  description: string
  personCount: number
  usedInProjects: number
  changedAt: string
  people: NameListPerson[]
}

// ---- Projekt ----

export type Visibility = 'open' | 'closed'
export type ChannelState = 'none' | 'idle' | 'live'
export type RecordingState = 'none' | 'recording' | 'recorded' | 'trimmed' | 'published'
export type PublicationState = 'none' | 'review' | 'published'

export interface Project {
  id: string
  name: string
  createdAt: string
  visibility: Visibility
  playerUrl: string
  channel: { id: string; state: ChannelState } | null
  recording: { id: string; state: RecordingState } | null
  publication: { state: PublicationState }
  agendaId: string | null
  namelistId: string | null
  /**
   * Mockup-bara fält för att simulera sändningsförloppet utan en riktig
   * IVS-kanal (se mockup/HANDOVER.md §6.5 — panelen som styr detta tas bort
   * i steg 2). Inspelad tid är accumulatedSeconds plus tiden sedan
   * recordingStartedAt när kanalen just nu är live.
   */
  sim: {
    everSent: boolean
    segments: number
    accumulatedSeconds: number
    recordingStartedAt: string | null
  }
  playout: PlayoutState
}

// ---- Playout och tidslinje ----

export type CueKind = 'agendaItem' | 'person'

export interface TimelineEvent {
  id: string
  kind: CueKind
  refId: string
  label: string
  occurredAt: string
  offsetSeconds: number | null
}

export interface PlayoutState {
  currentAgendaItemId: string | null
  currentPersonId: string | null
  timeline: TimelineEvent[]
}

// ---- Live-resurser (IVS-kanaler) ----

// Fritext ("Öppen för publik"/"Stängd") tills projektdomänen byggs (steg 10).
export interface ProjectRef {
  id: string
  name: string
  state: string
}

export interface Channel {
  id: string
  name: string
  label: string
  state: ChannelState
  region: string
  type: string
  latencyMode: 'LOW' | 'NORMAL'
  recording: boolean
  project: ProjectRef | null
  arn: string
  ingestEndpoint: string
  streamKeyMasked: string
  playbackUrl: string
  createdAt: string
  lastUsedAt: string | null
  idleDays: number
}

export interface ChannelHealth {
  state: ChannelState
  bitrateKbps: number
  resolution: string
  framerate: number
  lastFrameSecondsAgo: number
  streamStartedAt: string
}

export interface ChannelQuota {
  used: number
  limit: number
}

// ---- Inspelningar och videoarkiv ----

export type RecordingKind = 'original' | 'trimmed'

export interface RecordingSegment {
  startedAt: string
  durationSeconds: number
}

export interface Chapter {
  kind: CueKind
  label: string
  offsetSeconds: number
}

export interface Recording {
  id: string
  kind: RecordingKind
  name: string
  createdAt: string
  durationSeconds: number
  sizeBytes: number
  resolution: string
  source: string
  hlsUrl: string
  project: ProjectRef | null
  /** Endast original — glapp syns som segments.length > 1. */
  segments: RecordingSegment[]
  /** Endast original — en trimmad version läser kapitel via parentId och filtrerar på trimRange. */
  chapters: Chapter[]
  /** Endast trimmade versioner. */
  parentId?: string
  trimRange?: { startOffsetSeconds: number; endOffsetSeconds: number }
  published?: boolean
}

export interface TrimJob {
  jobId: string
  state: 'processing' | 'done' | 'failed'
  recordingId?: string
  error?: { code: string; message: string }
}

export interface ReviewLink {
  url: string
  token: string
  expiresAt: string
}

// ---- Papperskorg ----

export type TrashItemType = 'project' | 'agenda' | 'namelist' | 'recording'

export interface TrashItem {
  id: string
  type: TrashItemType
  refId: string
  name: string
  detail: string
  deletedAt: string
  deletedBy: { id: string; name: string }
  purgeAt: string
}

// ---- Domäner och användare ----

export type UserStatus = 'active' | 'invited' | 'disabled'

export interface UserActivityEntry {
  occurredAt: string
  description: string
}

export interface UserAccount {
  id: string
  name: string
  email: string
  domainId: string
  roles: Role[]
  status: UserStatus
  ssoEnabled: boolean
  createdAt: string
  lastLoginAt: string | null
  activity: UserActivityEntry[]
}
