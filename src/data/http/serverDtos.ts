// Formen på live-server-v3s JSON-svar (camelCase, se API-ENDPOINTS.md).
// Skiljer sig medvetet från src/data/types.ts på några ställen (lätta
// listposter, platta referens-id:n istället för nästlade objekt) — httpClient.ts
// gör mappningen mellan de två.

export interface ServerPaged<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

// ---- Dagordningar ----

export interface ServerAgendaItem {
  id: string
  position: number
  title: string
  reference?: string
  attachments: ServerAgendaAttachment[]
}

export interface ServerAgendaAttachment {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  url: string
}

export interface ServerAgendaListItem {
  id: string
  name: string
  description: string
  itemCount: number
  usedInProjects: number
  changedAt: string
  isTemplate: boolean
  domainId?: string
}

export interface ServerAgenda extends ServerAgendaListItem {
  items: ServerAgendaItem[]
}

// ---- Namnlistor ----

export interface ServerPerson {
  id: string
  position: number
  name: string
  party?: string
  role?: string
}

export interface ServerNameListSummary {
  id: string
  name: string
  description: string
  personCount: number
  usedInProjects: number
  changedAt: string
  domainId?: string
}

export interface ServerNameList extends ServerNameListSummary {
  people: ServerPerson[]
}

// ---- Projekt / playout ----

export interface ServerChannelRef {
  id: string
  state: string
}

export interface ServerRecordingRef {
  id: string
  state: string
  hlsUrl?: string
  availabilityReason?: string
}

export interface ServerProjectTechnicalHealth {
  channelState: string | null
  channelLivePhase: string | null
  streamStartedAt: string | null
  recordingState: string | null
}

export interface ServerProject {
  id: string
  name: string
  createdAt: string
  visibility: string
  playerUrl: string
  channel: ServerChannelRef | null
  technicalHealth: ServerProjectTechnicalHealth
  recording: ServerRecordingRef | null
  publication: { state: string }
  capabilities: {
    trimRecording: { status: string; reasonCode?: string }
    publishVod: { status: string; reasonCode?: string }
    teardownChannel: { status: string; reasonCode?: string }
  }
  onDemandLocked: boolean
  agendaId: string | null
  namelistId: string | null
  domainId?: string
  meetingBindingId?: string
  meetingDomain?: string
  meetingId?: string
  meetingEventsEnabled?: boolean
}

export interface ServerTimelineEvent {
  eventId: string
  kind: string
  refId: string | null
  label: string
  occurredAt: string
  offsetSeconds: number | null
}

export interface ServerPlayout {
  currentAgendaItem: ServerTimelineEvent | null
  currentPerson: ServerTimelineEvent | null
  currentExclamation: ServerTimelineEvent | null
  timeline: ServerTimelineEvent[]
}

export interface ServerReviewLink {
  url: string
  token: string
  expiresAt: string
}

export interface ServerChapter {
  kind: string
  label: string
  offsetSeconds: number
}

// ---- Live-resurser ----

export interface ServerChannel {
  id: string
  name: string
  label: string
  state: string
  region: string
  type: string
  latencyMode: 'LOW' | 'NORMAL'
  recording: boolean
  arn: string
  ingestEndpoint: string
  streamKeyMasked: string
  playbackUrl: string
  projectId: string | null
  createdAt: string
  lastUsedAt: string | null
  idleDays: number
}

export interface ServerChannelHealth {
  state: string
  // Exakt C#-enumnamnet (t.ex. "WaitingForStream"), inte camelCase — backend
  // serialiserar det via ToString(), ingen JsonStringEnumConverter är
  // registrerad. Se httpClient.ts:mapLivePhase för mappningen.
  livePhase?: string
  bitrateKbps?: number
  resolution?: string
  framerate?: number
  lastFrameSecondsAgo?: number
  streamStartedAt?: string
}

export interface ServerChannelQuota {
  used: number
  limit: number
}

// ---- Inspelningar och videoarkiv ----

export interface ServerRecordingSegment {
  startedAt: string
  durationSeconds: number
}

export interface ServerRecordingSession {
  id: string
  streamId: string
  startedAt: string
  endedAt?: string
  durationSeconds: number
  hlsUrl?: string
  availabilityReason?: string
}

export interface ServerRecording {
  id: string
  kind: 'original' | 'trim'
  name: string
  projectId?: string
  source: string
  startedAt: string
  durationSeconds: number
  sizeBytes: number
  resolution: string
  framerate: number
  hlsUrl: string
  segments: ServerRecordingSegment[]
  children: string[]
  parentId?: string
  startOffsetSeconds?: number
  endOffsetSeconds?: number
  published?: boolean
  sessions?: ServerRecordingSession[]
}

export interface ServerTrimJob {
  jobId: string
  state: 'processing' | 'done' | 'failed'
  recordingId?: string
  error?: { code: string; message: string }
}

// ---- Papperskorg ----

export interface ServerTrashItem {
  id: string
  type: 'project' | 'agenda' | 'namelist' | 'recording'
  refId: string
  name: string
  detail: string
  deletedAt: string
  deletedBy: { id: string; name: string }
  purgeAt: string
}

// ---- Domäner och användare ----

export interface ServerDomain {
  id: string
  host: string
  org: string
  userCount: number
  contractStart?: string
  contractEnd?: string
}

export interface ServerActivityEntry {
  occurredAt: string
  description: string
}

export interface ServerUser {
  id: string
  domainId: string
  name: string
  email: string
  roles: string[]
  status: string
  ssoEnabled: boolean
  createdAt: string
  lastLoginAt: string | null
}

export interface ServerDomainRef {
  id: string
  host: string
  org: string
}

export interface ServerCurrentUser {
  id: string
  name: string
  email: string
  domain: ServerDomainRef
  roles: string[]
}

export interface ServerLoginResponse {
  token: string
  user: ServerCurrentUser
}
