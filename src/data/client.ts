import type {
  Agenda,
  AgendaItem,
  Channel,
  ChannelHealth,
  ChannelQuota,
  CueKind,
  Domain,
  NameList,
  NameListPerson,
  Project,
  Recording,
  Role,
  TimelineEvent,
  TrashItem,
  UserAccount,
  Visibility,
} from './types'

export interface AgendaInput {
  name: string
  description: string
}

export interface NameListInput {
  name: string
  description: string
}

// Client är den enda ytan vyerna pratar med. Steg 2 (koppla mot live-server)
// byter ut mockClient.ts mot en fetch-baserad implementation utan att vyerna
// behöver ändras. Domänerna läggs till här i samma takt som deras vyer byggs
// (se PLAN-byggordningen) — inga oanvända metoder i väntan på en vy.
export interface Client {
  agendas: {
    list(query?: string): Promise<Agenda[]>
    get(id: string): Promise<Agenda | undefined>
    create(input: AgendaInput): Promise<Agenda>
    update(id: string, input: Partial<AgendaInput>): Promise<Agenda>
    duplicate(id: string): Promise<Agenda>
    trash(id: string): Promise<void>
    setTemplate(id: string, isTemplate: boolean): Promise<Agenda>
    replaceItems(id: string, items: AgendaItem[]): Promise<Agenda>
    addItem(id: string, item: Omit<AgendaItem, 'id' | 'position'>): Promise<Agenda>
    updateItem(id: string, itemId: string, item: Omit<AgendaItem, 'id' | 'position'>): Promise<Agenda>
    removeItem(id: string, itemId: string): Promise<Agenda>
  }
  namelists: {
    list(query?: string): Promise<NameList[]>
    get(id: string): Promise<NameList | undefined>
    create(input: NameListInput): Promise<NameList>
    update(id: string, input: Partial<NameListInput>): Promise<NameList>
    duplicate(id: string): Promise<NameList>
    trash(id: string): Promise<void>
    replacePeople(id: string, people: NameListPerson[]): Promise<NameList>
    addPerson(id: string, person: Omit<NameListPerson, 'id' | 'position'>): Promise<NameList>
    updatePerson(
      id: string,
      personId: string,
      person: Omit<NameListPerson, 'id' | 'position'>,
    ): Promise<NameList>
    removePerson(id: string, personId: string): Promise<NameList>
  }
  recordings: {
    list(query?: string): Promise<Recording[]>
    get(id: string): Promise<Recording | undefined>
    trash(id: string): Promise<void>
    trim(id: string, range: { startOffsetSeconds: number; endOffsetSeconds: number }): Promise<Recording>
  }
  channels: {
    list(query?: string): Promise<Channel[]>
    get(id: string): Promise<Channel | undefined>
    quota(): Promise<ChannelQuota>
    create(input: { label: string }): Promise<Channel>
    teardown(id: string): Promise<void>
    rotateKey(id: string): Promise<Channel>
    health(id: string): Promise<ChannelHealth | null>
  }
  trash: {
    list(query?: string): Promise<TrashItem[]>
    restore(id: string): Promise<void>
    policy(): Promise<{ retentionDays: number }>
  }
  domains: {
    list(): Promise<Domain[]>
    create(input: { host: string; org: string }): Promise<Domain>
    update(id: string, input: { org: string }): Promise<Domain>
    remove(id: string): Promise<void>
    invite(domainId: string, input: { email: string; name: string; roles: Role[] }): Promise<UserAccount>
  }
  users: {
    listByDomain(domainId: string, query?: string): Promise<UserAccount[]>
    get(id: string): Promise<UserAccount | undefined>
    update(id: string, input: { name?: string; email?: string }): Promise<UserAccount>
    resendInvite(id: string): Promise<void>
    sendPasswordReset(id: string): Promise<void>
    setRoles(id: string, roles: Role[]): Promise<UserAccount>
    disable(id: string): Promise<UserAccount>
    enable(id: string): Promise<UserAccount>
    remove(id: string): Promise<void>
  }
  projects: {
    list(query?: string): Promise<Project[]>
    get(id: string): Promise<Project | undefined>
    create(input: { name: string }): Promise<Project>
    trash(id: string): Promise<void>
    setVisibility(id: string, visibility: Visibility): Promise<Project>
    setAgenda(id: string, agendaId: string | null): Promise<Project>
    setNameList(id: string, namelistId: string | null): Promise<Project>
    createChannel(id: string): Promise<Project>
    teardownChannel(id: string): Promise<Project>
    /** Mockup-bara: simulerar att enkodern startar/stoppar sändning. */
    setEncoderSending(id: string, sending: boolean): Promise<Project>
    trim(id: string): Promise<Project>
    createReviewLink(id: string): Promise<Project>
    publish(id: string): Promise<Project>
    cue(id: string, kind: CueKind, refId: string, label: string): Promise<TimelineEvent>
    removeTimelineEvent(id: string, eventId: string): Promise<void>
    /** Mockup-bara: återställer sändningssimuleringen till ett obörjat läge. */
    resetSimulation(id: string): Promise<Project>
  }
}
