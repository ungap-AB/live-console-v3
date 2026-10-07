import { useEffect, useMemo, useRef } from 'preact/hooks'
import type { CaptionEnergy } from '../../data/types'
import {
  bandProfile, bandWindow, cueIndexAt, rowCenterY, snapToSpeech, speechThreshold, timeToY, visibleSpans, yToTime, type CueSpan, type TimeWindow,
} from './captionWaveformLogic'

/** Bredd på vågformsbandet och på solfjädern med kopplingslinjer mellan bandet och raderna (CSS-pixlar). */
export const BAND_WIDTH = 84
export const FAN_WIDTH = 56
export const WAVEFORM_WIDTH = BAND_WIDTH + FAN_WIDTH

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
  /** Om kanterna på vald replik får dras. */
  editable: boolean
  onSeek: (time: number) => void
  onSelect: (index: number) => void
  onZoom: (deltaY: number) => void
  onDragStart: () => void
  onDrag: (edge: 'start' | 'end', time: number) => void
  onDragEnd: () => void
}

/** Hur nära (pixlar) en kant ska träffas för att kunna tas tag i. */
const GRAB_PIXELS = 7

// UNG-152/160: vågformen som ett vertikalt band till vänster om replikrutorna. Tiden löper nedåt som listan. Varje replik visas
// som ett intervall i bandet, ljud utanför alla repliker är markerat (möjligt tal utan text), spelhuvudet är en linje och
// kopplingslinjerna går från replikens start i bandet till dess rad i listan. Ritas på en canvas, bara det som syns.
export function CaptionWaveform(props: CaptionWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef(props)
  latest.current = props
  const threshold = useMemo(() => speechThreshold(props.energy), [props.energy])
  // Under ett drag ligger fönstret fast: annars flyttar sig bandet med repliken som dras.
  const frozen = useRef<TimeWindow | null>(null)
  const dragging = useRef<'start' | 'end' | null>(null)

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
    const line = color('--line', '#d7dde4')
    const focus = color('--focus', '#2f6fd0')
    const surface = color('--surface-2', '#f1f4f8')
    const warn = color('--warn', '#8a5a00')

    const win = currentWindow()
    const spans = visibleSpans(cues, win, height)

    // Bandets bakgrund, repliker som omväxlande fält (vald replik markerad) och publicerad del.
    ctx.fillStyle = surface
    ctx.fillRect(0, 0, BAND_WIDTH, height)
    for (const span of spans) {
      const cue = cues[span.index]
      const outside = publishedStart !== undefined && publishedEnd !== undefined && (cue.end <= publishedStart || cue.start >= publishedEnd)
      ctx.globalAlpha = outside ? 0.35 : 1
      ctx.fillStyle = span.index === selectedIndex ? focus : span.index % 2 === 0 ? line : surface
      if (span.index === selectedIndex) ctx.globalAlpha = 0.28
      ctx.fillRect(0, span.y0, BAND_WIDTH, Math.max(1, span.y1 - span.y0))
    }
    ctx.globalAlpha = 1

    // Vågformen: en pixelrad per rad, spegelvänd runt mitten. Ljud som ingen replik täcker får varningsfärg.
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

    // Replikernas start som tunna streck.
    ctx.fillStyle = quiet
    for (const span of spans) {
      if (span.y0 >= 0 && span.y0 <= height) ctx.fillRect(0, Math.round(span.y0) - 0.5, BAND_WIDTH, 1)
    }

    // Kopplingslinjer från replikens start i bandet till dess rad. Vald och spelande rad får en kil över hela intervallet.
    const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight))
    const lastRow = Math.min(cues.length - 1, Math.ceil((scrollTop + height) / rowHeight))
    ctx.lineWidth = 1
    for (let index = firstRow; index <= lastRow; index++) {
      const cue = cues[index]
      const emphasised = index === selectedIndex || index === activeIndex
      const yStart = timeToY(cue.start, win, height)
      if (yStart < -30 || yStart > height + 30) continue // utanför fönstret (fokusläge): ingen linje
      const rowTop = index * rowHeight - scrollTop
      const rowCenter = rowCenterY(index, scrollTop, rowHeight)
      if (emphasised) {
        const yEnd = timeToY(cue.end, win, height)
        ctx.globalAlpha = index === selectedIndex ? 0.22 : 0.12
        ctx.fillStyle = focus
        ctx.beginPath()
        ctx.moveTo(BAND_WIDTH, yStart)
        ctx.lineTo(WAVEFORM_WIDTH, rowTop)
        ctx.lineTo(WAVEFORM_WIDTH, rowTop + rowHeight)
        ctx.lineTo(BAND_WIDTH, Math.max(yEnd, yStart + 1))
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = emphasised ? 1 : 0.4
      ctx.strokeStyle = emphasised ? focus : quiet
      ctx.lineWidth = index === selectedIndex ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(BAND_WIDTH, yStart)
      ctx.lineTo(WAVEFORM_WIDTH, rowCenter)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Den valda replikens kanter: fasta handtag att dra i, med liten flik till vänster.
    const selectedCue = cues[selectedIndex]
    if (selectedCue) {
      ctx.fillStyle = focus
      for (const edge of ['start', 'end'] as const) {
        const edgeY = timeToY(selectedCue[edge], win, height)
        if (edgeY < -4 || edgeY > height + 4) continue
        const grabbed = dragging.current === edge
        ctx.fillRect(0, edgeY - (grabbed ? 1.5 : 1), BAND_WIDTH, grabbed ? 3 : 2)
        const flip = edge === 'start' ? 1 : -1
        ctx.beginPath()
        ctx.moveTo(0, edgeY)
        ctx.lineTo(0, edgeY + flip * 9)
        ctx.lineTo(9, edgeY)
        ctx.closePath()
        ctx.fill()
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

  function localY(event: PointerEvent | WheelEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  // Vilken av den valda replikens kanter (om någon) ligger under pekaren.
  function edgeAt(y: number): 'start' | 'end' | null {
    const { cues, height, selectedIndex, editable } = latest.current
    const selected = cues[selectedIndex]
    if (!editable || !selected) return null
    const win = currentWindow()
    const dStart = Math.abs(timeToY(selected.start, win, height) - y)
    const dEnd = Math.abs(timeToY(selected.end, win, height) - y)
    if (Math.min(dStart, dEnd) > GRAB_PIXELS) return null
    return dStart <= dEnd ? 'start' : 'end'
  }

  function onPointerDown(event: PointerEvent) {
    const position = localY(event)
    const canvas = canvasRef.current
    if (!position || !canvas || position.x > BAND_WIDTH) return
    const edge = edgeAt(position.y)
    if (edge) {
      event.preventDefault()
      canvas.setPointerCapture(event.pointerId)
      frozen.current = currentWindow()
      dragging.current = edge
      latest.current.onDragStart()
      return
    }
    const { cues, height, onSeek, onSelect } = latest.current
    const time = Math.max(0, yToTime(position.y, currentWindow(), height))
    onSeek(time)
    const index = cueIndexAt(cues, time)
    if (index >= 0) onSelect(index)
  }

  function onPointerMove(event: PointerEvent) {
    const position = localY(event)
    const canvas = canvasRef.current
    if (!position || !canvas) return
    const edge = dragging.current
    if (!edge) {
      canvas.style.cursor = position.x <= BAND_WIDTH && edgeAt(position.y) ? 'ns-resize' : 'pointer'
      return
    }
    const { height, energy, onDrag } = latest.current
    const win = currentWindow()
    let time = Math.max(0, yToTime(Math.min(height, Math.max(0, position.y)), win, height))
    if (!event.altKey) time = snapToSpeech(energy, threshold, time, edge)
    onDrag(edge, time)
  }

  function endDrag(event: PointerEvent) {
    if (!dragging.current) return
    canvasRef.current?.releasePointerCapture(event.pointerId)
    dragging.current = null
    frozen.current = null
    latest.current.onDragEnd()
  }

  function onWheel(event: WheelEvent) {
    if (latest.current.focusSpan === null) return
    event.preventDefault()
    latest.current.onZoom(event.deltaY)
  }

  return (
    <canvas
      ref={canvasRef}
      class="ce-wave"
      style={{ width: `${WAVEFORM_WIDTH}px`, height: `${props.height}px` }}
      aria-label="Vågform för ljudet. Klicka för att hoppa i videon."
      title="Ljudets vågform. Klicka för att hoppa i videon. Dra den valda replikens kanter (blå) för att justera tiderna, Alt stänger av fästningen. Orange ljud saknar replik."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
    />
  )
}
