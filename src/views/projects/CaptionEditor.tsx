import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { create, isPlayerSupported } from 'amazon-ivs-player'
import wasmBinary from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.wasm?url'
import wasmWorker from 'amazon-ivs-player/dist/assets/amazon-ivs-wasmworker.min.js?url'
import { client } from '../../data'
import { ApiError } from '../../data/http/fetchJson'
import type { CaptionEnergy, CaptionMaster } from '../../data/types'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Icon } from '../../components/Icon'
import { formatHms } from '../../app/time'
import {
  activeCueIndex, formatCueTime, rangeStatus, savePayload, scrollToReveal, windowRange,
} from './captionEditorLogic'
import {
  LONG_GAP_SECONDS, addCue, deleteCue, diffState, mergeInfo, mergeWithNext, shiftFrom,
  newCueTime, sortedForSave, splitCue, validateCues, withoutEmpty, type EditCue, type OpResult,
} from './captionEditOps'
import { estimateSplitTime, moveBoundary } from './captionFlow'
import { deriveTimes, speechRuns } from './captionTimingLogic'
import { emptyHistory, record, redo, undo, type History } from './captionHistory'
import { CaptionWaveform, WAVEFORM_WIDTH } from './CaptionWaveform'
import { cueIndexAt, type GrabRole } from './captionWaveformLogic'
import { groupCorrections, type CorrectionGroup } from './autoCaptionsLogic'
import { ownCorrections } from './captionCorrectionsLogic'
import { CorrectionsPanel } from './CorrectionsPanel'
import './CaptionEditor.css'

const ROW_HEIGHT = 84

interface CaptionEditorProps {
  projectId: string
  projectName: string
  onClose: () => void
  /** Anropas efter en lyckad sparning, så att omgivande vy kan hämta om status. */
  onSaved?: () => void
}

const seconds = (value: number) => value.toFixed(1).replace('.', ',')

// UNG-140/143: redigerare för undertexterna (mastern, original-tidslinje). Video med aktuell replik över bilden och en virtualiserad
// radlista där texten rättas på plats. Rutor kan slås ihop (exakt tid), delas, orden kan flyttas mellan grannar, tider justeras,
// rader läggs till och tas bort, och allt går att ångra tills man sparar. Sparas som en version (versionskontroll mot servern).
export function CaptionEditor({ projectId, projectName, onClose, onSaved }: CaptionEditorProps) {
  const [master, setMaster] = useState<CaptionMaster | null>(null)
  const [loadError, setLoadError] = useState('')
  const [cues, setCues] = useState<EditCue[]>([])
  const [saved, setSaved] = useState<EditCue[]>([])
  const [history, setHistory] = useState<History<EditCue[]>>(emptyHistory)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [follow, setFollow] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [pendingMerge, setPendingMerge] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [shiftInput, setShiftInput] = useState('0,5')
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [focusTick, setFocusTick] = useState(0)
  const [energy, setEnergy] = useState<CaptionEnergy | null>(null)
  // Flik under videon: verktyg för vald replik, eller rättningar (UNG-166). Maskinella rättningar hämtas ur utkastets genereringsläge.
  const [sideTab, setSideTab] = useState<'tools' | 'corrections'>('tools')
  const [machine, setMachine] = useState<CorrectionGroup[] | null>(null)
  // Gränsen (replikindex) som dras, med antal ord i de två berörda replikerna när draget började (för orden-just-nu-märket).
  const [dragBoundary, setDragBoundary] = useState<{ index: number; role: GrabRole; baseBefore: number; baseAfter: number } | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
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
      (generation) => { if (!cancelled) setMachine(groupCorrections(generation.draft?.corrections ?? [])) },
      () => { if (!cancelled) setMachine([]) },
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
  const dirty = diff.dirty
  const changeCount = diff.changedIds.size + diff.removed + (diff.reordered && diff.changedIds.size + diff.removed === 0 ? 1 : 0)
  const readOnly = master?.legacy ?? false
  const issues = useMemo(() => validateCues(cues), [cues])
  const issueByIndex = useMemo(() => {
    const map = new Map<number, (typeof issues)[number]>()
    for (const issue of issues) if (!map.has(issue.index) || issue.error) map.set(issue.index, issue)
    return map
  }, [issues])
  const selected = cues[selectedIndex]

  // ---- Video ----
  const hlsUrl = master?.originalHlsUrl
  useEffect(() => {
    const video = videoRef.current
    if (!video || !hlsUrl) return
    if (!isPlayerSupported) {
      setVideoError('Videospelaren kan inte köras i den här webbläsaren.')
      return
    }
    const player = create({ wasmWorker, wasmBinary })
    player.attachHTMLVideoElement(video)
    player.load(hlsUrl)
    const onTime = () => setCurrentTime(video.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      player.pause()
      player.delete()
    }
  }, [hlsUrl])

  function seekTo(target: number, play: boolean) {
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
    const element = listRef.current
    if (!element) return
    const update = () => setViewportHeight(element.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [master])

  const { first, last } = windowRange(scrollTop, viewportHeight, ROW_HEIGHT, cues.length)

  function revealRow(index: number) {
    const element = listRef.current
    if (!element) return
    const next = scrollToReveal(index, element.scrollTop, element.clientHeight, ROW_HEIGHT)
    if (next !== element.scrollTop) {
      element.scrollTop = next
      setScrollTop(next)
    }
  }

  // Raden får fokus (och markören sin plats) så snart den finns i listan, efter att den scrollats fram vid behov.
  function focusRow(index: number, caret?: number) {
    pendingFocus.current = { index, caret }
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
  function commitTypingTo(base: History<EditCue[]>): History<EditCue[]> {
    const typing = focusBase.current
    focusBase.current = null
    if (!typing) return base
    const before = typing.cues.find((cue) => cue.id === typing.id)
    const now = cues.find((cue) => cue.id === typing.id)
    return before && now && before.text !== now.text ? record(base, typing.cues) : base
  }

  function apply(result: OpResult): boolean {
    if (!result.ok) {
      setNotice(result.reason)
      return false
    }
    setNotice('')
    setHistory(record(commitTypingTo(history), cues))
    setCues(derive(result.cues))
    focusRow(result.focusIndex, result.caret)
    return true
  }

  function doUndo() {
    const base = commitTypingTo(history)
    const result = undo(base, cues)
    if (!result) {
      setHistory(base)
      return
    }
    setHistory(result.history)
    setCues(derive(result.value))
    setNotice('')
  }

  function doRedo() {
    const result = redo(history, cues)
    if (!result) return
    setHistory(result.history)
    setCues(derive(result.value))
    setNotice('')
  }

  const newId = () => tempId.current--

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
    seekTo(time, false)
  }

  function dragEnd() {
    const base = dragBase.current
    dragBase.current = null
    setDragBoundary(null)
    if (!base || cuesRef.current === base) return
    setHistory(record(commitTypingTo(history), base))
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
    // Knappen visas vid den aktiva repliken (playIndex), så den pausar när uppspelning pågår, även om uppspelningen har gått förbi den valda.
    if (index === playIndex && video && !video.paused) {
      video.pause()
      setSelectedIndex(index)
      return
    }
    setSelectedIndex(index)
    seekTo(cue.start, true)
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
  async function save() {
    if (!master || !dirty || saving || readOnly) return
    const error = issues.find((issue) => issue.error)
    if (error) {
      setNotice(`Replik ${error.index + 1}: ${error.message}`)
      focusRow(error.index)
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      // Tomma repliker (t.ex. en ny ruta som lämnats tom) tas bort tyst.
      adopt(await client.projects.saveCaptionMaster(projectId, { ifVersion: master.version, cues: savePayload(sortedForSave(withoutEmpty(cues))) }))
      onSaved?.()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'version_conflict') setConflict(true)
      else setSaveError(err instanceof Error ? err.message : 'Undertexterna kunde inte sparas.')
    } finally {
      setSaving(false)
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
      focusRow(event.shiftKey ? index - 1 : index + 1)
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
          <button class="btn btn-sm" type="button" disabled={history.past.length === 0 || readOnly} onClick={doUndo} title="Ångra (Ctrl/Cmd+Z)">Ångra</button>
          <button class="btn btn-sm" type="button" disabled={history.future.length === 0 || readOnly} onClick={doRedo} title="Gör om (Ctrl/Cmd+Skift+Z)">Gör om</button>
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
          <button class="btn btn-sm btn-primary" type="button" disabled={!dirty || saving || readOnly} onClick={() => void save()}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
          <button class="ib" type="button" aria-label="Stäng" title="Stäng" onClick={requestClose}>✕</button>
        </div>
      </header>

      {loadError && (
        <div class="ce-banner ce-error" role="alert">
          {loadError}
          <button class="btn btn-sm" type="button" onClick={() => void load()}>Försök igen</button>
        </div>
      )}
      {readOnly && (
        <div class="ce-banner ce-warn" role="alert">
          Det här utkastet är skapat på ett äldre sätt och går inte att redigera här. Skapa nya undertexter i undertextpanelen.
        </div>
      )}
      {conflict && (
        <div class="ce-banner ce-error" role="alert">
          Någon annan har sparat undertexterna sedan du öppnade dem. Dina ändringar är inte sparade.
          <button class="btn btn-sm" type="button" onClick={() => void load()}>Ladda om (dina ändringar går förlorade)</button>
        </div>
      )}
      {saveError && <div class="ce-banner ce-error" role="alert">{saveError}</div>}
      {notice && (
        <div class="ce-banner ce-warn ce-notice" role="status">
          {notice}
          <button class="ib" type="button" aria-label="Stäng meddelandet" onClick={() => setNotice('')}>✕</button>
        </div>
      )}

      {!master && !loadError && <div class="ce-loading">Hämtar undertexter…</div>}

      {master && (
        <div class="ce-body">
          <section class="ce-video" aria-label="Video">
            <div class="ce-stage">
              <video ref={videoRef} controls playsInline preload="metadata" />
              {activeCue && <div class="ce-overlay" aria-hidden="true">{activeCue.text}</div>}
            </div>
            {videoError && <p class="ce-error-text" role="alert">{videoError}</p>}

            <div class="ce-tabs" role="tablist" aria-label="Under videon">
              <button class={sideTab === 'tools' ? 'is-active' : ''} role="tab" type="button" aria-selected={sideTab === 'tools'} onClick={() => setSideTab('tools')}>Verktyg</button>
              <button class={sideTab === 'corrections' ? 'is-active' : ''} role="tab" type="button" aria-selected={sideTab === 'corrections'} onClick={() => setSideTab('corrections')}>
                Rättningar{ownList.length > 0 ? ` (${ownList.length})` : ''}
              </button>
            </div>

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

            {sideTab === 'tools' && <p class="ce-help">
              Dra en gräns i vågformen så flödar texten över den. Ctrl/Cmd+Enter = dela vid markören, ny ruta efter (sist i texten) eller före (först) · Enter = nästa rad · Skift+Enter = ny rad · Esc = ångra raden · Tab / Skift+Tab = nästa / föregående rad ·
              Backspace i början / Delete i slutet slår ihop med grannen. Klicka på en rads tid för att spela den.
            </p>}
          </section>

          <section class="ce-list-wrap" aria-label="Repliker">
            <div class="ce-list-head" aria-hidden="true" style={energy ? { marginLeft: `${WAVEFORM_WIDTH}px` } : undefined}>
              <span /><span>Text</span><span>#</span><span>Start</span><span />
            </div>
            <div class="ce-list-main">
            {energy && (
              <CaptionWaveform
                cues={cues}
                energy={energy}
                scrollTop={scrollTop}
                height={viewportHeight}
                rowHeight={ROW_HEIGHT}
                selectedIndex={selectedIndex}
                activeIndex={activeIndex}
                getTime={playhead}
                playing={playing}
                publishedStart={publishedStart}
                publishedEnd={publishedEnd}
                editable={!readOnly}
                onSeek={(time) => seekTo(time, false)}
                onSelect={setSelectedIndex}
                onScrollBy={scrollListBy}
                onDragStart={dragStart}
                onDrag={dragMove}
                onDragEnd={dragEnd}
              />
            )}
            <div
              class="ce-list"
              ref={listRef}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              onWheel={stopFollowing}
              onTouchMove={stopFollowing}
              onPointerDown={(event) => {
                // Ett tryck direkt på listan (inte på en rad) är ett drag i rullningslisten.
                if (event.target === event.currentTarget) stopFollowing()
              }}
            >
              <div class="ce-spacer" style={{ height: `${cues.length * ROW_HEIGHT}px` }}>
                {cues.slice(first, last).map((cue, offset) => {
                  const index = first + offset
                  const status = rangeStatus(cue, publishedStart, publishedEnd)
                  const issue = issueByIndex.get(index)
                  const classes = [
                    'ce-row',
                    index === activeIndex ? 'is-active' : '',
                    index === selectedIndex ? 'is-selected' : '',
                    status === 'outside' ? 'is-outside' : status === 'edge' ? 'is-edge' : '',
                    diff.changedIds.has(cue.id) ? 'is-changed' : '',
                    issue?.error ? 'has-error' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <div key={cue.id} class={classes} style={{ top: `${index * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }}>
                      <div
                        class="ce-playcol"
                        role="button"
                        aria-label={index === playIndex && playing ? 'Pausa' : `Välj och spela replik ${index + 1}`}
                        title={index === playIndex && playing ? 'Pausa' : 'Välj repliken och spela från dess start (klicka igen för paus)'}
                        onClick={() => playRow(index)}
                      >
                        {index === playIndex && (
                          <span class="ce-playbtn" aria-hidden="true">
                            <Icon name={playing ? 'pause' : 'play_arrow'} size={20} />
                          </span>
                        )}
                      </div>
                      <div class="ce-text">
                        <textarea
                          ref={(element) => {
                            if (element) areas.current.set(index, element)
                            else areas.current.delete(index)
                          }}
                          rows={3}
                          value={cue.text}
                          readOnly={readOnly}
                          aria-label={`Text för replik ${index + 1}`}
                          onInput={(event) => {
                            // Skrivning är en ändring för sig: utgångsläget sparas första gången något skrivs i rutan.
                            if (focusBase.current?.id !== cue.id) focusBase.current = { id: cue.id, cues }
                            setText(index, event.currentTarget.value)
                          }}
                          onFocus={() => {
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
                      {!readOnly && (
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
