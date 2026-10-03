// Domäntyper, formade efter mockup/API-ENDPOINTS.md — det tilltänkta API-kontraktet.
// Fältnamnen ska kunna mappas direkt mot en framtida fetch-baserad klient.

export type Role = 'rootAdmin' | 'domainAdmin' | 'operator'

export interface DomainRef {
  id: string
  host: string
  org: string
}

export interface Domain extends DomainRef {
  userCount: number
  contractStart?: string
  contractEnd?: string
}

export interface CredentialLinkInfo {
  valid: boolean
  kind?: 'invite' | 'reset'
  name?: string
  email?: string
}

export interface CredentialLinkRedeemed {
  pin: string
  email: string
  kind: 'invite' | 'reset'
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
  /** Meetings eget ärende-id (topic.id), sätts bara vid import från Meeting. */
  meetingItemId?: string
  attachments?: AgendaAttachment[]
}

export interface AgendaAttachment {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  url: string
}

export interface Agenda {
  id: string
  name: string
  description: string
  itemCount: number
  usedInProjects: number
  changedAt: string
  isTemplate: boolean
  domainId?: string
  items: AgendaItem[]
  sourceMeetingId?: string | null
}

export interface MeetingSummary {
  id: number
  title: string
}

export interface MeetingTopic {
  id: number
  title: string
  sortOrder: number
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
  domainId?: string
  people: NameListPerson[]
  sourceMeetingId?: string | null
}

// ---- Projekt ----

export type Visibility = 'open' | 'closed'
export type PublicMode = 'before' | 'live' | 'after' | 'ondemand'
export type AfterReason = 'liveFinished' | 'ondemandUnpublished'
export type RecordingReadiness = 'unknown' | 'recording' | 'processing' | 'ready' | 'published'
export type ChannelState = 'none' | 'idle' | 'live'
export type RecordingState = 'none' | 'recording' | 'processing' | 'awaitingApproval' | 'recorded' | 'trimmed' | 'published'

export interface TrimDraftChapter {
  index: number
  label: string
  offsetSeconds: number
}

export interface TrimDraft {
  startOffsetSeconds: number
  endOffsetSeconds: number
  chapters: TrimDraftChapter[]
}

export type PublicationState = 'none' | 'review' | 'published'

export type CapabilityStatus = 'allowed' | 'allowedWithWarning' | 'blocked'

export interface OperationCapability {
  status: CapabilityStatus
  reasonCode?: string
}

export interface ProjectCapabilities {
  trimRecording: OperationCapability
  publishVod: OperationCapability
  teardownChannel: OperationCapability
}

export interface ProjectTechnicalHealth {
  channelState: ChannelState | null
  channelLivePhase: string | null
  streamStartedAt: string | null
  recordingState: RecordingState | null
}

export interface Project {
  id: string
  name: string
  createdAt: string
  beforeText: string
  liveText: string
  afterText: string
  ondemandText: string
  /** Publik URL till spelarens poster (visas när ingen video spelas), eller null. */
  posterUrl?: string | null
  visibility: Visibility
  publicMode: PublicMode
  afterReason: AfterReason | null
  recordingReadiness: RecordingReadiness
  playerUrl: string
  channel: { id: string; state: ChannelState } | null
  technicalHealth: ProjectTechnicalHealth
  recording: { id: string; state: RecordingState; hlsUrl?: string; source?: string; progress?: number; phase?: string } | null
  publication: { state: PublicationState }
  publicationHistory: PublicationHistory[]
  capabilities: ProjectCapabilities
  onDemandLocked: boolean
  agendaId: string | null
  namelistId: string | null
  domainId?: string
  meetingBindingId?: string
  meetingDomain?: string
  meetingId?: string
  meetingEventsEnabled?: boolean
  trimDraft: TrimDraft | null
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

export interface PublicationHistory {
  id: string
  action: string
  actorName: string
  occurredAt: string
  recordingId: string | null
  manifestId: string | null
  fromState: string | null
  toState: string | null
  reason: string | null
  metadataJson: string | null
}

// ---- Playout och tidslinje ----

export type CueKind = 'agendaItem' | 'person' | 'exclamation'

export interface TimelineEvent {
  id: string
  kind: CueKind
  /** null representerar att bilden rensats för den här sorten (ingen aktiv punkt/namnskylt). */
  refId: string | null
  label: string
  occurredAt: string
  offsetSeconds: number | null
}

export interface PlayoutState {
  currentAgendaItemId: string | null
  currentPersonId: string | null
  timeline: TimelineEvent[]
  currentAgendaItem?: TimelineEvent | null
  currentPerson?: TimelineEvent | null
  currentExclamation?: TimelineEvent | null
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

// Fas-detaljerna live-server-v3 härleder från den hysteres-baserade
// fasövergången (se ChannelLivePhase i backend) — bara meningsfull när ett
// projekt är kopplat till kanalen, annars är den `undefined`.
export type LivePhase = 'waitingForStream' | 'live' | 'signalInterrupted' | 'signalInterruptedDeclined' | 'streamEnded'

export interface ChannelHealth {
  state: ChannelState
  livePhase?: LivePhase
  // Bara satta när state är 'live'.
  bitrateKbps?: number
  resolution?: string
  framerate?: number
  lastFrameSecondsAgo?: number
  streamStartedAt?: string
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
  chapterId: string
  kind: CueKind
  label: string
  offsetSeconds: number
  sourceEventId?: string
  readOnly?: boolean
  /** Falskt för importerade cues i en uppladdad video som ännu inte ankrats — saknar position och publiceras inte. */
  synced?: boolean
  /** Uppladdad video: förankringens läge för kapitellistan som helhet (samma värde på alla kapitel). */
  syncState?: 'none' | 'pending' | 'confirmed'
  /** Kapitlet operatören förankrade mot videon. */
  anchor?: boolean
  /** Hur kapitlets tid är känd: i videon (publiceras), klockslag (kräver förankring) eller ingen tid (stegas fram med Synk). */
  timing?: 'positioned' | 'clock' | 'untimed'
  /** Har ett ursprungligt klockslag och kan väljas som ankare. */
  anchorable?: boolean
}

export interface ChapterImportItem {
  kind: CueKind
  label: string
  /** Position i videon (sekunder) — kapitlet blir direkt synkat. */
  offsetSeconds?: number
  /** Klockslag i sändningen (ISO 8601, UTC) — kapitlet förankras. */
  clockUtc?: string
}

export interface ChapterImportResult {
  positioned: number
  clock: number
  untimed: number
  outsideVideo: number
}

// En av projektets egna sändningar (även test-sändningar) — valbara i
// Ondemand-vyns "Sändning"-dropdown, se ProjectRecordingDto på servern.
export interface ProjectRecording {
  id: string
  name: string
  durationSeconds: number
  hlsUrl: string
  startedAt: string
  isActive: boolean
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

export interface DownloadJob {
  jobId: string
  state: 'processing' | 'done' | 'error'
  url?: string
  expiresAt?: string
  error?: { code: string; message: string }
  progress?: number
  phase?: string
}

// UNG-80 steg 2: ett mediajobb i jobbfältet (servern äger slutförandet, se MediaJobObserver).
export interface MediaJob {
  id: string
  kind: 'download' | 'upload'
  state: 'processing' | 'done' | 'error'
  recordingId: string
  projectId?: string
  projectName?: string
  recordingName?: string
  progress?: number
  phase?: string
  errorMessage?: string
  createdAtUtc: string
  completedAtUtc?: string
  startedByUserId?: string
  startedByName?: string
}

// UNG-80 steg 4: operatörens delningar av nedladdningar (loggen sparas tolv månader efter utgång).
export interface ShareItem {
  id: string
  recordingId: string
  name: string
  downloadCount: number
  lastDownloadedAtUtc?: string
}

export interface ShareEvent {
  kind: 'created' | 'downloaded' | 'revoked' | 'mail_failed'
  occurredAtUtc: string
  detail?: string
}

export interface Share {
  id: string
  status: 'active' | 'expired' | 'revoked'
  createdByName: string
  createdAtUtc: string
  expiresAtUtc: string
  message?: string
  recipients: string[]
  items: ShareItem[]
  revokedAtUtc?: string
  revokedByName?: string
  /** Ingår bara i detaljvyn (get/revoke). */
  events?: ShareEvent[]
}

export interface ShareInput {
  recordingIds: string[]
  recipients: string[]
  message?: string
}

export interface ShareRecipientResult {
  address: string
  sent: boolean
  errorCode?: string
}

export interface CreatedShare {
  share: Share
  /** Visas bara här: servern sparar bara en hash av token och kan inte visa länken igen. */
  link: string
  recipients: ShareRecipientResult[]
}

// UNG-80 steg 4: det mottagaren ser på den publika delningssidan. Övriga fält än status finns bara för 'active'.
export interface PublicShareItem {
  id: string
  name: string
  sizeBytes?: number
  available: boolean
}

export interface PublicShare {
  status: 'active' | 'expired' | 'revoked' | 'unknown'
  senderName?: string
  message?: string
  expiresAtUtc?: string
  items?: PublicShareItem[]
}

export interface DownloadLink {
  url: string
  expiresAt: string
}

export interface UploadJob {
  jobId: string
  state: 'processing' | 'done' | 'error'
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

export type UserStatus = 'notinvited' | 'active' | 'invited' | 'disabled'

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
