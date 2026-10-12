import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { notifyJobsChanged } from '../../app/jobsBus'
import { shouldCaptureTab, shouldTogglePlayback, spaceAction, spaceTargetKind, tabOriginIndex, tabTargetIndex, tabTargetKind } from './captionKeysLogic'
import { cueCharCount, isLongCue } from './captionLengthLogic'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { client } from '../../data'
import { ApiError } from '../../data/http/fetchJson'
import type { CaptionDraft, CaptionEnergy, CaptionGeneration, CaptionMaster, Chapter, ChapterImportResult, CueKind, DraftStatus, EditorSource, WordImportResult } from '../../data/types'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Icon } from '../../components/Icon'
import { formatHms } from '../../app/time'
import {
  activeCueIndex, formatCueTime, rangeStatus, savePayload,
} from './captionEditorLogic'
import { rowPosition, scrollToRevealRow, uniformCueLayout, windowRows } from './rowLayout'
import { chapterGroupInfo, collapsibleGroupIds, visibleChapters } from './chapterGroups'
import {
  LONG_GAP_SECONDS, addCue, deleteCue, diffState, mergeInfo, mergeWithNext, shiftFrom,
  newCueTime, sortedForSave, splitCue, validateCues, withoutEmpty, type EditCue, type OpResult,
} from './captionEditOps'
import { estimateSplitTime, moveBoundary } from './captionFlow'
import { deriveTimes, speechRuns } from './captionTimingLogic'
import { emptyHistory, record, redo, undo, type History } from './captionHistory'
import { CaptionWaveform, WAVEFORM_WIDTH, type ChapterMark } from './CaptionWaveform'
import { TrimBar } from '../../components/TrimBar'
import { PositionScrubber } from '../../components/PositionScrubber'
import { VideoPositionControls } from '../../components/VideoPositionControls'
import { playEndFrom, type TrimRange } from '../../components/trimBarLogic'
import { conflictDescription, headerActions, isConflictCode, overwriteLabel, trimChanged, trimDraftPayload, type ConflictInfo, type DraftAction } from './draftActions'
import {
  addChapter as addChapterTo, changeCount as chapterChangeTotal, chapterKindText, chapterLayout, currentChapters,
  diffChapters, mergeRows, positionedChapters, removeChapter, renameChapter, setChapterTime, sortChapters, type EditorChapter,
} from './chapterRows'
import { timeAtRow, type GrabRole } from './captionWaveformLogic'
import { showUnmute, unmuted } from './videoSoundLogic'
import { WordImportDialog } from './WordImportDialog'
import { ChapterImportDialog } from './ChapterImportDialog'
import { AnchorGuide } from './ChapterSyncTools'
import { exportFileName } from './chapterExport'
import { saveFile } from './ExportImportDialog'
import { Modal } from '../../components/Modal'
import { CaptionToolsDialog, type CaptionTool } from './CaptionToolsDialog'
import { VttImportDialog, type VttTimeline } from './VttImportDialog'
import { WordReviewBar } from './WordReviewBar'
import { buildReview, isLocked, nextReviewIndex, openConflicts, reviewIndexes, conflictKey, type WordReview } from './wordImportLogic'
import './CaptionEditor.css'

const ROW_HEIGHT = 84
/** Kapitelrader är enkelradiga (UNG-228). */
const CHAPTER_ROW_HEIGHT = 40

// Fliken Verktyg är dold tillsvidare; med bara en flik visas rättningarna under en rubrik i stället för en flikrad.
const SHOW_TOOLS_TAB = false

interface CaptionEditorProps {
  projectId: string
  projectName: string
  onClose: () => void
  /** UNG-250: ökas när redigeraren ska stängas utifrån (bakåtknappen); frågar om osparat som Stäng. */
  closeSignal?: number
  /** Anropas efter en lyckad sparning, så att omgivande vy kan hämta om status. */
  onSaved?: () => void
  /** Anropas när "Skapa på nytt" har startat ett nytt jobb, så att omgivande vy kan visa framsteget (redigeraren stängs då). */
  onRegenerated?: (generation: CaptionGeneration) => void
  /** Anropas efter att kapitel sparats (utkastet ändrat), så att omgivande vy kan hämta om kapitlen och visa opublicerade ändringar. */
  onChaptersSaved?: () => void
  /**
   * Trimningen (UNG-236/ondemand): den del av originalet som publiceras, i originalets tid. Ägs av omgivande vy, som tillämpar den vid
   * Publicera ondemand. Saknas den visas inga trimkontroller i redigeraren.
   */
  trim?: EditorTrim
  /** UNG-247: projektet är publicerat: trimningen visas låst, med en väg till Avpublicera (redigeraren stängs först). */
  trimLock?: { onUnpublish: () => void }
  /** UNG-248: förra försöket att skapa undertexter misslyckades (felet), när projektet ännu saknar undertexter. */
  createFailed?: string
  /** UNG-249: det kapitelverktygen (import och förankring) behöver veta om projektet. Saknas det finns bara Tid här och Synk. */
  chapterTools?: EditorChapterTools
  /** Momentet som redigeraren öppnas med (After: de guidade stegen). Saknas det öppnas den som vanligt. */
  focus?: EditorFocus
}

/**
 * Momentet i fokus när redigeraren öppnas: trim (som vanligt), kapitel (listan visar bara kapitel) eller undertexter (utan undertexter
 * frågar den direkt om att skapa dem).
 */
export type EditorFocus = 'trim' | 'chapters' | 'captions'

/** UNG-249: projektets uppgifter för kapitelverktygen. */
export interface EditorChapterTools {
  /** Videon är uppladdad (eller extern): kapitel med klockslag förankras med guiden. */
  uploadedRecording: boolean
  agendaId: string | null
  /** Datum (ÅÅÅÅ-MM-DD) som klockslag utan datum tolkas mot vid import. */
  importDefaultDate?: string
}

/**
 * Trimningen som redigeraren visar och ändrar. start/end är den pågående trimningen; savedStart/savedEnd det som är sparat som utkast
 * (skillnaden är osparat). onSaved anropas när trimningen sparats, så att omgivande vy kan hämta om projektet.
 */
export interface EditorTrim {
  start: number
  end: number
  savedStart: number
  savedEnd: number
  onChange: (range: TrimRange) => void
  onSaved?: () => void
  /** UNG-246: Ladda om efter en konflikt: omgivande vy hämtar om projektet så att trimningen blir den sparade. */
  onReload?: () => void
}

// UNG-248: ett projekt utan undertexter öppnas med en tom master ur redigerarens källa (video, längd och trim), så att resten av redigeraren
// (kapitel, trim, Spara och Publicera) fungerar som vanligt. Versionen används aldrig: utan repliker finns inget att spara.
function emptyMaster(source: EditorSource): CaptionMaster {
  return {
    recordingId: '',
    language: 'sv',
    version: 0,
    updatedAtUtc: '',
    cues: [],
    originalHlsUrl: source.originalHlsUrl,
    originalDurationSeconds: source.originalDurationSeconds,
    publishedStartSeconds: source.publishedStartSeconds,
    publishedEndSeconds: source.publishedEndSeconds,
    legacy: false,
    draftRevision: source.draftRevision,
  }
}

/** Allt som går att ångra: replikerna och kapitlen i ett steg (UNG-229). */
interface Snapshot {
  cues: EditCue[]
  chapters: EditorChapter[]
}

const seconds = (value: number) => value.toFixed(1).replace('.', ',')

// Efter ett musklick lämnas fokus inte kvar på knappen: annars skulle mellanslag aktivera knappen igen och Tab gå till nästa knapp i stället
// för att styra redigeraren (UNG-231). Ett tangentbordsklick (detail 0) behåller fokus.
function blurAfterMouse(event: MouseEvent) {
  if (event.detail > 0) (event.currentTarget as HTMLElement).blur()
}

// UNG-140/143: redigerare för undertexterna (mastern, original-tidslinje). Video med aktuell replik över bilden och en virtualiserad
// radlista där texten rättas på plats. Rutor kan slås ihop (exakt tid), delas, orden kan flyttas mellan grannar, tider justeras,
// rader läggs till och tas bort, och allt går att ångra tills man sparar. Sparas som en version (versionskontroll mot servern).
export function CaptionEditor({ projectId, projectName, onClose, closeSignal, onSaved, onRegenerated, onChaptersSaved, trim, trimLock, createFailed, chapterTools, focus }: CaptionEditorProps) {
  const [master, setMaster] = useState<CaptionMaster | null>(null)
  // UNG-248: projektet har undertexter. Utan dem är redigeraren bara-kapitel-läget, med video och trimbalk, och Skapa undertexter i huvudet.
  const [hasCaptions, setHasCaptions] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [cues, setCues] = useState<EditCue[]>([])
  const [saved, setSaved] = useState<EditCue[]>([])
  const [history, setHistory] = useState<History<Snapshot>>(emptyHistory)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  // UNG-246: någon annan har sparat sedan redigeraren öppnades. Dialogen erbjuder Ladda om eller Skriv över (gör om det som stoppades).
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [retry, setRetry] = useState<DraftAction | null>(null)
  const actionRef = useRef<DraftAction>('save')
  const [follow, setFollow] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [videoError, setVideoError] = useState('')
  // UNG-211: videon är mutad eller har volym noll (följer videoelementets egna händelser, så det gäller även mute via kontrollerna eller tangentbordet).
  const [soundOff, setSoundOff] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [pendingMerge, setPendingMerge] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [shiftInput, setShiftInput] = useState('0,5')
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [focusTick, setFocusTick] = useState(0)
  const [energy, setEnergy] = useState<CaptionEnergy | null>(null)
  // Verktyg för vald replik under videon (dolda tillsvidare). Rättningslistan och hjälptexten är borttagna (UI-finslipning).
  const sideTab: 'tools' | 'none' = SHOW_TOOLS_TAB ? 'tools' : 'none'
  // Utkastet som servern känner till (för att veta om det går att publicera), och publiceringens tillstånd (UNG-165: Publicera i huvudet).
  const [draftInfo, setDraftInfo] = useState<CaptionDraft | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // UNG-245: en publicering för undertexter och kapitel (Publicera ändringar), godkännande av maskinutkast, och förkasta.
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [draftStatus, setDraftStatus] = useState<DraftStatus | null>(null)
  // Utkastets versionsnummer som nästa skrivning villkoras på (UNG-241). Uppdateras av varje svar som bär det.
  const draftRevision = useRef<number | undefined>(undefined)
  // Undertexternas version som nästa sparning villkoras på. Följer den inlästa mastern, utom efter "Skriv över" (då serverns senaste).
  const captionVersion = useRef<number | undefined>(undefined)
  // "Skapa på nytt" i huvudet: nytt jobb från ljudet, efter bekräftelse.
  const [canRegenerate, setCanRegenerate] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  // UNG-272: egen VTT-fil som utkast, och borttagning av undertexterna.
  const [showVttImport, setShowVttImport] = useState(false)
  const [vttError, setVttError] = useState('')
  const [confirmRemoveCaptions, setConfirmRemoveCaptions] = useState(false)
  const [captionsBusy, setCaptionsBusy] = useState(false)
  // Öppnad med Skapa undertexter (After) i ett projekt utan undertexter: frågan om att skapa dem visas direkt, en gång.
  const askedToCreate = useRef(false)
  useEffect(() => {
    if (focus !== 'captions' || hasCaptions || !master || !canRegenerate || askedToCreate.current) return
    askedToCreate.current = true
    setConfirmRegenerate(true)
  }, [focus, hasCaptions, master, canRegenerate])
  // Valen vid "Skapa på nytt" är samma som när undertexterna skapas första gången (mejla, och talarbyten när servern har dem påslagna, UNG-205).
  const [regenNotify, setRegenNotify] = useState(false)
  const [regenSpeakers, setRegenSpeakers] = useState(false)
  const [speakersAvailable, setSpeakersAvailable] = useState(false)
  const [speakersReady, setSpeakersReady] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  // Gränsen (replikindex) som dras, med antal ord i de två berörda replikerna när draget började (för orden-just-nu-märket).
  // UNG-147: rättningar inlästa från Word. review = granskningsläget (null när det inte pågår eller är avslutat), fromWord = det som sparas kommer från Word.
  const [review, setReview] = useState<WordReview | null>(null)
  const [fromWord, setFromWord] = useState(false)
  const [exportChoice, setExportChoice] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [wordDialog, setWordDialog] = useState<{ baseChoice: boolean } | null>(null)
  const [dragBoundary, setDragBoundary] = useState<{ index: number; role: GrabRole; baseBefore: number; baseAfter: number } | null>(null)
  // UNG-228/229: kapitlen (punkter och personer med position). chapterList är arbetskopian och savedChapters det servern har. 'none' = inga
  // kapitel att visa eller ändra (projektet är inte i After/Ondemand, eller listan är den skrivskyddade historiken).
  const [chapterState, setChapterState] = useState<'loading' | 'ok' | 'none'>('loading')
  const [chapterList, setChapterList] = useState<EditorChapter[]>([])
  const [savedChapters, setSavedChapters] = useState<EditorChapter[]>([])
  // UNG-249: alla kapitel som servern har, även de utan position (utan tid, klockslag som inte förankrats), för kapitelverktygen.
  const [serverChapters, setServerChapters] = useState<Chapter[]>([])
  const [chapterBusy, setChapterBusy] = useState(false)
  const [showChapterImport, setShowChapterImport] = useState(false)
  const [guide, setGuide] = useState<{ step: 1 | 2 | 3; anchorId: string | null } | null>(null)
  const [showChapters, setShowChapters] = useState(true)
  // UNG-231: filtret Undertexter. Med bara Kapitel på blir listan en kompakt översikt utan vågform, där talarna är grupperade under sin punkt
  // och hopfällda tills man öppnar punkten.
  const [showCues, setShowCues] = useState(focus !== 'chapters')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  // Tiden vid listans övre kant när läget byts, så att listan hamnar på samma ställe i det nya läget.
  const modeScrollTime = useRef<number | null>(null)
  const [editingChapter, setEditingChapter] = useState<string | null>(null)
  const [chapterDraft, setChapterDraft] = useState('')
  // Ny rad i Ej synkade kapitel (parkeras på servern utan tid och placeras sedan med Tid här).
  const [addChapterOpen, setAddChapterOpen] = useState(false)
  const [addKind, setAddKind] = useState<'agendaItem' | 'person'>('agendaItem')
  const [addLabel, setAddLabel] = useState('')
  const [showCaptionTools, setShowCaptionTools] = useState(false)
  // UNG-230: det markerade kapitlet (vinner vid grepp i bandet) och ett kapitel som dras (tiden gäller bara under draget; listans ordning
  // ligger fast tills det släpps, och först då blir det ett steg i historiken).
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null)
  const [chapterDragTime, setChapterDragTime] = useState<{ id: string; time: number } | null>(null)
  const chapterDragRef = useRef<{ id: string; time: number } | null>(null)
  const chapterRevealRef = useRef<string | null>(null)
  // Enter och blur kan båda avsluta ett namnbyte; bara det första räknas.
  const chapterEditFinished = useRef(true)

  const videoRef = useRef<HTMLVideoElement>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Listans element hålls också i tillstånd (via en stabil ref-funktion), så att höjdmätningen alltid följer det element som faktiskt finns
  // i sidan. Tidigare mättes ett element som hunnit bytas ut: det gav höjd 0 och vågformsbandet försvann.
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null)
  const setListRef = useRef((element: HTMLDivElement | null) => {
    listRef.current = element
    setListElement(element)
  }).current
  const areas = useRef(new Map<number, HTMLTextAreaElement>())
  const pendingFocus = useRef<{ index: number; caret?: number } | null>(null)
  const focusBase = useRef<{ id: number; cues: EditCue[] } | null>(null)
  const tempId = useRef(-1)
  const cuesRef = useRef<EditCue[]>([])
  cuesRef.current = cues
  const dragBase = useRef<EditCue[] | null>(null)

  // Visningstiden räknas ut ur gränserna och talet (UNG-161): operatören placerar bara gränserna. Utan energikurva lämnas tiderna orörda.
  const timing = useMemo(
    () => ({ runs: energy ? speechRuns(energy) : null, total: energy ? (energy.data.length * energy.intervalMs) / 1000 : 0 }),
    [energy],
  )
  // Läses via en ref: funktioner som skapades innan energikurvan kom (t.ex. inläsningen av undertexterna) ska också härleda med den.
  const timingRef = useRef(timing)
  timingRef.current = timing
  const derive = (list: EditCue[]) => deriveTimes(list, timingRef.current.runs, timingRef.current.total)

  function adopt(next: CaptionMaster) {
    if (next.draftRevision !== undefined) draftRevision.current = next.draftRevision
    captionVersion.current = next.version
    const list = derive(next.cues.map(({ id, start, end, text }) => ({ id, start, end, text })))
    setMaster(next)
    setCues(list)
    setSaved(list)
    setHistory(emptyHistory())
    setReview(null)
    setFromWord(false)
    focusBase.current = null
  }

  // Kapitlen från servern: alla till verktygen, och de med position som arbetskopia och sparat.
  function adoptChapters(list: Chapter[]) {
    const positioned = positionedChapters(list)
    setServerChapters(list)
    setChapterList(positioned)
    setSavedChapters(positioned)
  }

  // Mastern, eller en tom master när projektet saknar undertexter (UNG-248).
  async function fetchMaster(): Promise<CaptionMaster> {
    try {
      const next = await client.projects.getCaptionMaster(projectId)
      setHasCaptions(true)
      return next
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'captions_not_found')) throw err
      setHasCaptions(false)
      return emptyMaster(await client.projects.getEditorSource(projectId))
    }
  }

  async function load() {
    setLoadError('')
    try {
      adopt(await fetchMaster())
      setConflict(null)
      setSaveError('')
      setNotice('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Undertexterna kunde inte hämtas.')
    }
  }

  useEffect(() => {
    void load()
    void refreshStatus()
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    client.projects.getCaptionGeneration(projectId).then(
      (generation) => {
        if (cancelled) return
        setDraftInfo(generation.draft ?? null)
        setCanRegenerate(generation.canGenerate)
        setSpeakersAvailable(generation.speakersAvailable === true)
        setSpeakersReady(generation.speakers?.state === 'ready')
      },
      () => {},
    )
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    client.projects.chapters(projectId).then(
      (list) => {
        if (cancelled) return
        adoptChapters(list)
        setChapterState(list.some((chapter) => chapter.readOnly) ? 'none' : 'ok')
      },
      () => { if (!cancelled) setChapterState('none') },
    )
    return () => { cancelled = true }
  }, [projectId])

  // UNG-149/152: ljudets energikurva till vågformsbandet. Saknas den (eller kan inte hämtas) fungerar redigeraren som förut.
  useEffect(() => {
    let cancelled = false
    client.projects.getCaptionEnergy(projectId).then(
      (value) => { if (!cancelled) setEnergy(value) },
      () => { if (!cancelled) setEnergy(null) },
    )
    return () => { cancelled = true }
  }, [projectId])

  // När energikurvan kommer efter att undertexterna lästs in härleds tiderna om (för både arbetskopian och det sparade).
  useEffect(() => {
    if (!timing.runs) return
    setCues((current) => derive(current))
    setSaved((current) => derive(current))
  }, [timing])


  // Det sparade jämförs i härledd form: annars ser varje replik ändrad ut (gul kant) så fort en enda redigering härlett om alla tider.
  const diff = useMemo(() => diffState(derive(saved), cues), [saved, cues, timing])
  const chapterChanges = useMemo(() => diffChapters(savedChapters, chapterList), [savedChapters, chapterList])
  const chaptersDirty = chapterChangeTotal(chapterChanges) > 0
  // UNG-249: kapitel utan position (visas i ett eget block) och de som stegas fram med Synk (utan tid).
  const toolsEnabled = chapterState === 'ok' && !(master?.legacy ?? false)
  // Ej synkade kapitel: utan tid i videon på servern och inte heller placerade i arbetskopian (Tid här som ännu inte sparats).
  const unplacedChapters = serverChapters.filter((chapter) => (chapter.synced === false || (chapter.timing !== undefined && chapter.timing !== 'positioned'))
    && !chapterList.some((item) => item.id === chapter.chapterId))
  const syncState = serverChapters.find((chapter) => chapter.syncState)?.syncState
  const anchorCandidates = serverChapters.filter((chapter) => chapter.anchorable)
  const anchorToolsVisible = toolsEnabled && Boolean(chapterTools?.uploadedRecording) && anchorCandidates.length > 0
  const anchorChapter = guide?.anchorId ? serverChapters.find((chapter) => chapter.chapterId === guide.anchorId) : undefined
  const cuesDirty = diff.dirty
  // UNG-245: trimmen (ägs av omgivande vy) räknas också som osparad tills den sparats som utkast.
  const trimDirty = trimChanged(trim)
  // Undertexter, kapitel och trim är ett enda "osparat": en Spara (UNG-229, UNG-245).
  const dirty = cuesDirty || chaptersDirty || trimDirty
  const changeCount = diff.changedIds.size + diff.removed + (diff.reordered && diff.changedIds.size + diff.removed === 0 ? 1 : 0) + chapterChangeTotal(chapterChanges) + (trimDirty ? 1 : 0)
  const readOnly = master?.legacy ?? false
  // Publicera i huvudet: publicerad = den sparade versionen är den godkända och inget är ändrat sedan dess.
  const unreviewed = Boolean(draftInfo?.unreviewed) && !readOnly
  const actions = headerActions({
    published: draftStatus?.published ?? false,
    serverChanges: draftStatus?.hasUnpublishedChanges ?? false,
    localDirty: dirty,
    busy: saving || publishing || regenerating,
    readOnly,
  })
  const issues = useMemo(() => validateCues(cues), [cues])
  const issueByIndex = useMemo(() => {
    const map = new Map<number, (typeof issues)[number]>()
    for (const issue of issues) if (!map.has(issue.index) || issue.error) map.set(issue.index, issue)
    return map
  }, [issues])
  const selected = cues[selectedIndex]

  // ---- Video ----
  const hlsUrl = master?.originalHlsUrl
  // UNG-172: spelaren kopplas till det <video>-element som finns just nu. Byts elementet ut (av vilken anledning som helst) kopplas
  // spelaren om, i stället för att det nya elementet blir en tom ruta utan källa.
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const videoRefCallback = useRef((element: HTMLVideoElement | null) => {
    videoRef.current = element
    setVideoElement(element)
  }).current
  useEffect(() => {
    const video = videoElement
    if (!video || !hlsUrl) return
    if (!isPlayerSupported) {
      setVideoError('Videospelaren kan inte köras i den här webbläsaren.')
      return
    }
    const player = create({ wasmWorker, wasmBinary })
    player.attachHTMLVideoElement(video)
    player.load(hlsUrl)
    const onTime = () => setCurrentTime(video.currentTime)
    const onSound = () => setSoundOff(showUnmute({ muted: video.muted, volume: video.volume }))
    onSound()
    video.addEventListener('volumechange', onSound)
    video.addEventListener('loadedmetadata', onSound)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('volumechange', onSound)
      video.removeEventListener('loadedmetadata', onSound)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      player.pause()
      player.delete()
    }
  }, [hlsUrl, videoElement])

  // UNG-184: placeringen som mellanslag spelar från. Sätts av ett klick i vågformen och avslutas av allt annat som flyttar videon
  // (en rads spelknapp, fokus i en replikruta, videons egna kontroller, hopp till publicerad del). Gränsdrag och mellanslagets egna
  // hopp behåller den (keepAnchor).
  const [anchor, setAnchorState] = useState<number | null>(null)
  const anchorRef = useRef<number | null>(null)
  function setAnchor(next: number | null) {
    anchorRef.current = next
    setAnchorState(next)
  }

  function seekTo(target: number, play: boolean, keepAnchor = false) {
    if (!keepAnchor && anchorRef.current !== null) setAnchor(null)
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, target)
    setCurrentTime(video.currentTime)
    if (play) void video.play().catch(() => undefined)
  }

  const playhead = () => videoRef.current?.currentTime ?? currentTime
  const activeIndex = useMemo(() => activeCueIndex(cues, currentTime), [cues, currentTime])
  const activeCue = activeIndex >= 0 ? cues[activeIndex] : null

  // ---- Lista (virtualiserad) ----
  useEffect(() => {
    const element = listElement
    if (!element) return
    // En mätning på 0 (listan dold eller ännu inte lagd) ignoreras: då skulle vågformsbandet få höjd 0 och försvinna tills storleken ändras.
    const update = () => {
      if (element.clientHeight > 0) setViewportHeight(element.clientHeight)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [listElement])

  // UNG-228: kapitlen visas som egna rader bland replikerna.
  // Ordgranskningsläget (Word) har låsta rader och egen navigering: där visas inga kapitel.
  // UNG-248: utan undertexter är listan alltid bara kapitel (även tom, så att det första kapitlet går att lägga till).
  const chaptersAvailable = chapterState === 'ok' && (chapterList.length > 0 || !hasCaptions) && review === null
  const chaptersVisible = (showChapters || !hasCaptions) && chaptersAvailable
  const chaptersOnly = chaptersVisible && !(showCues && hasCaptions)
  const listRows = useMemo(() => (chaptersVisible && !chaptersOnly ? mergeRows(cues, chapterList) : null), [chaptersVisible, chaptersOnly, cues, chapterList])

  // UNG-231: bara kapitel. Talarna hör till punkten före dem (lös gruppering ur tidsordningen) och är hopfällda tills punkten öppnas.
  // Ett markerat kapitel håller sin grupp öppen.
  const chapterOnlyRows = useMemo(() => {
    if (!chaptersOnly) return []
    const items = chapterList.map((chapter) => ({ chapterId: chapter.id, kind: chapter.kind }))
    const info = chapterGroupInfo(items)
    const collapsed = new Set(collapsibleGroupIds(items).filter((id) => !expandedGroups.has(id)))
    const visible = visibleChapters(items, collapsed, [selectedChapterId])
    const rows: { chapter: EditorChapter; group: { toggle?: { open: boolean; count: number; onToggle: () => void }; child?: boolean } }[] = []
    chapterList.forEach((chapter, index) => {
      if (!visible[index]) return
      const entry = info[index]
      if (entry.isHeader && entry.childCount > 0) {
        const open = !collapsed.has(chapter.id)
        rows.push({
          chapter,
          group: {
            toggle: {
              open,
              count: entry.childCount,
              onToggle: () => setExpandedGroups((current) => {
                const next = new Set(current)
                if (next.has(chapter.id)) next.delete(chapter.id)
                else next.add(chapter.id)
                return next
              }),
            },
          },
        })
      } else {
        rows.push({ chapter, group: { child: entry.groupId !== null && !entry.isHeader } })
      }
    })
    return rows
  }, [chaptersOnly, chapterList, expandedGroups, selectedChapterId])

  // UNG-227/228/231: listans geometri som en layout: en rad per replik (med kapitelrader emellan när de visas), eller bara kapitelrader.
  const layout = useMemo(() => {
    if (chaptersOnly) return uniformCueLayout(chapterOnlyRows.map((row) => ({ start: row.chapter.time, end: row.chapter.time })), CHAPTER_ROW_HEIGHT)
    return listRows ? chapterLayout(cues, listRows, ROW_HEIGHT, CHAPTER_ROW_HEIGHT) : uniformCueLayout(cues, ROW_HEIGHT)
  }, [cues, listRows, chaptersOnly, chapterOnlyRows])
  const nowChapters = useMemo(() => currentChapters(chapterList, currentTime), [chapterList, currentTime])
  const chapterMarks = useMemo<ChapterMark[]>(() => {
    if (!listRows) return []
    const marks: ChapterMark[] = []
    listRows.forEach((row, rowIndex) => {
      if (row.kind !== 'chapter') return
      const { chapter } = row
      marks.push({
        id: chapter.id,
        row: rowIndex,
        time: chapterDragTime?.id === chapter.id ? chapterDragTime.time : chapter.time,
        kind: chapter.kind,
        label: chapter.label,
        current: chapter.id === nowChapters.agenda?.id || chapter.id === nowChapters.person?.id,
        selected: chapter.id === selectedChapterId,
      })
    })
    return marks
  }, [listRows, nowChapters, chapterDragTime, selectedChapterId])
  // Punkten och personen vid listans övre kant: det man läser just nu. (Kapitelrader ligger kvar som rubrik överst.)
  const topChapters = chaptersVisible ? currentChapters(chapterList, timeAtRow(layout.spans, rowPosition(layout, scrollTop)) + 0.001) : null
  const { first, last } = windowRows(layout, scrollTop, viewportHeight)

  function revealRow(index: number) {
    const element = listRef.current
    if (!element || chaptersOnly) return
    const next = scrollToRevealRow(layout, layout.cueRow(index), element.scrollTop, element.clientHeight)
    if (next !== element.scrollTop) {
      element.scrollTop = next
      setScrollTop(next)
    }
  }

  // UNG-231: byte mellan lägena (båda, bara kapitel, bara undertexter) behåller platsen i mötet: tiden vid listans övre kant i det gamla
  // läget blir listans övre kant i det nya. Minst ett av filtren är alltid på.
  function changeFilter(next: { cues: boolean; chapters: boolean }) {
    modeScrollTime.current = timeAtRow(layout.spans, rowPosition(layout, scrollTop))
    setShowCues(next.cues)
    setShowChapters(next.chapters)
  }

  useEffect(() => {
    const time = modeScrollTime.current
    if (time === null) return
    modeScrollTime.current = null
    const element = listRef.current
    if (!element || layout.count === 0) return
    // Första raden vars ankartid ligger vid eller efter tiden (annars sista raden).
    let row = layout.spans.findIndex((span) => span.start >= time - 0.001)
    if (row < 0) row = layout.count - 1
    element.scrollTop = layout.top(row)
    setScrollTop(element.scrollTop)
  }, [chaptersOnly, chaptersVisible])

  // Raden får fokus (och markören sin plats) så snart den finns i listan, efter att den scrollats fram vid behov.
  function focusRow(index: number, caret?: number) {
    pendingFocus.current = { index, caret }
    setSelectedChapterId(null)
    setSelectedIndex(index)
    setFocusTick((tick) => tick + 1)
  }

  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    if (pending.index < 0 || pending.index >= cues.length) {
      pendingFocus.current = null
      return
    }
    const area = areas.current.get(pending.index)
    if (area) {
      pendingFocus.current = null
      area.focus()
      if (pending.caret !== undefined) area.setSelectionRange(pending.caret, pending.caret)
    } else {
      revealRow(pending.index)
    }
  }, [focusTick, scrollTop, first, last, cues])

  // UNG-230: ett kapitel som dragits och släppts scrollas fram på sin nya plats.
  useEffect(() => {
    const id = chapterRevealRef.current
    if (!id || !listRows) return
    chapterRevealRef.current = null
    const row = listRows.findIndex((item) => item.kind === 'chapter' && item.chapter.id === id)
    const element = listRef.current
    if (row < 0 || !element) return
    const next = scrollToRevealRow(layout, row, element.scrollTop, element.clientHeight)
    if (next !== element.scrollTop) {
      element.scrollTop = next
      setScrollTop(next)
    }
  }, [listRows])

  // Listan följer med uppspelningen, men inte medan operatören skriver.
  useEffect(() => {
    if (!follow || !playing || activeIndex < 0) return
    if (document.activeElement instanceof HTMLTextAreaElement) return
    revealRow(activeIndex)
  }, [activeIndex, follow, playing])

  // "Följ med" slås av när operatören själv scrollar (hjul, touch eller drag i rullningslisten), inte av vår egen scroll.
  // Slås den på igen hoppar listan direkt till den rad som spelas.
  function stopFollowing() {
    setFollow(false)
  }

  useEffect(() => {
    if (follow && activeIndex >= 0) revealRow(activeIndex)
  }, [follow])

  // ---- Ändringar och ångra ----
  function setText(index: number, text: string) {
    setCues((current) => derive(current.map((cue, position) => (position === index ? { ...cue, text } : cue))))
  }

  // Skrivning i en ruta är en ändring för sig: den sparas i historiken när rutan lämnas (eller vid ångra), inte per tecken.
  function commitTypingTo(base: History<Snapshot>): History<Snapshot> {
    const typing = focusBase.current
    focusBase.current = null
    if (!typing) return base
    const before = typing.cues.find((cue) => cue.id === typing.id)
    const now = cues.find((cue) => cue.id === typing.id)
    return before && now && before.text !== now.text ? record(base, { cues: typing.cues, chapters: chapterList }) : base
  }

  function apply(result: OpResult): boolean {
    if (!result.ok) {
      setNotice(result.reason)
      return false
    }
    setNotice('')
    setHistory(record(commitTypingTo(history), { cues, chapters: chapterList }))
    setCues(derive(result.cues))
    focusRow(result.focusIndex, result.caret)
    return true
  }

  // UNG-229: en ändring av kapitlen är ett steg i samma historik som ändringar av replikerna.
  function applyChapters(next: EditorChapter[]) {
    setNotice('')
    setHistory(record(commitTypingTo(history), { cues, chapters: chapterList }))
    setChapterList(sortChapters(next))
  }

  function chapterHere(id: string) {
    if (readOnly) return
    applyChapters(setChapterTime(chapterList, id, playhead()))
  }

  function chapterDragStart(id: string) {
    if (readOnly) return
    setSelectedChapterId(id)
    chapterDragRef.current = null
    setNotice('')
  }

  function chapterDragMove(id: string, time: number) {
    if (readOnly) return
    const limit = master?.originalDurationSeconds && master.originalDurationSeconds > 0 ? master.originalDurationSeconds : Number.POSITIVE_INFINITY
    const next = { id, time: Math.min(limit, Math.max(0, Math.round(time))) }
    chapterDragRef.current = next
    setChapterDragTime(next)
    seekTo(next.time, false, true)
  }

  // Släpps kapitlet sorteras det in på sin nya plats (ett steg i historiken) och listan scrollar så att raden syns.
  function chapterDragEnd() {
    const drag = chapterDragRef.current
    chapterDragRef.current = null
    setChapterDragTime(null)
    if (!drag) return
    const chapter = chapterList.find((item) => item.id === drag.id)
    if (!chapter || chapter.time === drag.time) return
    chapterRevealRef.current = drag.id
    applyChapters(setChapterTime(chapterList, drag.id, drag.time))
  }

  function chapterDelete(id: string) {
    if (readOnly) return
    if (editingChapter === id) setEditingChapter(null)
    applyChapters(removeChapter(chapterList, id))
  }

  function beginChapterEdit(chapter: EditorChapter) {
    if (readOnly) return
    chapterEditFinished.current = false
    setEditingChapter(chapter.id)
    setChapterDraft(chapter.label)
  }

  function finishChapterEdit(commit: boolean) {
    if (chapterEditFinished.current) return
    chapterEditFinished.current = true
    const id = editingChapter
    setEditingChapter(null)
    if (!commit || id === null) return
    const label = chapterDraft.trim()
    const current = chapterList.find((chapter) => chapter.id === id)
    if (current && label !== '' && label !== current.label) applyChapters(renameChapter(chapterList, id, label))
  }

  // Ett nytt kapitel parkeras direkt på servern utan tid (påverkar inte tittarna). Arbetskopian av listan rörs inte, så osparade ändringar
  // ligger kvar; bara listan med ej synkade kapitel läses om.
  async function addUntimedChapter() {
    if (readOnly) return
    const label = addLabel.trim() || (addKind === 'agendaItem' ? 'Ny punkt' : 'Ny person')
    setChapterBusy(true)
    setSaveError('')
    try {
      const result = await client.projects.addUntimedChapter(projectId, { kind: addKind, label }, draftRevision.current)
      if (result.draftRevision !== undefined) draftRevision.current = result.draftRevision
      setServerChapters(await client.projects.chapters(projectId))
      setAddLabel('')
      setAddChapterOpen(false)
    } catch (err) {
      if (isConflict(err)) void markConflict()
      else setSaveError(err instanceof Error ? err.message : 'Kapitlet kunde inte läggas till.')
    } finally {
      setChapterBusy(false)
    }
  }

  function doUndo() {
    const base = commitTypingTo(history)
    const result = undo(base, { cues, chapters: chapterList })
    if (!result) {
      setHistory(base)
      return
    }
    setHistory(result.history)
    setCues(derive(result.value.cues))
    setChapterList(result.value.chapters)
    setEditingChapter(null)
    setNotice('')
  }

  function doRedo() {
    const result = redo(history, { cues, chapters: chapterList })
    if (!result) return
    setHistory(result.history)
    setCues(derive(result.value.cues))
    setChapterList(result.value.chapters)
    setEditingChapter(null)
    setNotice('')
  }

  const newId = () => tempId.current--

  // Tab och Skift+Tab: nästa/föregående rad, från den aktiva raden (UNG-219). Under granskning av Word-rättningar hoppar de bara mellan
  // ändrade rutor (och rutor med konflikt); finns ingen åt det hållet står fokus kvar.
  function tabFrom(origin: number, backwards: boolean) {
    if (review) {
      const next = nextReviewIndex(reviewIndexes(cues, review), origin, backwards)
      if (next === null) {
        setNotice(backwards ? 'Ingen ändrad ruta före den här.' : 'Ingen ändrad ruta efter den här.')
        focusRow(Math.min(cues.length - 1, Math.max(0, origin)))
      } else {
        setNotice('')
        focusRow(next)
      }
      return
    }
    focusRow(tabTargetIndex(origin, backwards, cues.length))
  }

  // Bara kapitel (UNG-231): Tab/Skift+Tab till nästa/föregående synliga kapitelrad. Utgår från det markerade kapitlet, annars det som
  // pågår vid videons position. Kapitlet markeras och videon hoppar dit.
  function tabChapter(backwards: boolean) {
    const rows = chapterOnlyRows
    if (rows.length === 0) return
    let origin = rows.findIndex((row) => row.chapter.id === selectedChapterId)
    if (origin < 0) {
      rows.forEach((row, index) => {
        if (row.chapter.time <= currentTime + 0.001) origin = index
      })
    }
    const target = tabTargetIndex(origin, backwards, rows.length)
    const chapter = rows[target].chapter
    setSelectedChapterId(chapter.id)
    seekTo(chapter.time, false)
    const element = listRef.current
    if (element) {
      const next = scrollToRevealRow(layout, target, element.scrollTop, element.clientHeight)
      if (next !== element.scrollTop) {
        element.scrollTop = next
        setScrollTop(next)
      }
    }
  }

  // Manus (Word) ur den sparade versionen. Är projektet trimmat får operatören välja publicerad del eller hela inspelningen.
  async function exportWord(scope: 'published' | 'whole') {
    setExportChoice(false)
    setExporting(true)
    try {
      const blob = await client.projects.exportManuscriptDocx(projectId, scope)
      saveFile(exportFileName(projectName, 'manus', 'docx'), blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      setNotice(dirty ? 'Manuset är gjort av den sparade versionen. Dina osparade ändringar ingår inte.' : '')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Manuset kunde inte skapas.')
    } finally {
      setExporting(false)
    }
  }

  function startWordReview(result: WordImportResult) {
    if (!master || result.currentVersion !== master.version) {
      setWordDialog(null)
      setNotice('Undertexterna har ändrats under inläsningen. Läs in filen igen.')
      return
    }
    const built = buildReview(result, newId)
    setHistory(record(commitTypingTo(history), { cues, chapters: chapterList }))
    setCues(derive(built.cues))
    setReview(built.review)
    setFromWord(true)
    setWordDialog(null)
    setNotice('')
    const stops = reviewIndexes(built.cues, built.review)
    if (stops.length > 0) {
      focusRow(stops[0])
      seekTo(built.cues[stops[0]].start, false)
    }
  }

  function updateReview(change: (current: WordReview) => void) {
    setReview((current) => {
      if (!current) return current
      const next: WordReview = { ...current, unlocked: new Set(current.unlocked), resolved: new Set(current.resolved) }
      change(next)
      return next
    })
  }

  function discardWordReview() {
    setHistory(record(commitTypingTo(history), { cues, chapters: chapterList }))
    setCues(derive(saved))
    setReview(null)
    setFromWord(false)
    setNotice('')
  }

  function startMerge(firstIndex: number) {
    const info = mergeInfo(cues, firstIndex)
    if (!info) {
      setNotice('Det finns ingen replik att slå ihop med.')
      return
    }
    if (info.fits && info.gapSeconds > LONG_GAP_SECONDS) setPendingMerge(firstIndex)
    else apply(mergeWithNext(cues, firstIndex))
  }

  // ---- Gränser i vågformsbandet (UNG-161) ----
  // Linjerna i bandet är replikernas starter. Den valda replikens egen startlinje ändrar bara dess starttid (utan hänsyn till om den
  // inkräktar på föregående replik, vars slut då kortas av sig självt). Alla andra linjer är en replik slut mot nästa: där flödar orden
  // över efter uppskattad tid över tal. Raderna ändras löpande utan att historiken fylls; hela draget blir ETT ångra-steg.
  const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

  function dragStart(index: number, role: GrabRole) {
    const base = cuesRef.current
    dragBase.current = base
    setDragBoundary({ index, role, baseBefore: index > 0 ? wordCount(base[index - 1].text) : 0, baseAfter: wordCount(base[index].text) })
    // Startlinjen tillhör repliken själv; en slutlinje tillhör repliken ovanför den. Den repliken blir vald.
    setSelectedIndex(role === 'start' ? index : Math.max(0, index - 1))
  }

  function dragMove(index: number, time: number, role: GrabRole) {
    const base = dragBase.current
    if (!base) return
    setNotice('')
    setCues(derive(moveBoundary(base, index, time, timing.runs, role === 'end').cues))
    seekTo(time, false, true)
  }

  function dragEnd() {
    const base = dragBase.current
    dragBase.current = null
    setDragBoundary(null)
    if (!base || cuesRef.current === base) return
    setHistory(record(commitTypingTo(history), { cues: base, chapters: chapterList }))
  }

  // Start (gränsen) vid en tid utan att texten flödar: Starta här och nudge.
  function setBoundaryTime(index: number, time: number) {
    apply({ ok: true, cues: moveBoundary(cues, index, time, timing.runs, false).cues, focusIndex: index })
  }

  // Spela-knappen sitter vid den aktiva repliken (den som visas i videon), annars vid den valda.
  const playIndex = activeIndex >= 0 ? activeIndex : selectedIndex

  // Under ett drag visas hur många ord de två berörda replikerna just nu innehåller (och förändringen sedan draget började).
  function wordBadge(index: number): { count: number; delta: number } | null {
    if (!dragBoundary || dragBoundary.role !== 'end') return null // bara slutlinjen flyttar ord
    if (index === dragBoundary.index - 1) return { count: wordCount(cues[index].text), delta: wordCount(cues[index].text) - dragBoundary.baseBefore }
    if (index === dragBoundary.index) return { count: wordCount(cues[index].text), delta: wordCount(cues[index].text) - dragBoundary.baseAfter }
    return null
  }

  // Klick på en rads nummer/tid eller spalten: raden väljs och spelas från sin start. Klick på den rad som spelar just nu pausar
  // (andningspaus); klick igen spelar från radens start.
  function playRow(index: number) {
    const video = videoRef.current
    const cue = cues[index]
    if (!cue) return
    setAnchor(null) // en rads spelknapp är ett annat sätt att spela upp: placeringen från vågformen avslutas (UNG-184)
    // Knappen visas vid den aktiva repliken (playIndex), så den pausar när uppspelning pågår, även om uppspelningen har gått förbi den valda.
    if (index === playIndex && video && !video.paused) {
      video.pause()
      setSelectedIndex(index)
      return
    }
    setSelectedIndex(index)
    seekTo(cue.start, true)
  }

  // Mellanslag (UNG-171): växlar spela/paus på videon där den står, utan att välja eller flytta något.
  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    const action = spaceAction(anchorRef.current, video.paused)
    if (action.kind === 'playFrom') seekTo(action.time, true, true)
    else if (action.kind === 'pauseBack') {
      video.pause()
      seekTo(action.time, false, true)
    } else if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }

  function ctrlEnter(index: number) {
    const cue = cues[index]
    if (!cue) return
    const caret = areas.current.get(index)?.selectionStart ?? 0
    if (cue.text.trim() === '' || cue.text.slice(caret).trim() === '') addEmptyCue(index, 'after')
    else if (cue.text.slice(0, caret).trim() === '') addEmptyCue(index, 'before')
    else splitAtCaret(index)
  }

  // En ny, tom replik bredvid raden; markören hamnar i dess textfält. Tomma repliker tas bort vid sparning om de lämnas kvar.
  function addEmptyCue(index: number, where: 'after' | 'before') {
    apply(addCue(cues, newCueTime(cues, index, where, playhead()), newId()))
  }

  // Delar repliken vid markören. Tiden är videons position om den ligger inne i repliken (exakt), annars en uppskattning över talet.
  function splitAtCaret(index: number) {
    const cue = cues[index]
    if (!cue) return
    const caret = areas.current.get(index)?.selectionStart ?? 0
    const position = playhead()
    const inside = position > cue.start + 0.3 && position < cue.end - 0.3
    const to = cues[index + 1]?.start ?? cue.end
    const leftChars = cue.text.slice(0, caret).replace(/\s+/g, ' ').trim().length
    const rightChars = cue.text.slice(caret).replace(/\s+/g, ' ').trim().length
    apply(splitCue(cues, index, caret, newId(), inside ? position : estimateSplitTime(cue.start, to, leftChars, rightChars, timing.runs)))
  }

  // Hjul över vågformen rullar listan (och slår av "Följ med", som när man rullar i listan).
  function scrollListBy(deltaY: number) {
    const element = listRef.current
    if (!element) return
    stopFollowing()
    element.scrollTop += deltaY
  }

  // ---- Spara och stäng ----
  // Sparar och ger den nya mastern (eller null om något hindrade eller gick fel).
  async function saveMaster(): Promise<CaptionMaster | null> {
    if (!master || !cuesDirty || saving || readOnly) return null
    const error = issues.find((issue) => issue.error)
    if (error) {
      setNotice(`Replik ${error.index + 1}: ${error.message}`)
      focusRow(error.index)
      return null
    }
    setSaving(true)
    setSaveError('')
    try {
      // Tomma repliker (t.ex. en ny ruta som lämnats tom) tas bort tyst.
      const next = await client.projects.saveCaptionMaster(
        projectId,
        { ifVersion: captionVersion.current ?? master.version, cues: savePayload(sortedForSave(withoutEmpty(cues))), ...(fromWord ? { reason: 'word' as const } : {}) },
        draftRevision.current,
      )
      adopt(next)
      onSaved?.()
      return next
    } catch (err) {
      if (isConflict(err)) void markConflict()
      else setSaveError(err instanceof Error ? err.message : 'Undertexterna kunde inte sparas.')
      return null
    } finally {
      setSaving(false)
    }
  }

  // Vilka versionskonflikter som betyder att någon annan har sparat sedan redigeraren öppnades (UNG-241).
  const isConflict = (err: unknown) => err instanceof ApiError && isConflictCode(err.code)

  // UNG-245: kapitlen sparas som utkast i ett anrop (en transaktion), villkorat på utkastets version. Misslyckas det läses det servern har om,
  // så att det som återstår går att spara igen.
  async function saveChapters(): Promise<boolean> {
    if (chapterChangeTotal(chapterChanges) === 0) return true
    setSaving(true)
    setSaveError('')
    try {
      const result = await client.projects.batchChapters(
        projectId,
        {
          remove: chapterChanges.removed,
          change: chapterChanges.changed.map((item) => ({ id: item.id, label: item.label, offsetSeconds: item.time })),
          add: chapterChanges.added.map((item) => ({ kind: item.kind as CueKind, label: item.label, offsetSeconds: item.time })),
        },
        draftRevision.current,
      )
      draftRevision.current = result.draftRevision
      adoptChapters(await client.projects.chapters(projectId))
      setHistory(emptyHistory())
      onChaptersSaved?.()
      return true
    } catch (err) {
      if (isConflict(err)) void markConflict()
      else setSaveError(err instanceof Error ? err.message : 'Kapitlen kunde inte sparas.')
      try {
        setSavedChapters(positionedChapters(await client.projects.chapters(projectId)))
      } catch {
        // Det som servern har går inte att läsa nu; arbetskopian ligger kvar.
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  // UNG-245: trimningen sparas som utkast (den tillämpas vid Publicera ondemand, och är låst efter publicering).
  async function saveTrim(): Promise<boolean> {
    if (!trim || !trimChanged(trim)) return true
    setSaving(true)
    setSaveError('')
    try {
      const allChapters = await client.projects.chapters(projectId)
      const project = await client.projects.saveTrimDraft(projectId, trimDraftPayload(trim.start, trim.end, allChapters), draftRevision.current)
      if (project.draftRevision !== undefined) draftRevision.current = project.draftRevision
      trim.onSaved?.()
      return true
    } catch (err) {
      if (isConflict(err)) void markConflict()
      else setSaveError(err instanceof Error ? err.message : 'Trimningen kunde inte sparas.')
      return false
    } finally {
      setSaving(false)
    }
  }

  // ---- UNG-249: kapitelverktygen ----
  // Tid här, Synk, förankring och import skriver direkt till servern. Osparade kapitel sparas först; efteråt läses kapitlen och utkastets
  // version om. Ångra-historiken töms, eftersom den inte kan gå tillbaka förbi en ändring som redan ligger på servern.
  async function chapterOp(run: () => Promise<void>, failText: string): Promise<boolean> {
    actionRef.current = 'save'
    if (chaptersDirty && !(await saveChapters())) return false
    setChapterBusy(true)
    setSaveError('')
    try {
      await run()
      adoptChapters(await client.projects.chapters(projectId))
      setHistory(emptyHistory())
      await refreshRevision()
      onChaptersSaved?.()
      return true
    } catch (err) {
      if (isConflict(err)) void markConflict()
      else setSaveError(err instanceof Error ? err.message : failText)
      return false
    } finally {
      setChapterBusy(false)
    }
  }

  // Utkastets version efter en skrivning vars svar inte bär den.
  async function refreshRevision() {
    try {
      const status = await client.projects.draftStatus(projectId)
      draftRevision.current = status.draftRevision
      setDraftStatus(status)
    } catch {
      // Nästa skrivning får då en konflikt, som går att ladda om från.
    }
  }

  // Hela sekunder: serverns Tid här/Synk (PATCH timeline-draft/chapters) tar emot heltal, som i After-/Ondemand-vyn.
  const chapterTime = () => Math.round(playhead())

  // Tid här: kapitlet får tid i arbetskopian (en osparad ändring som sparas med Spara, kan ångras och frågas om vid Stäng).
  function placeChapter(chapterId: string) {
    const chapter = serverChapters.find((item) => item.chapterId === chapterId)
    if (!chapter || readOnly) return
    applyChapters(addChapterTo(chapterList, { id: chapter.chapterId, kind: chapter.kind, label: chapter.label, time: chapterTime() }))
  }

  // Förankring (uppladdad video): ett kapitel med klockslag placeras i videon och de övriga följer med.
  function pickAnchor(chapterId: string) {
    setGuide({ step: 2, anchorId: chapterId })
    const chapter = serverChapters.find((item) => item.chapterId === chapterId)
    if (chapter && chapter.synced !== false && chapter.timing === 'positioned') seekTo(chapter.offsetSeconds, false)
    else videoRef.current?.pause()
  }

  async function applyAnchor(offsetSeconds: number) {
    const anchorId = guide?.anchorId
    if (!anchorId) return false
    let outside = 0
    const ok = await chapterOp(async () => {
      outside = (await client.projects.syncChapters(projectId, anchorId, offsetSeconds, draftRevision.current)).outsideVideo
    }, 'Förankringen misslyckades.')
    if (ok && outside > 0) setNotice(`${outside} kapitel hamnade utanför videon och är dolda tills de ryms. Justera ankaret eller ta bort dem.`)
    return ok
  }

  async function anchorHere() {
    if (await applyAnchor(Math.round(playhead()))) setGuide((current) => (current ? { ...current, step: 3 } : current))
  }

  async function nudgeAnchor(deltaSeconds: number) {
    const anchor = serverChapters.find((chapter) => chapter.chapterId === guide?.anchorId)
    if (!anchor) return
    // Hela sekunder (serverns förankring tar heltal); ankarets tid kan ha decimaler om kapitlet sparats från editorn.
    const next = Math.max(0, Math.round(anchor.offsetSeconds + deltaSeconds))
    if (await applyAnchor(next)) seekTo(next, false)
  }

  async function confirmAnchor() {
    if (await chapterOp(() => client.projects.confirmChapterSync(projectId, draftRevision.current), 'Bekräftelsen misslyckades.')) setGuide(null)
  }

  async function openChapterImport() {
    actionRef.current = 'save'
    if (chaptersDirty && !(await saveChapters())) return
    setShowChapterImport(true)
  }

  async function chaptersImported(result: ChapterImportResult) {
    setShowChapterImport(false)
    setGuide(null)
    try {
      adoptChapters(await client.projects.chapters(projectId))
    } catch {
      // Kapitlen läses om vid nästa öppning.
    }
    setHistory(emptyHistory())
    await refreshRevision()
    onChaptersSaved?.()
    if (result.outsideVideo > 0) setNotice(`${result.outsideVideo} kapitel låg efter videons slut och har ingen tid än.`)
  }

  async function refreshStatus() {
    try {
      setDraftStatus(await client.projects.draftStatus(projectId))
    } catch {
      setDraftStatus(null)
    }
  }

  async function refreshDraftInfo() {
    try {
      const generation = await client.projects.getCaptionGeneration(projectId)
      setDraftInfo(generation.draft ?? null)
      setCanRegenerate(generation.canGenerate)
    } catch {
      // Statusen uppdateras vid nästa läsning.
    }
  }

  // Sparar allt som är osparat: undertexter (kan avvisas av versionskontrollen eller valideringen), sedan kapitel och trim.
  async function saveAll(): Promise<boolean> {
    if (cuesDirty && !(await saveMaster())) return false
    if (chaptersDirty && !(await saveChapters())) return false
    if (trimDirty && !(await saveTrim())) return false
    return true
  }

  async function save() {
    actionRef.current = 'save'
    if (await saveAll()) {
      void refreshStatus()
    }
  }

  // Skapa på nytt: startar ett nytt jobb från ljudet. Det nya utkastet ersätter arbetsversionen (den gamla finns kvar som tidigare version)
  // och publiceras inte förrän det godkänns. Redigeraren stängs, och omgivande vy visar framsteget.
  async function regenerate() {
    setConfirmRegenerate(false)
    // UNG-248: utan undertexter (Skapa undertexter) sparas kapitel och trim först, eftersom redigeraren stängs medan undertexterna skapas.
    if (!hasCaptions && dirty) {
      actionRef.current = 'save'
      if (!(await saveAll())) return
    }
    setRegenerating(true)
    setSaveError('')
    try {
      const generation = await client.projects.generateCaptions(projectId, regenNotify, regenSpeakers && speakersAvailable)
      notifyJobsChanged()
      onRegenerated?.(generation)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Det gick inte att starta undertextningen.')
    } finally {
      setRegenerating(false)
    }
  }

  // UNG-272: en egen VTT-fil blir arbetsversionen (ett utkast, publiceras med Publicera ändringar). Osparat sparas först.
  async function importVtt(file: File, timeline: VttTimeline) {
    actionRef.current = 'save'
    setCaptionsBusy(true)
    setVttError('')
    try {
      if (dirty && !(await saveAll())) {
        setShowVttImport(false)
        return
      }
      const next = await client.projects.importCaptionMaster(projectId, file, timeline, hasCaptions ? captionVersion.current : undefined, draftRevision.current)
      setHasCaptions(true)
      adopt(next)
      setShowVttImport(false)
      await refreshDraftInfo()
      await refreshStatus()
      onSaved?.()
    } catch (err) {
      setVttError(isConflict(err)
        ? 'Utkastet har ändrats av någon annan. Stäng, ladda om och försök igen.'
        : err instanceof Error ? err.message : 'Filen kunde inte läsas in.')
    } finally {
      setCaptionsBusy(false)
    }
  }

  // UNG-272: tar bort undertexterna helt (arbetsversion, historik och den publicerade filen). Kapitel och trim rörs inte.
  async function removeAllCaptions() {
    setConfirmRemoveCaptions(false)
    setCaptionsBusy(true)
    setSaveError('')
    try {
      await client.projects.removeCaptionMaster(projectId, draftRevision.current)
      await load()
      await refreshRevision()
      await refreshDraftInfo()
      onSaved?.()
    } catch (err) {
      if (isConflict(err)) setSaveError('Utkastet har ändrats av någon annan. Ladda om och försök igen.')
      else setSaveError(err instanceof Error ? err.message : 'Undertexterna kunde inte tas bort.')
    } finally {
      setCaptionsBusy(false)
    }
  }

  // Publicera ändringar (UNG-242): sparar det osparade och släpper kapitel och godkända undertexter i ett publicerat projekt.
  async function publishChanges() {
    if (!master) return
    actionRef.current = 'publish'
    setConfirmPublish(false)
    setPublishing(true)
    setSaveError('')
    try {
      if (!(await saveAll())) return
      const result = await client.projects.publishChanges(projectId, draftRevision.current)
      if (result.project.draftRevision !== undefined) draftRevision.current = result.project.draftRevision
      await load()
      await refreshDraftInfo()
      await refreshStatus()
      onSaved?.()
      onChaptersSaved?.()
    } catch (err) {
      if (isConflict(err)) void markConflict()
      else setSaveError(err instanceof Error ? err.message : 'Ändringarna kunde inte publiceras.')
    } finally {
      setPublishing(false)
    }
  }

  // Förkasta ändringar (UNG-243): kapitel och undertexter tillbaka till det publicerade. Trimmen är låst och rörs inte.
  async function discardChanges() {
    actionRef.current = 'discard'
    setConfirmDiscard(false)
    setPublishing(true)
    setSaveError('')
    try {
      const status = await client.projects.discardChanges(projectId, draftRevision.current)
      draftRevision.current = status.draftRevision
      setDraftStatus(status)
      await load()
      adoptChapters(await client.projects.chapters(projectId))
      setHistory(emptyHistory())
      await refreshDraftInfo()
      onSaved?.()
      onChaptersSaved?.()
    } catch (err) {
      if (isConflict(err)) void markConflict()
      else setSaveError(err instanceof Error ? err.message : 'Ändringarna kunde inte förkastas.')
    } finally {
      setPublishing(false)
    }
  }

  // ---- UNG-246: konflikt ----
  // Läser vad servern har nu, för att kunna säga vad den andre ändrat. Läsningen ersätter inte arbetskopian.
  async function markConflict() {
    const action = actionRef.current
    let captionsChanged = false
    let captionsChangedBy: string | undefined
    try {
      const fresh = await fetchMaster()
      captionsChanged = captionVersion.current !== undefined && fresh.version !== captionVersion.current
      captionsChangedBy = fresh.updatedByName
    } catch {
      // Beskrivningen blir då den allmänna.
    }
    setConflict({ action, captionsChanged, captionsChangedBy })
  }

  // Ladda om: det som finns på servern ersätter arbetskopian (undertexter, kapitel och trim).
  async function reloadAll() {
    setConflict(null)
    await load()
    try {
      adoptChapters(await client.projects.chapters(projectId))
    } catch {
      // Kapitlen läses om vid nästa öppning.
    }
    setHistory(emptyHistory())
    trim?.onReload?.()
    await refreshDraftInfo()
    await refreshStatus()
  }

  // Skriv över: villkoren flyttas fram till serverns senaste versioner och det som stoppades görs om med dina ändringar. Kapitlen skickas
  // fortfarande som ändringar mot det du läste in, så kapitel som den andre lagt till och du inte rört ligger kvar.
  async function overwrite() {
    if (!conflict) return
    const action = conflict.action
    setConflict(null)
    setSaveError('')
    try {
      const [status, fresh] = await Promise.all([client.projects.draftStatus(projectId), fetchMaster()])
      draftRevision.current = status.draftRevision
      captionVersion.current = fresh.version
      setDraftStatus(status)
      setRetry(action)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Det gick inte att läsa det senaste utkastet.')
    }
  }

  // Görs om efter en rendering, så att åtgärden ser det aktuella tillståndet.
  useEffect(() => {
    if (!retry) return
    setRetry(null)
    if (retry === 'save') void save()
    else if (retry === 'publish') void publishChanges()
    else void discardChanges()
  }, [retry])

  // UNG-247: avpubliceringen görs i ondemand-vyn (med dess bekräftelse), så redigeraren stängs först. Osparat måste sparas eller ångras.
  function unpublish() {
    if (dirty) {
      setNotice('Spara eller ångra dina ändringar innan du avpublicerar.')
      return
    }
    onClose()
    trimLock?.onUnpublish()
  }

  function requestClose() {
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  useEffect(() => {
    if (closeSignal) requestClose()
  }, [closeSignal])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault()
        if (event.shiftKey) doRedo()
        else doUndo()
        return
      }
      if (modifier && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault()
        doRedo()
        return
      }
      if (event.key === ' ') {
        const element = event.target instanceof HTMLElement ? event.target : null
        const kind = element ? spaceTargetKind(element.tagName, element.isContentEditable, (selector) => element.closest(selector) !== null) : 'other'
        // Redigerarens eget lager är en dialog; en dialog till (bekräftelse, publicera) äger tangenterna.
        const otherDialogOpen = document.querySelectorAll('[role="dialog"]').length > 1
        if (shouldTogglePlayback(event, kind, otherDialogOpen)) {
          event.preventDefault() // ingen sidrullning, och ingen ny aktivering av en fokuserad spelknapp
          togglePlayback()
        }
        return
      }
      if (event.key === 'Tab') {
        // UNG-219: efter ett klick i videon eller vågformen utgår Tab också från den aktiva raden. Knappar, fält och andra dialoger sköter sin egen.
        const element = event.target instanceof HTMLElement ? event.target : null
        const kind = element ? tabTargetKind(element.tagName, (selector) => element.closest(selector) !== null) : 'surface'
        const otherDialogOpen = document.querySelectorAll('[role="dialog"]').length > 1
        if (shouldCaptureTab(event, kind, otherDialogOpen)) {
          if (chaptersOnly) {
            // Bara kapitel (UNG-231): Tab hoppar mellan kapitelraderna. I övriga lägen hoppar den bara mellan repliker.
            if (chapterOnlyRows.length > 0) {
              event.preventDefault()
              tabChapter(event.shiftKey)
            }
          } else if (cues.length > 0) {
            event.preventDefault()
            tabFrom(tabOriginIndex(activeIndex, selectedIndex, null), event.shiftKey)
          }
        }
        return
      }
      if (event.key !== 'Escape' || confirmClose || pendingMerge !== null) return
      if (event.target instanceof HTMLTextAreaElement) return
      requestClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  // Ett meddelande försvinner av sig självt, så att det inte ligger kvar och skymmer.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 7000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function onAreaKeyDown(event: KeyboardEvent, index: number) {
    const area = event.currentTarget as HTMLTextAreaElement
    const atStart = area.selectionStart === 0 && area.selectionEnd === 0
    const atEnd = area.selectionStart === area.value.length && area.selectionEnd === area.value.length
    // Låsta rader (ej ändrade i Word) går inte att ändra med tangenterna heller, bara att hoppa förbi.
    const locked = review !== null && isLocked(review, cues[index].id)
    if (locked && event.key !== 'Tab' && event.key !== 'Escape' && !(event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey)) {
      if (event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete') event.preventDefault()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      const original = saved.find((cue) => cue.id === cues[index].id)
      if (original) setText(index, original.text)
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      // Ctrl/Cmd+Enter: mitt i texten delas repliken, sist i texten skapas en ny tom replik efter, först i texten en före (UNG-164).
      event.preventDefault()
      ctrlEnter(index)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) {
        // Överfulla repliker är tillåtna (ingen gräns på antal rader).
        const start = area.selectionStart
        const end = area.selectionEnd
        setText(index, `${area.value.slice(0, start)}\n${area.value.slice(end)}`)
        requestAnimationFrame(() => area.setSelectionRange(start + 1, start + 1))
      } else {
        focusRow(index + 1)
      }
    } else if (event.key === 'Tab') {
      event.preventDefault()
      // UNG-219: från den aktiva raden (den replik som videon står på), inte från den textruta som senast hade fokus.
      tabFrom(tabOriginIndex(activeIndex, selectedIndex, index), event.shiftKey)
    } else if (event.key === 'Backspace' && atStart && index > 0 && !readOnly) {
      // Som i en textredigerare: Backspace i början slår ihop med föregående replik.
      event.preventDefault()
      startMerge(index - 1)
    } else if (event.key === 'Delete' && atEnd && index < cues.length - 1 && !readOnly) {
      event.preventDefault()
      startMerge(index)
    }
  }

  function parsedShift(): number | null {
    const value = Number.parseFloat(shiftInput.replace(',', '.'))
    return Number.isFinite(value) && value !== 0 ? value : null
  }

  // En kapitelrad (UNG-228/229/231). group = rubrik med hopfällbara talare (bara-kapitel-läget) eller en talare under en punkt.
  function renderChapterRow(
    chapter: EditorChapter,
    rowIndex: number,
    group?: { toggle?: { open: boolean; count: number; onToggle: () => void }; child?: boolean },
  ) {
    const isCurrent = chapter.id === nowChapters.agenda?.id || chapter.id === nowChapters.person?.id
    const shownTime = chapterDragTime?.id === chapter.id ? chapterDragTime.time : chapter.time
    const outside = publishedStart !== undefined && publishedEnd !== undefined && (shownTime < publishedStart || shownTime > publishedEnd)
    const agenda = chapter.kind === 'agendaItem'
    return (
      <div
        key={`chapter-${chapter.id}`}
        class={`ce-chrow${agenda ? ' is-agenda' : ''}${group?.child ? ' is-child' : ''}${isCurrent ? ' is-current' : ''}${outside ? ' is-outside' : ''}${selectedChapterId === chapter.id ? ' is-selected' : ''}`}
        style={{ top: `${layout.top(rowIndex)}px`, height: `${layout.height(rowIndex)}px` }}
        onPointerDown={() => setSelectedChapterId(chapter.id)}
        onClick={(event) => {
          // Ett klick på raden (namn, typ eller tom yta) hoppar i videon till kapitlet. Knappar och fält sköter sig själva.
          if ((event.target as HTMLElement).closest('button, input')) return
          seekTo(chapter.time, false)
        }}
      >
        {group?.toggle ? (
          <button
            class="ce-icon ce-chrow-toggle"
            type="button"
            tabIndex={-1}
            aria-expanded={group.toggle.open}
            aria-label={`${group.toggle.open ? 'Dölj' : 'Visa'} talarna under ${chapter.label}`}
            onClick={group.toggle.onToggle}
          >
            <Icon name={group.toggle.open ? 'expand_more' : 'chevron_right'} size={18} />
          </button>
        ) : (
          <span />
        )}
        <div class="ce-chrow-main">
          <span class="ce-chrow-kind">{chapterKindText(chapter.kind)}</span>
          {editingChapter === chapter.id ? (
            <input
              class="ce-chrow-input"
              type="text"
              value={chapterDraft}
              aria-label="Kapitlets namn"
              ref={(element) => { if (element && !chapterEditFinished.current) element.focus() }}
              onInput={(event) => setChapterDraft(event.currentTarget.value)}
              onBlur={() => finishChapterEdit(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  finishChapterEdit(true)
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  finishChapterEdit(false)
                }
              }}
            />
          ) : (
            <span class="ce-chrow-label" onDblClick={() => beginChapterEdit(chapter)}>{chapter.label}</span>
          )}
          {group?.toggle && !group.toggle.open && <span class="ce-chrow-count">{group.toggle.count} talare</span>}
        </div>
        <span />
        <button
          class="ce-time"
          type="button"
          tabIndex={-1}
          aria-label={`Spela från kapitlet ${chapter.label}`}
          onClick={() => seekTo(chapter.time, true)}
        >
          {formatCueTime(shownTime)}
        </button>
        {!readOnly ? (
          <div class="ce-row-actions">
            <button class="ce-icon" type="button" tabIndex={-1} aria-label={`Sätt ${chapter.label} till videons position`} onClick={() => chapterHere(chapter.id)}>
              <Icon name="my_location" size={16} />
            </button>
            <button class="ce-icon" type="button" tabIndex={-1} aria-label={`Ta bort ${chapter.label}`} onClick={() => chapterDelete(chapter.id)}>
              <Icon name="delete" size={16} />
            </button>
          </div>
        ) : (
          <span />
        )}
      </div>
    )
  }

  // Med trimkontroller (trim) är det den pågående trimningen som visas som "publiceras": den tonar ned det som tas bort, direkt när
  // balkarna flyttas. Annars gäller den trimning som servern känner till.
  const publishedStart = trim ? trim.start : master?.publishedStartSeconds
  const publishedEnd = trim ? trim.end : master?.publishedEndSeconds
  const trimDuration = master?.originalDurationSeconds ?? 0
  const showTrim = Boolean(trim) && trimDuration > 0
  // UNG-247: i ett publicerat projekt visas den publicerade trimningen, låst.
  const lockedRange = !trim && trimLock && master?.publishedStartSeconds != null && master?.publishedEndSeconds != null
    ? { start: master.publishedStartSeconds, end: master.publishedEndSeconds }
    : null
  const showLockedTrim = lockedRange !== null && trimDuration > 0
  const pendingInfo = pendingMerge === null ? null : mergeInfo(cues, pendingMerge)

  return (
    <div class="ce-scrim" role="dialog" aria-modal="true" aria-label="Redigera projekt">
      <header class="ce-head">
        <div class="ce-title">
          <h2>Redigera projekt</h2>
          <div class="ce-sub">
            {projectName}
            {master && hasCaptions && <> · version {master.version}{master.updatedByName ? ` (${master.updatedByName})` : ''}</>}
          </div>
        </div>
        <div class="ce-actions">
          {onRegenerated && !hasCaptions && (
            <button
              class="btn btn-sm"
              type="button"
              disabled={!master || readOnly || saving || publishing || regenerating || !canRegenerate}
              title={canRegenerate ? 'Skapar undertexter automatiskt från ljudet' : 'Undertexter går inte att skapa automatiskt för den här videon'}
              onClick={() => setConfirmRegenerate(true)}
            >
              {regenerating ? 'Startar…' : 'Skapa undertexter'}
            </button>
          )}
          <button class="btn btn-sm ce-save" type="button" disabled={!dirty || saving || publishing || readOnly} title={dirty ? `${changeCount} osparade ändringar` : 'Allt är sparat'} onClick={() => void save()}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
          {actions.showDiscard && (
            <button
              class="btn btn-sm"
              type="button"
              disabled={!actions.discardEnabled}
              title="Går tillbaka till det som är publicerat (undertexter och kapitel)"
              onClick={() => setConfirmDiscard(true)}
            >
              Förkasta ändringar
            </button>
          )}
          {actions.showPublishChanges && (
            <button
              class="btn btn-sm btn-primary"
              type="button"
              disabled={!actions.publishChangesEnabled}
              title={actions.publishChangesEnabled ? 'Sparar och släpper ändringarna i kapitel och undertexter för tittarna' : 'Inga opublicerade ändringar'}
              onClick={() => setConfirmPublish(true)}
            >
              {publishing ? 'Publicerar…' : 'Publicera ändringar'}
            </button>
          )}
          <button class="btn btn-sm" type="button" title="Stäng redigeraren (Esc)" onClick={requestClose}>Stäng</button>
        </div>
      </header>

      {/* UNG-172: varje villkorlig syskon har en nyckel. Utan nycklar återanvände Preact den befintliga .ce-body-diven som meddelanderutan
          (båda är en <div> utan nyckel) när ett meddelande dök upp, vilket byggde om hela redigeraren inklusive <video> (utan källa). */}
      {loadError && (
        <div key="load-error" class="ce-banner ce-error" role="alert">
          {loadError}
          <button class="btn btn-sm" type="button" onClick={() => void load()}>Försök igen</button>
        </div>
      )}
      {readOnly && (
        <div key="read-only" class="ce-banner ce-warn" role="alert">
          Det här utkastet är skapat på ett äldre sätt och går inte att redigera här. Skapa nya undertexter i undertextpanelen.
        </div>
      )}
      {saveError && <div key="save-error" class="ce-banner ce-error" role="alert">{saveError}</div>}
      {createFailed && !hasCaptions && (
        <div key="create-failed" class="ce-banner ce-error" role="alert">Undertexterna kunde inte skapas: {createFailed} Försök igen med Skapa undertexter.</div>
      )}
      {notice && (
        <div key="notice" class="ce-banner ce-warn ce-notice" role="status">
          {notice}
          <button class="ib" type="button" aria-label="Stäng meddelandet" onClick={() => setNotice('')}>✕</button>
        </div>
      )}

      {!master && !loadError && <div key="loading" class="ce-loading">Hämtar…</div>}

      {review && (
        <WordReviewBar
          key="word-review"
          review={review}
          cues={cues}
          selectedIndex={selectedIndex}
          stopCount={reviewIndexes(cues, review).length}
          onNext={() => tabFrom(tabOriginIndex(activeIndex, selectedIndex, null), false)}
          onPrevious={() => tabFrom(tabOriginIndex(activeIndex, selectedIndex, null), true)}
          onUnlockAll={() => updateReview((next) => { for (const cue of cues) next.unlocked.add(cue.id) })}
          onUnlockOne={(id) => updateReview((next) => { next.unlocked.add(id) })}
          onResolve={(id, conflictIndex) => updateReview((next) => { next.resolved.add(conflictKey(id, conflictIndex)) })}
          onDiscard={discardWordReview}
          onFinish={() => setReview(null)}
          onChangeBase={() => setWordDialog({ baseChoice: true })}
        />
      )}

      {master && (
        <div key="body" class="ce-body">
          <section class="ce-video" aria-label="Video">
            <div class="ce-stage">
              <video key="video" ref={videoRefCallback} controls playsInline preload="metadata" onPointerDown={() => setAnchor(null)} onKeyDown={() => setAnchor(null)} />
              {activeCue && <div key="overlay" class="ce-overlay" aria-hidden="true">{activeCue.text}</div>}
              {showTrim && (
                <VideoPositionControls
                  key="position"
                  overlay
                  position={currentTime}
                  duration={trimDuration}
                  playing={playing}
                  onSeek={(seconds) => seekTo(seconds, false)}
                  onTogglePlay={togglePlayback}
                />
              )}
              {soundOff && (
                <button
                  key="unmute"
                  class="ce-unmute"
                  type="button"
                  tabIndex={-1}
                  // Tar inte fokus från textrutan man redigerar i.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const video = videoRef.current
                    if (!video) return
                    const next = unmuted({ muted: video.muted, volume: video.volume })
                    video.muted = next.muted
                    video.volume = next.volume
                  }}
                >
                  <Icon name="volume_up" size={18} />
                  Slå på ljudet
                </button>
              )}
            </div>
            {videoError && <p class="ce-error-text" role="alert">{videoError}</p>}

            {showTrim && trim && (
              <div key="trim" class="ce-trim" aria-label="Trimning">
                <PositionScrubber
                  position={currentTime}
                  duration={trimDuration}
                  start={trim.start}
                  end={trim.end}
                  onSeek={(seconds) => seekTo(seconds, false)}
                  onChange={trim.onChange}
                />
                <TrimBar
                  duration={trimDuration}
                  start={trim.start}
                  end={trim.end}
                  position={currentTime}
                  chapters={chapterList.map((chapter) => ({ time: chapter.time, label: chapter.label }))}
                  onChange={trim.onChange}
                  onSeek={(seconds) => {
                    videoRef.current?.pause()
                    seekTo(seconds, false)
                  }}
                  onPlayFromStart={() => seekTo(trim.start, true)}
                  onPlayEnd={() => seekTo(playEndFrom(trim.start, trim.end), true)}
                />
              </div>
            )}

            {showLockedTrim && lockedRange && (
              <div key="trim-locked" class="ce-trim" aria-label="Trimning (låst)">
                <PositionScrubber
                  position={currentTime}
                  duration={trimDuration}
                  start={lockedRange.start}
                  end={lockedRange.end}
                  locked
                  onSeek={(seconds) => seekTo(seconds, false)}
                  onChange={() => {}}
                />
                <TrimBar
                  duration={trimDuration}
                  start={lockedRange.start}
                  end={lockedRange.end}
                  position={currentTime}
                  chapters={chapterList.map((chapter) => ({ time: chapter.time, label: chapter.label }))}
                  locked
                  onChange={() => {}}
                  onSeek={(seconds) => {
                    videoRef.current?.pause()
                    seekTo(seconds, false)
                  }}
                  onPlayFromStart={() => seekTo(lockedRange.start, true)}
                  onPlayEnd={() => seekTo(playEndFrom(lockedRange.start, lockedRange.end), true)}
                />
                <p class="ce-trim-locked">
                  Trimningen är låst när projektet är publicerat. Avpublicera för att ändra den.
                  <button class="btn btn-sm" type="button" onClick={unpublish}>Avpublicera</button>
                </p>
              </div>
            )}

            {toolsEnabled && (
              <div key="chapter-tools" class="ce-chaptertools" aria-label="Kapitelverktyg">
                {anchorToolsVisible && !guide && (
                  <div class="od-sync-status">
                    <span>
                      {syncState === 'pending'
                        ? 'Förankringen är inte bekräftad. Publicering är spärrad.'
                        : syncState === 'confirmed'
                          ? 'Kapitlen är förankrade mot videon.'
                          : 'Kapitlen från sändningen är inte förankrade mot videon.'}
                    </span>
                    <button
                      class="btn btn-sm"
                      type="button"
                      disabled={chapterBusy}
                      onClick={() => setGuide(syncState === 'pending'
                        ? { step: 3, anchorId: serverChapters.find((chapter) => chapter.anchor)?.chapterId ?? null }
                        : { step: 1, anchorId: null })}
                    >
                      {syncState === 'pending' ? 'Fortsätt' : 'Förankra kapitel'}
                    </button>
                  </div>
                )}
                {guide && (
                  <AnchorGuide
                    step={guide.step}
                    anchorLabel={anchorChapter?.label ?? null}
                    anchorOffset={anchorChapter && anchorChapter.timing === 'positioned' && anchorChapter.synced !== false ? anchorChapter.offsetSeconds : null}
                    position={currentTime}
                    playing={playing}
                    busy={chapterBusy}
                    candidates={anchorCandidates.map((chapter) => ({ id: chapter.chapterId, label: chapter.label }))}
                    onPick={pickAnchor}
                    onSeekBy={(delta) => seekTo(playhead() + delta, false)}
                    onTogglePlay={togglePlayback}
                    onChooseAgain={() => setGuide({ step: 1, anchorId: null })}
                    onAnchor={() => void anchorHere()}
                    onGoToAnchor={() => { if (anchorChapter) seekTo(anchorChapter.offsetSeconds, true) }}
                    onNudge={(delta) => void nudgeAnchor(delta)}
                    onConfirm={() => void confirmAnchor()}
                    onClose={() => setGuide(null)}
                  />
                )}
                {/* Alltid synlig: importerade kapitel utan tid och nya rader (+) parkeras här och synkas med Tid här. */}
                {(
                  <div class="ce-unplaced" role="group" aria-label="Ej synkade kapitel">
                    <div class="ce-unplaced-head">
                      <h3 class="ce-side-title">Ej synkade kapitel ({unplacedChapters.length})</h3>
                      {!readOnly && (
                        <button
                          class="btn btn-sm"
                          type="button"
                          aria-expanded={addChapterOpen}
                          title="Lägger till ett nytt kapitel utan tid, att synka med Tid här"
                          onClick={() => setAddChapterOpen(!addChapterOpen)}
                        >
                          <Icon name="add" size={16} /> Kapitel
                        </button>
                      )}
                    </div>
                    {addChapterOpen && !readOnly && (
                      <div class="ce-addchapter">
                        <div class="ce-addchapter-kind" role="group" aria-label="Typ av kapitel">
                          <button class={`ce-chip${addKind === 'agendaItem' ? ' is-on' : ''}`} type="button" aria-pressed={addKind === 'agendaItem'} onClick={() => setAddKind('agendaItem')}>Punkt</button>
                          <button class={`ce-chip${addKind === 'person' ? ' is-on' : ''}`} type="button" aria-pressed={addKind === 'person'} onClick={() => setAddKind('person')}>Person</button>
                        </div>
                        <input
                          class="ce-addchapter-name"
                          type="text"
                          value={addLabel}
                          placeholder={addKind === 'agendaItem' ? 'Namn på punkten' : 'Personens namn'}
                          aria-label="Kapitlets namn"
                          onInput={(event) => setAddLabel(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void addUntimedChapter()
                            } else if (event.key === 'Escape') {
                              event.preventDefault()
                              event.stopPropagation()
                              setAddChapterOpen(false)
                            }
                          }}
                        />
                        <button class="btn btn-sm btn-primary" type="button" disabled={chapterBusy} onClick={() => void addUntimedChapter()}>Lägg till</button>
                        <button class="btn btn-sm" type="button" onClick={() => setAddChapterOpen(false)}>Avbryt</button>
                      </div>
                    )}
                    {unplacedChapters.length === 0 && !addChapterOpen && <p class="ce-unplaced-empty">Inga. Importera med Kapitel… eller lägg till med +.</p>}
                    <ul>
                      {unplacedChapters.map((chapter) => (
                        <li key={chapter.chapterId}>
                          <span class="ce-chapterbar-kind">{chapterKindText(chapter.kind)}</span>
                          <span class="ce-unplaced-label">{chapter.label}</span>
                          {chapter.timing === 'untimed' ? (
                            <button
                              class="btn btn-sm"
                              type="button"
                              disabled={chapterBusy || readOnly}
                              title="Sätter kapitlets tid till videons position (sparas med Spara)"
                              onClick={() => placeChapter(chapter.chapterId)}
                            >
                              Tid här · {formatHms(Math.round(currentTime))}
                            </button>
                          ) : (
                            <span class="ce-unplaced-note">Ej förankrad</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {sideTab === 'tools' && selected && (
              <div class="ce-tools" aria-label="Vald replik">
                <div class="ce-tools-title">Replik {selectedIndex + 1}: gräns vid {formatCueTime(selected.start)}</div>
                <div class="ce-tools-row">
                  <span class="ce-tools-label">Gräns</span>
                  <button class="btn btn-sm" type="button" disabled={readOnly} title="Flyttar gränsen till videons position (texten stannar där den är)" onClick={() => setBoundaryTime(selectedIndex, playhead())}>Starta här</button>
                  {[-0.5, -0.1, 0.1, 0.5].map((delta) => (
                    <button key={delta} class="btn btn-sm ce-nudge" type="button" disabled={readOnly} onClick={() => setBoundaryTime(selectedIndex, selected.start + delta)}>
                      {delta > 0 ? '+' : '−'}{Math.abs(delta).toString().replace('.', ',')}
                    </button>
                  ))}
                </div>
                <div class="ce-tools-row">
                  <span class="ce-tools-label">Flytta</span>
                  <input
                    class="ce-shift-input"
                    type="text"
                    inputMode="decimal"
                    aria-label="Förskjutning i sekunder"
                    value={shiftInput}
                    onInput={(event) => setShiftInput(event.currentTarget.value)}
                  />
                  <span class="ce-unit">s</span>
                  <button class="btn btn-sm" type="button" disabled={readOnly || parsedShift() === null} title="Förskjuter den valda repliken och alla efter den" onClick={() => { const delta = parsedShift(); if (delta !== null) apply(shiftFrom(cues, selectedIndex, delta)) }}>
                    Vald och alla efter
                  </button>
                  <button class="btn btn-sm" type="button" disabled={readOnly || parsedShift() === null} title="Förskjuter alla repliker" onClick={() => { const delta = parsedShift(); if (delta !== null) apply(shiftFrom(cues, 0, delta)) }}>
                    Alla
                  </button>
                </div>
                <div class="ce-tools-row">
                  <button class="btn btn-sm" type="button" disabled={readOnly} onClick={() => apply(addCue(cues, playhead(), newId()))}>Lägg till replik här</button>
                </div>
              </div>
            )}

          </section>

          <section class="ce-list-wrap" aria-label="Repliker">
            <div class="ce-chapterbar">
              <label class="ce-follow">
                <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.currentTarget.checked)} />
                Följ med
              </label>
              {chapterState === 'ok' && review === null && (
              <>
                {(chapterList.length > 0 || !hasCaptions) && (
                  <>
                    {/* Minst ett av filtren är alltid på: släcks det ena när det andra redan är släckt händer ingenting. */}
                    <button
                      class={`ce-chip${showCues && hasCaptions ? ' is-on' : ''}`}
                      type="button"
                      aria-pressed={showCues && hasCaptions}
                      disabled={!hasCaptions}
                      title={hasCaptions ? undefined : 'Projektet har inga undertexter än'}
                      onClick={(event) => {
                        blurAfterMouse(event)
                        if (!showCues || showChapters) changeFilter({ cues: !showCues, chapters: true })
                      }}
                    >
                      Undertexter · {cues.length}
                    </button>
                    <button
                      class={`ce-chip${showChapters || !hasCaptions ? ' is-on' : ''}`}
                      type="button"
                      aria-pressed={showChapters || !hasCaptions}
                      disabled={!hasCaptions}
                      onClick={(event) => {
                        blurAfterMouse(event)
                        if (!showChapters || showCues) changeFilter({ cues: true, chapters: !showChapters })
                      }}
                    >
                      Kapitel · {chapterList.length}
                    </button>
                  </>
                )}
                {!readOnly && chapterTools && (
                  <button
                    class="ce-chip"
                    type="button"
                    disabled={saving || chapterBusy}
                    title="Importerar kapitel från en lista eller dagordningen (ersätter eller lägger till)"
                    onClick={(event) => {
                      blurAfterMouse(event)
                      void openChapterImport()
                    }}
                  >
                    Kapitel…
                  </button>
                )}
                {!readOnly && (
                  <button
                    class="ce-chip"
                    type="button"
                    disabled={!master}
                    title="Undertextfunktionerna: Word, skapa automatiskt, egen VTT-fil, ta bort"
                    onClick={(event) => {
                      blurAfterMouse(event)
                      setShowCaptionTools(true)
                    }}
                  >
                    Undertext…
                  </button>
                )}
              </>
              )}
            </div>
            {!chaptersOnly && (
              <div class="ce-list-head" aria-hidden="true" style={energy ? { marginLeft: `${WAVEFORM_WIDTH}px` } : undefined}>
                <span />
                {/* Kapitlet som spelhuvudet står i ersätter rubriken Text, så att det syns när listan skrollar. */}
                {topChapters?.agenda ? <span class="ce-list-head-chapter" title={topChapters.agenda.label}>{topChapters.agenda.label}</span> : <span>Text</span>}
                <span>#</span><span>Start</span><span />
              </div>
            )}
            {chaptersOnly && chapterList.length === 0 && (
              <p key="no-chapters" class="ce-empty">Inga kapitel med tid än. Lägg till under Ej synkade kapitel och synka med Tid här.</p>
            )}
            <div class="ce-list-main">
            {energy && !chaptersOnly && (
              <CaptionWaveform
                cues={cues}
                energy={energy}
                scrollTop={scrollTop}
                height={viewportHeight}
                layout={layout}
                chapterMarks={chapterMarks}
                selectedIndex={selectedIndex}
                activeIndex={activeIndex}
                getTime={playhead}
                playing={playing}
                publishedStart={publishedStart}
                publishedEnd={publishedEnd}
                editable={!readOnly}
                anchor={anchor}
                onSeek={(time, kind) => {
                  if (kind === 'place') setAnchor(time)
                  seekTo(time, false, true)
                }}
                onSelect={(index) => {
                  setSelectedChapterId(null)
                  setSelectedIndex(index)
                }}
                onScrollBy={scrollListBy}
                onDragStart={dragStart}
                onDrag={dragMove}
                onDragEnd={dragEnd}
                onChapterDragStart={chapterDragStart}
                onChapterDrag={chapterDragMove}
                onChapterDragEnd={chapterDragEnd}
              />
            )}
            <div
              class="ce-list"
              ref={setListRef}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              onWheel={stopFollowing}
              onTouchMove={stopFollowing}
              onPointerDown={(event) => {
                // Ett tryck direkt på listan (inte på en rad) är ett drag i rullningslisten.
                if (event.target === event.currentTarget) stopFollowing()
              }}
            >
              <div class="ce-spacer" style={{ height: `${layout.total}px` }}>
                {Array.from({ length: Math.max(0, last - first) }, (_, offset) => first + offset).map((rowIndex) => {
                  const listRow = listRows ? listRows[rowIndex] : null
                  if (chaptersOnly) {
                    const entry = chapterOnlyRows[rowIndex]
                    return entry ? renderChapterRow(entry.chapter, rowIndex, entry.group) : null
                  }
                  if (listRow && listRow.kind === 'chapter') return renderChapterRow(listRow.chapter, rowIndex)
                  const index = listRow ? listRow.index : rowIndex
                  const cue = cues[index]
                  if (!cue) return null
                  const status = rangeStatus(cue, publishedStart, publishedEnd)
                  const issue = issueByIndex.get(index)
                  const locked = review !== null && isLocked(review, cue.id)
                  const wordChanged = review?.changedIds.has(cue.id) ?? false
                  const wordConflict = review !== null && openConflicts(review, cue.id).length > 0
                  const wordFlags = review?.flags.get(cue.id) ?? []
                  const wordRemoved = review?.removedIds.has(cue.id) ?? false
                  const wordBadgeText = wordConflict ? 'Konflikt' : wordRemoved ? 'Borttagen i Word' : wordChanged ? (wordFlags.includes('split') ? 'Delad' : 'Ändrad i Word') : ''
                  const classes = [
                    'ce-row',
                    index === activeIndex ? 'is-active' : '',
                    index === selectedIndex ? 'is-selected' : '',
                    status === 'outside' ? 'is-outside' : status === 'edge' ? 'is-edge' : '',
                    diff.changedIds.has(cue.id) ? 'is-changed' : '',
                    issue?.error ? 'has-error' : '',
                    isLongCue(cue.text) ? 'is-long' : '',
                    locked ? 'is-locked' : '',
                    wordChanged ? 'is-wordchanged' : '',
                    wordConflict ? 'is-wordconflict' : '',
                    wordBadgeText ? 'has-wordbadge' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <div key={cue.id} class={classes} style={{ top: `${layout.top(rowIndex)}px`, height: `${layout.height(rowIndex)}px` }}>
                      <div
                        class="ce-playcol"
                        role="button"
                        aria-label={index === playIndex && playing ? 'Pausa' : `Välj och spela replik ${index + 1}`}
                        title={index === playIndex && playing ? 'Pausa' : 'Välj repliken och spela från dess start (klicka igen för paus)'}
                        tabIndex={0}
                        onClick={() => playRow(index)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            playRow(index)
                          }
                        }}
                      >
                        {/* Spelknappen visas alltid för den spelande raden, och för övriga rader när kolumnen hovras eller har fokus (UNG-173). */}
                        <span class={`ce-playbtn${index === playIndex ? '' : ' is-ghost'}`} aria-hidden="true">
                          <Icon name={index === playIndex && playing ? 'pause' : 'play_arrow'} size={20} />
                        </span>
                      </div>
                      <div class="ce-text">
                        <textarea
                          ref={(element) => {
                            if (element) areas.current.set(index, element)
                            else areas.current.delete(index)
                          }}
                          rows={3}
                          value={cue.text}
                          readOnly={readOnly || locked}
                          title={locked ? 'Låst: ändrades inte i Word. Dubbelklicka för att låsa upp.' : undefined}
                          onDblClick={locked ? () => updateReview((next) => { next.unlocked.add(cue.id) }) : undefined}
                          aria-label={`Text för replik ${index + 1}`}
                          onInput={(event) => {
                            // Skrivning är en ändring för sig: utgångsläget sparas första gången något skrivs i rutan.
                            if (focusBase.current?.id !== cue.id) focusBase.current = { id: cue.id, cues }
                            setText(index, event.currentTarget.value)
                          }}
                          onFocus={() => {
                            setSelectedChapterId(null)
                            setSelectedIndex(index)
                            seekTo(cue.start, false)
                          }}
                          onBlur={() => setHistory(commitTypingTo(history))}
                          onKeyDown={(event) => onAreaKeyDown(event, index)}
                        />
                        {(() => {
                          const badge = wordBadge(index)
                          return badge && (
                            <span class="ce-wordcount" aria-hidden="true">
                              {badge.count} ord{badge.delta !== 0 && <b>{badge.delta > 0 ? ` +${badge.delta}` : ` −${-badge.delta}`}</b>}
                            </span>
                          )
                        })()}
                        {wordBadgeText && (
                          <span class={`ce-wordbadge${wordConflict ? ' is-conflict' : ''}${wordRemoved ? ' is-removed' : ''}`} aria-label={wordBadgeText}>{wordBadgeText}</span>
                        )}
                        {isLongCue(cue.text) && (
                          <span class="ce-longcue" role="note" aria-label={`Lång replik, ${cueCharCount(cue.text)} tecken`}>
                            {cueCharCount(cue.text)} tecken
                          </span>
                        )}
                        {issue?.error && <div class="ce-counters" role="alert"><span class="is-over">{issue.message}</span></div>}
                      </div>
                      <button class="ce-time ce-num" type="button" title="Spela den här repliken (klicka igen för paus)" onClick={() => playRow(index)}>{index + 1}</button>
                      <button
                        class="ce-time"
                        type="button"
                        title={`Spela den här repliken (klicka igen för paus), ${seconds(cue.end - cue.start)} s`}
                        onClick={() => playRow(index)}
                      >
                        {formatCueTime(cue.start)}
                      </button>
                      {!readOnly && !locked && (
                        <div class="ce-row-actions">
                          <button class="ce-icon" type="button" title="Ta bort repliken" onClick={() => apply(deleteCue(cues, index))}>
                            <Icon name="delete" size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            </div>
          </section>
        </div>
      )}

      {pendingMerge !== null && pendingInfo && (
        <ConfirmModal
          title="Slå ihop trots paus?"
          confirmLabel="Slå ihop ändå"
          onCancel={() => setPendingMerge(null)}
          onConfirm={() => {
            const index = pendingMerge
            setPendingMerge(null)
            apply(mergeWithNext(cues, index))
          }}
        >
          <p>
            Det är {seconds(pendingInfo.gapSeconds)} s paus mellan replikerna. Slår du ihop dem visas hela texten under pausen, som en replik på
            {' '}{seconds(pendingInfo.durationSeconds)} s.
          </p>
        </ConfirmModal>
      )}

      {exportChoice && (
        <Modal title="Exportera till Word" onClose={() => setExportChoice(false)}>
          <p>Vilken del av videon ska manuset gälla? Du kan läsa in det rättade manuset här igen oavsett val.</p>
          <div class="modal-actions">
            <button class="btn btn-sm" type="button" onClick={() => setExportChoice(false)}>Avbryt</button>
            <button class="btn btn-sm" type="button" onClick={() => void exportWord('whole')}>Hela inspelningen</button>
            <button class="btn btn-sm btn-primary" type="button" onClick={() => void exportWord('published')}>Publicerad del</button>
          </div>
        </Modal>
      )}

      {wordDialog && (
        <WordImportDialog
          projectId={projectId}
          blockedByEdits={dirty && !review}
          startWithBaseChoice={wordDialog.baseChoice}
          onClose={() => setWordDialog(null)}
          onResult={startWordReview}
        />
      )}

      {showChapterImport && chapterTools && (
        <ChapterImportDialog
          projectId={projectId}
          agendaId={chapterTools.agendaId}
          currentChapterCount={serverChapters.length}
          positionedChapterCount={savedChapters.length}
          directClock={!chapterTools.uploadedRecording}
          defaultDate={chapterTools.importDefaultDate}
          ifDraftRevision={draftRevision.current}
          onClose={() => setShowChapterImport(false)}
          onImported={(result) => void chaptersImported(result)}
        />
      )}

      {confirmRegenerate && (
        <ConfirmModal
          title={hasCaptions ? 'Skapa undertexterna på nytt?' : 'Skapa undertexter automatiskt?'}
          confirmLabel={hasCaptions ? 'Skapa på nytt' : 'Skapa undertexter'}
          danger={hasCaptions}
          onCancel={() => setConfirmRegenerate(false)}
          onConfirm={() => void regenerate()}
        >
          {hasCaptions ? (
          <p>
            Ett nytt utkast skapas från ljudet och ersätter den här arbetsversionen. Nuvarande version finns kvar i versionshistoriken, och
            nuvarande publicerade undertexter ligger kvar för tittarna tills du godkänner det nya utkastet.
            {dirty ? ` Dina ${changeCount} osparade ändringar går förlorade.` : ''}
          </p>
          ) : (
          <p>
            Ljudet skrivs ut och delas upp i repliker. Du följer framsteget här och får sedan ett utkast att redigera, med vågform och en ruta
            för varje replik. Utkastet syns inte för tittarna förrän du godkänner det.
            {dirty ? ' Dina osparade ändringar i kapitel och trim sparas först.' : ''}
          </p>
          )}
          <label class="ce-regen-option">
            <input type="checkbox" checked={regenNotify} onChange={(event) => setRegenNotify(event.currentTarget.checked)} />
            Mejla mig när det är klart
          </label>
          {speakersAvailable && (
            <label class="ce-regen-option">
              <input type="checkbox" checked={regenSpeakers} onChange={(event) => setRegenSpeakers(event.currentTarget.checked)} />
              Analysera också talarbyten (för manus i Word)
            </label>
          )}
          {speakersAvailable && speakersReady && !regenSpeakers && (
            <p class="ce-regen-hint">Talarbyten som redan är analyserade behålls: de hör till ljudet, inte till texten.</p>
          )}
          {!hasCaptions && (
            <p class="ce-regen-hint">
              Har du redan en undertextfil?{' '}
              <button class="btn btn-sm" type="button" onClick={() => { setConfirmRegenerate(false); setVttError(''); setShowVttImport(true) }}>
                Läs in egen VTT-fil i stället
              </button>
            </p>
          )}
        </ConfirmModal>
      )}

      {showCaptionTools && (
        <CaptionToolsDialog
          projectName={projectName}
          onClose={() => setShowCaptionTools(false)}
          tools={([
            ...(hasCaptions ? [
              {
                title: 'Exportera till Word',
                description: 'Undertexterna som ett manus i Word, att rätta och sedan läsa in här. Görs av den sparade versionen.',
                action: exporting ? 'Skapar…' : 'Exportera',
                disabled: !master || readOnly || exporting,
                onClick: () => (master?.publishedStartSeconds !== undefined ? setExportChoice(true) : void exportWord('whole')),
              },
              {
                title: 'Läs in från Word',
                description: 'Läser in ett rättat manus och föreslår ändringarna i undertexterna, att granska rad för rad.',
                action: 'Läs in…',
                disabled: !master || readOnly || saving || publishing || regenerating,
                onClick: () => setWordDialog({ baseChoice: false }),
              },
            ] : []),
            ...(onRegenerated ? [{
              title: hasCaptions ? 'Skapa på nytt' : 'Skapa automatiskt',
              description: hasCaptions
                ? 'Skapar ett nytt utkast från ljudet. Nuvarande version finns kvar i versionshistoriken.'
                : 'Ljudet skrivs ut och delas upp i repliker. Du får ett utkast att redigera.',
              action: regenerating ? 'Startar…' : hasCaptions ? 'Skapa på nytt…' : 'Skapa…',
              disabled: !master || readOnly || saving || publishing || regenerating || !canRegenerate,
              disabledReason: canRegenerate ? undefined : 'Undertexter går inte att skapa automatiskt just nu.',
              onClick: () => setConfirmRegenerate(true),
            }] : []),
            {
              title: 'Läs in VTT-fil',
              description: hasCaptions
                ? 'En egen undertextfil ersätter arbetsversionen (den gamla finns kvar i versionshistoriken).'
                : 'En egen undertextfil blir undertexternas utkast.',
              action: 'Läs in…',
              disabled: !master || readOnly || saving || publishing || regenerating || captionsBusy,
              onClick: () => { setVttError(''); setShowVttImport(true) },
            },
            ...(hasCaptions ? [{
              title: 'Ta bort undertexter',
              description: 'Tar bort undertexterna helt, även för tittarna. Det går inte att ångra.',
              action: 'Ta bort…',
              danger: true,
              disabled: readOnly || saving || publishing || regenerating || captionsBusy,
              onClick: () => setConfirmRemoveCaptions(true),
            }] : []),
          ] satisfies CaptionTool[])}
        />
      )}

      {showVttImport && (
        <VttImportDialog
          projectName={projectName}
          publishedStart={master?.publishedStartSeconds}
          hasCaptions={hasCaptions}
          dirtyCount={dirty ? changeCount : 0}
          busy={captionsBusy}
          error={vttError}
          onImport={(file, timeline) => void importVtt(file, timeline)}
          onClose={() => setShowVttImport(false)}
        />
      )}

      {confirmRemoveCaptions && (
        <ConfirmModal title="Ta bort undertexterna?" confirmLabel="Ta bort" danger onCancel={() => setConfirmRemoveCaptions(false)} onConfirm={() => void removeAllCaptions()}>
          <p>
            Undertexterna tas bort helt: arbetsversionen med hela versionshistoriken, och de publicerade undertexterna försvinner för tittarna
            direkt. Kapitel och trim rörs inte. Det går inte att ångra.
            {cuesDirty ? ' Dina osparade ändringar i undertexterna går förlorade.' : ''}
          </p>
        </ConfirmModal>
      )}

      {confirmPublish && (
        <ConfirmModal
          title="Publicera ändringarna?"
          confirmLabel={dirty ? 'Spara och publicera' : 'Publicera'}
          onCancel={() => setConfirmPublish(false)}
          onConfirm={() => void publishChanges()}
        >
          <p>
            Ändringarna i kapitel och undertexter blir synliga för tittarna direkt och ersätter de nuvarande.
            {dirty ? ' Dina osparade ändringar sparas först.' : ''}
            {unreviewed ? ' Obs: undertexterna är maskingenererade och inte granskade.' : ''}
          </p>
        </ConfirmModal>
      )}

      {confirmDiscard && (
        <ConfirmModal
          title="Förkasta ändringarna?"
          confirmLabel="Förkasta"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => void discardChanges()}
        >
          <p>
            Kapitel och undertexter går tillbaka till det som är publicerat. Det du ändrat sedan dess försvinner (undertexternas tidigare versioner
            finns kvar i historiken). Osparade ändringar i redigeraren förloras också.
          </p>
        </ConfirmModal>
      )}

      {conflict && (
        <Modal title="Någon annan har sparat" onClose={() => setConflict(null)}>
          <p>{conflictDescription(conflict)} Dina ändringar är inte sparade.</p>
          <p>Ladda om för att se det som finns nu, eller skriv över med dina ändringar.</p>
          <div class="modal-actions">
            <button class="btn btn-sm" type="button" onClick={() => setConflict(null)}>Avbryt</button>
            <button class="btn btn-sm" type="button" onClick={() => void reloadAll()}>Ladda om (dina ändringar går förlorade)</button>
            <button class="btn btn-sm btn-danger" type="button" onClick={() => void overwrite()}>{overwriteLabel(conflict.action)}</button>
          </div>
        </Modal>
      )}

      {confirmClose && (
        <ConfirmModal
          title="Stänga utan att spara?"
          confirmLabel="Stäng utan att spara"
          danger
          onCancel={() => setConfirmClose(false)}
          onConfirm={onClose}
        >
          <p>Du har {changeCount} osparade ändringar. De går förlorade om du stänger nu.</p>
        </ConfirmModal>
      )}
    </div>
  )
}
