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
  /** Kundens egen Mux env key (UNG-20). Saknas den gäller plattformens standardnyckel. */
  muxEnvKey?: string | null
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
  /** Var texterna ovan placeras i spelarens videofönster (UNG-96). En placering för alla fyra. */
  textPlacement: TextPlacement
  /** Spelaren skickar uppspelningsmätning till Mux (UNG-20). */
  muxEnabled: boolean
  /** Nyckeln mätningen skulle använda (domänens egen, annars standardnyckeln). Skrivskyddad. */
  muxEnvKey?: string | null
  /** Respektera tittarens "Do Not Track". Av som standard: mätningen är anonym och cookiefri. */
  muxRespectDoNotTrack: boolean
  /** UNG-5: tittare får spola tillbaka i en pågående sändning (DVR). */
  dvrEnabled: boolean
  /** UNG-192: utrop räknas som talare i spelarens dagordningslista under live. */
  exclamationsAsSpeakers: boolean
  /** UNG-198: markören "endast live" (ändrar inget beteende, visas som etikett). */
  liveOnly: boolean
  /** UNG-198: projektet är forkat ur ett annat projekts sändning eller inspelning. */
  forkedFrom?: { projectId: string; name?: string; atUtc?: string }
  visibility: Visibility
  publicMode: PublicMode
  afterReason: AfterReason | null
  recordingReadiness: RecordingReadiness
  playerUrl: string
  channel: { id: string; state: ChannelState } | null
  technicalHealth: ProjectTechnicalHealth
  recording: { id: string; state: RecordingState; hlsUrl?: string; source?: string; progress?: number; phase?: string; captions?: ProjectCaptions | null; durationSeconds?: number } | null
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
  /** Undertextläget (UNG-167), så att projektlistan inte behöver en fråga per rad. Saknas i mock-läget. */
  captionStatus?: { state: 'none' | 'generating' | 'failed' | 'draft' | 'published'; progress?: number | null }
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

// pauseIn/pauseOut (UNG-119): en paus är två händelser i tidslinjen. Texten ligger i etiketten på pauseIn.
export type CueKind = 'agendaItem' | 'person' | 'exclamation' | 'pauseIn' | 'pauseOut'

/** UNG-198: svar när ett projekt skapats ur en sändning eller inspelning. Varningen outside_public: delar sändes aldrig publikt. */
export interface ForkResult {
  project: Project
  warnings: { code: string; message: string }[]
}

/** UNG-198: fönstret en fork kan börja i (för tidväljaren): den pågående sändningen hittills, eller den färdiga inspelningen. */
export interface ForkWindow {
  source: 'live' | 'recording'
  startUtc: string
  endUtc: string
}

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
  /** Den pauseIn som pågår just nu (UNG-119), annars null. */
  currentPause?: TimelineEvent | null
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
  /** Samtidiga tittare enligt IVS (UNG-22). Saknas när siffran inte är känd. */
  viewerCount?: number
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
// UNG-94: undertexten (WebVTT) för uppspelningsinspelningen, uppladdad av operatören.
export interface ProjectCaptions {
  language: string
  label: string
  cueCount: number
  /** Sluttiden för den sista repliken — för att kunna varna om filen inte hör till den publicerade videon. */
  lastCueEndSeconds: number
  uploadedAt: string
  url: string
}

// UNG-126: en maskinell rättning i ett undertextutkast (namn/term som ersatts), så den går att granska.
export interface CaptionCorrection {
  /** Sekunder från videons start där rättningen gjordes. */
  time: number
  original: string
  replacement: string
  similarity: number
}

// UNG-126: ett maskingenererat undertextutkast. Inte publicerat och syns inte för tittarna förrän operatören godkänt det.
export interface CaptionDraft {
  recordingId: string
  language: string
  createdAtUtc: string
  cueCount: number
  lastCueEndSeconds: number
  audioSeconds: number
  /** Utkastet hör till en tidigare version av inspelningen (projektet har trimmats om sedan det skapades). */
  stale: boolean
  approvedAtUtc?: string
  corrections: CaptionCorrection[]
  /** Arbetskopians version (ökar vid varje sparning) och den version som senast publicerades. */
  version?: number
  publishedVersion?: number
  /** Arbetskopian har ändrats sedan den senast publicerades (eller har aldrig publicerats). */
  unpublishedChanges?: boolean
  updatedAtUtc?: string
  updatedByName?: string
}

/** UNG-138: en replik i undertextmastern. Tider i sekunder på ORIGINALinspelningens tidslinje. */
export interface CaptionCue {
  id: number
  start: number
  end: number
  /** Text med radbrytningar (\n) för en eller två rader. */
  text: string
}

export interface CaptionMaster {
  recordingId: string
  language: string
  version: number
  publishedVersion?: number
  updatedAtUtc: string
  updatedByName?: string
  cues: CaptionCue[]
  /** Redigeraren spelar originalet, eftersom tiderna ligger på dess tidslinje. */
  originalHlsUrl?: string
  originalDurationSeconds: number
  /** Den del av originalet som publiceras (trimmen), i originalets tid. Saknas om projektet inte är trimmat. */
  publishedStartSeconds?: number
  publishedEndSeconds?: number
  /** Äldre utkast på trimmad tidslinje: kan inte redigeras, skapa nya undertexter. */
  legacy: boolean
}

/** UNG-147: en replik i förslaget från ett rättat Word-manus. Id = replikens id i mastern (för nya rutor: den de delats ur). */
export interface WordImportCue {
  id: number
  start: number
  end: number
  text: string
  state: 'unchanged' | 'changed' | 'added'
  /** Texten före rättningen (för ändrade rutor). */
  before?: string
  /** split = delad ur en längre ruta, fast = svårläst tempo. */
  flags: ('split' | 'fast')[]
}

export interface WordImportConflict {
  id: number
  currentText: string
  baseText: string
  wordText: string
}

export interface WordImportWarning {
  code: 'base_unverified' | 'base_unchecked' | 'tracked_changes' | 'much_removed' | 'master_changed'
  message: string
}

export interface WordImportResult {
  baseVersion: number
  currentVersion: number
  baseVerified?: boolean
  trackedInsertions: number
  trackedDeletions: number
  summary: { wordsAdded: number; wordsRemoved: number; changedCues: number; addedCues: number; removedCues: number; conflicts: number; checkCues: number }
  /** Hela den föreslagna listan: nuvarande master med rättningarna ilagda. */
  cues: WordImportCue[]
  removed: { id: number; start: number; end: number; text: string }[]
  conflicts: WordImportConflict[]
  warnings: WordImportWarning[]
}

/** UNG-149: ljudets energikurva för originalet (en byte per ram, decibelskala), som vågformsbandet ritar. */
export interface CaptionEnergy {
  intervalMs: number
  minDb: number
  maxDb: number
  data: Uint8Array
}

export interface CaptionVersionInfo {
  version: number
  createdAtUtc: string
  createdByName?: string
  reason: 'generated' | 'edit' | 'restore' | 'word'
  cueCount: number
  published: boolean
  current: boolean
}

/** Senaste genereringen för projektet: jobbet (om något), utkastet (om något) och om en ny generering kan startas. */
export interface CaptionGeneration {
  job?: MediaJob
  draft?: CaptionDraft
  canGenerate: boolean
  /** UNG-205: läget för talarbyten (analyseras med en egen knapp eller följer med genereringen). */
  speakers?: CaptionSpeakers
  /** Talarbyten går att analysera i den här miljön (annars döljs knappen och valet). */
  speakersAvailable?: boolean
}

/** UNG-205: talarbyten (diarization) för originalet. none = inte analyserade, analyzing = jobb pågår, ready = sparade, failed = senaste jobbet misslyckades. */
export interface CaptionSpeakers {
  state: 'none' | 'analyzing' | 'ready' | 'failed'
  progress?: number
  turnCount: number
  createdAtUtc?: string
  method?: string
  error?: string
}

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
  kind: 'download' | 'upload' | 'captions' | 'speakers'
  state: 'processing' | 'done' | 'error' | 'canceled'
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

export type TextPlacement = 'top' | 'middle' | 'bottom'

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
