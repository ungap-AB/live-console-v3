import type {
  Agenda,
  AgendaItem,
  AfterReason,
  Channel,
  ChannelHealth,
  ChannelQuota,
  CueKind,
  CurrentUser,
  Domain,
  NameList,
  NameListPerson,
  MeetingSummary,
  MeetingTopic,
  Project,
  PublicMode,
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

export interface AgendaAttachmentInput {
  files: File[]
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
  auth: {
    login(email: string, pin: string): Promise<CurrentUser>
    me(): Promise<CurrentUser>
    logout(): Promise<void>
  }
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
    addAttachments(id: string, itemId: string, input: AgendaAttachmentInput): Promise<Agenda>
    removeAttachment(id: string, itemId: string, attachmentId: string): Promise<Agenda>
  }
  meetings: {
    list(domain: string): Promise<MeetingSummary[]>
    getAgenda(domain: string, meetingId: number): Promise<MeetingTopic[]>
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
    selectSession(id: string, sessionId: string): Promise<Recording | undefined>
    rename(id: string, name: string): Promise<Recording>
    trash(id: string): Promise<void>
    trim(id: string, range: { startOffsetSeconds: number; endOffsetSeconds: number; sessionId?: string }): Promise<Recording>
  }
  channels: {
    list(query?: string): Promise<Channel[]>
    get(id: string): Promise<Channel | undefined>
    quota(): Promise<ChannelQuota>
    create(input: { label: string }): Promise<Channel>
    rename(id: string, label: string): Promise<Channel>
    teardown(id: string): Promise<void>
    rotateKey(id: string): Promise<Channel>
    health(id: string): Promise<ChannelHealth>
    /** Det riktiga, omaskerade stream key-värdet — server.channels.get()/list() returnerar bara streamKeyMasked. */
    getStreamKey(id: string): Promise<string | null>
  }
  trash: {
    list(query?: string): Promise<TrashItem[]>
    restore(id: string): Promise<void>
    policy(): Promise<{ retentionDays: number }>
  }
  domains: {
    list(): Promise<Domain[]>
    create(input: { host: string; org: string }): Promise<Domain>
    update(id: string, input: { org: string; contractStart?: string; contractEnd?: string }): Promise<Domain>
    remove(id: string): Promise<void>
    createUser(domainId: string, input: { email: string; name: string; roles: Role[] }): Promise<UserAccount>
  }
  users: {
    listByDomain(domainId: string, query?: string): Promise<UserAccount[]>
    get(id: string): Promise<UserAccount | undefined>
    update(id: string, input: { name?: string; email?: string }): Promise<UserAccount>
    sendInvitation(id: string, pin: string): Promise<UserAccount>
    resendInvite(id: string, pin: string): Promise<UserAccount>
    sendPasswordReset(id: string): Promise<void>
    setRoles(id: string, roles: Role[]): Promise<UserAccount>
    disable(id: string): Promise<UserAccount>
    enable(id: string): Promise<UserAccount>
    remove(id: string): Promise<void>
  }
  projects: {
    list(query?: string): Promise<Project[]>
    get(id: string): Promise<Project | undefined>
    playout(id: string): Promise<Project['playout']>
    touchPlayout(id: string): Promise<void>
    create(input: { name: string }): Promise<Project>
    rename(id: string, name: string, texts?: Partial<Pick<Project, 'beforeText' | 'liveText' | 'afterText' | 'ondemandText'>>): Promise<Project>
    trash(id: string): Promise<void>
    setVisibility(id: string, visibility: Visibility): Promise<Project>
    setPublicMode(id: string, publicMode: PublicMode, afterReason?: AfterReason): Promise<Project>
    setAgenda(id: string, agendaId: string | null): Promise<Project>
    setNameList(id: string, namelistId: string | null): Promise<Project>
    setMeetingBinding(id: string, meetingDomain: string, meetingId: string, eventsEnabled?: boolean): Promise<Project>
    clearMeetingBinding(id: string): Promise<Project>
    createChannel(id: string): Promise<Project>
    teardownChannel(id: string): Promise<Project>
    /** Mockup-bara: simulerar att enkodern startar/stoppar sändning. */
    setEncoderSending(id: string, sending: boolean): Promise<Project>
    interruptionDecision(id: string, decision: 'wait_for_reconnect' | 'end'): Promise<Project>
    trim(id: string, range: { startOffsetSeconds: number; endOffsetSeconds: number; sessionId?: string }): Promise<Project>
    createReviewLink(id: string): Promise<Project>
    publish(id: string): Promise<Project>
    /** Avpublicerar inspelningen: läget blir After (afterReason ondemandUnpublished) och manifestet tas bort. */
    unpublish(id: string): Promise<Project>
    returnToLive(id: string): Promise<Project>
    cue(id: string, kind: CueKind, refId: string, label: string): Promise<TimelineEvent>
    /** Rensar aktiv dagordningspunkt/namnskylt — loggas som en egen tidslinjehändelse, tar inte bort tidigare utspelningar. */
    clear(id: string, kind: CueKind): Promise<TimelineEvent>
    /** Mockup-bara: återställer sändningssimuleringen till ett obörjat läge. */
    resetSimulation(id: string): Promise<Project>
  }
}
