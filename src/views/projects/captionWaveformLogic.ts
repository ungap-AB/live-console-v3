// UNG-152/160: geometri och data för vågformsbandet till vänster om replikrutorna. Ren logik (testas utan DOM).
// Bandet är en tidsaxel som löper nedåt precis som listan. Listan är en indexaxel (lika hög rad för varje replik), så fönstret
// som bandet visar härleds ur listans scrollposition, och kopplingslinjer översätter mellan axlarna.

import type { CaptionEnergy } from '../../data/types'

export interface CueSpan {
  start: number
  end: number
}

export interface TimeWindow {
  t0: number
  t1: number
}

/**
 * Tiden vid en (bråk)radposition: radens start vid heltal, linjärt mellan två raders starttider. Utanför listan fortsätter
 * den med närmaste replikens längd, så att fönstret följer med även när listan scrollas förbi ändarna.
 */
export function timeAtRow(cues: readonly CueSpan[], row: number): number {
  const count = cues.length
  if (count === 0) return 0
  if (row <= 0) return cues[0].start + row * Math.max(0.5, cues[0].end - cues[0].start)
  if (row >= count - 1) {
    const last = cues[count - 1]
    return last.start + (row - (count - 1)) * Math.max(0.5, last.end - last.start)
  }
  const index = Math.floor(row)
  const fraction = row - index
  return cues[index].start + fraction * (cues[index + 1].start - cues[index].start)
}

/**
 * Tidsfönstret bandet visar: tiden vid listans övre och nedre kant. Mjukt vid scroll (ingen hoppar rad för rad), och varje
 * synlig rads start ligger inom fönstret. Ett minsta fönster hindrar absurd zoom när många repliker ligger tätt.
 */
export function viewWindow(cues: readonly CueSpan[], scrollTop: number, viewportHeight: number, rowHeight: number, minSeconds = 8): TimeWindow {
  if (cues.length === 0 || rowHeight <= 0) return { t0: 0, t1: minSeconds }
  let t0 = timeAtRow(cues, scrollTop / rowHeight)
  let t1 = timeAtRow(cues, (scrollTop + viewportHeight) / rowHeight)
  if (t1 - t0 < minSeconds) {
    const middle = (t0 + t1) / 2
    t0 = middle - minSeconds / 2
    t1 = middle + minSeconds / 2
  }
  return { t0, t1 }
}

export function timeToY(time: number, window: TimeWindow, height: number): number {
  return ((time - window.t0) / (window.t1 - window.t0)) * height
}

export function yToTime(y: number, window: TimeWindow, height: number): number {
  return window.t0 + (y / height) * (window.t1 - window.t0)
}

/** Byte (0-255) till 0-1 för ritning: allt under floorDb är tystnad, allt över ceilingDb är full bredd. Tal ligger vanligen runt -35..-15 dB. */
export function level(byte: number, energy: Pick<CaptionEnergy, 'minDb' | 'maxDb'>, floorDb = -58, ceilingDb = -14): number {
  if (byte <= 0) return 0
  const db = energy.minDb + (byte / 255) * (energy.maxDb - energy.minDb)
  return Math.min(1, Math.max(0, (db - floorDb) / (ceilingDb - floorDb)))
}

/** Högsta värdet (byte) i tidsintervallet, så att en kort topp inte försvinner när flera ramar delar en pixel. */
export function peakBetween(energy: CaptionEnergy, from: number, to: number): number {
  const length = energy.data.length
  if (length === 0 || to < from) return 0
  const step = energy.intervalMs / 1000
  let first = Math.floor(from / step)
  let last = Math.floor(to / step)
  if (last < 0 || first >= length) return 0
  first = Math.max(0, first)
  last = Math.min(length - 1, Math.max(first, last))
  let peak = 0
  for (let index = first; index <= last; index++) if (energy.data[index] > peak) peak = energy.data[index]
  return peak
}

/** Ritvärden för varje pixelrad (0-1), från fönstrets topp till botten. */
export function bandProfile(energy: CaptionEnergy, window: TimeWindow, pixelRows: number): Float32Array {
  const profile = new Float32Array(Math.max(0, pixelRows))
  const span = (window.t1 - window.t0) / pixelRows
  for (let row = 0; row < pixelRows; row++) {
    const from = window.t0 + row * span
    profile[row] = level(peakBetween(energy, from, from + span), energy)
  }
  return profile
}

/** Index på repliken som innehåller tiden (den senast startade vid överlapp), annars den närmaste som redan börjat, annars -1. */
export function cueIndexAt(cues: readonly CueSpan[], time: number): number {
  let low = 0
  let high = cues.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (cues[mid].start <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

export interface VisibleSpan {
  index: number
  y0: number
  y1: number
}

/** Repliker som ligger (helt eller delvis) i fönstret, med pixelrad för start och slut. */
export function visibleSpans(cues: readonly CueSpan[], window: TimeWindow, height: number): VisibleSpan[] {
  const spans: VisibleSpan[] = []
  let index = Math.max(0, cueIndexAt(cues, window.t0) - 6)
  for (; index < cues.length; index++) {
    const cue = cues[index]
    if (cue.start > window.t1) break
    if (cue.end < window.t0) continue
    spans.push({ index, y0: timeToY(cue.start, window, height), y1: timeToY(cue.end, window, height) })
  }
  return spans
}

/** Radens mittlinje (pixlar från listans överkant) där kopplingslinjen når raden. */
export function rowCenterY(index: number, scrollTop: number, rowHeight: number): number {
  return index * rowHeight - scrollTop + rowHeight / 2
}

/** Fokusfönstret (UNG-160): centrerat på repliken, minst span sekunder brett och minst 1,4 gånger replikens längd. Börjar aldrig före 0. */
export function focusWindow(cue: CueSpan, span: number): TimeWindow {
  const length = Math.max(span, (cue.end - cue.start) * 1.4)
  const middle = (cue.start + cue.end) / 2
  const t0 = Math.max(0, middle - length / 2)
  return { t0, t1: t0 + length }
}

/** Fönstret bandet visar: fokusfönstret kring vald replik om fokusläge är på, annars det som följer listans scroll. */
export function bandWindow(
  cues: readonly CueSpan[],
  scrollTop: number,
  height: number,
  rowHeight: number,
  selectedIndex: number,
  focusSpan: number | null,
): TimeWindow {
  const selected = cues[selectedIndex]
  if (focusSpan !== null && selected) return focusWindow(selected, focusSpan)
  return viewWindow(cues, scrollTop, height, rowHeight)
}

export const MIN_FOCUS_SECONDS = 3
export const MAX_FOCUS_SECONDS = 60

/** Zoom i fokusläget: en hjulsteg gör fönstret 1,25 gånger bredare eller smalare, inom gränserna. */
export function zoomFocusSpan(span: number, deltaY: number): number {
  const next = deltaY > 0 ? span * 1.25 : span / 1.25
  return Math.min(MAX_FOCUS_SECONDS, Math.max(MIN_FOCUS_SECONDS, next))
}

/**
 * Tröskel (byte) som skiljer tal från paus: en fjärdedel av talnivåns amplitud (−12 dB under medianen av ramar över −46 dB), aldrig
 * under −46 dB. Samma princip som PauseSnapper i workern, så att fästningen i redigeraren stämmer med hur rutorna lades.
 */
export function speechThreshold(energy: CaptionEnergy): number {
  const floorByte = Math.ceil(((-46 - energy.minDb) / (energy.maxDb - energy.minDb)) * 255)
  const loud: number[] = []
  for (let index = 0; index < energy.data.length; index++) if (energy.data[index] > floorByte) loud.push(energy.data[index])
  if (loud.length === 0) return floorByte
  loud.sort((a, b) => a - b)
  const median = loud[loud.length >> 1]
  const twelveDb = (12 / (energy.maxDb - energy.minDb)) * 255
  return Math.max(floorByte, Math.round(median - twelveDb))
}

/**
 * Fäster en tid vid närmaste verkliga talgräns: för en start den närmaste stigande kanten (paus → tal), för ett slut den närmaste
 * fallande (tal → paus), inom windowSeconds. Utan kant i närheten lämnas tiden orörd. Värdena jämnas över tre ramar mot flimmer.
 */
export function snapToSpeech(energy: CaptionEnergy, threshold: number, time: number, edge: 'start' | 'end', windowSeconds = 0.08): number {
  const step = energy.intervalMs / 1000
  const length = energy.data.length
  if (length < 3) return time
  const smooth = (index: number) => {
    const a = energy.data[Math.max(0, index - 1)]
    const b = energy.data[Math.min(length - 1, Math.max(0, index))]
    const c = energy.data[Math.min(length - 1, index + 1)]
    return (a + b + c) / 3
  }
  const centre = Math.round(time / step)
  const reach = Math.ceil(windowSeconds / step)
  let best = -1
  for (let offset = 0; offset <= reach; offset++) {
    for (const index of offset === 0 ? [centre] : [centre - offset, centre + offset]) {
      if (index < 1 || index >= length) continue
      const before = smooth(index - 1) >= threshold
      const here = smooth(index) >= threshold
      if (edge === 'start' ? !before && here : before && !here) {
        best = index
        break
      }
    }
    if (best >= 0) break
  }
  return best >= 0 ? Math.round(best * step * 1000) / 1000 : time
}
