import { useEffect, useMemo, useRef } from 'preact/hooks'
import type { CaptionEnergy } from '../../data/types'
import {
  bandProfile, chooseGrab, cueIndexAt, grabRole, snapToSpeech, speechThreshold, timeToY, viewWindowForLayout, visibleSpans, yToTime, type CueSpan, type GrabRole, type TimeWindow,
} from './captionWaveformLogic'
import { rowPosition, type RowLayout } from './rowLayout'

/** Bredd på vågformsbandet och på solfjädern med kopplingslinjer mellan bandet och raderna (CSS-pixlar). */
export const BAND_WIDTH = 84
export const FAN_WIDTH = 56
export const WAVEFORM_WIDTH = BAND_WIDTH + FAN_WIDTH

/** Hur nära (pixlar) en gräns ska träffas för att kunna tas tag i. */
const GRAB_PIXELS = 8

/** Ett kapitel som markeras i bandet (UNG-228): en linje vid kapitlets tid och en kopplingslinje till kapitelraden i listan. */
export interface ChapterMark {
  id: string
  /** Radens index i listans layout. */
  row: number
  time: number
  kind: string
  label: string
  /** Pågår vid videons position. */
  current: boolean
  /** Är den markerade raden (vinner vid grepp, UNG-230). */
  selected: boolean
}

interface CaptionWaveformProps {
  cues: readonly CueSpan[]
  energy: CaptionEnergy
  scrollTop: number
  height: number
  /** Listans geometri (UNG-227): radernas överkant och höjd. Replikindex är oförändrat, men raderna kan vara fler än replikerna. */
  layout: RowLayout
  /** Kapitel som ritas som egna linjer och kopplingslinjer ovanpå gränserna (äkta överlagring, annan färg). */
  chapterMarks?: readonly ChapterMark[]
  selectedIndex: number
  activeIndex: number
  /** Videons position i originalets tid; läses vid varje ritning så att spelhuvudet är jämnt under uppspelning. */
  getTime: () => number
  playing: boolean
  publishedStart?: number
  publishedEnd?: number
  /** Om gränserna får dras. */
  editable: boolean
  /** 'place' = ett klick i vågformen (sätter en placering, UNG-184); 'boundary' = ett grepp om en gräns (hoppar dit utan att byta placering). */
  onSeek: (time: number, kind: 'place' | 'boundary') => void
  /** Placeringen som mellanslag spelar från (UNG-184), eller null. Ritas som en tunn markör vid sidan av spelhuvudet. */
  anchor: number | null
  onSelect: (index: number) => void
  /** Hjulet över bandet rullar listan. */
  onScrollBy: (deltaY: number) => void
  onDragStart: (index: number, role: GrabRole) => void
  onDrag: (index: number, time: number, role: GrabRole) => void
  onDragEnd: () => void
  /** UNG-230: en kapitellinje tas tag i, dras (tid i originalets tidslinje) och släpps. Ändrar bara kapitlets tid. */
  onChapterDragStart?: (id: string) => void
  onChapterDrag?: (id: string, time: number) => void
  onChapterDragEnd?: () => void
}

// UNG-152/160/161: vågformen som ett vertikalt band till vänster om replikrutorna. Tiden löper nedåt som listan. Operatören arbetar
// med gränser, inte rutor: varje repliks start är en linje i bandet som går att dra (texten flödar över gränsen), och
// kopplingslinjerna går från radgränserna i listan till gränsernas lägen. Ljud utan replik är markerat, spelhuvudet är en linje.
// Ritas på en canvas, bara det som syns.
export function CaptionWaveform(props: CaptionWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef(props)
  latest.current = props
  const threshold = useMemo(() => speechThreshold(props.energy), [props.energy])
  // Under ett drag ligger fönstret fast: annars flyttar sig bandet med gränsen som dras.
  const frozen = useRef<TimeWindow | null>(null)
  const dragging = useRef<number | null>(null)
  const dragRole = useRef<GrabRole>('end')
  const hovered = useRef<number | null>(null)
  // Kapitellinjen (index i chapterMarks) som pekaren står på, för namnflaggan.
  const hoveredChapter = useRef<number | null>(null)
  // Kapitellinjen som dras (index i chapterMarks), och dess id så att draget överlever att listan ritas om.
  const draggingChapter = useRef<{ index: number; id: string } | null>(null)

  const currentWindow = () => {
    const { scrollTop, height, layout } = latest.current
    return frozen.current ?? viewWindowForLayout(layout, scrollTop, height)
  }

  // Ett fel i ritningen ska aldrig stoppa resten av redigeraren: det loggas och bandet ritas om vid nästa rendering.
  function draw() {
    try {
      paint()
    } catch (error) {
      console.error('Vågformsbandet kunde inte ritas', error)
    }
  }

  function paint() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { cues, energy, scrollTop, height, layout, selectedIndex, activeIndex, getTime, publishedStart, publishedEnd } = latest.current
    if (height <= 0) return
    const dpr = window.devicePixelRatio || 1
    const pixelHeight = Math.round(height * dpr)
    if (canvas.width !== Math.round(WAVEFORM_WIDTH * dpr) || canvas.height !== pixelHeight) {
      canvas.width = Math.round(WAVEFORM_WIDTH * dpr)
      canvas.height = pixelHeight
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, WAVEFORM_WIDTH, height)

    const style = getComputedStyle(canvas)
    const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    const ink = color('--ink-2', '#5a6572')
    const quiet = color('--ink-3', '#8b95a1')
    const focus = color('--focus', '#2f6fd0')
    const surface = color('--surface-2', '#f1f4f8')
    const warn = color('--warn', '#8a5a00')

    const win = currentWindow()
    const spans = visibleSpans(cues, win, height)
    const startY = (index: number) => timeToY(cues[index].start, win, height)
    const grabbed = dragging.current
    const emphasisedBoundary = grabbed ?? hovered.current
    // Den valda replikens två linjer: dess start (ändrar bara tiden) och dess slut, som är nästa replik start (där orden flödar över).
    const startLine = selectedIndex
    const endLine = selectedIndex + 1 < cues.length ? selectedIndex + 1 : -1

    // Bandets bakgrund, och den valda repliken som ett svagt fält mellan sin gräns och nästa.
    ctx.fillStyle = surface
    ctx.fillRect(0, 0, BAND_WIDTH, height)
    const selected = cues[selectedIndex]
    if (selected) {
      const top = startY(selectedIndex)
      const bottom = cues[selectedIndex + 1] ? startY(selectedIndex + 1) : timeToY(selected.end, win, height)
      ctx.globalAlpha = 0.16
      ctx.fillStyle = focus
      ctx.fillRect(0, top, BAND_WIDTH, Math.max(1, bottom - top))
      ctx.globalAlpha = 1
    }
    // Delen utanför den publicerade tonas ned.
    if (publishedStart !== undefined && publishedEnd !== undefined) {
      ctx.globalAlpha = 0.5
      ctx.fillStyle = surface
      const before = timeToY(publishedStart, win, height)
      const after = timeToY(publishedEnd, win, height)
      if (before > 0) ctx.fillRect(0, 0, BAND_WIDTH, Math.min(height, before))
      if (after < height) ctx.fillRect(0, Math.max(0, after), BAND_WIDTH, height - Math.max(0, after))
      ctx.globalAlpha = 1
    }

    // Vågformen: en pixelrad per rad, spegelvänd runt mitten. Ljud som ingen replik visas över får varningsfärg.
    const profile = bandProfile(energy, win, pixelHeight)
    const covered = new Uint8Array(pixelHeight)
    for (const span of spans) {
      const from = Math.max(0, Math.floor(span.y0 * dpr))
      const to = Math.min(pixelHeight, Math.ceil(span.y1 * dpr))
      for (let row = from; row < to; row++) covered[row] = 1
    }
    const center = BAND_WIDTH / 2
    const half = center - 4
    const thin = 1 / dpr
    for (let row = 0; row < pixelHeight; row++) {
      const width = profile[row] * half
      if (width < 0.3) continue
      ctx.fillStyle = covered[row] ? ink : warn
      ctx.fillRect(center - width, row / dpr, width * 2, thin)
    }

    // Gränserna: en linje per repliks start. Vald och den som hålls över eller dras är tjockare, med en liten flik till vänster.
    for (const span of spans) {
      const y = span.y0
      if (y < -4 || y > height + 4) continue
      const strong = span.index === startLine || span.index === endLine || span.index === emphasisedBoundary
      const dragged = span.index === grabbed
      ctx.fillStyle = strong ? focus : quiet
      ctx.globalAlpha = strong ? 1 : 0.55
      const thickness = dragged ? 3 : strong ? 2 : 1
      ctx.fillRect(0, y - thickness / 2, BAND_WIDTH, thickness)
      if (strong) {
        ctx.beginPath()
        ctx.moveTo(0, y - 6)
        ctx.lineTo(0, y + 6)
        ctx.lineTo(8, y)
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    // Vad den valda replikens två linjer är: dess start (bara tiden) och dess slut (orden flödar mot nästa replik).
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.fillStyle = focus
    if (startLine >= 0 && startLine < cues.length) {
      const y = startY(startLine)
      if (y > 14 && y < height) ctx.fillText('start', 12, y - 5)
    }
    if (endLine >= 0) {
      const y = startY(endLine)
      if (y > 0 && y < height - 12) ctx.fillText('slut', 12, y + 13)
    }

    // Kopplingslinjer från radgränserna i listan (strecket ovanför varje rad) till gränsernas lägen i bandet.
    const firstRow = Math.max(0, Math.floor(rowPosition(layout, scrollTop)))
    const lastRow = Math.min(layout.count - 1, Math.ceil(rowPosition(layout, scrollTop + height)))
    const link = (index: number) => ({ band: startY(index), row: layout.top(layout.cueRow(index)) - scrollTop })
    for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex++) {
      const index = layout.cueIndex(rowIndex)
      if (index < 0) continue
      const { band, row } = link(index)
      if (band < -30 || band > height + 30) continue // utanför fönstret (fokusläge): ingen linje
      const strong = index === startLine || index === endLine || index === emphasisedBoundary
      ctx.globalAlpha = strong ? 1 : 0.4
      ctx.strokeStyle = strong ? focus : quiet
      ctx.lineWidth = index === grabbed ? 3 : strong ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(BAND_WIDTH, band)
      ctx.lineTo(WAVEFORM_WIDTH, row)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Den valda och den spelande replikens yta: en kil mellan dess gräns och nästa, från bandet till radens kanter i listan.
    for (const index of [activeIndex, selectedIndex]) {
      if (index < 0 || index >= cues.length) continue
      const top = link(index)
      const ownRow = layout.cueRow(index)
      const next = cues[index + 1] ? link(index + 1) : { band: timeToY(cues[index].end, win, height), row: layout.top(ownRow) + layout.height(ownRow) - scrollTop }
      ctx.globalAlpha = index === selectedIndex ? 0.2 : 0.1
      ctx.fillStyle = focus
      ctx.beginPath()
      ctx.moveTo(BAND_WIDTH, top.band)
      ctx.lineTo(WAVEFORM_WIDTH, top.row)
      ctx.lineTo(WAVEFORM_WIDTH, next.row)
      ctx.lineTo(BAND_WIDTH, Math.max(next.band, top.band + 1))
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Kapitlen (UNG-228): en egen linje i bandet (grön, tjockare för en punkt) och en kopplingslinje till kapitelraden, ovanpå gränserna.
    const marks = latest.current.chapterMarks ?? []
    if (marks.length > 0) {
      const green = color('--live', '#0a8f3c')
      ctx.fillStyle = green
      ctx.strokeStyle = green
      marks.forEach((mark, markIndex) => {
        const bandY = timeToY(mark.time, win, height)
        const rowY = layout.top(mark.row) + layout.height(mark.row) / 2 - scrollTop
        const bandVisible = bandY >= -4 && bandY <= height + 4
        const rowVisible = rowY >= -30 && rowY <= height + 30
        if (!bandVisible && !rowVisible) return
        const agenda = mark.kind === 'agendaItem'
        const emphasised = mark.current || mark.selected || hoveredChapter.current === markIndex || draggingChapter.current?.id === mark.id
        ctx.globalAlpha = emphasised ? 1 : 0.8
        if (bandVisible) {
          const thickness = (agenda ? 2.5 : 1.5) + (emphasised ? 1 : 0)
          ctx.fillRect(0, bandY - thickness / 2, BAND_WIDTH, thickness)
          ctx.beginPath()
          ctx.moveTo(BAND_WIDTH, bandY - 6)
          ctx.lineTo(BAND_WIDTH, bandY + 6)
          ctx.lineTo(BAND_WIDTH - 8, bandY)
          ctx.closePath()
          ctx.fill()
        }
        if (bandY > -30 && bandY < height + 30 && rowVisible) {
          ctx.lineWidth = (agenda ? 2 : 1.5) + (emphasised ? 0.5 : 0)
          ctx.beginPath()
          ctx.moveTo(BAND_WIDTH, bandY)
          ctx.lineTo(WAVEFORM_WIDTH, rowY)
          ctx.stroke()
        }
      })
      ctx.globalAlpha = 1
      // Namnflaggan för kapitellinjen som pekaren står på.
      const flagged = hoveredChapter.current !== null ? marks[hoveredChapter.current] : undefined
      if (flagged) {
        const y = timeToY(flagged.time, win, height)
        ctx.font = '600 11px system-ui, sans-serif'
        let text = flagged.label
        const maxWidth = WAVEFORM_WIDTH - 12
        while (text.length > 1 && ctx.measureText(text).width > maxWidth - 10) text = text.slice(0, -1)
        if (text !== flagged.label) text = `${text.trimEnd()}…`
        const width = Math.min(maxWidth, ctx.measureText(text).width + 10)
        const top = Math.min(height - 20, Math.max(2, y - 22))
        ctx.fillStyle = color('--ink', '#1c2430')
        ctx.fillRect(4, top, width, 18)
        ctx.fillStyle = '#fff'
        ctx.fillText(text, 9, top + 13)
      }
    }

    // Placeringen (UNG-184): en tunn streckad linje med en liten spets åt höger, på det ställe mellanslag spelar från.
    if (latest.current.anchor !== null) {
      const anchorY = timeToY(latest.current.anchor, win, height)
      if (anchorY >= -2 && anchorY <= height + 2) {
        ctx.save()
        ctx.strokeStyle = color('--ink', '#1c2430')
        ctx.fillStyle = color('--ink', '#1c2430')
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(0, anchorY + 0.5)
        ctx.lineTo(BAND_WIDTH, anchorY + 0.5)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(BAND_WIDTH, anchorY - 4)
        ctx.lineTo(BAND_WIDTH, anchorY + 5)
        ctx.lineTo(BAND_WIDTH - 7, anchorY + 0.5)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }

    // Spelhuvudet.
    const y = timeToY(getTime(), win, height)
    if (y >= -2 && y <= height + 2) {
      ctx.fillStyle = color('--mode-live-bg', '#d13438')
      ctx.fillRect(0, y - 1, BAND_WIDTH, 2)
    }
  }

  // Ritas om efter varje rendering (scroll, markering, redigering, ny uppspelningsposition).
  useEffect(draw)

  // Under uppspelning ritas spelhuvudet om varje bildruta, så att det rör sig jämnt mellan videons tidshändelser.
  useEffect(() => {
    if (!props.playing) return
    let frame = requestAnimationFrame(function tick() {
      draw()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [props.playing])

  function local(event: PointerEvent | WheelEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  // Gränsen (replikindex) närmast pekaren, om någon ligger inom greppavstånd, med avståndet.
  function boundaryHit(y: number): { index: number; distance: number } | null {
    const { cues, height } = latest.current
    const win = currentWindow()
    let best: { index: number; distance: number } | null = null
    let bestDistance = GRAB_PIXELS + 0.001
    for (const span of visibleSpans(cues, win, height)) {
      const distance = Math.abs(span.y0 - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = { index: span.index, distance }
      }
    }
    return best
  }

  // Vad ett grepp vid y tar tag i: replikgräns eller kapitellinje (UNG-230), enligt chooseGrab.
  function grabAt(y: number): { kind: 'cue'; index: number } | { kind: 'chapter'; index: number } | null {
    const { selectedIndex, chapterMarks, editable } = latest.current
    const cue = editable ? boundaryHit(y) : null
    const chapterIndex = editable ? chapterAt(y) : null
    const chapterMark = chapterIndex !== null ? chapterMarks?.[chapterIndex] : undefined
    const chapter = chapterIndex !== null && chapterMark && latest.current.onChapterDragStart
      ? { index: chapterIndex, distance: Math.abs(timeToY(chapterMark.time, currentWindow(), latest.current.height) - y), selected: chapterMark.selected }
      : null
    const chosen = chooseGrab(
      cue ? { distance: cue.distance, onSelected: cue.index === selectedIndex || cue.index === selectedIndex + 1 } : null,
      chapter ? { distance: chapter.distance, selected: chapter.selected } : null,
    )
    if (chosen === 'cue' && cue) return { kind: 'cue', index: cue.index }
    if (chosen === 'chapter' && chapter) return { kind: 'chapter', index: chapter.index }
    return null
  }

  function onPointerDown(event: PointerEvent) {
    const position = local(event)
    const canvas = canvasRef.current
    if (!position || !canvas || position.x > BAND_WIDTH) return
    const grab = grabAt(position.y)
    if (grab && grab.kind === 'chapter') {
      const mark = latest.current.chapterMarks?.[grab.index]
      if (mark) {
        event.preventDefault()
        canvas.setPointerCapture(event.pointerId)
        frozen.current = currentWindow()
        draggingChapter.current = { index: grab.index, id: mark.id }
        latest.current.onChapterDragStart?.(mark.id)
        latest.current.onSeek(mark.time, 'boundary')
        return
      }
    }
    const boundary = grab && grab.kind === 'cue' ? grab.index : null
    if (boundary !== null) {
      event.preventDefault()
      canvas.setPointerCapture(event.pointerId)
      frozen.current = currentWindow()
      dragging.current = boundary
      dragRole.current = grabRole(boundary, latest.current.selectedIndex)
      latest.current.onDragStart(boundary, dragRole.current)
      // Ett klick på en gräns hoppar också dit, precis som ett klick på själva vågformen.
      latest.current.onSeek(latest.current.cues[boundary].start, 'boundary')
      return
    }
    const { cues, height, onSeek, onSelect } = latest.current
    const time = Math.max(0, yToTime(position.y, currentWindow(), height))
    onSeek(time, 'place')
    const index = cueIndexAt(cues, time)
    if (index >= 0) onSelect(index)
  }

  // Kapitellinjen (index i chapterMarks) närmast pekaren, om någon ligger inom greppavstånd och ingen replikgräns gör det.
  function chapterAt(y: number): number | null {
    const { chapterMarks, height } = latest.current
    if (!chapterMarks || chapterMarks.length === 0) return null
    const win = currentWindow()
    let best: number | null = null
    let bestDistance = GRAB_PIXELS + 0.001
    chapterMarks.forEach((mark, markIndex) => {
      const distance = Math.abs(timeToY(mark.time, win, height) - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = markIndex
      }
    })
    return best
  }

  function onPointerMove(event: PointerEvent) {
    const position = local(event)
    const canvas = canvasRef.current
    if (!position || !canvas) return
    const draggedChapter = draggingChapter.current
    if (draggedChapter) {
      const { height, energy, onChapterDrag } = latest.current
      let time = Math.max(0, yToTime(Math.min(height, Math.max(0, position.y)), currentWindow(), height))
      if (!event.altKey) time = snapToSpeech(energy, threshold, time, 'start')
      onChapterDrag?.(draggedChapter.id, time)
      return
    }
    const index = dragging.current
    if (index === null) {
      const inBand = position.x <= BAND_WIDTH
      const grab = inBand ? grabAt(position.y) : null
      const boundary = grab && grab.kind === 'cue' ? grab.index : null
      const chapter = grab && grab.kind === 'chapter' ? grab.index : inBand && boundary === null ? chapterAt(position.y) : null
      canvas.style.cursor = grab !== null ? 'ns-resize' : 'pointer'
      if (boundary !== hovered.current || chapter !== hoveredChapter.current) {
        hovered.current = boundary
        hoveredChapter.current = chapter
        draw()
      }
      return
    }
    const { height, energy, onDrag } = latest.current
    let time = Math.max(0, yToTime(Math.min(height, Math.max(0, position.y)), currentWindow(), height))
    if (!event.altKey) time = snapToSpeech(energy, threshold, time, 'start')
    onDrag(index, time, dragRole.current)
  }

  function onPointerLeave() {
    if (dragging.current !== null || draggingChapter.current !== null || (hovered.current === null && hoveredChapter.current === null)) return
    hovered.current = null
    hoveredChapter.current = null
    draw()
  }

  function endDrag(event: PointerEvent) {
    if (draggingChapter.current !== null) {
      canvasRef.current?.releasePointerCapture(event.pointerId)
      draggingChapter.current = null
      frozen.current = null
      latest.current.onChapterDragEnd?.()
      return
    }
    if (dragging.current === null) return
    canvasRef.current?.releasePointerCapture(event.pointerId)
    dragging.current = null
    frozen.current = null
    latest.current.onDragEnd()
  }

  // Hjulet rullar listan (bandet följer med). Ctrl/Cmd + hjul lämnas åt webbläsaren (zoom).
  function onWheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey) return
    event.preventDefault()
    latest.current.onScrollBy(event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY)
  }

  return (
    <div class="ce-wave-slot" style={{ width: `${WAVEFORM_WIDTH}px`, height: `${props.height}px` }}>
      <canvas
        ref={canvasRef}
        class="ce-wave"
        style={{ width: `${WAVEFORM_WIDTH}px`, height: `${props.height}px` }}
        aria-label="Vågform för ljudet. Klicka för att hoppa i videon, dra en gräns för att flytta den."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      />
    </div>
  )
}
