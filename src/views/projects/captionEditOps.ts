import { MAX_LINES, MAX_LINE_LENGTH } from './captionEditorLogic.ts'

// UNG-143: rena operationer på redigerarens radlista (slå ihop, dela, flytta ord, tider, lägg till, ta bort). Allt returnerar
// en NY lista och rör aldrig indatan, så ångra/gör om bara är en stack av listor. Grundprincip: SAMMANSLAGNING ÄR EXAKT (första
// start, sista slut), medan DELNING bara kan uppskatta tiden (tecken-proportionellt) om den inte görs vid videons position.

export interface EditCue {
  id: number
  start: number
  end: number
  text: string
}

export type OpResult =
  | { ok: true; cues: EditCue[]; focusIndex: number; caret?: number }
  | { ok: false; reason: string }

/** Pausen över vilken en sammanslagning varnar (texten visas under pausen). */
export const LONG_GAP_SECONDS = 1.0
/** Kort ruta: högst så här många ord, eller kortare än så här många sekunder. */
export const SHORT_MAX_WORDS = 2
export const SHORT_MAX_SECONDS = 1.2
/** Gräns för hur nära en replik kan delas/flyttas, så att inga repliker blir bara några hundra millisekunder. */
const MIN_PART_SECONDS = 0.3

const round = (value: number) => Math.round(value * 1000) / 1000

/** Samma regel som servern/workern: en rad om det ryms, annars jämnast möjliga delning i två. Null om det inte går. */
export function wrapBalanced(text: string): string | null {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const total = words.join(' ').length
  if (total <= MAX_LINE_LENGTH) return words.join(' ')
  if (MAX_LINES < 2) return null

  let best: string | null = null
  let bestDifference = Number.MAX_SAFE_INTEGER
  let firstLength = 0
  for (let split = 1; split < words.length; split++) {
    firstLength += words[split - 1].length + (split > 1 ? 1 : 0)
    const secondLength = total - firstLength - 1
    if (firstLength > MAX_LINE_LENGTH || secondLength > MAX_LINE_LENGTH) continue
    const difference = Math.abs(firstLength - secondLength)
    if (difference < bestDifference) {
      bestDifference = difference
      best = `${words.slice(0, split).join(' ')}\n${words.slice(split).join(' ')}`
    }
  }
  return best
}

const flatten = (text: string) => text.replace(/\s+/g, ' ').trim()

export function isShort(cue: Pick<EditCue, 'start' | 'end' | 'text'>): boolean {
  const words = cue.text.split(/\s+/).filter(Boolean).length
  return words <= SHORT_MAX_WORDS || cue.end - cue.start < SHORT_MAX_SECONDS
}

export function shortIndexes(cues: readonly EditCue[]): number[] {
  const indexes: number[] = []
  cues.forEach((cue, index) => {
    if (isShort(cue)) indexes.push(index)
  })
  return indexes
}

export interface MergeInfo {
  /** Pausen mellan de två replikerna (0 om de ligger kant i kant eller överlappar). */
  gapSeconds: number
  text: string | null
  lines: number
  durationSeconds: number
  /** Ryms på två rader om 42 tecken. */
  fits: boolean
  startSeconds: number
  endSeconds: number
}

/** Förhandsvisning av att slå ihop rad i med rad i+1. */
export function mergeInfo(cues: readonly EditCue[], index: number): MergeInfo | null {
  const first = cues[index]
  const second = cues[index + 1]
  if (!first || !second) return null
  const text = wrapBalanced(`${flatten(first.text)} ${flatten(second.text)}`)
  const start = Math.min(first.start, second.start)
  const end = Math.max(first.end, second.end)
  return {
    gapSeconds: Math.max(0, round(second.start - first.end)),
    text,
    lines: text === null ? 0 : text.split('\n').length,
    durationSeconds: round(end - start),
    fits: text !== null,
    startSeconds: start,
    endSeconds: end,
  }
}

/** Slår ihop rad i med rad i+1: första startens och sista slutets tid, texten fogad och omradbruten. */
export function mergeWithNext(cues: readonly EditCue[], index: number): OpResult {
  const info = mergeInfo(cues, index)
  if (!info) return { ok: false, reason: 'Det finns ingen replik att slå ihop med.' }
  if (info.text === null) {
    return { ok: false, reason: 'Blir för lång för en replik (över två rader). Flytta ord till grannrepliken i stället.' }
  }
  const first = cues[index]
  const joinCaret = flatten(first.text).length
  const merged: EditCue = { id: first.id, start: info.startSeconds, end: info.endSeconds, text: info.text }
  const next = [...cues.slice(0, index), merged, ...cues.slice(index + 2)]
  // Markören hamnar där texterna fogades (efter första textens sista tecken).
  return { ok: true, cues: next, focusIndex: index, caret: textCaret(info.text, joinCaret) }
}

/** Samma som mergeWithNext men med föregående: raden index slås ihop med index-1. */
export function mergeWithPrevious(cues: readonly EditCue[], index: number): OpResult {
  if (index <= 0) return { ok: false, reason: 'Det finns ingen föregående replik.' }
  const result = mergeWithNext(cues, index - 1)
  return result.ok ? { ...result, focusIndex: index - 1 } : result
}

// Position i den omradbrutna texten som motsvarar tecken nummer flatCaret i den sammanhängande texten.
function textCaret(wrapped: string, flatCaret: number): number {
  let seen = 0
  for (let i = 0; i < wrapped.length; i++) {
    if (wrapped[i] === '\n') continue
    if (seen >= flatCaret) return i
    seen++
  }
  return wrapped.length
}

/**
 * Delar rad i vid markören. Tiden: tid (t.ex. videons position) om den ligger inne i repliken (minst 0,3 s från kanterna),
 * annars proportionellt mot antal tecken. De två delarna ligger kant i kant.
 */
export function splitCue(cues: readonly EditCue[], index: number, caret: number, newId: number, time: number | null = null): OpResult {
  const cue = cues[index]
  if (!cue) return { ok: false, reason: 'Ingen replik vald.' }
  const left = flatten(cue.text.slice(0, caret))
  const right = flatten(cue.text.slice(caret))
  if (!left || !right) return { ok: false, reason: 'Placera markören mellan två ord i texten, så delas repliken där.' }

  const useTime = time !== null && time > cue.start + MIN_PART_SECONDS && time < cue.end - MIN_PART_SECONDS
  const boundary = round(useTime ? time : cue.start + ((cue.end - cue.start) * left.length) / (left.length + right.length))
  const first: EditCue = { id: cue.id, start: cue.start, end: boundary, text: wrapBalanced(left) ?? left }
  const second: EditCue = { id: newId, start: boundary, end: cue.end, text: wrapBalanced(right) ?? right }
  return { ok: true, cues: [...cues.slice(0, index), first, second, ...cues.slice(index + 1)], focusIndex: index + 1, caret: 0 }
}

// Gränsen mellan två grannrepliker efter att ord flyttats: talets tid (utan pausen emellan) fördelas efter antal tecken.
function redistribute(a: EditCue, b: EditCue, aText: string, bText: string): [EditCue, EditCue] {
  const gap = Math.max(0, b.start - a.end)
  const speech = Math.max(0.2, b.end - a.start - gap)
  const aChars = Math.max(1, flatten(aText).length)
  const bChars = Math.max(1, flatten(bText).length)
  const aDuration = Math.min(speech - MIN_PART_SECONDS, Math.max(MIN_PART_SECONDS, (speech * aChars) / (aChars + bChars)))
  const aEnd = round(a.start + aDuration)
  return [
    { ...a, end: aEnd, text: aText },
    { ...b, start: round(aEnd + gap), text: bText },
  ]
}

/** Flytta texten efter markören i rad i till början av rad i+1. */
export function moveTailToNext(cues: readonly EditCue[], index: number, caret: number): OpResult {
  const cue = cues[index]
  const next = cues[index + 1]
  if (!cue || !next) return { ok: false, reason: 'Det finns ingen replik efter den här att flytta ord till.' }
  const keep = flatten(cue.text.slice(0, caret))
  const move = flatten(cue.text.slice(caret))
  if (!keep || !move) return { ok: false, reason: 'Placera markören före de ord som ska flyttas (och efter minst ett ord som ska stanna).' }
  const aText = wrapBalanced(keep)
  const bText = wrapBalanced(`${move} ${flatten(next.text)}`)
  if (aText === null || bText === null) return { ok: false, reason: 'Orden ryms inte i nästa replik (över två rader).' }
  const [a, b] = redistribute(cue, next, aText, bText)
  return { ok: true, cues: [...cues.slice(0, index), a, b, ...cues.slice(index + 2)], focusIndex: index + 1, caret: textCaret(bText, flatten(move).length) }
}

/** Flytta texten före markören i rad i till slutet av rad i-1. */
export function moveHeadToPrevious(cues: readonly EditCue[], index: number, caret: number): OpResult {
  const cue = cues[index]
  const previous = cues[index - 1]
  if (!cue || !previous) return { ok: false, reason: 'Det finns ingen replik före den här att flytta ord till.' }
  const move = flatten(cue.text.slice(0, caret))
  const keep = flatten(cue.text.slice(caret))
  if (!keep || !move) return { ok: false, reason: 'Placera markören efter de ord som ska flyttas (och före minst ett ord som ska stanna).' }
  const aText = wrapBalanced(`${flatten(previous.text)} ${move}`)
  const bText = wrapBalanced(keep)
  if (aText === null || bText === null) return { ok: false, reason: 'Orden ryms inte i föregående replik (över två rader).' }
  const [a, b] = redistribute(previous, cue, aText, bText)
  return { ok: true, cues: [...cues.slice(0, index - 1), a, b, ...cues.slice(index + 1)], focusIndex: index, caret: 0 }
}

export function deleteCue(cues: readonly EditCue[], index: number): OpResult {
  if (!cues[index]) return { ok: false, reason: 'Ingen replik vald.' }
  const next = cues.filter((_, position) => position !== index)
  return { ok: true, cues: next, focusIndex: Math.min(index, next.length - 1) }
}

/** Ny, tom replik vid tiden (två sekunder, eller fram till nästa replik). Texten måste fyllas i innan det går att spara. */
export function addCue(cues: readonly EditCue[], time: number, newId: number): OpResult {
  let position = cues.findIndex((cue) => cue.start > time)
  if (position < 0) position = cues.length
  const limit = cues[position]?.start ?? Number.POSITIVE_INFINITY
  const end = round(Math.min(time + 2, Math.max(time + 0.2, limit - 0.04)))
  const created: EditCue = { id: newId, start: round(Math.max(0, time)), end, text: '' }
  return { ok: true, cues: [...cues.slice(0, position), created, ...cues.slice(position)], focusIndex: position, caret: 0 }
}

/** Sätter start eller slut. Tiden begränsas till minst 0 och minst 0,1 s mellan start och slut. */
export function setTime(cues: readonly EditCue[], index: number, edge: 'start' | 'end', seconds: number): OpResult {
  const cue = cues[index]
  if (!cue) return { ok: false, reason: 'Ingen replik vald.' }
  const value = round(Math.max(0, seconds))
  if (edge === 'start' && value > cue.end - 0.1) return { ok: false, reason: 'Starten måste ligga före slutet.' }
  if (edge === 'end' && value < cue.start + 0.1) return { ok: false, reason: 'Slutet måste ligga efter starten.' }
  return { ok: true, cues: cues.map((item, position) => (position === index ? { ...item, [edge]: value } : item)), focusIndex: index }
}

export function nudge(cues: readonly EditCue[], index: number, edge: 'start' | 'end', delta: number): OpResult {
  const cue = cues[index]
  return cue ? setTime(cues, index, edge, cue[edge] + delta) : { ok: false, reason: 'Ingen replik vald.' }
}

/** Förskjuter alla repliker från och med rad fromIndex (eller alla om fromIndex är 0) med delta sekunder. Inget hamnar före 0. */
export function shiftFrom(cues: readonly EditCue[], fromIndex: number, delta: number): OpResult {
  if (!cues[fromIndex]) return { ok: false, reason: 'Ingen replik vald.' }
  if (cues[fromIndex].start + delta < 0) return { ok: false, reason: 'Förskjutningen skulle flytta repliken före början av videon.' }
  return {
    ok: true,
    cues: cues.map((cue, position) => (position >= fromIndex ? { ...cue, start: round(cue.start + delta), end: round(cue.end + delta) } : cue)),
    focusIndex: fromIndex,
  }
}

export type IssueKind = 'empty' | 'badTime' | 'overlap' | 'order'

export interface Issue {
  index: number
  kind: IssueKind
  /** Fel stoppar sparandet; övrigt är varningar. */
  error: boolean
  message: string
}

export function validateCues(cues: readonly EditCue[]): Issue[] {
  const issues: Issue[] = []
  cues.forEach((cue, index) => {
    if (!cue.text.trim()) issues.push({ index, kind: 'empty', error: true, message: 'Repliken saknar text.' })
    if (!(cue.end > cue.start)) issues.push({ index, kind: 'badTime', error: true, message: 'Repliken slutar inte efter att den börjar.' })
    const previous = cues[index - 1]
    if (previous) {
      if (cue.start < previous.start) issues.push({ index, kind: 'order', error: false, message: 'Repliken börjar före föregående (sorteras om vid sparning).' })
      else if (cue.start < previous.end - 0.001) issues.push({ index, kind: 'overlap', error: false, message: 'Repliken överlappar föregående.' })
    }
  })
  return issues
}

/** Samma ordning som servern sparar i: på starttid, stabilt. */
export function sortedForSave(cues: readonly EditCue[]): EditCue[] {
  return cues.map((cue, order) => ({ cue, order })).sort((a, b) => a.cue.start - b.cue.start || a.cue.end - b.cue.end || a.order - b.order).map((item) => item.cue)
}

export interface DiffState {
  /** Id på repliker vars tid eller text skiljer sig från den sparade, eller som är nya. */
  changedIds: Set<number>
  /** Antal sparade repliker som inte längre finns. */
  removed: number
  /** De sparade replikerna ligger i en annan inbördes ordning än när de sparades. */
  reordered: boolean
  dirty: boolean
}

/** Jämför arbetskopian med det som är sparat: ändrad text eller tid, nya och borttagna repliker och ändrad ordning. */
export function diffState(saved: readonly EditCue[], cues: readonly EditCue[]): DiffState {
  const savedById = new Map(saved.map((cue) => [cue.id, cue]))
  const changedIds = new Set<number>()
  for (const cue of cues) {
    const before = savedById.get(cue.id)
    if (!before || before.start !== cue.start || before.end !== cue.end || before.text !== cue.text) changedIds.add(cue.id)
  }
  const currentIds = new Set(cues.map((cue) => cue.id))
  const removed = saved.filter((cue) => !currentIds.has(cue.id)).length
  const keptSaved = saved.filter((cue) => currentIds.has(cue.id)).map((cue) => cue.id)
  const keptCurrent = cues.filter((cue) => savedById.has(cue.id)).map((cue) => cue.id)
  const reordered = keptSaved.some((id, position) => id !== keptCurrent[position])
  return { changedIds, removed, reordered, dirty: changedIds.size > 0 || removed > 0 || reordered }
}

const MIN_DRAG_SECONDS = 0.3
/** Två kanter närmare än så här räknas som en gemensam gräns mellan två repliker. */
const JOINT_SECONDS = 0.05

/**
 * Flyttar en replikkant till tiden (drag i vågformsbandet, UNG-161). Utgår från cues vid dragets början, så att gränsen inte byter
 * karaktär under draget. Ligger grannens kant mot kant med den (gemensam gräns) följer den med, annars stoppas kanten vid grannen
 * (inget överlapp). Repliken behåller minst 0,3 s, och en gemensam granne också. Tiden begränsas i stället för att avvisas.
 */
export function moveEdge(cues: readonly EditCue[], index: number, edge: 'start' | 'end', seconds: number): EditCue[] {
  const cue = cues[index]
  if (!cue) return [...cues]
  const neighbour = edge === 'start' ? cues[index - 1] : cues[index + 1]
  const joint = neighbour !== undefined && Math.abs((edge === 'start' ? neighbour.end : neighbour.start) - cue[edge]) <= JOINT_SECONDS
  let value = Math.max(0, seconds)
  if (edge === 'start') {
    value = Math.min(value, cue.end - MIN_DRAG_SECONDS)
    if (neighbour) value = Math.max(value, joint ? neighbour.start + MIN_DRAG_SECONDS : neighbour.end)
  } else {
    value = Math.max(value, cue.start + MIN_DRAG_SECONDS)
    if (neighbour) value = Math.min(value, joint ? neighbour.end - MIN_DRAG_SECONDS : neighbour.start)
  }
  value = round(value)
  return cues.map((item, position) => {
    if (position === index) return { ...item, [edge]: value }
    if (joint && position === (edge === 'start' ? index - 1 : index + 1)) return { ...item, [edge === 'start' ? 'end' : 'start']: value }
    return item
  })
}
