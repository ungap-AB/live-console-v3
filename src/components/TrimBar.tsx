import { useRef } from 'preact/hooks'
import { Icon } from './Icon'
import {
  DEFAULT_MIN_KEEP_SECONDS, fraction, handleLabel, handleValueText, isOutside, keyDelta, moveHandle, nearestHandle, pointerTime,
  type Handle, type TrimRange,
} from './trimBarLogic'
import './TrimBar.css'

/** Halva balkens bredd (px): spåret har så mycket marginal i varje ände, så att en balk vid noll och vid slutet syns helt. */
const HANDLE_INSET = 4

export interface TrimBarChapter {
  time: number
  label?: string
}

interface TrimBarProps {
  /** Videons längd (sekunder). */
  duration: number
  start: number
  end: number
  /** Videons position (sekunder), ritas som spelhuvud. */
  position: number
  chapters?: readonly TrimBarChapter[]
  /** Minsta längd som får bli kvar (sekunder). */
  minKeep?: number
  disabled?: boolean
  /** Nytt intervall efter att en balk dragits eller flyttats med tangentbordet. */
  onChange: (range: TrimRange) => void
  /** Videons position ska följa balken (anropas under dragning och vid tangentflytt). Föräldern sätter positionen och pausar. */
  onSeek: (seconds: number) => void
  /** De runda spelknapparna under balkarna. */
  onPlayFromStart: () => void
  onPlayEnd: () => void
}

// UNG-233 (trimvyn, UNG-134): en tidslinje med två dragbara vita balkar. Spåret visar det som behålls, det som tas bort före och efter,
// kapitelmarkeringar (de utanför tonas ned) och spelhuvudet. Ett tryck på spåret tar tag i närmaste balk. Balkarna går att flytta med
// tangentbordet (pil 1 s, Skift+pil 10 s). Videon följer balken. Komponenten har ingen egen serverlogik: den får värden och anropar callbacks.
export function TrimBar({
  duration, start, end, position, chapters = [], minKeep = DEFAULT_MIN_KEEP_SECONDS, disabled = false,
  onChange, onSeek, onPlayFromStart, onPlayEnd,
}: TrimBarProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<Handle | null>(null)

  const range: TrimRange = { start, end }
  const percent = (time: number) => `${(fraction(time, duration) * 100).toFixed(3)}%`
  // Läget längs spåret (med marginalen), för spelknapparna som hänger under balkarna.
  const along = (time: number) => `calc(${HANDLE_INSET}px + (100% - ${HANDLE_INSET * 2}px) * ${fraction(time, duration).toFixed(5)})`

  function place(handle: Handle, time: number) {
    const next = moveHandle(handle, time, range, duration, minKeep)
    if (next.start !== start || next.end !== end) onChange(next)
    onSeek(handle === 'start' ? next.start : next.end)
  }

  function timeAt(event: PointerEvent): number {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return pointerTime(event.clientX, rect.left, rect.width, duration, HANDLE_INSET)
  }

  function onPointerDown(event: PointerEvent) {
    if (disabled || event.button !== 0) return
    const time = timeAt(event)
    const handle = nearestHandle(time, start, end)
    dragging.current = handle
    surfaceRef.current?.setPointerCapture(event.pointerId)
    ;(handle === 'start' ? startRef : endRef).current?.focus()
    place(handle, time)
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent) {
    const handle = dragging.current
    if (!handle) return
    place(handle, timeAt(event))
  }

  function onPointerEnd(event: PointerEvent) {
    if (!dragging.current) return
    dragging.current = null
    surfaceRef.current?.releasePointerCapture(event.pointerId)
  }

  function onKeyDown(handle: Handle, event: KeyboardEvent) {
    if (disabled) return
    const delta = keyDelta(event.key, event.shiftKey)
    if (delta === null) return
    event.preventDefault()
    place(handle, (handle === 'start' ? start : end) + delta)
  }

  const handles: { handle: Handle; time: number; ref: typeof startRef }[] = [
    { handle: 'start', time: start, ref: startRef },
    { handle: 'end', time: end, ref: endRef },
  ]

  return (
    <div class={`trimbar${disabled ? ' is-disabled' : ''}`}>
      <div class="trimbar-surface" ref={surfaceRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <div class="trimbar-track">
          <div class="trimbar-cut" style={{ left: '0', width: percent(start) }} />
          <div class="trimbar-keep" style={{ left: percent(start), width: `${((fraction(end, duration) - fraction(start, duration)) * 100).toFixed(3)}%` }} />
          <div class="trimbar-cut" style={{ left: percent(end), right: '0' }} />
          {chapters.map((chapter, index) => (
            <div
              key={index}
              class={`trimbar-chapter${isOutside(chapter.time, start, end) ? ' is-outside' : ''}`}
              style={{ left: percent(chapter.time) }}
              title={chapter.label}
            />
          ))}
          <div class="trimbar-playhead" style={{ left: percent(position) }} />
        </div>
        {handles.map(({ handle, time, ref }) => (
          <div
            key={handle}
            ref={ref}
            class="trimbar-handle"
            style={{ left: percent(time) }}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={handleLabel(handle)}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={time}
            aria-valuetext={handleValueText(handle, time)}
            aria-disabled={disabled}
            onKeyDown={(event) => onKeyDown(handle, event)}
          />
        ))}
      </div>
      <div class="trimbar-plays" style={{ '--trimbar-start': along(start), '--trimbar-end': along(end) }}>
        <button class="trimbar-play trimbar-play-start" type="button" title="Spela från början av det som behålls" aria-label="Spela från början av det som behålls" disabled={disabled} onClick={onPlayFromStart}>
          <Icon name="play_arrow" size={22} />
        </button>
        <button class="trimbar-play trimbar-play-end" type="button" title="Spela de sista sekunderna före slutet" aria-label="Spela de sista sekunderna före slutet" disabled={disabled} onClick={onPlayEnd}>
          <Icon name="play_arrow" size={22} />
        </button>
      </div>
    </div>
  )
}
