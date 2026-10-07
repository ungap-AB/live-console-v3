// Sökning i punkt- och namnlistan i live-vyn (UNG-130). Ren logik: normalisering, matchning och markering.

/** Små bokstäver utan diakritiska tecken (Björk → bjork, Åke → ake), så sökningen tål att man skriver utan å/ä/ö. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

const WORD = /[\p{L}\p{N}]+/gu

function words(text: string): string[] {
  return normalize(text).match(WORD) ?? []
}

/** Sökorden: mellanrumsseparerade, normaliserade. Tomt när sökningen är tom. */
export function queryTokens(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean)
}

/** Träff när varje sökord är början på något ord i någon av texterna (valfri ordning, t.ex. "eri per" → "Per Eriksson"). */
export function matches(tokens: readonly string[], texts: readonly (string | undefined)[]): boolean {
  if (tokens.length === 0) return true
  const haystack = texts.flatMap((text) => (text ? words(text) : []))
  return tokens.every((token) => haystack.some((word) => word.startsWith(token)))
}

export interface Segment {
  text: string
  hit: boolean
}

/** Delar en text i träffande och övriga delar, för att markera det man sökt. Bevarar originalets stavning. */
export function highlight(label: string, tokens: readonly string[]): Segment[] {
  if (tokens.length === 0) return [{ text: label, hit: false }]
  const segments: Segment[] = []
  let cursor = 0
  for (const match of label.matchAll(WORD)) {
    const word = match[0]
    const start = match.index ?? 0
    const normalized = normalize(word)
    const token = tokens.find((candidate) => normalized.startsWith(candidate))
    if (!token) continue
    // Hur många tecken i originalordet som motsvarar sökordets längd (ett tecken kan normaliseras till ett annat antal).
    let covered = 0
    let length = 0
    for (const char of word) {
      if (covered >= token.length) break
      covered += normalize(char).length
      length += char.length
    }
    if (start > cursor) segments.push({ text: label.slice(cursor, start), hit: false })
    segments.push({ text: label.slice(start, start + length), hit: true })
    cursor = start + length
  }
  if (cursor < label.length) segments.push({ text: label.slice(cursor), hit: false })
  return segments
}

export interface Hit {
  list: 'agenda' | 'names'
  id: string
}

/** Pilarna flyttar markeringen mellan träffarna (utan att rulla runt); -1 = ingen markerad. */
export function moveActive(current: number, delta: 1 | -1, count: number): number {
  if (count === 0) return -1
  if (current < 0) return delta === 1 ? 0 : count - 1
  return Math.min(count - 1, Math.max(0, current + delta))
}

/**
 * Vilken träff som är markerad. Med exakt en träff är den markerad direkt; annars bara den man valt med pilarna.
 * Enter spelar bara ut en markerad rad (säkerhetsregeln för sändning).
 */
export function markedHit(hits: readonly Hit[], active: number): Hit | null {
  if (hits.length === 1) return hits[0]
  return active >= 0 && active < hits.length ? hits[active] : null
}

/** `/` aktiverar sökningen när fokus inte ligger i ett fält, ingen dialog är öppen och ingen modifierartangent hålls. */
export function shouldActivateSearch(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, targetIsEditable: boolean, dialogOpen: boolean): boolean {
  return event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !targetIsEditable && !dialogOpen
}
