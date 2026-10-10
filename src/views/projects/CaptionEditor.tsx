import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { notifyJobsChanged } from '../../app/jobsBus'
import { shouldCaptureTab, shouldTogglePlayback, spaceAction, spaceTargetKind, tabOriginIndex, tabTargetIndex, tabTargetKind } from './captionKeysLogic'
import { cueCharCount, isLongCue } from './captionLengthLogic'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { client } from '../../data'
import { ApiError } from '../../data/http/fetchJson'
import type { CaptionDraft, CaptionEnergy, CaptionGeneration, CaptionMaster, CueKind, WordImportResult } from '../../data/types'
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
import {
  NEW_CHAPTER_PREFIX, addChapter as addChapterTo, changeCount as chapterChangeTotal, chapterKindText, chapterLayout, currentChapters,
  diffChapters, mergeRows, positionedChapters, removeChapter, renameChapter, setChapterTime, sortChapters, type EditorChapter,
} from './chapterRows'
import { cueIndexAt, timeAtRow, type GrabRole } from './captionWaveformLogic'
import { approveBlockedReason, groupCorrections, type CorrectionGroup } from './autoCaptionsLogic'
import { ownCorrections } from './captionCorrectionsLogic'
import { CorrectionsPanel } from './CorrectionsPanel'
import { showUnmute, unmuted } from './videoSoundLogic'
import { WordImportDialog } from './WordImportDialog'
import { exportFileName } from './chapterExport'
import { saveFile } from './ExportImportDialog'
import { Modal } from '../../components/Modal'
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
  /** Anropas efter en lyckad sparning, så att omgivande vy kan hämta om status. */
  onSaved?: () => void
  /** Anropas när "Skapa på nytt" har startat ett nytt jobb, så att omgivande vy kan visa framsteget (redigeraren stängs då). */
  onRegenerated?: (generation: CaptionGeneration) => void
  /** Anropas efter att kapitel sparats (utkastet ändrat), så att omgivande vy kan hämta om kapitlen och visa opublicerade ändringar. */
  onChaptersSaved?: () => void
}

/** Allt som går att ångra: replikerna och kapitlen i ett steg (UNG-229). */
interface Snapshot {
  cues: EditCue[]
  chapters: EditorChapter[]
}

const seconds = (value: number) => value.toFixed(1).replace('.', ',')

// UNG-140/143: redigerare för undertexterna (mastern, original-tidslinje). Video med aktuell replik över bilden och en virtualiserad
// radlista där texten rättas på plats. Rutor kan slås ihop (exakt tid), delas, orden kan flyttas mellan grannar, tider justeras,
// rader läggs till och tas bort, och allt går att ångra tills man sparar. Sparas som en version (versionskontroll mot servern).
export function CaptionEditor({ projectId, projectName, onClose, onSaved, onRegenerated, onChaptersSaved }: CaptionEditorProps) {
  const [master, setMaster] = useState<CaptionMaster | null>(null)
  const [loadError, setLoadError] = useState('')
  const [cues, setCues] = useState<EditCue[]>([])
  const [saved, setSaved] = useState<EditCue[]>([])
  const [history, setHistory] = useState<History<Snapshot>>(emptyHistory)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
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
  // Flik under videon: verktyg för vald replik, eller rättningar (UNG-166). Maskinella rättningar hämtas ur utkastets genereringsläge.
  const [sideTab, setSideTab] = useState<'tools' | 'corrections'>(SHOW_TOOLS_TAB ? 'tools' : 'corrections')
  const [machine, setMachine] = useState<CorrectionGroup[] | null>(null)
  // Utkastet som servern känner till (för att veta om det går att publicera), och publiceringens tillstånd (UNG-165: Publicera i huvudet).
  const [draftInfo, setDraftInfo] = useState<CaptionDraft | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // "Skapa på nytt" i huvudet: nytt jobb från ljudet, efter bekräftelse.
  const [canRegenerate, setCanRegenerate] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
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
  const [showChapters, setShowChapters] = useState(true)
  // UNG-231: filtret Undertexter. Med bara Kapitel på blir listan en kompakt översikt utan vågform, där talarna är grupperade under sin punkt
  // och hopfällda tills man öppnar punkten.
  const [showCues, setShowCues] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  // Tiden vid listans övre kant när läget byts, så att listan hamnar på samma ställe i det nya läget.
  const modeScrollTime = useRef<number | null>(null)
  const [editingChapter, setEditingChapter] = useState<string | null>(null)
  const [chapterDraft, setChapterDraft] = useState('')
  const [addChapterOpen, setAddChapterOpen] = useState(false)
  const [addKind, setAddKind] = useState<'agendaItem' | 'person'>('agendaItem')
  const [addLabel, setAddLabel] = useState('')
  const newChapterCounter = useRef(0)
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
    const list = derive(next.cues.map(({ id, start, end, text }) => ({ id, start, end, text })))
    setMaster(next)
    setCues(list)
    setSaved(list)
    setHistory(emptyHistory())
    setReview(null)
    setFromWord(false)
    focusBase.current = null
  }

  async function load() {
    setLoadError('')
    try {
      adopt(await client.projects.getCaptionMaster(projectId))
      setConflict(false)
      setSaveError('')
      setNotice('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Undertexterna kunde inte hämtas.')
    }
  }

  useEffect(() => {
    void load()
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    client.projects.getCaptionGeneration(projectId).then(
      (generation) => {
        if (cancelled) return
        setMachine(groupCorrections(generation.draft?.corrections ?? []))
        setDraftInfo(generation.draft ?? null)
        setCanRegenerate(generation.canGenerate)
        setSpeakersAvailable(generation.speakersAvailable === true)
        setSpeakersReady(generation.speakers?.state === 'ready')
      },
      () => { if (!cancelled) setMachine([]) },
    )
    return () => { cancelled = true }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    client.projects.chapters(projectId).then(
      (list) => {
        if (cancelled) return
        const positioned = positionedChapters(list)
        setChapterList(positioned)
        setSavedChapters(positioned)
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

  // Orden som ändrats sedan det som lästes in, med radens index (UNG-166).
  const ownList = useMemo(() => {
    const indexById = new Map(cues.map((cue, index) => [cue.id, index]))
    return ownCorrections(saved, cues).map((item) => ({ index: indexById.get(item.cueId) ?? 0, from: item.from, to: item.to }))
  }, [saved, cues])

  // Det sparade jämförs i härledd form: annars ser varje replik ändrad ut (gul kant) så fort en enda redigering härlett om alla tider.
  const diff = useMemo(() => diffState(derive(saved), cues), [saved, cues, timing])
  const chapterChanges = useMemo(() => diffChapters(savedChapters, chapterList), [savedChapters, chapterList])
  const chaptersDirty = chapterChangeTotal(chapterChanges) > 0
  const cuesDirty = diff.dirty
  // Undertexter och kapitel är ett enda "osparat": en Spara, en Ångra (UNG-229).
  const dirty = cuesDirty || chaptersDirty
  const changeCount = diff.changedIds.size + diff.removed + (diff.reordered && diff.changedIds.size + diff.removed === 0 ? 1 : 0) + chapterChangeTotal(chapterChanges)
  const readOnly = master?.legacy ?? false
  // Publicera i huvudet: publicerad = den sparade versionen är den godkända och inget är ändrat sedan dess.
  const hasPublished = master?.publishedVersion !== undefined && master?.publishedVersion !== null
  const upToDate = Boolean(master) && hasPublished && master?.publishedVersion === master?.version && !cuesDirty
  const publishLabel = upToDate ? 'Publicerad' : hasPublished ? 'Publicera ändringar' : 'Godkänn och publicera'
  const publishBlocked = draftInfo ? approveBlockedReason(draftInfo) : null
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
  const chaptersAvailable = chapterState === 'ok' && chapterList.length > 0 && review === null
  const chaptersVisible = showChapters && chaptersAvailable
  const chaptersOnly = chaptersVisible && !showCues
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

  function addChapterHere() {
    if (readOnly) return
    newChapterCounter.current += 1
    const fallback = addKind === 'agendaItem' ? 'Ny punkt' : 'Ny person'
    applyChapters(addChapterTo(chapterList, { id: `${NEW_CHAPTER_PREFIX}${newChapterCounter.current}`, kind: addKind, label: addLabel.trim() || fallback, time: playhead() }))
    setAddLabel('')
    setAddChapterOpen(false)
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
      const next = await client.projects.saveCaptionMaster(projectId, { ifVersion: master.version, cues: savePayload(sortedForSave(withoutEmpty(cues))), ...(fromWord ? { reason: 'word' as const } : {}) })
      adopt(next)
      onSaved?.()
      return next
    } catch (err) {
      if (err instanceof ApiError && err.code === 'version_conflict') setConflict(true)
      else setSaveError(err instanceof Error ? err.message : 'Undertexterna kunde inte sparas.')
      return null
    } finally {
      setSaving(false)
    }
  }

  // UNG-229: kapitlen sparas som utkast (ett anrop per ändring). Misslyckas något läses det servern har om, så att det som återstår går att spara igen.
  async function saveChapters(): Promise<boolean> {
    if (chapterChangeTotal(chapterChanges) === 0) return true
    setSaving(true)
    setSaveError('')
    try {
      for (const id of chapterChanges.removed) await client.projects.deleteDraftChapter(projectId, id)
      for (const item of chapterChanges.changed) {
        await client.projects.updateDraftChapter(projectId, item.id, {
          ...(item.label !== undefined ? { label: item.label } : {}),
          ...(item.time !== undefined ? { offsetSeconds: item.time } : {}),
        })
      }
      for (const item of chapterChanges.added) await client.projects.addChapter(projectId, { kind: item.kind as CueKind, label: item.label, offsetSeconds: item.time })
      const fresh = positionedChapters(await client.projects.chapters(projectId))
      setChapterList(fresh)
      setSavedChapters(fresh)
      setHistory(emptyHistory())
      setNotice('Kapitlen är sparade som utkast och går live först när du publicerar ondemand.')
      onChaptersSaved?.()
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Kapitlen kunde inte sparas.')
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

  async function save() {
    if (cuesDirty && !(await saveMaster())) return
    if (chaptersDirty) await saveChapters()
  }

  // Skapa på nytt: startar ett nytt jobb från ljudet. Det nya utkastet ersätter arbetsversionen (den gamla finns kvar som tidigare version)
  // och publiceras inte förrän det godkänns. Redigeraren stängs, och omgivande vy visar framsteget.
  async function regenerate() {
    setConfirmRegenerate(false)
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

  // Publicera från redigeringens huvud: osparade ändringar sparas först, sedan godkänns den versionen och blir synlig för tittarna.
  async function publish() {
    if (!master) return
    setConfirmPublish(false)
    setPublishing(true)
    setSaveError('')
    try {
      let version = master.version
      if (cuesDirty) {
        const saved = await saveMaster()
        if (!saved) return
        version = saved.version
      }
      if (chaptersDirty && !(await saveChapters())) return
      await client.projects.approveCaptionDraft(projectId, version)
      await load()
      onSaved?.()
      setNotice('Undertexterna är publicerade och syns för tittarna.')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Undertexterna kunde inte publiceras.')
    } finally {
      setPublishing(false)
    }
  }

  function requestClose() {
    if (dirty) setConfirmClose(true)
    else onClose()
  }

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
        if (shouldCaptureTab(event, kind, otherDialogOpen) && cues.length > 0 && !chaptersOnly) {
          event.preventDefault()
          tabFrom(tabOriginIndex(activeIndex, selectedIndex, null), event.shiftKey)
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

  const publishedStart = master?.publishedStartSeconds
  const publishedEnd = master?.publishedEndSeconds
  const pendingInfo = pendingMerge === null ? null : mergeInfo(cues, pendingMerge)

  return (
    <div class="ce-scrim" role="dialog" aria-modal="true" aria-label="Redigera undertexter">
      <header class="ce-head">
        <div class="ce-title">
          <h2>Redigera undertexter</h2>
          <div class="ce-sub">
            {projectName}
            {master && <> · version {master.version}{master.updatedByName ? ` (${master.updatedByName})` : ''}</>}
            {publishedStart !== undefined && publishedEnd !== undefined && (
              <> · publiceras: {formatHms(publishedStart)}–{formatHms(publishedEnd)}</>
            )}
          </div>
        </div>
        <div class="ce-actions">
          {publishedStart !== undefined && (
            <button class="btn btn-sm" type="button" onClick={() => seekTo(publishedStart, false)}>
              Hoppa till publicerad del
            </button>
          )}
          <label class="ce-follow">
            <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.currentTarget.checked)} />
            Följ med
          </label>
          <span class="ce-dirty" aria-live="polite">{dirty ? `${changeCount} osparade ändringar` : master ? 'Sparat' : ''}</span>
          <button
            class="btn btn-sm"
            type="button"
            disabled={!master || readOnly || exporting}
            title="Skriver ut undertexterna som ett manus i Word, att rätta och sedan läsa in här (görs av den sparade versionen)"
            onClick={() => (master?.publishedStartSeconds !== undefined ? setExportChoice(true) : void exportWord('whole'))}
          >
            {exporting ? 'Skapar…' : 'Exportera till Word'}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            disabled={!master || readOnly || saving || publishing || regenerating}
            title="Läser in ett rättat manus (Word) och föreslår ändringarna i undertexterna"
            onClick={() => setWordDialog({ baseChoice: false })}
          >
            Läs in från Word…
          </button>
          {onRegenerated && (
            <button
              class="btn btn-sm"
              type="button"
              disabled={!master || readOnly || saving || publishing || regenerating || !canRegenerate}
              title={canRegenerate ? 'Skapar nya undertexter från ljudet (efter bekräftelse)' : 'Undertexterna går inte att skapa på nytt just nu'}
              onClick={() => setConfirmRegenerate(true)}
            >
              {regenerating ? 'Startar…' : 'Skapa på nytt'}
            </button>
          )}
          <button class="btn btn-sm" type="button" disabled={!dirty || saving || publishing || readOnly} onClick={() => void save()}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
          <button
            class="btn btn-sm btn-primary"
            type="button"
            disabled={!master || readOnly || saving || publishing || upToDate || Boolean(publishBlocked)}
            title={publishBlocked ?? (upToDate ? `Version ${master?.version} är publicerad` : dirty ? 'Sparar ändringarna och publicerar dem för tittarna' : 'Publicerar undertexterna för tittarna')}
            onClick={() => setConfirmPublish(true)}
          >
            {publishing ? 'Publicerar…' : publishLabel}
          </button>
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
      {conflict && (
        <div key="conflict" class="ce-banner ce-error" role="alert">
          Någon annan har sparat undertexterna sedan du öppnade dem. Dina ändringar är inte sparade.
          <button class="btn btn-sm" type="button" onClick={() => void load()}>Ladda om (dina ändringar går förlorade)</button>
        </div>
      )}
      {saveError && <div key="save-error" class="ce-banner ce-error" role="alert">{saveError}</div>}
      {notice && (
        <div key="notice" class="ce-banner ce-warn ce-notice" role="status">
          {notice}
          <button class="ib" type="button" aria-label="Stäng meddelandet" onClick={() => setNotice('')}>✕</button>
        </div>
      )}

      {!master && !loadError && <div key="loading" class="ce-loading">Hämtar undertexter…</div>}

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

            {SHOW_TOOLS_TAB ? (
              <div class="ce-tabs" role="tablist" aria-label="Under videon">
                <button class={sideTab === 'tools' ? 'is-active' : ''} role="tab" type="button" aria-selected={sideTab === 'tools'} onClick={() => setSideTab('tools')}>Verktyg</button>
                <button class={sideTab === 'corrections' ? 'is-active' : ''} role="tab" type="button" aria-selected={sideTab === 'corrections'} onClick={() => setSideTab('corrections')}>
                  Rättningar{ownList.length > 0 ? ` (${ownList.length})` : ''}
                </button>
              </div>
            ) : (
              <h3 class="ce-side-title">Rättningar{ownList.length > 0 ? ` (${ownList.length})` : ''}</h3>
            )}

            {sideTab === 'corrections' && (
              <CorrectionsPanel
                machine={machine}
                own={ownList}
                onJumpToTime={(time) => {
                  const index = cueIndexAt(cues, time)
                  if (index >= 0) focusRow(index)
                  seekTo(index >= 0 ? cues[index].start : time, false)
                }}
                onJumpToRow={(index) => {
                  focusRow(index)
                  seekTo(cues[index].start, false)
                }}
              />
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

            <p class="ce-help">
              Dra en gräns i vågformen så flödar texten över den. Ctrl/Cmd+Enter = dela vid markören, ny ruta efter (sist i texten) eller före (först) · Enter = nästa rad · Skift+Enter = ny rad · Esc = ångra raden · Tab / Skift+Tab = nästa / föregående rad ·
              Backspace i början / Delete i slutet slår ihop med grannen. Klicka på en rads tid för att spela den.
            </p>
          </section>

          <section class="ce-list-wrap" aria-label="Repliker">
            {chapterState === 'ok' && review === null && (
              <div class="ce-chapterbar">
                {chapterList.length > 0 && (
                  <>
                    {/* Minst ett av filtren är alltid på: släcks det ena när det andra redan är släckt händer ingenting. */}
                    <button
                      class={`ce-chip${showCues ? ' is-on' : ''}`}
                      type="button"
                      aria-pressed={showCues}
                      onClick={() => { if (!showCues || showChapters) changeFilter({ cues: !showCues, chapters: true }) }}
                    >
                      Undertexter · {cues.length}
                    </button>
                    <button
                      class={`ce-chip${showChapters ? ' is-on' : ''}`}
                      type="button"
                      aria-pressed={showChapters}
                      onClick={() => { if (!showChapters || showCues) changeFilter({ cues: true, chapters: !showChapters }) }}
                    >
                      Kapitel · {chapterList.length}
                    </button>
                  </>
                )}
                {!readOnly && (
                  <button class="ce-chip" type="button" aria-expanded={addChapterOpen} onClick={() => setAddChapterOpen(!addChapterOpen)}>
                    + Kapitel här
                  </button>
                )}
                {topChapters && (
                  <span class="ce-chapterbar-now" aria-live="polite">
                    {topChapters.agenda ? (
                      <>
                        <span class="ce-chapterbar-kind">Punkt</span>
                        <span class="ce-chapterbar-label">{topChapters.agenda.label}</span>
                        {topChapters.person && <span class="ce-chapterbar-person">· {topChapters.person.label}</span>}
                      </>
                    ) : (
                      <span class="ce-chapterbar-none">Före första kapitlet</span>
                    )}
                  </span>
                )}
              </div>
            )}
            {chapterState === 'ok' && review === null && addChapterOpen && !readOnly && (
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
                      addChapterHere()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      setAddChapterOpen(false)
                    }
                  }}
                />
                <button class="btn btn-sm btn-primary" type="button" onClick={addChapterHere}>
                  Lägg till vid {formatCueTime(currentTime)}
                </button>
                <button class="btn btn-sm" type="button" onClick={() => setAddChapterOpen(false)}>Avbryt</button>
              </div>
            )}
            {!chaptersOnly && (
              <div class="ce-list-head" aria-hidden="true" style={energy ? { marginLeft: `${WAVEFORM_WIDTH}px` } : undefined}>
                <span /><span>Text</span><span>#</span><span>Start</span><span />
              </div>
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

      {confirmRegenerate && (
        <ConfirmModal
          title="Skapa undertexterna på nytt?"
          confirmLabel="Skapa på nytt"
          danger
          onCancel={() => setConfirmRegenerate(false)}
          onConfirm={() => void regenerate()}
        >
          <p>
            Ett nytt utkast skapas från ljudet och ersätter den här arbetsversionen. Nuvarande version finns kvar i versionshistoriken, och
            nuvarande publicerade undertexter ligger kvar för tittarna tills du godkänner det nya utkastet.
            {dirty ? ` Dina ${changeCount} osparade ändringar går förlorade.` : ''}
          </p>
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
        </ConfirmModal>
      )}

      {confirmPublish && (
        <ConfirmModal
          title="Publicera undertexterna?"
          confirmLabel={dirty ? 'Spara och publicera' : 'Publicera'}
          onCancel={() => setConfirmPublish(false)}
          onConfirm={() => void publish()}
        >
          <p>
            Undertexterna blir synliga för tittarna direkt{hasPublished ? ' och ersätter de nuvarande' : ''}.
            {dirty ? ' Dina osparade ändringar sparas först.' : ''} De är gjorda av AI och kan innehålla fel, så granska dem först.
          </p>
        </ConfirmModal>
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
