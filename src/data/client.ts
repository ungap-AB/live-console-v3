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
    /** "Glömt PIN?": ber servern skicka ett återställningsmejl. Svarar likadant oavsett om adressen finns. */
    requestPasswordReset(email: string): Promise<void>
    /** Engångslänken i ett inbjudnings-/återställningsmejl. Ändrar inget — är bara en kontroll av att länken fortfarande gäller. */
    credentialLinkInfo(token: string): Promise<import('./types').CredentialLinkInfo>
    /** Förbrukar länken och ger användaren en ny, server-genererad PIN (visas en gång). */
    redeemCredentialLink(token: string): Promise<import('./types').CredentialLinkRedeemed>
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
    getActive(domain: string): Promise<MeetingSummary | null>
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
    rename(id: string, name: string): Promise<Recording>
    trash(id: string): Promise<void>
    trim(id: string, range: { startOffsetSeconds: number; endOffsetSeconds: number }): Promise<Recording>
    /**
     * Startar förberedelsen av en MP4 och resolvar direkt (servern kör jobbet, se jobbfältet). Finns en färdig
     * fil resolvar den med state 'done' och url; annars med state 'processing'.
     */
    startDownload(id: string, options?: { notifyByEmail?: boolean }): Promise<import('./types').DownloadJob>
    /**
     * UNG-55/56/57: laddar upp en videofil (presigned PUT mot S3) och startar HLS-transkodningen.
     * Resolvar när transkodningen startat — inte när den är klar; servern slutför jobbet själv och
     * projektets recording.state går från 'processing' till 'recorded'. Inspelningen hör alltid till ett projekt.
     */
    upload(
      file: File,
      projectId: string,
      name?: string,
      onProgress?: (fraction: number) => void,
      options?: { notifyByEmail?: boolean },
    ): Promise<import('./types').UploadJob>
    /**
     * UNG-102: kopplar en HLS-adress i stället för att ladda upp en fil. Servern läser bara metadata ur spellistan och
     * avvisar ogiltiga eller onåbara adresser med ett tydligt fel. Videon väntar sedan på godkännande som en uppladdad fil.
     */
    connectExternalHls(projectId: string, hlsUrl: string, name?: string): Promise<void>
    /** Godkänner den uppladdade filen: den ersätter projektets tidigare inspelningar (mjukraderas, återställs av admin från papperskorgen). */
    acceptUpload(id: string): Promise<void>
    /** Behåller de tidigare inspelningarna — den uppladdade filen ignoreras. */
    rejectUpload(id: string): Promise<void>
  }
  shares: {
    /** Delar färdiga nedladdningar via en länk utan inloggning (7 dagar). Mejlar mottagarna. */
    create(input: import('./types').ShareInput): Promise<import('./types').CreatedShare>
    list(): Promise<import('./types').Share[]>
    /** Detaljvy med logg. */
    get(id: string): Promise<import('./types').Share>
    /** Återkallar direkt för nya klick (en redan utfärdad nedladdningslänk lever kvar i högst 15 minuter). */
    revoke(id: string): Promise<import('./types').Share>
  }
  /** Publika delningssidan (UNG-80 steg 4): fungerar utan inloggning, token kommer ur länkens fragment. */
  publicDownloads: {
    lookup(token: string): Promise<import('./types').PublicShare>
    /** En färsk kortlivad länk till en fil i delningen. Avvisas om delningen inte är giltig eller filen gått ut. */
    link(token: string, itemId: string): Promise<import('./types').DownloadLink>
  }
  jobs: {
    /** Domänens pågående och senaste mediajobb (nedladdning/uppladdning), nyast först. */
    list(): Promise<import('./types').MediaJob[]>
    /** Avbryter ett pågående jobb (UNG-100). Avvisas om jobbet hunnit bli klart. */
    cancel(id: string): Promise<import('./types').MediaJob>
    /** Färsk länk till ett klart nedladdningsjobb. Startar aldrig ett nytt jobb — avvisas om filen gått ut. */
    downloadLink(id: string): Promise<import('./types').DownloadLink>
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
    /** muxEnvKey: tom sträng tar bort kundens egen nyckel (standardnyckeln gäller då); utelämnad lämnar den oförändrad. */
    update(id: string, input: { org: string; contractStart?: string; contractEnd?: string; muxEnvKey?: string }): Promise<Domain>
    remove(id: string): Promise<void>
    createUser(domainId: string, input: { email: string; name: string; roles: Role[] }): Promise<UserAccount>
  }
  users: {
    listByDomain(domainId: string, query?: string): Promise<UserAccount[]>
    get(id: string): Promise<UserAccount | undefined>
    update(id: string, input: { name?: string; email?: string }): Promise<UserAccount>
    /** Skickar ett välkomstmejl med en engångslänk (7 dagar); PIN skapas av servern när mottagaren klickar på länken. */
    sendInvitation(id: string): Promise<UserAccount>
    resendInvite(id: string): Promise<UserAccount>
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
    chapters(id: string): Promise<import('./types').Chapter[]>
    /** Projektets egna spända inspelningar (Kind=Original), för "Sändning"-väljaren i Ondemand. */
    recordings(id: string): Promise<import('./types').ProjectRecording[]>
    /** Byter vilken inspelning som räknas som aktiv för Ondemand — räknar om kapitlens tider. */
    setActiveRecording(id: string, recordingId: string): Promise<Project>
    touchPlayout(id: string): Promise<void>
    /** layoutSourceProjectId: projektet vars spelarlayout kopieras till det nya (UNG-180). Utan det blir projektet som förut. */
    create(input: { name: string; layoutSourceProjectId?: string }): Promise<Project>
    /** Ersätter projektets spelarlayout (texter, placering, Mux) med en kopia av ett annat projekts (UNG-180). */
    inheritLayout(id: string, sourceProjectId: string): Promise<Project>
    rename(id: string, name: string, texts?: Partial<Pick<Project, 'beforeText' | 'liveText' | 'afterText' | 'ondemandText' | 'textPlacement' | 'muxEnabled' | 'muxRespectDoNotTrack' | 'dvrEnabled' | 'exclamationsAsSpeakers'>>): Promise<Project>
    trash(id: string): Promise<void>
    /** Laddar upp spelarens poster (JPG/PNG/WebP, högst 5 MB). Ersätter en tidigare poster. */
    /** Laddar upp undertexter (WebVTT) för den trimmade, publicerade inspelningen. Ersätter en tidigare fil. */
    setCaptions(id: string, file: File): Promise<import('./types').ProjectCaptions>
    removeCaptions(id: string): Promise<void>
    /** UNG-126: senaste automatiska genereringen (jobb + utkast) för projektets uppspelningsinspelning. */
    getCaptionGeneration(id: string): Promise<import('./types').CaptionGeneration>
    /** Startar automatisk undertextning. Ett redan pågående jobb för inspelningen återanvänds. */
    generateCaptions(id: string, notifyByEmail: boolean): Promise<import('./types').CaptionGeneration>
    /** Godkänner utkastet: det publiceras som projektets undertext (samma väg som en uppladdad VTT-fil). */
    approveCaptionDraft(id: string, version?: number): Promise<import('./types').CaptionGeneration>
    /** UNG-138: mastern som radlista. Spara med den version du utgick från (409 om någon annan hunnit före). */
    getCaptionMaster(id: string): Promise<import('./types').CaptionMaster>
    saveCaptionMaster(id: string, input: { ifVersion: number; cues: { start: number; end: number; text: string }[] }): Promise<import('./types').CaptionMaster>
    /** UNG-149: ljudets energikurva för vågformsbandet, eller null om den saknas (äldre utkast). */
    getCaptionEnergy(id: string): Promise<import('./types').CaptionEnergy | null>
    listCaptionVersions(id: string): Promise<import('./types').CaptionVersionInfo[]>
    restoreCaptionVersion(id: string, version: number, ifVersion: number): Promise<import('./types').CaptionMaster>
    discardCaptionDraft(id: string): Promise<void>
    /** Sparar utkastets VTT-fil via webbläsaren. */
    downloadCaptionDraft(id: string): Promise<void>
    /** UNG-194: kapitel för arkivering som Word-dokument (servern bygger det). */
    exportChaptersDocx(id: string): Promise<Blob>
    /** De publicerade undertexterna som fil, i den publicerade videons tid (servern läser dem ur lagringen). */
    exportCaptions(id: string, format: 'vtt' | 'srt'): Promise<Blob>
    setPoster(id: string, file: File): Promise<Project>
    removePoster(id: string): Promise<Project>
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
    trim(id: string, range: { startOffsetSeconds: number; endOffsetSeconds: number }): Promise<Project>
    createReviewLink(id: string): Promise<Project>
    publish(id: string): Promise<Project>
    /** Avpublicerar inspelningen: läget blir After (afterReason ondemandUnpublished) och manifestet tas bort. */
    unpublish(id: string): Promise<Project>
    restoreOriginal(id: string): Promise<Project>
    returnToLive(id: string): Promise<Project>
    cue(id: string, kind: CueKind, refId: string, label: string): Promise<TimelineEvent>
    /** Rensar aktiv dagordningspunkt/namnskylt — loggas som en egen tidslinjehändelse, tar inte bort tidigare utspelningar. */
    clear(id: string, kind: CueKind): Promise<TimelineEvent>
    /** Startar en paus (UNG-119) med texten som visas över videon i spelaren, eller byter texten på en pågående paus. */
    pause(id: string, text: string): Promise<TimelineEvent>
    /** Avslutar en pågående paus. Svarar 409 not_paused om ingen paus pågår. */
    resume(id: string): Promise<TimelineEvent>
    updateTimelineEvent(id: string, eventId: string, input: { label?: string; offsetSeconds?: number }): Promise<TimelineEvent>
    deleteTimelineEvent(id: string, eventId: string): Promise<void>
    updateDraftChapter(id: string, chapterId: string, input: { label?: string; offsetSeconds?: number }): Promise<void>
    /** Uppladdad video: förankrar kapitellistan — ankarkapitlet ligger vid anchorOffsetSeconds; redan förankrade kapitel flyttas lika mycket, övriga räknas efter sin tidsskillnad mot det. */
    syncChapters(id: string, anchorChapterId: string, anchorOffsetSeconds: number): Promise<{ synced: number; outsideVideo: number }>
    /** Lägger till ett eget kapitel på en videoposition (uppladdad video). */
    addChapter(id: string, input: { kind: CueKind; label: string; offsetSeconds: number }): Promise<void>
    /** Ersätter hela kapitellistan med en importerad lista (en källa åt gången). Tiden i varje rad avgör läget. */
    /** mode "add" lägger till i det som finns (bara inspelade sändningar, UNG-169); standard ersätter listan. */
    importChapters(id: string, items: import('./types').ChapterImportItem[], mode?: 'replace' | 'add'): Promise<import('./types').ChapterImportResult>
    /** Operatören litar på förankringen — hävs publiceringsspärren. */
    confirmChapterSync(id: string): Promise<void>
    deleteDraftChapter(id: string, chapterId: string): Promise<void>
    updateChapterOffset(id: string, index: number, input: { offsetSeconds?: number; label?: string }): Promise<void>
    updatePublishedChapter(id: string, chapterId: string, input: { offsetSeconds?: number; label?: string }): Promise<void>
    deleteChapter(id: string, index: number): Promise<void>
    deletePublishedChapter(id: string, chapterId: string): Promise<void>
    saveTrimDraft(id: string, draft: import('./types').TrimDraft): Promise<Project>
    /** Mockup-bara: återställer sändningssimuleringen till ett obörjat läge. */
    resetSimulation(id: string): Promise<Project>
  }
}
