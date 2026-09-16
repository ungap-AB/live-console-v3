import type { Client } from '../client'
import type {
  Agenda,
  Channel,
  ChannelHealth,
  ChannelState,
  Chapter,
  CueKind,
  CurrentUser,
  LivePhase,
  NameList,
  Project,
  ProjectRef,
  PublicationState,
  Recording,
  RecordingState,
  TimelineEvent,
  UserAccount,
  Visibility,
} from '../types'
import { ApiError, api, setAuthToken } from './fetchJson'
import type {
  ServerAgenda,
  ServerAgendaListItem,
  ServerChannel,
  ServerChannelHealth,
  ServerChannelQuota,
  ServerChapter,
  ServerCurrentUser,
  ServerDomain,
  ServerLoginResponse,
  ServerNameList,
  ServerNameListSummary,
  ServerPaged,
  ServerProject,
  ServerRecording,
  ServerTimelineEvent,
  ServerTrashItem,
  ServerTrimJob,
  ServerUser,
} from './serverDtos'

// Fetch-baserad Client mot live-server-v3, se Client-interfacet i ../client.ts
// och API-ENDPOINTS.md för kontraktet. Servern har medvetet lätta
// list-endpoints (paginerade, utan nästlade punkter/personer/kapitel) — den
// fullständiga posten hämtas via get(id). Vyerna hämtar därför detalj vid val
// istället för att läsa ur listresultatet (se AgendasView/NameListsView/
// VideoArchiveView/UsersView).

function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.code.endsWith('_not_found')
}

async function getOrUndefined<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise
  } catch (err) {
    if (isNotFound(err)) return undefined
    throw err
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollTrimJob(jobId: string): Promise<ServerTrimJob> {
  for (;;) {
    const job = await api<ServerTrimJob>(`/trim-jobs/${jobId}`)
    if (job.state === 'processing') {
      await sleep(400)
      continue
    }
    if (job.state === 'failed') {
      throw new Error(job.error?.message ?? 'Trimningen misslyckades.')
    }
    return job
  }
}

// ---- Dagordningar ----

function toAgendaSummary(dto: ServerAgendaListItem): Agenda {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    itemCount: dto.itemCount,
    usedInProjects: dto.usedInProjects,
    changedAt: dto.changedAt,
    isTemplate: dto.isTemplate,
    domainId: dto.domainId,
    items: [],
  }
}

function toAgenda(dto: ServerAgenda): Agenda {
  return { ...toAgendaSummary(dto), items: dto.items }
}

// ---- Namnlistor ----

function toNameListSummary(dto: ServerNameListSummary): NameList {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    personCount: dto.personCount,
    usedInProjects: dto.usedInProjects,
    changedAt: dto.changedAt,
    domainId: dto.domainId,
    people: [],
  }
}

function toNameList(dto: ServerNameList): NameList {
  return { ...toNameListSummary(dto), people: dto.people }
}

// ---- Live-resurser & inspelningar: projekt-referens ----

function publicationLabel(state: string): string {
  if (state === 'published') return 'Publicerad'
  if (state === 'review') return 'Under granskning'
  return 'Ej publicerad'
}

function visibilityLabel(state: string): string {
  return state === 'open' ? 'Öppen för publik' : 'Stängd'
}

async function projectRefMap(): Promise<Map<string, ServerProject>> {
  const list = await api<ServerProject[]>('/projects')
  return new Map(list.map((p) => [p.id, p]))
}

function toProjectRef(project: ServerProject | undefined, kind: 'recording' | 'channel'): ProjectRef | null {
  if (!project) return null
  const state = kind === 'recording' ? publicationLabel(project.publication.state) : visibilityLabel(project.visibility)
  return { id: project.id, name: project.name, state }
}

// ---- Inspelningar och videoarkiv ----

function toChapter(dto: ServerChapter): Chapter {
  return { kind: dto.kind as CueKind, label: dto.label, offsetSeconds: dto.offsetSeconds }
}

function toRecording(dto: ServerRecording, chapters: ServerChapter[], project: ProjectRef | null): Recording {
  return {
    id: dto.id,
    kind: dto.kind === 'trim' ? 'trimmed' : 'original',
    name: dto.name,
    createdAt: dto.startedAt,
    durationSeconds: dto.durationSeconds,
    sizeBytes: dto.sizeBytes,
    resolution: dto.resolution,
    source: dto.source,
    hlsUrl: dto.hlsUrl,
    project,
    segments: dto.segments,
    chapters: chapters.map(toChapter),
    parentId: dto.parentId,
    trimRange:
      dto.startOffsetSeconds !== undefined && dto.endOffsetSeconds !== undefined
        ? { startOffsetSeconds: dto.startOffsetSeconds, endOffsetSeconds: dto.endOffsetSeconds }
        : undefined,
    published: dto.published,
  }
}

async function fetchRecordingDetail(dto: ServerRecording): Promise<Recording> {
  const [chapters, projects] = await Promise.all([
    dto.kind === 'original' ? api<ServerChapter[]>(`/recordings/${dto.id}/chapters`) : Promise.resolve([]),
    dto.projectId ? projectRefMap() : Promise.resolve(new Map<string, ServerProject>()),
  ])
  return toRecording(dto, chapters, toProjectRef(dto.projectId ? projects.get(dto.projectId) : undefined, 'recording'))
}

// ---- Live-resurser ----

// Backend skickar exakt C#-enumnamnet (ToString(), ingen JsonStringEnumConverter
// registrerad) — t.ex. "WaitingForStream", inte "waitingForStream".
function mapLivePhase(raw: string | undefined): LivePhase | undefined {
  switch (raw) {
    case 'WaitingForStream':
      return 'waitingForStream'
    case 'Live':
      return 'live'
    case 'StreamInterrupted':
      return 'signalInterrupted'
    case 'StreamInterruptedDeclined':
      return 'signalInterruptedDeclined'
    case 'StreamEnded':
      return 'streamEnded'
    default:
      return undefined
  }
}

function toChannel(dto: ServerChannel, projects: Map<string, ServerProject>): Channel {
  return {
    id: dto.id,
    name: dto.name,
    label: dto.label,
    state: dto.state as ChannelState,
    region: dto.region,
    type: dto.type,
    latencyMode: dto.latencyMode,
    recording: dto.recording,
    project: toProjectRef(dto.projectId ? projects.get(dto.projectId) : undefined, 'channel'),
    arn: dto.arn,
    ingestEndpoint: dto.ingestEndpoint,
    streamKeyMasked: dto.streamKeyMasked,
    playbackUrl: dto.playbackUrl,
    createdAt: dto.createdAt,
    lastUsedAt: dto.lastUsedAt,
    idleDays: dto.idleDays,
  }
}

// ---- Projekt / playout ----

function toTimelineEvent(dto: ServerTimelineEvent): TimelineEvent {
  return {
    id: dto.eventId,
    kind: dto.kind as CueKind,
    refId: dto.refId,
    label: dto.label,
    occurredAt: dto.occurredAt,
    offsetSeconds: dto.offsetSeconds,
  }
}

async function fetchPlayout(id: string) {
  const events = await api<ServerTimelineEvent[]>(`/projects/${id}/timeline`)
  const timeline = events.map(toTimelineEvent)
  const currentAgendaItemId = [...timeline].reverse().find((e) => e.kind === 'agendaItem')?.refId ?? null
  const currentPersonId = [...timeline].reverse().find((e) => e.kind === 'person')?.refId ?? null
  return { currentAgendaItemId, currentPersonId, timeline }
}

// sim finns bara i frontend-typen (se types.ts) — härleds här ur riktiga
// endpoints (kanalhälsa, inspelningens segment) istället för att vara ett
// eget fält i API-kontraktet.
async function deriveSim(dto: ServerProject) {
  if (!dto.channel) {
    return { everSent: false, segments: 0, accumulatedSeconds: 0, recordingStartedAt: null as string | null }
  }
  const isLive = dto.channel.state === 'live'
  let recordingStartedAt: string | null = null
  if (isLive) {
    const health = await api<ServerChannelHealth>(`/channels/${dto.channel.id}/health`)
    recordingStartedAt = health.streamStartedAt ?? null
  }
  let accumulatedSeconds = 0
  let segments = 0
  if (dto.recording && dto.recording.state !== 'recording') {
    const rec = await api<ServerRecording>(`/recordings/${dto.recording.id}`)
    const original = rec.kind === 'trim' && rec.parentId ? await api<ServerRecording>(`/recordings/${rec.parentId}`) : rec
    accumulatedSeconds = original.durationSeconds
    segments = original.segments.length
  }
  return { everSent: dto.recording !== null || isLive, segments, accumulatedSeconds, recordingStartedAt }
}

function toProjectLite(dto: ServerProject): Project {
  return {
    id: dto.id,
    name: dto.name,
    createdAt: dto.createdAt,
    visibility: dto.visibility as Visibility,
    playerUrl: dto.playerUrl,
    channel: dto.channel ? { id: dto.channel.id, state: dto.channel.state as ChannelState } : null,
    recording: dto.recording ? { id: dto.recording.id, state: dto.recording.state as RecordingState, hlsUrl: dto.recording.hlsUrl } : null,
    publication: { state: dto.publication.state as PublicationState },
    onDemandLocked: dto.onDemandLocked,
    agendaId: dto.agendaId,
    namelistId: dto.namelistId,
    domainId: dto.domainId,
    sim: { everSent: false, segments: 0, accumulatedSeconds: 0, recordingStartedAt: null },
    playout: { currentAgendaItemId: null, currentPersonId: null, timeline: [] },
  }
}

async function toProjectFull(dto: ServerProject): Promise<Project> {
  const [playout, sim] = await Promise.all([fetchPlayout(dto.id), deriveSim(dto)])
  return { ...toProjectLite(dto), sim, playout }
}

async function fetchProject(id: string): Promise<Project> {
  const dto = await api<ServerProject>(`/projects/${id}`)
  return toProjectFull(dto)
}

// ---- Domäner och användare ----

function toUserSummary(dto: ServerUser): UserAccount {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    domainId: dto.domainId,
    roles: dto.roles as UserAccount['roles'],
    status: dto.status as UserAccount['status'],
    ssoEnabled: dto.ssoEnabled,
    createdAt: dto.createdAt,
    lastLoginAt: dto.lastLoginAt,
    activity: [],
  }
}

async function fetchUserDetail(id: string): Promise<UserAccount> {
  const [dto, activity] = await Promise.all([
    api<ServerUser>(`/users/${id}`),
    api<{ occurredAt: string; description: string }[]>(`/users/${id}/activity`),
  ])
  return { ...toUserSummary(dto), activity }
}

function toCurrentUser(dto: ServerCurrentUser): CurrentUser {
  return { id: dto.id, name: dto.name, email: dto.email, domain: dto.domain, roles: dto.roles as CurrentUser['roles'] }
}

export const httpClient: Client = {
  auth: {
    async login(email, pin) {
      const dto = await api<ServerLoginResponse>('/auth/login', { method: 'POST', body: { email, pin } })
      setAuthToken(dto.token)
      return toCurrentUser(dto.user)
    },
    async me() {
      const dto = await api<ServerCurrentUser>('/auth/me')
      return toCurrentUser(dto)
    },
    async logout() {
      try {
        await api<void>('/auth/logout', { method: 'POST' })
      } finally {
        setAuthToken(null)
      }
    },
  },
  agendas: {
    async list(query) {
      const page = await api<ServerPaged<ServerAgendaListItem>>('/agendas', { query: { q: query, pageSize: 200 } })
      return page.items.map(toAgendaSummary)
    },
    async get(id) {
      const dto = await getOrUndefined(api<ServerAgenda>(`/agendas/${id}`))
      return dto ? toAgenda(dto) : undefined
    },
    async create(input) {
      return toAgenda(await api<ServerAgenda>('/agendas', { method: 'POST', body: input }))
    },
    async update(id, input) {
      return toAgenda(await api<ServerAgenda>(`/agendas/${id}`, { method: 'PATCH', body: input }))
    },
    async duplicate(id) {
      return toAgenda(await api<ServerAgenda>(`/agendas/${id}/duplicate`, { method: 'POST' }))
    },
    async trash(id) {
      await api<void>(`/agendas/${id}`, { method: 'DELETE' })
    },
    async setTemplate(id, isTemplate) {
      return toAgenda(await api<ServerAgenda>(`/agendas/${id}/template`, { method: 'PUT', body: { isTemplate } }))
    },
    async replaceItems(id, items) {
      return toAgenda(await api<ServerAgenda>(`/agendas/${id}/items`, { method: 'PUT', body: { items } }))
    },
    async addItem(id, item) {
      return toAgenda(await api<ServerAgenda>(`/agendas/${id}/items`, { method: 'POST', body: item }))
    },
    async updateItem(id, itemId, item) {
      return toAgenda(await api<ServerAgenda>(`/agendas/${id}/items/${itemId}`, { method: 'PATCH', body: item }))
    },
    async removeItem(id, itemId) {
      return toAgenda(await api<ServerAgenda>(`/agendas/${id}/items/${itemId}`, { method: 'DELETE' }))
    },
  },
  namelists: {
    async list(query) {
      const page = await api<ServerPaged<ServerNameListSummary>>('/namelists', { query: { q: query, pageSize: 200 } })
      return page.items.map(toNameListSummary)
    },
    async get(id) {
      const dto = await getOrUndefined(api<ServerNameList>(`/namelists/${id}`))
      return dto ? toNameList(dto) : undefined
    },
    async create(input) {
      return toNameList(await api<ServerNameList>('/namelists', { method: 'POST', body: input }))
    },
    async update(id, input) {
      return toNameList(await api<ServerNameList>(`/namelists/${id}`, { method: 'PATCH', body: input }))
    },
    async duplicate(id) {
      return toNameList(await api<ServerNameList>(`/namelists/${id}/duplicate`, { method: 'POST' }))
    },
    async trash(id) {
      await api<void>(`/namelists/${id}`, { method: 'DELETE' })
    },
    async replacePeople(id, people) {
      return toNameList(await api<ServerNameList>(`/namelists/${id}/people`, { method: 'PUT', body: { people } }))
    },
    async addPerson(id, person) {
      return toNameList(await api<ServerNameList>(`/namelists/${id}/people`, { method: 'POST', body: person }))
    },
    async updatePerson(id, personId, person) {
      return toNameList(await api<ServerNameList>(`/namelists/${id}/people/${personId}`, { method: 'PATCH', body: person }))
    },
    async removePerson(id, personId) {
      return toNameList(await api<ServerNameList>(`/namelists/${id}/people/${personId}`, { method: 'DELETE' }))
    },
  },
  recordings: {
    async list(query) {
      const [items, projects] = await Promise.all([
        api<ServerRecording[]>('/recordings', { query: { q: query } }),
        projectRefMap(),
      ])
      return items.map((dto) => toRecording(dto, [], toProjectRef(dto.projectId ? projects.get(dto.projectId) : undefined, 'recording')))
    },
    async get(id) {
      const dto = await getOrUndefined(api<ServerRecording>(`/recordings/${id}`))
      return dto ? fetchRecordingDetail(dto) : undefined
    },
    async trash(id) {
      await api<void>(`/recordings/${id}`, { method: 'DELETE' })
    },
    async trim(id, range) {
      const job = await api<ServerTrimJob>(`/recordings/${id}/trim`, {
        method: 'POST',
        body: { startOffsetSeconds: range.startOffsetSeconds, endOffsetSeconds: range.endOffsetSeconds },
      })
      const done = await pollTrimJob(job.jobId)
      const fresh = await api<ServerRecording>(`/recordings/${done.recordingId}`)
      return fetchRecordingDetail(fresh)
    },
  },
  channels: {
    async list(query) {
      const [items, projects] = await Promise.all([
        api<ServerChannel[]>('/channels', { query: { q: query } }),
        projectRefMap(),
      ])
      return items.map((dto) => toChannel(dto, projects))
    },
    async get(id) {
      const dto = await getOrUndefined(api<ServerChannel>(`/channels/${id}`))
      if (!dto) return undefined
      const projects = dto.projectId ? await projectRefMap() : new Map<string, ServerProject>()
      return toChannel(dto, projects)
    },
    async quota() {
      return api<ServerChannelQuota>('/channels/quota')
    },
    async create(input) {
      const dto = await api<ServerChannel>('/channels', {
        method: 'POST',
        body: { name: input.label, projectId: null, type: 'STANDARD', latencyMode: 'LOW', recording: true },
      })
      return toChannel(dto, new Map())
    },
    async teardown(id) {
      await api<void>(`/channels/${id}`, { method: 'DELETE' })
    },
    async rotateKey(id) {
      const dto = await api<ServerChannel>(`/channels/${id}/rotate-key`, { method: 'POST' })
      const projects = dto.projectId ? await projectRefMap() : new Map<string, ServerProject>()
      return toChannel(dto, projects)
    },
    async health(id) {
      const dto = await api<ServerChannelHealth>(`/channels/${id}/health`)
      return {
        state: dto.state as ChannelState,
        livePhase: mapLivePhase(dto.livePhase),
        bitrateKbps: dto.bitrateKbps,
        resolution: dto.resolution,
        framerate: dto.framerate,
        lastFrameSecondsAgo: dto.lastFrameSecondsAgo,
        streamStartedAt: dto.streamStartedAt,
      } satisfies ChannelHealth
    },
    async getStreamKey(id) {
      const dto = await getOrUndefined(api<{ streamKey: string }>(`/channels/${id}/stream-key`))
      return dto?.streamKey ?? null
    },
  },
  trash: {
    async list(query) {
      return api<ServerTrashItem[]>('/trash', { query: { q: query } })
    },
    async restore(id) {
      await api<void>(`/trash/${id}/restore`, { method: 'POST' })
    },
    async policy() {
      return api<{ retentionDays: number }>('/trash/policy')
    },
  },
  domains: {
    async list() {
      return api('/domains')
    },
    async create(input) {
      return api<ServerDomain>('/domains', { method: 'POST', body: input })
    },
    async update(id, input) {
      return api<ServerDomain>(`/domains/${id}`, { method: 'PATCH', body: input })
    },
    async remove(id) {
      await api<void>(`/domains/${id}`, { method: 'DELETE' })
    },
    async invite(domainId, input) {
      const dto = await api<ServerUser>(`/domains/${domainId}/invitations`, { method: 'POST', body: input })
      return toUserSummary(dto)
    },
  },
  users: {
    async listByDomain(domainId, query) {
      const items = await api<ServerUser[]>(`/domains/${domainId}/users`, { query: { q: query } })
      return items.map(toUserSummary)
    },
    async get(id) {
      const found = await getOrUndefined(api<ServerUser>(`/users/${id}`))
      return found ? fetchUserDetail(id) : undefined
    },
    async update(id, input) {
      await api<ServerUser>(`/users/${id}`, { method: 'PATCH', body: input })
      return fetchUserDetail(id)
    },
    async resendInvite(id) {
      await api<void>(`/invitations/${id}/resend`, { method: 'POST' })
    },
    async sendPasswordReset(id) {
      const dto = await api<ServerUser>(`/users/${id}`)
      await api<void>('/auth/password-reset', { method: 'POST', body: { email: dto.email } })
    },
    async setRoles(id, roles) {
      await api<ServerUser>(`/users/${id}/roles`, { method: 'PUT', body: { roles } })
      return fetchUserDetail(id)
    },
    async disable(id) {
      await api<ServerUser>(`/users/${id}/disable`, { method: 'POST' })
      return fetchUserDetail(id)
    },
    async enable(id) {
      await api<ServerUser>(`/users/${id}/enable`, { method: 'POST' })
      return fetchUserDetail(id)
    },
    async remove(id) {
      await api<void>(`/users/${id}`, { method: 'DELETE' })
    },
  },
  projects: {
    async list(query) {
      const items = await api<ServerProject[]>('/projects', { query: { q: query } })
      return items.map(toProjectLite)
    },
    async get(id) {
      const dto = await getOrUndefined(api<ServerProject>(`/projects/${id}`))
      return dto ? toProjectFull(dto) : undefined
    },
    async create(input) {
      const dto = await api<ServerProject>('/projects', { method: 'POST', body: input })
      return toProjectFull(dto)
    },
    async rename(id, name) {
      const dto = await api<ServerProject>(`/projects/${id}`, { method: 'PATCH', body: { name } })
      return toProjectFull(dto)
    },
    async trash(id) {
      await api<void>(`/projects/${id}`, { method: 'DELETE' })
    },
    async setVisibility(id, visibility) {
      const dto = await api<ServerProject>(`/projects/${id}/visibility`, { method: 'PUT', body: { visibility } })
      return toProjectFull(dto)
    },
    async setAgenda(id, agendaId) {
      const dto = await api<ServerProject>(`/projects/${id}/agenda`, { method: 'PUT', body: { agendaId } })
      return toProjectFull(dto)
    },
    async setNameList(id, namelistId) {
      const dto = await api<ServerProject>(`/projects/${id}/namelist`, { method: 'PUT', body: { namelistId } })
      return toProjectFull(dto)
    },
    async createChannel(id) {
      const project = await api<ServerProject>(`/projects/${id}`)
      if (project.channel) throw new Error('Projektet har redan en live-resurs.')
      const channel = await api<ServerChannel>('/channels', {
        method: 'POST',
        body: { name: project.name, projectId: id, type: 'STANDARD', latencyMode: 'LOW', recording: true },
      })
      await api<void>(`/channels/${channel.id}/project`, { method: 'PUT', body: { projectId: id } })
      return fetchProject(id)
    },
    async teardownChannel(id) {
      const project = await api<ServerProject>(`/projects/${id}`)
      if (project.channel) await api<void>(`/channels/${project.channel.id}`, { method: 'DELETE' })
      return fetchProject(id)
    },
    // Debug-only endpoints (utanför API-ENDPOINTS.md) — se
    // Controllers/DebugController.cs i live-server-v3. Simulerar en encoder
    // så hela flödet går att testa utan riktig IVS-kanal.
    async setEncoderSending(id, sending) {
      await api<void>(`/debug/projects/${id}/encoder/${sending ? 'start' : 'stop'}`, { method: 'POST' })
      return fetchProject(id)
    },
    async trim(id, range) {
      const project = await api<ServerProject>(`/projects/${id}`)
      if (!project.recording || !['recorded', 'trimmed'].includes(project.recording.state)) {
        throw new Error('Inspelningen måste vara klar innan den kan trimmas.')
      }
      const recording = await api<ServerRecording>(`/recordings/${project.recording.id}`)
      const original =
        recording.kind === 'trim' && recording.parentId ? await api<ServerRecording>(`/recordings/${recording.parentId}`) : recording
      const job = await api<ServerTrimJob>(`/recordings/${original.id}/trim`, {
        method: 'POST',
        body: range,
      })
      await pollTrimJob(job.jobId)
      return fetchProject(id)
    },
    async createReviewLink(id) {
      await api<void>(`/projects/${id}/review-link`, { method: 'POST' })
      return fetchProject(id)
    },
    async publish(id) {
      await api<void>(`/projects/${id}/publish`, { method: 'POST' })
      return fetchProject(id)
    },
    async returnToLive(id) {
      const dto = await api<ServerProject>(`/projects/${id}/return-to-live`, { method: 'POST' })
      return toProjectFull(dto)
    },
    async cue(id, kind, refId, _label) {
      const dto = await api<ServerTimelineEvent>(`/projects/${id}/playout/cue`, { method: 'POST', body: { kind, refId } })
      return toTimelineEvent(dto)
    },
    async clear(id, kind) {
      const dto = await api<ServerTimelineEvent>(`/projects/${id}/playout/cue`, { method: 'POST', body: { kind, refId: null } })
      return toTimelineEvent(dto)
    },
    async resetSimulation(id) {
      await api<void>(`/debug/projects/${id}/reset`, { method: 'POST' })
      return fetchProject(id)
    },
  },
}

