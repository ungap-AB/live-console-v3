import type { CaptionEnergy } from '../../data/types'
import { speechThreshold } from './captionWaveformLogic.ts'
import type { EditCue } from './captionEditOps.ts'

// UNG-161: gränsmodellen. Operatören placerar bara gränserna (replikernas start) mot vågformen. Visningstiden räknas ut:
// slutet ur talets slut och antal ord, och en gräns i en paus skjuts fram till nästa talstart. Reglerna är kalibrerade mot
// mänskliga facit (live-transcribe, kommandot calibrate, 3 möten och ca 3 800 rutor: median fel 0,14 s, 92 % inom 0,5 s; korta
// repliker visas relativt längre, 0,35 s per ord som golv är för långt). Konfigureras senare (ordlängd).

export interface TimingOptions {
  /** Väntan efter talets slut innan texten försvinner. */
  lingerSeconds: number
  /** Lägsta visningstid för en replik med två ord eller fler. Människor visar korta repliker ca 2 s oavsett om de har 2 eller 6 ord. */
  minSeconds: number
  /** Lägsta visningstid för en replik med ett enda ord. */
  singleWordSeconds: number
  /** Läsetid per ord som golv för långa repliker i snabbt tal (golvet är det större av minSeconds och ord · perWordSeconds). */
  perWordSeconds: number
  /** Hur långt före talstart en replik visas när gränsen ligger i en paus (människor ligger runt 0). */
  startLeadSeconds: number
}

export const DEFAULT_TIMING: TimingOptions = { lingerSeconds: 0.25, minSeconds: 2.0, singleWordSeconds: 1.1, perWordSeconds: 0.25, startLeadSeconds: 0 }

/** Talsegment i sekunder, sorterade och utan överlapp. Luckor under 0,15 s (andning, klusiler) räknas inte som paus. */
export interface SpeechRuns {
  starts: Float64Array
  ends: Float64Array
}

const MERGE_GAP_SECONDS = 0.15
const SMOOTH_RADIUS = 2 // fem ramar (100 ms) jämnade runt varje ram

export function speechRuns(energy: CaptionEnergy): SpeechRuns {
  const { data, intervalMs, minDb, maxDb } = energy
  const rms = new Float64Array(256)
  for (let byte = 1; byte < 256; byte++) rms[byte] = 10 ** ((minDb + (byte / 255) * (maxDb - minDb)) / 20)
  const thresholdRms = rms[Math.min(255, Math.max(1, speechThreshold(energy)))]
  const frame = intervalMs / 1000
  const starts: number[] = []
  const ends: number[] = []
  let inRun = false
  let runStart = 0
  const length = data.length
  for (let index = 0; index < length; index++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, index - SMOOTH_RADIUS); j <= Math.min(length - 1, index + SMOOTH_RADIUS); j++) {
      sum += rms[data[j]]
      count++
    }
    const voiced = sum / count >= thresholdRms
    if (voiced && !inRun) {
      runStart = index * frame
      inRun = true
    } else if (!voiced && inRun) {
      const end = index * frame
      if (starts.length > 0 && runStart - ends[ends.length - 1] < MERGE_GAP_SECONDS) ends[ends.length - 1] = end
      else {
        starts.push(runStart)
        ends.push(end)
      }
      inRun = false
    }
  }
  if (inRun) {
    const end = length * frame
    if (starts.length > 0 && runStart - ends[ends.length - 1] < MERGE_GAP_SECONDS) ends[ends.length - 1] = end
    else {
      starts.push(runStart)
      ends.push(end)
    }
  }
  return { starts: Float64Array.from(starts), ends: Float64Array.from(ends) }
}

/** Index på sista segmentet som börjar senast vid tiden, eller -1. */
function lastStartAtOrBefore(runs: SpeechRuns, time: number): number {
  let low = 0
  let high = runs.starts.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (runs.starts[mid] <= time) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

export function inSpeech(runs: SpeechRuns, time: number): boolean {
  const index = lastStartAtOrBefore(runs, time)
  return index >= 0 && time < runs.ends[index]
}

/** Starten på första talsegmentet efter tiden, eller null. */
export function nextOnsetAfter(runs: SpeechRuns, time: number): number | null {
  const index = lastStartAtOrBefore(runs, time)
  return index + 1 < runs.starts.length ? runs.starts[index + 1] : null
}

/**
 * Slutet på det sista talet som ligger i [from, to), eller null om det inte talas där. Tal som börjar mindre än tolerance före
 * to räknas till nästa replik: en gräns ligger sällan exakt på talstarten, och utjämningen flyttar talets kant några ramar.
 */
export function lastSpeechEnd(runs: SpeechRuns, from: number, to: number, tolerance = 0.08): number | null {
  let index = lastStartAtOrBefore(runs, to - tolerance)
  while (index >= 0 && runs.ends[index] <= from) index--
  if (index < 0) return null
  return Math.min(runs.ends[index], to)
}

const round = (value: number) => Math.round(value * 1000) / 1000
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

/**
 * Räknar ut visningstiden för varje replik ur gränserna (replikernas start), texten och talet.
 * Start: ligger gränsen i en paus skjuts den fram till nästa talstart (minus startLead), men aldrig förbi nästa gräns.
 * Slut: det tidigaste av nästa starts och det senare av (talets slut + väntan) och (start + golv), där golvet är 1,1 s för ett ord och
 * annars det större av 2 s och 0,25 s per ord.
 * Idempotent: en lista som redan härletts ändras inte av en ny härledning. Utan tal (null) lämnas tiderna orörda.
 * Oförändrade repliker behåller sin identitet i listan.
 */
export function deriveTimes(cues: readonly EditCue[], runs: SpeechRuns | null, totalSeconds: number, options: TimingOptions = DEFAULT_TIMING): EditCue[] {
  if (!runs) return [...cues]
  const starts = cues.map((cue, index) => {
    const nextCut = cues[index + 1]?.start ?? Infinity
    if (inSpeech(runs, cue.start)) return cue.start
    const onset = nextOnsetAfter(runs, cue.start)
    return onset !== null && onset < nextCut ? round(Math.max(cue.start, onset - options.startLeadSeconds)) : cue.start
  })
  return cues.map((cue, index) => {
    const start = starts[index]
    const nextCut = cues[index + 1]?.start ?? totalSeconds
    const nextStart = starts[index + 1] ?? totalSeconds
    const speechEnd = lastSpeechEnd(runs, start, nextCut) ?? start
    const words = wordCount(cue.text)
    const floor = words <= 1 ? options.singleWordSeconds : Math.max(options.minSeconds, options.perWordSeconds * words)
    const reading = start + floor
    const end = round(Math.max(start + 0.1, Math.min(nextStart, Math.max(speechEnd + options.lingerSeconds, reading))))
    return cue.start === start && cue.end === end ? cue : { ...cue, start, end }
  })
}
