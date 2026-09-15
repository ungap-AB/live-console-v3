import type { Client } from '../client'
import type {
  Agenda,
  AgendaItem,
  Channel,
  CurrentUser,
  Domain,
  NameList,
  NameListPerson,
  Project,
  Recording,
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
} from './fixtures'

const CHANNEL_QUOTA_LIMIT = 20
const TRASH_RETENTION_DAYS = 30

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
  return JSON.parse(JSON.stringify(value))
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
    async trash(id) {
      const target = recordings.find((r) => r.id === id)
      if (!target) return delay(undefined)
      recordings = recordings.filter((r) => r !== target && r.parentId !== id)
      return delay(undefined)
    },
    async trim(id, range) {
      const original = recordings.find((r) => r.id === id)
      if (!original) throw new Error(`Inspelning ${id} finns inte`)
      const existing = recordings.find((r) => r.parentId === id)
      const duration = range.endOffsetSeconds - range.startOffsetSeconds
      const trimmed: Recording = {
        id: existing?.id ?? `${id}t`,
        kind: 'trimmed',
        parentId: id,
        name: `${original.name} (trimmad)`,
        createdAt: new Date().toISOString(),
        durationSeconds: duration,
        sizeBytes: Math.round((original.sizeBytes * duration) / original.durationSeconds),
        resolution: original.resolution,
        source: 'Trim av original',
        hlsUrl: original.hlsUrl.replace('/rec/', '/vod/').replace('/original', ''),
        project: original.project,
        segments: [],
        chapters: [],
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
      // Mock-kanaler har bara binärt idle/live, ingen hysteres/avbrottskoncept
      // — en dokumenterad förenkling, inte en egen mock-fasmaskin.
      if (channel.state !== 'live') return delay({ state: 'idle', livePhase: 'waitingForStream' })
      return delay({
        state: 'live',
        livePhase: 'live',
        bitrateKbps: 5980,
        resolution: '1920×1080p50',
        framerate: 50,
        lastFrameSecondsAgo: 0.4,
        streamStartedAt: channel.createdAt,
      })
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
    async invite(domainId, input) {
      const user: UserAccount = {
        id: `u${nextId++}`,
        domainId,
        name: input.name,
        email: input.email,
        roles: input.roles,
        status: 'invited',
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
    async resendInvite() {
      return delay(undefined)
    },
    async sendPasswordReset() {
      return delay(undefined)
    },
    async setRoles(id, roles) {
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error(`Användare ${id} finns inte`)
      const nextRoles = roles.length ? roles : ['reviewer' as const]
      if (isOnlyActiveAdmin(user) && !nextRoles.includes('admin')) {
        throw new Error('Domänen måste ha minst en aktiv administratör.')
      }
      user.roles = nextRoles
      return delay(clone(user))
    },
    async disable(id) {
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error(`Användare ${id} finns inte`)
      if (isOnlyActiveAdmin(user)) {
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
      if (user && isOnlyActiveAdmin(user)) {
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
      return delay(clone(hits))
    },
    async get(id) {
      return delay(clone(projects.find((p) => p.id === id)))
    },
    async create(input) {
      const project: Project = {
        id: `p${nextId++}`,
        name: input.name,
        createdAt: new Date().toISOString(),
        visibility: 'closed',
        playerUrl: `https://play.ungap.se/p/${input.name.trim().toLowerCase().replace(/\s+/g, '-')}`,
        channel: null,
        recording: null,
        publication: { state: 'none' },
        agendaId: null,
        namelistId: null,
        sim: { everSent: false, segments: 0, accumulatedSeconds: 0, recordingStartedAt: null },
        playout: { currentAgendaItemId: null, currentPersonId: null, timeline: [] },
      }
      projects = [project, ...projects]
      return delay(clone(project))
    },
    async trash(id) {
      projects = projects.filter((p) => p.id !== id)
      return delay(undefined)
    },
    async setVisibility(id, visibility) {
      const p = findProject(id)
      p.visibility = visibility
      return delay(clone(p))
    },
    async setAgenda(id, agendaId) {
      const p = findProject(id)
      p.agendaId = agendaId
      return delay(clone(p))
    },
    async setNameList(id, namelistId) {
      const p = findProject(id)
      p.namelistId = namelistId
      return delay(clone(p))
    },
    async createChannel(id) {
      const p = findProject(id)
      if (p.channel) throw new Error('Projektet har redan en live-resurs.')
      p.channel = { id: `ch-${id}`, state: 'idle' }
      return delay(clone(p))
    },
    async teardownChannel(id) {
      const p = findProject(id)
      if (!p.channel) return delay(clone(p))
      if (p.channel.state === 'live') {
        throw new Error('Går inte att riva medan signal tas emot.')
      }
      p.channel = null
      return delay(clone(p))
    },
    async setEncoderSending(id, sending) {
      const p = findProject(id)
      if (!p.channel) throw new Error('Ingen live-resurs allokerad.')
      if (sending) {
        p.channel.state = 'live'
        p.sim.everSent = true
        p.sim.segments += 1
        p.sim.recordingStartedAt = new Date().toISOString()
        p.recording = p.recording
          ? { ...p.recording, state: 'recording' }
          : { id: `rec-${id}`, state: 'recording' }
      } else {
        if (p.sim.recordingStartedAt) {
          p.sim.accumulatedSeconds += (Date.now() - new Date(p.sim.recordingStartedAt).getTime()) / 1000
        }
        p.sim.recordingStartedAt = null
        p.channel.state = 'idle'
        if (p.recording?.state === 'recording') p.recording.state = 'recorded'
      }
      return delay(clone(p))
    },
    async trim(id) {
      const p = findProject(id)
      if (!p.recording || !['recorded', 'trimmed'].includes(p.recording.state)) {
        throw new Error('Inspelningen måste vara klar innan den kan trimmas.')
      }
      p.recording.state = 'trimmed'
      return delay(clone(p))
    },
    async createReviewLink(id) {
      const p = findProject(id)
      if (!p.recording || !['trimmed', 'published'].includes(p.recording.state)) {
        throw new Error('Trimma inspelningen innan en granskningslänk kan skapas.')
      }
      if (p.publication.state === 'none') p.publication.state = 'review'
      return delay(clone(p))
    },
    async publish(id) {
      const p = findProject(id)
      if (!p.recording || p.recording.state !== 'trimmed') {
        throw new Error('Trimma inspelningen innan publicering.')
      }
      p.recording.state = 'published'
      p.publication.state = 'published'
      return delay(clone(p))
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
    async resetSimulation(id) {
      const p = findProject(id)
      p.visibility = 'closed'
      p.channel = null
      p.recording = null
      p.publication = { state: 'none' }
      p.sim = { everSent: false, segments: 0, accumulatedSeconds: 0, recordingStartedAt: null }
      p.playout = { currentAgendaItemId: null, currentPersonId: null, timeline: [] }
      return delay(clone(p))
    },
  },
}

function findProject(id: string): Project {
  const project = projects.find((p) => p.id === id)
  if (!project) throw new Error(`Projekt ${id} finns inte`)
  return project
}

function isOnlyActiveAdmin(user: UserAccount): boolean {
  if (!user.roles.includes('admin') || user.status !== 'active') return false
  const activeAdmins = users.filter(
    (u) => u.domainId === user.domainId && u.roles.includes('admin') && u.status === 'active',
  )
  return activeAdmins.length === 1
}
