import { useEffect, useMemo, useRef } from 'preact/hooks'
import type { CaptionEnergy } from '../../data/types'
import {
  bandProfile, bandWindow, cueIndexAt, snapToSpeech, speechThreshold, timeToY, visibleSpans, yToTime, type CueSpan, type TimeWindow,
} from './captionWaveformLogic'

/** Bredd på vågformsbandet och på solfjädern med kopplingslinjer mellan bandet och raderna (CSS-pixlar). */
export const BAND_WIDTH = 84
export const FAN_WIDTH = 56
export const WAVEFORM_WIDTH = BAND_WIDTH + FAN_WIDTH

/** Hur nära (pixlar) en gräns ska träffas för att kunna tas tag i. */
const GRAB_PIXELS = 8

interface CaptionWaveformProps {
  cues: readonly CueSpan[]
  energy: CaptionEnergy
  scrollTop: number
  height: number
  rowHeight: number
  selectedIndex: number
  activeIndex: number
  /** Videons position i originalets tid; läses vid varje ritning så att spelhuvudet är jämnt under uppspelning. */
  getTime: () => number
  playing: boolean
  publishedStart?: number
  publishedEnd?: number
  /** Fokusläge: bandet visar ett fönster av så här många sekunder kring vald replik. Null = fönstret följer listans scroll. */
  focusSpan: number | null
  /** Om gränserna får dras. */
  editable: boolean
  onSeek: (time: number) => void
  onSelect: (index: number) => void
  onZoom: (deltaY: number) => void
  /** Hjulet över bandet rullar listan. */
  onScrollBy: (deltaY: number) => void
  onDragStart: (index: number) => void
  onDrag: (index: number, time: number) => void
  onDragEnd: () => void
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
  const hovered = useRef<number | null>(null)

  const currentWindow = () => {
    const { cues, scrollTop, height, rowHeight, selectedIndex, focusSpan } = latest.current
    return frozen.current ?? bandWindow(cues, scrollTop, height, rowHeight, selectedIndex, focusSpan)
  }

  function draw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { cues, energy, scrollTop, height, rowHeight, selectedIndex, activeIndex, getTime, publishedStart, publishedEnd } = latest.current
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
      const strong = span.index === selectedIndex || span.index === emphasisedBoundary
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

    // Kopplingslinjer från radgränserna i listan (strecket ovanför varje rad) till gränsernas lägen i bandet.
    const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight))
    const lastRow = Math.min(cues.length - 1, Math.ceil((scrollTop + height) / rowHeight))
    const link = (index: number) => ({ band: startY(index), row: index * rowHeight - scrollTop })
    for (let index = firstRow; index <= lastRow; index++) {
      const { band, row } = link(index)
      if (band < -30 || band > height + 30) continue // utanför fönstret (fokusläge): ingen linje
      const strong = index === selectedIndex || index === emphasisedBoundary
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
      const next = cues[index + 1] ? link(index + 1) : { band: timeToY(cues[index].end, win, height), row: (index + 1) * rowHeight - scrollTop }
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

  // Gränsen (replikindex) närmast pekaren, om någon ligger inom greppavstånd.
  function boundaryAt(y: number): number | null {
    const { cues, height } = latest.current
    const win = currentWindow()
    let best: number | null = null
    let bestDistance = GRAB_PIXELS + 0.001
    for (const span of visibleSpans(cues, win, height)) {
      const distance = Math.abs(span.y0 - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = span.index
      }
    }
    return best
  }

  function onPointerDown(event: PointerEvent) {
    const position = local(event)
    const canvas = canvasRef.current
    if (!position || !canvas || position.x > BAND_WIDTH) return
    const boundary = latest.current.editable ? boundaryAt(position.y) : null
    if (boundary !== null) {
      event.preventDefault()
      canvas.setPointerCapture(event.pointerId)
      frozen.current = currentWindow()
      dragging.current = boundary
      latest.current.onDragStart(boundary)
      return
    }
    const { cues, height, onSeek, onSelect } = latest.current
    const time = Math.max(0, yToTime(position.y, currentWindow(), height))
    onSeek(time)
    const index = cueIndexAt(cues, time)
    if (index >= 0) onSelect(index)
  }

  function onPointerMove(event: PointerEvent) {
    const position = local(event)
    const canvas = canvasRef.current
    if (!position || !canvas) return
    const index = dragging.current
    if (index === null) {
      const boundary = position.x <= BAND_WIDTH && latest.current.editable ? boundaryAt(position.y) : null
      canvas.style.cursor = boundary !== null ? 'ns-resize' : 'pointer'
      if (boundary !== hovered.current) {
        hovered.current = boundary
        draw()
      }
      return
    }
    const { height, energy, onDrag } = latest.current
    let time = Math.max(0, yToTime(Math.min(height, Math.max(0, position.y)), currentWindow(), height))
    if (!event.altKey) time = snapToSpeech(energy, threshold, time, 'start')
    onDrag(index, time)
  }

  function onPointerLeave() {
    if (dragging.current !== null || hovered.current === null) return
    hovered.current = null
    draw()
  }

  function endDrag(event: PointerEvent) {
    if (dragging.current === null) return
    canvasRef.current?.releasePointerCapture(event.pointerId)
    dragging.current = null
    frozen.current = null
    latest.current.onDragEnd()
  }

  // Hjulet rullar listan (bandet följer med). I fokusläget zoomar Ctrl/Cmd + hjul i stället.
  function onWheel(event: WheelEvent) {
    event.preventDefault()
    if (latest.current.focusSpan !== null && (event.ctrlKey || event.metaKey)) {
      latest.current.onZoom(event.deltaY)
      return
    }
    latest.current.onScrollBy(event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY)
  }

  return (
    <div class="ce-wave-slot" style={{ width: `${WAVEFORM_WIDTH}px`, height: `${props.height}px` }}>
      <canvas
        ref={canvasRef}
        class="ce-wave"
        style={{ width: `${WAVEFORM_WIDTH}px`, height: `${props.height}px` }}
        aria-label="Vågform för ljudet. Klicka för att hoppa i videon, dra en gräns för att flytta den."
        title="Ljudets vågform. Klicka för att hoppa i videon. Dra en gräns (linje) för att flytta den, så flödar texten över. Alt stänger av fästningen. Hjulet rullar listan (Ctrl/Cmd + hjul zoomar i fokusläge). Orange ljud saknar replik."
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
