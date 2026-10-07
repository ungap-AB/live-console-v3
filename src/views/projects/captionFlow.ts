import { wrapAny, type EditCue } from './captionEditOps.ts'
import type { SpeechRuns } from './captionTimingLogic.ts'

// UNG-161: ordflödet över en gräns. Texten är ett flöde av ord och en gräns delar det mellan två repliker. Drar man gränsen i tid
// byter ord sida. Ordens tider uppskattas över TAL (tid där det faktiskt talas), så en gräns som dras genom en paus flyttar inga
// ord. Allt räknas från läget när draget började (base), så samma tid ger alltid samma fördelning och inget går förlorat.

const MIN_PART_SECONDS = 0.3
const round = (value: number) => Math.round(value * 1000) / 1000
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean)

/** Klocka som räknar bara tal: speech(t) = hur många sekunder tal som ligger före tiden. Utan tal är den vanlig tid. */
export interface SpeechClock {
  toSpeech: (time: number) => number
  toTime: (speech: number) => number
}

export function speechClock(runs: SpeechRuns | null): SpeechClock {
  if (!runs || runs.starts.length === 0) return { toSpeech: (time) => time, toTime: (speech) => speech }
  const count = runs.starts.length
  const before = new Float64Array(count + 1) // tal före segment i
  for (let i = 0; i < count; i++) before[i + 1] = before[i] + (runs.ends[i] - runs.starts[i])
  return {
    toSpeech(time) {
      let low = 0
      let high = count - 1
      let index = -1
      while (low <= high) {
        const mid = (low + high) >> 1
        if (runs.starts[mid] <= time) {
          index = mid
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      if (index < 0) return time - runs.starts[0] // före första talet: negativt, så att ordningen bevaras
      return before[index] + Math.min(time, runs.ends[index]) - runs.starts[index]
    },
    toTime(speech) {
      if (speech <= 0) return runs.starts[0] + speech
      if (speech >= before[count]) return runs.ends[count - 1] + (speech - before[count])
      let low = 0
      let high = count - 1
      while (low < high) {
        const mid = (low + high + 1) >> 1
        if (before[mid] <= speech) low = mid
        else high = mid - 1
      }
      return runs.starts[low] + (speech - before[low])
    },
  }
}

/** Uppskattad tid för varje ord i en replik som visar texten över intervallet [from, to): fördelat efter tecken över talet i intervallet. */
function wordTimes(words: string[], from: number, to: number, clock: SpeechClock): number[] {
  const speechFrom = clock.toSpeech(from)
  const speechTo = clock.toSpeech(to)
  const useSpeech = speechTo - speechFrom >= 0.05
  const weights = words.map((word) => word.length + 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let before = 0
  return words.map((_, index) => {
    const fraction = (before + weights[index] / 2) / total
    before += weights[index]
    return useSpeech ? clock.toTime(speechFrom + fraction * (speechTo - speechFrom)) : from + fraction * (to - from)
  })
}

/**
 * Uppskattad tid för en delning av en replik som visas över [from, to): ordens tecken fördelas över talet i intervallet (utan pauser),
 * så en delning mitt i en mening hamnar där orden på var sida ungefär sägs. Delningen vid videons position är exakt och används i första hand.
 */
export function estimateSplitTime(from: number, to: number, leftChars: number, rightChars: number, runs: SpeechRuns | null): number {
  const clock = speechClock(runs)
  const speechFrom = clock.toSpeech(from)
  const speechTo = clock.toSpeech(to)
  const fraction = leftChars / Math.max(1, leftChars + rightChars)
  if (speechTo - speechFrom < 0.05) return round(from + fraction * (to - from))
  return round(clock.toTime(speechFrom + fraction * (speechTo - speechFrom)))
}

export interface BoundaryMove {
  cues: EditCue[]
  /** Antal ord i föregående replik efter flytten, och före den (utgångsläget). */
  split: number
  baseSplit: number
}

/**
 * Flyttar gränsen före rad index (replikens start) till tiden, och låter ord byta sida enligt uppskattad ordtid. Rad 0 har ingen
 * föregående replik: bara tiden ändras. Gränsen hålls minst 0,3 s från grannarnas gränser, och varje replik behåller minst ett ord.
 * Orörd text (ingen ord bytte sida) behåller sina radbrytningar; annars radbryts de två berörda replikerna om. Med flow = false
 * ändras bara tiden (Starta här, nudge): texten stannar där den är.
 */
export function moveBoundary(base: readonly EditCue[], index: number, seconds: number, runs: SpeechRuns | null, flow = true): BoundaryMove {
  const cue = base[index]
  if (!cue) return { cues: [...base], split: 0, baseSplit: 0 }
  const next = base[index + 1]
  const upper = (next ? next.start : cue.end) - MIN_PART_SECONDS
  if (index === 0) {
    const start = round(Math.min(Math.max(0, seconds), Math.max(0, upper)))
    return { cues: base.map((item, position) => (position === 0 ? { ...item, start } : item)), split: 0, baseSplit: 0 }
  }
  const previous = base[index - 1]
  const lower = previous.start + MIN_PART_SECONDS
  if (lower > upper) return { cues: [...base], split: wordsOf(previous.text).length, baseSplit: wordsOf(previous.text).length }
  const time = round(Math.min(Math.max(seconds, lower), upper))

  const aWords = wordsOf(previous.text)
  const bWords = wordsOf(cue.text)
  const baseSplit = aWords.length
  if (!flow || baseSplit === 0 || bWords.length === 0) {
    return { cues: base.map((item, position) => (position === index ? { ...item, start: time } : item)), split: baseSplit, baseSplit }
  }
  const clock = speechClock(runs)
  const times = [...wordTimes(aWords, previous.start, cue.start, clock), ...wordTimes(bWords, cue.start, next ? next.start : cue.end, clock)]
  const all = [...aWords, ...bWords]
  let split = times.filter((wordTime) => wordTime < time).length
  split = Math.min(all.length - 1, Math.max(1, split))

  const cues = base.map((item, position) => {
    if (position === index) return { ...item, start: time, text: split === baseSplit ? item.text : wrapAny(all.slice(split).join(' ')) }
    if (position === index - 1 && split !== baseSplit) return { ...item, text: wrapAny(all.slice(0, split).join(' ')) }
    return item
  })
  return { cues, split, baseSplit }
}
