import type { Client } from '../client'
import type {
  Agenda,
  AgendaItem,
  Channel,
  ChannelState,
  CurrentUser,
  Domain,
  MeetingSummary,
  MeetingTopic,
  NameList,
  NameListPerson,
  Project,
  Recording,
  Role,
  TimelineEvent,
  UserAccount,
} from '../types'
import {
  agendaFixtures,
  channelFixtures,
  domainFixtures,
  nameListFixtures,
  projectFixtures,
  recordingFixtures,
  trashFixtures,
  userFixtures,
  meetingFixtures,
} from './fixtures'

const CHANNEL_QUOTA_LIMIT = 20
const TRASH_RETENTION_DAYS = 30
const MOCK_ONDEMAND_HLS_URL = 'https://dev.media.ungap.net/ivs/v1/471112617922/LDHByX7JxjGF/2026/9/19/16/10/KRuUDSAVxa8x/media/hls/_odm_20260919161006_20260919170951.m3u8'

function defaultCapabilities() {
  return {
    trimRecording: { status: 'blocked' as const, reasonCode: 'recording_missing' },
    publishVod: { status: 'blocked' as const, reasonCode: 'recording_missing' },
    teardownChannel: { status: 'allowed' as const },
  }
}

function defaultTechnicalHealth() {
  return {
    channelState: null,
    channelLivePhase: null,
    streamStartedAt: null,
    recordingState: null,
  }
}

// In-memory kopior — muteras av create/update/trash så att en session känns
// verklig utan en backend. Fördröjningen tvingar fram loading-tillstånd i
// vyerna redan nu, vilket annars glöms bort tills steg 2.
let agendas = agendaFixtures.map((a) => ({ ...a, items: [...a.items] }))
let namelists = nameListFixtures.map((n) => ({ ...n, people: [...n.people] }))
let recordings = recordingFixtures.map((r) => clone(r))
let channels = channelFixtures.map((c) => clone(c))
let trashItems = trashFixtures.map((t) => clone(t))
const domains = domainFixtures.map((d) => clone(d))
let users = userFixtures.map((u) => clone(u))
let projects = projectFixtures.map((p) => clone(p))

function delay<T>(value: T): Promise<T> {
  const ms = 150 + Math.random() * 150
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value))
}

function projectSnapshot(project: Project): Project {
  const snapshot = clone(project)
  const closed = snapshot.visibility === 'closed'
  const channelLive = snapshot.channel?.state === 'live'
  const recordingState = snapshot.recording?.state
  const blocked = (reasonCode: string) => ({ status: 'blocked' as const, reasonCode })

  snapshot.capabilities = {
    trimRecording:
      !closed ? blocked('project_open') : channelLive ? blocked('channel_live') : recordingState === 'recorded' || recordingState === 'trimmed' ? { status: 'allowed' as const } : blocked(recordingState === 'processing' ? 'recording_processing' : recordingState ? 'recording_not_ready' : 'recording_missing'),
    publishVod:
      !closed ? blocked('project_open') : channelLive ? blocked('channel_live') : recordingState === 'trimmed' ? { status: 'allowed' as const } : blocked(recordingState === 'processing' ? 'recording_processing' : recordingState ? 'recording_not_trimmed' : 'recording_missing'),
    teardownChannel: !snapshot.channel || !channelLive ? { status: 'allowed' as const } : blocked('channel_in_use'),
  }
  snapshot.technicalHealth = {
    channelState: snapshot.channel?.state ?? null,
    channelLivePhase: channelLive ? 'live' : null,
    streamStartedAt: snapshot.sim.recordingStartedAt,
    recordingState: recordingState ?? null,
  }
  return snapshot
}

function findAgenda(id: string): Agenda {
  const agenda = agendas.find((a) => a.id === id)
  if (!agenda) throw new Error(`Agenda ${id} finns inte`)
  return agenda
}

function findNameList(id: string): NameList {
  const list = namelists.find((n) => n.id === id)
  if (!list) throw new Error(`Namnlista ${id} finns inte`)
  return list
}

// project.channel ({id,state}) och den fristående live-resurs-listan
// (`channels`, egen "tjänst" i mocken) är medvetet separata datamodeller —
// precis som i den riktiga arkitekturen (IVS-kanaler är en egen resurs, inte
// en del av projekt-tabellen). Mocken måste därför hålla dem synkade manuellt
// vid varje tillståndsändring, annars svarar channels.health()/get() aldrig
// rätt för en dynamiskt skapad/startad kanal.
function syncChannelState(id: string, state: ChannelState, markUsed = false) {
  const channel = channels.find((c) => c.id === id)
  if (!channel) return
  channel.state = state
  // lastUsedAt dubblar som "har den här kanalen varit live förut" — behövs för
  // att health() ska kunna skilja waitingForStream (aldrig sänt) från
  // streamEnded (sänt, nu tyst) utan en egen hysteres-modell.
  if (markUsed) channel.lastUsedAt = new Date().toISOString()
}

function ensureMockRecording(project: Project): Recording {
  const recordingId = project.recording?.id ?? `rec-${project.id}`
  const existing = recordings.find((recording) => recording.id === recordingId)
  if (existing) return existing

  const recording: Recording = {
    id: recordingId,
    kind: 'original',
    name: project.name,
    createdAt: new Date().toISOString(),
    durationSeconds: 5995,
    sizeBytes: 8_240_000_000,
    resolution: '1920×1080p50',
    source: 'Mockad inspelning',
    hlsUrl: MOCK_ONDEMAND_HLS_URL,
    project: { id: project.id, name: project.name, state: project.visibility },
    segments: [{ startedAt: new Date().toISOString(), durationSeconds: 5995 }],
    chapters: [
      { kind: 'agendaItem', label: '1. Mötet öppnas', offsetSeconds: 0 },
      { kind: 'agendaItem', label: '2. Föredragningslista', offsetSeconds: 180 },
      { kind: 'person', label: 'Ordförande', offsetSeconds: 720 },
      { kind: 'agendaItem', label: '3. Beslutsärenden', offsetSeconds: 1560 },
      { kind: 'agendaItem', label: '4. Mötet avslutas', offsetSeconds: 5760 },
    ],
  }
  recordings = [recording, ...recordings]
  return recording
}

let nextId = 100

// Mock-inloggning: ingen riktig PIN-kontroll, bara att e-posten matchar en
// fixturanvändare — håller bara i minnet, ingen persistens över omladdning.
let mockLoggedInUserId: string | null = null

function toCurrentUser(user: UserAccount): CurrentUser {
  const domain = domains.find((d) => d.id === user.domainId)
  if (!domain) throw new Error(`Domän ${user.domainId} finns inte`)
  return { id: user.id, name: user.name, email: user.email, domain, roles: user.roles }
}

export const mockClient: Client = {
  auth: {
    async login(email, _pin) {
      const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.status === 'active')
      if (!user) throw new Error('Fel e-postadress eller PIN-kod.')
      mockLoggedInUserId = user.id
      return delay(toCurrentUser(user))
    },
    async me() {
      const user = mockLoggedInUserId ? users.find((u) => u.id === mockLoggedInUserId) : undefined
      if (!user) throw new Error('Inte inloggad.')
      return delay(toCurrentUser(user))
    },
    async logout() {
      mockLoggedInUserId = null
      return delay(undefined)
    },
  },
  agendas: {
    async list(query) {
      const q = query?.trim().toLowerCase()
      const hits = !q
        ? agendas
        : agendas.filter((a) => (a.name + ' ' + a.description).toLowerCase().includes(q))
      return delay(clone(hits))
    },
    async get(id) {
      return delay(clone(agendas.find((a) => a.id === id)))
    },
    async create(input) {
      const agenda: Agenda = {
        id: `d${nextId++}`,
        name: input.name,
        description: input.description,
        itemCount: 0,
        usedInProjects: 0,
        changedAt: new Date().toISOString(),
        isTemplate: false,
        items: [],
      }
      agendas = [agenda, ...agendas]
      return delay(clone(agenda))
    },
    async update(id, input) {
      const agenda = findAgenda(id)
      Object.assign(agenda, input, { changedAt: new Date().toISOString() })
      return delay(clone(agenda))
    },
    async duplicate(id) {
      const source = findAgenda(id)
      const copy: Agenda = {
        ...clone(source),
        id: `d${nextId++}`,
        name: `${source.name} (kopia)`,
        usedInProjects: 0,
        changedAt: new Date().toISOString(),
        isTemplate: false,
      }
      agendas = [...agendas.slice(0, agendas.indexOf(source) + 1), copy, ...agendas.slice(agendas.indexOf(source) + 1)]
      return delay(clone(copy))
    },
    async trash(id) {
      agendas = agendas.filter((a) => a.id !== id)
      return delay(undefined)
    },
    async setTemplate(id, isTemplate) {
      const agenda = findAgenda(id)
      agenda.isTemplate = isTemplate
      return delay(clone(agenda))
    },
    async replaceItems(id, items) {
      const agenda = findAgenda(id)
      agenda.items = items
      agenda.itemCount = items.length
      agenda.changedAt = new Date().toISOString()
      return delay(clone(agenda))
    },
    async addItem(id, item) {
      const agenda = findAgenda(id)
      const newItem: AgendaItem = { id: `${id}i${nextId++}`, position: agenda.items.length + 1, ...item }
      agenda.items = [...agenda.items, newItem]
      agenda.itemCount = agenda.items.length
      agenda.changedAt = new Date().toISOString()
      return delay(clone(agenda))
    },
    async updateItem(id, itemId, item) {
      const agenda = findAgenda(id)
      agenda.items = agenda.items.map((it) => (it.id === itemId ? { ...it, ...item } : it))
      agenda.changedAt = new Date().toISOString()
      return delay(clone(agenda))
    },
    async removeItem(id, itemId) {
      const agenda = findAgenda(id)
      agenda.items = agenda.items
        .filter((it) => it.id !== itemId)
        .map((it, i) => ({ ...it, position: i + 1 }))
      agenda.itemCount = agenda.items.length
      agenda.changedAt = new Date().toISOString()
      return delay(clone(agenda))
    },
    async addAttachments(id, itemId, input) {
      const agenda = findAgenda(id)
      const item = agenda.items.find((candidate) => candidate.id === itemId)
      if (!item) throw new Error(`Punkt ${itemId} finns inte`)
      item.attachments = [
        ...(item.attachments ?? []),
        ...input.files.map((file) => ({
          id: `a${nextId++}`,
          fileName: file.name,
          contentType: 'application/pdf',
          sizeBytes: file.size,
          url: URL.createObjectURL(file),
        })),
      ]
      return delay(clone(agenda))
    },
    async removeAttachment(id, itemId, attachmentId) {
      const agenda = findAgenda(id)
      const item = agenda.items.find((candidate) => candidate.id === itemId)
      if (!item) throw new Error(`Punkt ${itemId} finns inte`)
      item.attachments = (item.attachments ?? []).filter((attachment) => attachment.id !== attachmentId)
      return delay(clone(agenda))
    },
  },
  meetings: {
    async list(domain): Promise<MeetingSummary[]> {
      return delay(clone(meetingFixtures[domain.trim().toLowerCase()]?.meetings ?? []))
    },
    async getAgenda(domain, meetingId): Promise<MeetingTopic[]> {
      const topics = meetingFixtures[domain.trim().toLowerCase()]?.topics[meetingId] ?? []
      return delay(clone(topics).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id))
    },
  },
  namelists: {
    async list(query) {
      const q = query?.trim().toLowerCase()
      const hits = !q
        ? namelists
        : namelists.filter((n) => (n.name + ' ' + n.description).toLowerCase().includes(q))
      return delay(clone(hits))
    },
    async get(id) {
      return delay(clone(namelists.find((n) => n.id === id)))
    },
    async create(input) {
      const list: NameList = {
        id: `n${nextId++}`,
        name: input.name,
        description: input.description,
        personCount: 0,
        usedInProjects: 0,
        changedAt: new Date().toISOString(),
        people: [],
      }
      namelists = [list, ...namelists]
      return delay(clone(list))
    },
    async update(id, input) {
      const list = findNameList(id)
      Object.assign(list, input, { changedAt: new Date().toISOString() })
      return delay(clone(list))
    },
    async duplicate(id) {
      const source = findNameList(id)
      const copy: NameList = {
        ...clone(source),
        id: `n${nextId++}`,
        name: `${source.name} (kopia)`,
        usedInProjects: 0,
        changedAt: new Date().toISOString(),
      }
      namelists = [
        ...namelists.slice(0, namelists.indexOf(source) + 1),
        copy,
        ...namelists.slice(namelists.indexOf(source) + 1),
      ]
      return delay(clone(copy))
    },
    async trash(id) {
      namelists = namelists.filter((n) => n.id !== id)
      return delay(undefined)
    },
    async replacePeople(id, people) {
      const list = findNameList(id)
      list.people = people
      list.personCount = people.length
      list.changedAt = new Date().toISOString()
      return delay(clone(list))
    },
    async addPerson(id, person) {
      const list = findNameList(id)
      const newPerson: NameListPerson = { id: `${id}p${nextId++}`, position: list.people.length + 1, ...person }
      list.people = [...list.people, newPerson]
      list.personCount = list.people.length
      list.changedAt = new Date().toISOString()
      return delay(clone(list))
    },
    async updatePerson(id, personId, person) {
      const list = findNameList(id)
      list.people = list.people.map((p) => (p.id === personId ? { ...p, ...person } : p))
      list.changedAt = new Date().toISOString()
      return delay(clone(list))
    },
    async removePerson(id, personId) {
      const list = findNameList(id)
      list.people = list.people
        .filter((p) => p.id !== personId)
        .map((p, i) => ({ ...p, position: i + 1 }))
      list.personCount = list.people.length
      list.changedAt = new Date().toISOString()
      return delay(clone(list))
    },
  },
  recordings: {
    async list(query) {
      const q = query?.trim().toLowerCase()
      const hits = !q ? recordings : recordings.filter((r) => r.name.toLowerCase().includes(q))
      return delay(clone(hits))
    },
    async get(id) {
      return delay(clone(recordings.find((r) => r.id === id)))
    },
    async selectSession(id) {
      return delay(clone(recordings.find((r) => r.id === id)))
    },
    async rename(id, name) {
      const recording = recordings.find((r) => r.id === id)
      if (!recording) throw new Error(`Inspelning ${id} finns inte`)
      recording.name = name
      return delay(clone(recording))
    },
    async trash(id) {
      const target = recordings.find((r) => r.id === id)
      if (!target) return delay(undefined)
      recordings = recordings.filter((r) => r !== target && r.parentId !== id)
      return delay(undefined)
    },
    async trim(id, range) {
      const selected = recordings.find((r) => r.id === id)
      const original = selected?.kind === 'trimmed' && selected.parentId
        ? recordings.find((r) => r.id === selected.parentId)
        : selected
      if (!original) throw new Error(`Inspelning ${id} finns inte`)
      const existing = recordings.find((r) => r.parentId === original.id)
      const duration = range.endOffsetSeconds - range.startOffsetSeconds
      const trimmed: Recording = {
        id: existing?.id ?? `${id}t`,
        kind: 'trimmed',
        parentId: original.id,
        name: `${original.name} (trimmad)`,
        createdAt: new Date().toISOString(),
        durationSeconds: duration,
        sizeBytes: Math.round((original.sizeBytes * duration) / original.durationSeconds),
        resolution: original.resolution,
        source: 'Trim av original',
        hlsUrl: original.hlsUrl.replace('/rec/', '/vod/').replace('/original', ''),
        project: original.project,
        segments: [],
        chapters: original.chapters
          .filter((chapter) => chapter.offsetSeconds >= range.startOffsetSeconds && chapter.offsetSeconds <= range.endOffsetSeconds)
          .map((chapter) => ({ ...chapter, offsetSeconds: chapter.offsetSeconds - range.startOffsetSeconds })),
        trimRange: range,
        published: existing?.published ?? false,
      }
      if (existing) {
        recordings = recordings.map((r) => (r.id === existing.id ? trimmed : r))
      } else {
        const idx = recordings.indexOf(original)
        recordings = [...recordings.slice(0, idx + 1), trimmed, ...recordings.slice(idx + 1)]
      }
      return delay(clone(trimmed))
    },
  },
  channels: {
    async list(query) {
      const q = query?.trim().toLowerCase()
      const hits = !q
        ? channels
        : channels.filter((c) => (c.name + ' ' + c.label).toLowerCase().includes(q))
      return delay(clone(hits))
    },
    async get(id) {
      return delay(clone(channels.find((c) => c.id === id)))
    },
    async quota() {
      return delay({ used: channels.length, limit: CHANNEL_QUOTA_LIMIT })
    },
    async create(input) {
      if (channels.length >= CHANNEL_QUOTA_LIMIT) {
        throw new Error(`Kanaltaket är nått (${CHANNEL_QUOTA_LIMIT}). Riv en vilande resurs först.`)
      }
      const id = `c${nextId++}`
      const slug = input.label.trim().toLowerCase().replace(/\s+/g, '-')
      const channel: Channel = {
        id,
        name: slug,
        label: input.label.trim(),
        state: 'idle',
        region: 'eu-north-1',
        type: 'STANDARD',
        latencyMode: 'LOW',
        recording: true,
        project: null,
        arn: `arn:aws:ivs:eu-north-1:4417:channel/${id}`,
        ingestEndpoint: `rtmps://${slug}.global-contribute.live-video.net:443/app/`,
        streamKeyMasked: 'sk_eu-north-1_••••••••••••••••',
        playbackUrl: `https://${slug}.eu-north-1.playback.live-video.net/…/master.m3u8`,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        idleDays: 0,
      }
      channels = [channel, ...channels]
      return delay(clone(channel))
    },
    async rename(id, label) {
      const channel = channels.find((c) => c.id === id)
      if (!channel) throw new Error(`Resurs ${id} finns inte`)
      channel.label = label
      return delay(clone(channel))
    },
    async teardown(id) {
      const channel = channels.find((c) => c.id === id)
      if (channel?.state === 'live') {
        throw new Error('Resursen sänder och kan inte rivas just nu.')
      }
      channels = channels.filter((c) => c.id !== id)
      return delay(undefined)
    },
    async rotateKey(id) {
      const channel = channels.find((c) => c.id === id)
      if (!channel) throw new Error(`Resurs ${id} finns inte`)
      return delay(clone(channel))
    },
    async health(id) {
      const channel = channels.find((c) => c.id === id)
      if (!channel) throw new Error(`Resurs ${id} finns inte`)
      // Mock-kanaler har bara binärt idle/live, ingen signalavbrotts-hysteres
      // — en dokumenterad förenkling, inte en egen mock-fasmaskin. lastUsedAt
      // (satt av setEncoderSending) skiljer ändå waitingForStream (aldrig
      // sänt) från streamEnded (sänt, nu tyst), så det guidade flödet i
      // Playout kan verifieras mot mocken.
      if (channel.state !== 'live') {
        return delay({ state: 'idle', livePhase: channel.lastUsedAt ? 'streamEnded' : 'waitingForStream' })
      }
      return delay({
        state: 'live',
        livePhase: 'live',
        bitrateKbps: 5980,
        resolution: '1920×1080p50',
        framerate: 50,
        lastFrameSecondsAgo: 0.4,
        streamStartedAt: channel.lastUsedAt ?? channel.createdAt,
      })
    },
    async getStreamKey(id) {
      const channel = channels.find((c) => c.id === id)
      return delay(channel ? `sk_eu-north-1_${channel.id}mockrealkey` : null)
    },
  },
  trash: {
    async list(query) {
      const q = query?.trim().toLowerCase()
      const hits = !q
        ? trashItems
        : trashItems.filter((t) => (t.name + ' ' + t.detail).toLowerCase().includes(q))
      return delay(clone(hits))
    },
    async restore(id) {
      trashItems = trashItems.filter((t) => t.id !== id)
      return delay(undefined)
    },
    async policy() {
      return delay({ retentionDays: TRASH_RETENTION_DAYS })
    },
  },
  domains: {
    async list() {
      const withLiveCounts = domains.map((d) => ({
        ...d,
        userCount: users.filter((u) => u.domainId === d.id).length,
      }))
      return delay(clone(withLiveCounts))
    },
    async create(input) {
      const domain: Domain = { id: `dm${nextId++}`, host: input.host, org: input.org, userCount: 0 }
      domains.push(domain)
      return delay(clone(domain))
    },
    async update(id, input) {
      const domain = domains.find((d) => d.id === id)
      if (!domain) throw new Error(`Domänen ${id} finns inte.`)
      domain.org = input.org
      if (input.contractStart !== undefined) domain.contractStart = input.contractStart
      if (input.contractEnd !== undefined) domain.contractEnd = input.contractEnd
      if (domain.contractStart && domain.contractEnd && domain.contractEnd < domain.contractStart) {
        throw new Error('Avtalets slutdatum måste vara efter startdatumet.')
      }
      return delay(clone(domain))
    },
    async remove(id) {
      if (users.some((u) => u.domainId === id)) {
        throw new Error('Domänen har användare kvar och kan inte tas bort.')
      }
      const idx = domains.findIndex((d) => d.id === id)
      if (idx >= 0) domains.splice(idx, 1)
      return delay(undefined)
    },
    async createUser(domainId, input) {
      const user: UserAccount = {
        id: `u${nextId++}`,
        domainId,
        name: input.name,
        email: input.email,
        roles: input.roles,
        status: 'notinvited',
        ssoEnabled: false,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
        activity: [],
      }
      users = [...users, user]
      return delay(clone(user))
    },
  },
  users: {
    async listByDomain(domainId, query) {
      const q = query?.trim().toLowerCase()
      const hits = users
        .filter((u) => u.domainId === domainId)
        .filter((u) => !q || (u.name + ' ' + u.email).toLowerCase().includes(q))
      return delay(clone(hits))
    },
    async get(id) {
      return delay(clone(users.find((u) => u.id === id)))
    },
    async update(id, input) {
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error(`Användare ${id} finns inte`)
      if (input.name !== undefined) user.name = input.name
      if (input.email !== undefined) user.email = input.email
      return delay(clone(user))
    },
    async sendInvitation(id, _pin) {
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error(`Användare ${id} finns inte`)
      user.status = 'invited'
      return delay(clone(user))
    },
    async resendInvite(id, pin) {
      return this.sendInvitation(id, pin)
    },
    async sendPasswordReset() {
      return delay(undefined)
    },
    async setRoles(id, roles) {
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error(`Användare ${id} finns inte`)
      const nextRoles: Role[] = roles.length ? [roles[0]] : ['operator']
      if (isOnlyActiveDomainAdmin(user) && !nextRoles.includes('domainAdmin')) {
        throw new Error('Domänen måste ha minst en aktiv administratör.')
      }
      user.roles = nextRoles
      return delay(clone(user))
    },
    async disable(id) {
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error(`Användare ${id} finns inte`)
      if (isOnlyActiveDomainAdmin(user)) {
        throw new Error('Domänen måste ha minst en aktiv administratör.')
      }
      user.status = 'disabled'
      return delay(clone(user))
    },
    async enable(id) {
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error(`Användare ${id} finns inte`)
      user.status = 'active'
      return delay(clone(user))
    },
    async remove(id) {
      const user = users.find((u) => u.id === id)
      if (user && isOnlyActiveDomainAdmin(user)) {
        throw new Error('Domänen måste ha minst en aktiv administratör.')
      }
      users = users.filter((u) => u.id !== id)
      return delay(undefined)
    },
  },
  projects: {
    async list(query) {
      const q = query?.trim().toLowerCase()
      const hits = !q ? projects : projects.filter((p) => p.name.toLowerCase().includes(q))
      return delay(hits.map(projectSnapshot))
    },
    async get(id) {
      const project = projects.find((p) => p.id === id)
      return delay(project ? projectSnapshot(project) : undefined)
    },
    async playout(id) {
      return delay(clone(findProject(id).playout))
    },
    async chapters(id) {
      const project = findProject(id)
      const recording = project.recording ? recordings.find((item) => item.id === project.recording!.id) : undefined
      return delay(clone(recording?.chapters ?? []))
    },
    async touchPlayout(_id) {
      await delay(undefined)
    },
    async create(input) {
      const project: Project = {
        id: `p${nextId++}`,
        name: input.name,
        createdAt: new Date().toISOString(),
        beforeText: '',
        liveText: '',
        afterText: '',
        ondemandText: '',
        visibility: 'closed',
        publicMode: 'before',
        afterReason: null,
        recordingReadiness: 'unknown',
        publicationHistory: [],
        playerUrl: `https://play.ungap.se/p/${input.name.trim().toLowerCase().replace(/\s+/g, '-')}`,
        channel: null,
        technicalHealth: defaultTechnicalHealth(),
        recording: null,
        publication: { state: 'none' },
        capabilities: defaultCapabilities(),
        onDemandLocked: false,
        agendaId: null,
        namelistId: null,
        sim: { everSent: false, segments: 0, accumulatedSeconds: 0, recordingStartedAt: null },
        playout: { currentAgendaItemId: null, currentPersonId: null, timeline: [] },
      }
      projects = [project, ...projects]
      return delay(projectSnapshot(project))
    },
    async rename(id, name, texts) {
      const p = findProject(id)
      p.name = name
      if (texts) Object.assign(p, texts)
      return delay(projectSnapshot(p))
    },
    async trash(id) {
      projects = projects.filter((p) => p.id !== id)
      return delay(undefined)
    },
    async setVisibility(id, visibility) {
      const p = findProject(id)
      if (p.publicMode === 'after' && visibility === 'open') return delay(projectSnapshot(p))
      p.visibility = visibility
      return delay(projectSnapshot(p))
    },
    async setPublicMode(id, publicMode, afterReason) {
      const p = findProject(id)
      if (p.publicMode === 'ondemand' && publicMode === 'live') {
        throw new Error('Gå först via Before innan projektet återgår till Live.')
      }
      if (publicMode === 'after') {
        const recording = ensureMockRecording(p)
        if (!p.recording || !['trimmed', 'published'].includes(p.recording.state)) {
          p.recording = { id: recording.id, state: 'recorded', hlsUrl: recording.hlsUrl }
          p.recordingReadiness = 'ready'
        }
        p.visibility = 'closed'
      }
      p.publicMode = publicMode
      if (publicMode === 'after') p.visibility = 'closed'
      p.afterReason = publicMode === 'after' ? afterReason ?? 'liveFinished' : null
      return delay(projectSnapshot(p))
    },
    async setAgenda(id, agendaId) {
      const p = findProject(id)
      p.agendaId = agendaId
      return delay(projectSnapshot(p))
    },
    async setNameList(id, namelistId) {
      const p = findProject(id)
      p.namelistId = namelistId
      return delay(projectSnapshot(p))
    },
    async setMeetingBinding(id, meetingDomain, meetingId, eventsEnabled = true) {
      const p = findProject(id)
      p.meetingBindingId ??= `mb-${p.id}`
      p.meetingDomain = meetingDomain
      p.meetingId = meetingId
      p.meetingEventsEnabled = eventsEnabled
      return delay(projectSnapshot(p))
    },
    async clearMeetingBinding(id) {
      const p = findProject(id)
      p.meetingBindingId = undefined
      p.meetingDomain = undefined
      p.meetingId = undefined
      return delay(projectSnapshot(p))
    },
    async createChannel(id) {
      const p = findProject(id)
      if (p.channel) throw new Error('Projektet har redan en live-resurs.')
      const channelId = `ch-${id}`
      const slug = p.name.trim().toLowerCase().replace(/\s+/g, '-')
      const channel: Channel = {
        id: channelId,
        name: slug,
        label: p.name,
        state: 'idle',
        region: 'eu-north-1',
        type: 'STANDARD',
        latencyMode: 'LOW',
        recording: true,
        project: { id: p.id, name: p.name, state: p.visibility },
        arn: `arn:aws:ivs:eu-north-1:4417:channel/${channelId}`,
        ingestEndpoint: `rtmps://${slug}.global-contribute.live-video.net:443/app/`,
        streamKeyMasked: 'sk_eu-north-1_••••••••••••••••',
        playbackUrl: `https://${slug}.eu-north-1.playback.live-video.net/…/master.m3u8`,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        idleDays: 0,
      }
      channels = [channel, ...channels]
      p.channel = { id: channelId, state: 'idle' }
      return delay(projectSnapshot(p))
    },
    async teardownChannel(id) {
      const p = findProject(id)
      if (!p.channel) return delay(projectSnapshot(p))
      if (p.channel.state === 'live') {
        throw new Error('Går inte att riva medan signal tas emot.')
      }
      channels = channels.filter((c) => c.id !== p.channel!.id)
      p.channel = null
      return delay(projectSnapshot(p))
    },
    async setEncoderSending(id, sending) {
      const p = findProject(id)
      if (!p.channel) throw new Error('Ingen live-resurs allokerad.')
      if (sending) {
        p.channel.state = 'live'
        syncChannelState(p.channel.id, 'live', true)
        p.sim.everSent = true
        p.sim.segments += 1
        p.sim.recordingStartedAt = new Date().toISOString()
        const recordingId = p.recording?.id ?? `rec-${id}`
        p.recording = p.recording ? { ...p.recording, state: 'recording' } : { id: recordingId, state: 'recording' }
        // project.recording ({id,state}) och den fristående videoarkiv-listan
        // (`recordings`) är, precis som channels/project.channel, medvetet
        // separata modeller — annars kraschar recordings.get()/trim() på en
        // inspelning som bara "finns" i projektets lättviktsreferens.
        if (!recordings.find((r) => r.id === recordingId)) {
          const slug = p.name.trim().toLowerCase().replace(/\s+/g, '-')
          recordings = [
            {
              id: recordingId,
              kind: 'original',
              name: p.name,
              createdAt: new Date().toISOString(),
              durationSeconds: 0,
              sizeBytes: 0,
              resolution: '1920×1080p50',
              source: 'IVS',
              hlsUrl: `https://dev.media.ungap.net/mock/${slug}/${recordingId}/master.m3u8`,
              project: { id: p.id, name: p.name, state: p.visibility },
              segments: [],
              chapters: [],
            },
            ...recordings,
          ]
        }
      } else {
        if (p.sim.recordingStartedAt) {
          p.sim.accumulatedSeconds += (Date.now() - new Date(p.sim.recordingStartedAt).getTime()) / 1000
        }
        p.sim.recordingStartedAt = null
        p.channel.state = 'idle'
        syncChannelState(p.channel.id, 'idle')
        if (p.recording?.state === 'recording') p.recording.state = 'recorded'
        const recording = recordings.find((r) => r.id === p.recording?.id)
        if (recording) {
          const elapsed = Math.max(1, Math.round(p.sim.accumulatedSeconds))
          recording.durationSeconds = elapsed
          recording.sizeBytes = elapsed * 1_500_000
          recording.segments = [{ startedAt: recording.createdAt, durationSeconds: elapsed }]
        }
      }
      return delay(projectSnapshot(p))
    },
    async interruptionDecision(id, decision) {
      const p = findProject(id)
      if (decision === 'end') p.visibility = 'closed'
      return delay(projectSnapshot(p))
    },
    async trim(id, range) {
      const p = findProject(id)
      if (!p.recording || !['recorded', 'trimmed', 'published'].includes(p.recording.state)) {
        throw new Error('Inspelningen måste vara klar innan den kan trimmas.')
      }
      const trimmed = await mockClient.recordings.trim(p.recording.id, range)
      p.recording = { id: trimmed.id, state: 'trimmed', hlsUrl: trimmed.hlsUrl }
      p.onDemandLocked = true
      return delay(projectSnapshot(p))
    },
    async createReviewLink(id) {
      const p = findProject(id)
      if (!p.recording || !['trimmed', 'published'].includes(p.recording.state)) {
        throw new Error('Trimma inspelningen innan en granskningslänk kan skapas.')
      }
      if (p.publication.state === 'none') p.publication.state = 'review'
      p.onDemandLocked = true
      return delay(projectSnapshot(p))
    },
    async publish(id) {
      const p = findProject(id)
      if (!p.recording || !['recorded', 'trimmed', 'published'].includes(p.recording.state)) {
        throw new Error('Inspelningen är inte klar för publicering.')
      }
      p.recording.state = 'published'
      p.publication.state = 'published'
      p.publicMode = 'ondemand'
      p.afterReason = null
      p.recordingReadiness = 'published'
      p.publicationHistory.push({
        id: `ph${nextId++}`,
        action: 'publish',
        actorName: 'Mockoperatör',
        occurredAt: new Date().toISOString(),
        recordingId: p.recording.id,
        manifestId: null,
        fromState: 'none',
        toState: 'published',
        reason: null,
        metadataJson: null,
      })
      p.onDemandLocked = true
      return delay(projectSnapshot(p))
    },
    async unpublish(id) {
      const p = findProject(id)
      if (p.recording) {
        const recording = recordings.find((item) => item.id === p.recording!.id)
        if (recording) recording.published = false
        p.recording = { ...p.recording, state: p.recording.state === 'published' ? 'trimmed' : p.recording.state }
      } else {
        const recording = ensureMockRecording(p)
        p.recording = { id: recording.id, state: 'recorded', hlsUrl: recording.hlsUrl }
      }
      p.publication.state = 'none'
      p.publicMode = 'after'
      p.visibility = 'closed'
      p.afterReason = 'ondemandUnpublished'
      p.recordingReadiness = 'ready'
      p.publicationHistory.push({
        id: `ph${nextId++}`,
        action: 'unpublish',
        actorName: 'Mockoperatör',
        occurredAt: new Date().toISOString(),
        recordingId: p.recording?.id ?? null,
        manifestId: null,
        fromState: 'published',
        toState: 'none',
        reason: 'ondemandUnpublished',
        metadataJson: null,
      })
      p.onDemandLocked = false
      return delay(projectSnapshot(p))
    },
    async returnToLive(id) {
      // Samma som servern: avkopplar ondemand-versionen och sätter läget Live, stängt.
      const p = findProject(id)
      if (p.recording?.state === 'trimmed' || p.recording?.state === 'published') p.recording = null
      p.publication.state = 'none'
      p.publicMode = 'live'
      p.visibility = 'closed'
      p.afterReason = null
      p.recordingReadiness = 'unknown'
      p.onDemandLocked = false
      return delay(projectSnapshot(p))
    },
    async cue(id, kind, refId, label) {
      const p = findProject(id)
      if (p.publication.state === 'published') throw new Error('Sändningen är publicerad. Utspelning är avstängd.')
      // Utspelning fungerar även offline — mötet ska kunna dokumenteras trots
      // enkoderstrul. offsetSeconds blir null tills sändningen är igång igen.
      const live = p.channel?.state === 'live'
      const offsetSeconds = live
        ? Math.round(
            p.sim.accumulatedSeconds +
              (p.sim.recordingStartedAt ? (Date.now() - new Date(p.sim.recordingStartedAt).getTime()) / 1000 : 0),
          )
        : null
      const event: TimelineEvent = {
        id: `ev${nextId++}`,
        kind,
        refId,
        label,
        occurredAt: new Date().toISOString(),
        offsetSeconds,
      }
      p.playout.timeline = [...p.playout.timeline, event]
      if (kind === 'agendaItem') p.playout.currentAgendaItemId = refId
      else p.playout.currentPersonId = refId
      return delay(clone(event))
    },
    async clear(id, kind) {
      const p = findProject(id)
      if (p.publication.state === 'published') throw new Error('Sändningen är publicerad. Utspelning är avstängd.')
      const live = p.channel?.state === 'live'
      const offsetSeconds = live
        ? Math.round(
            p.sim.accumulatedSeconds +
              (p.sim.recordingStartedAt ? (Date.now() - new Date(p.sim.recordingStartedAt).getTime()) / 1000 : 0),
          )
        : null
      const event: TimelineEvent = {
        id: `ev${nextId++}`,
        kind,
        refId: null,
        label: 'Rensat',
        occurredAt: new Date().toISOString(),
        offsetSeconds,
      }
      p.playout.timeline = [...p.playout.timeline, event]
      if (kind === 'agendaItem') p.playout.currentAgendaItemId = null
      else p.playout.currentPersonId = null
      return delay(clone(event))
    },
    async updateTimelineEvent(id, eventId, input) {
      const project = findProject(id)
      const event = project.playout.timeline.find((item) => item.id === eventId)
      if (!event) throw new Error(`Händelse ${eventId} finns inte`)
      if (input.label !== undefined) event.label = input.label
      if (input.offsetSeconds !== undefined) event.offsetSeconds = input.offsetSeconds
      return delay(clone(event))
    },
    async updateChapterOffset(_id, _index, _offsetSeconds) {
      return delay(undefined)
    },
    async resetSimulation(id) {
      const p = findProject(id)
      p.visibility = 'closed'
      p.channel = null
      p.recording = null
      p.publication = { state: 'none' }
      p.onDemandLocked = false
      p.sim = { everSent: false, segments: 0, accumulatedSeconds: 0, recordingStartedAt: null }
      p.playout = { currentAgendaItemId: null, currentPersonId: null, timeline: [] }
      return delay(projectSnapshot(p))
    },
  },
}

function findProject(id: string): Project {
  const project = projects.find((p) => p.id === id)
  if (!project) throw new Error(`Projekt ${id} finns inte`)
  return project
}

function isOnlyActiveDomainAdmin(user: UserAccount): boolean {
  if (!user.roles.includes('domainAdmin') || user.status !== 'active') return false
  const activeAdmins = users.filter(
    (u) => u.domainId === user.domainId && u.roles.includes('domainAdmin') && u.status === 'active',
  )
  return activeAdmins.length === 1
}
