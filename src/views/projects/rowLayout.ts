// UNG-227: radlayout för undertextlistan. Listan var en indexaxel med lika hög rad per replik (index × ROW_HEIGHT). För att kapitelrader
// (en annan höjd, en punkt i tiden i stället för ett intervall) ska kunna ligga mellan replikraderna beskrivs listans geometri här som
// en layout: varje rad har en överkant, en höjd och en ankartid. Ren logik (testas utan DOM).
//
// Tiden vid en y-position räknas som förut, men i radrum: tiden vid en bråkdels radposition interpoleras linjärt mellan två raders
// ankartider (`captionWaveformLogic.timeAtRow`). En rad är alltså lika "lång" i tid oavsett hur hög den är i pixlar. Med enbart
// replikrader i lika höjd ger layouten exakt samma resultat som den gamla `index × rowHeight`.

export interface RowSpan {
  /** Ankartiden: en repliks start, ett kapitels tid. */
  start: number
  /** En repliks slut. För ett kapitel (en punkt) samma som start. */
  end: number
}

export interface RowLayout {
  /** Antal rader. */
  readonly count: number
  /** Listans totala höjd (px). */
  readonly total: number
  /** Ankartid per rad, i radordning. */
  readonly spans: readonly RowSpan[]
  /** Radens överkant (px från listans topp). top(count) = total. */
  top(row: number): number
  height(row: number): number
  /** Raden som innehåller y (px), klämd till 0..count-1. −1 om det inte finns några rader. */
  rowAt(y: number): number
  /** Repliken som raden visar, eller −1 när raden är ett kapitel. */
  cueIndex(row: number): number
  /** Raden som visar repliken. */
  cueRow(cueIndex: number): number
}

/** Dagens layout: en rad per replik, alla lika höga. Ingen arrayallokering, så den är billig att bygga vid varje ändring. */
export function uniformCueLayout(cues: readonly RowSpan[], rowHeight: number): RowLayout {
  const count = cues.length
  return {
    count,
    total: count * rowHeight,
    spans: cues,
    top: (row) => row * rowHeight,
    height: () => rowHeight,
    rowAt: (y) => (count === 0 || rowHeight <= 0 ? -1 : Math.min(count - 1, Math.max(0, Math.floor(y / rowHeight)))),
    cueIndex: (row) => (row >= 0 && row < count ? row : -1),
    cueRow: (cueIndex) => cueIndex,
  }
}

export interface LayoutEntry {
  kind: 'cue' | 'chapter'
  height: number
  start: number
  end: number
}

/**
 * Layout med rader av olika höjd, i radordning (sorterade på tid). Repliker numreras i den ordning de förekommer, så replikindex är
 * oförändrat av kapitelrader emellan.
 */
export function mixedLayout(entries: readonly LayoutEntry[]): RowLayout {
  const count = entries.length
  const tops = new Array<number>(count + 1)
  const cueIndexOfRow = new Array<number>(count)
  const rowOfCue: number[] = []
  let y = 0
  entries.forEach((entry, row) => {
    tops[row] = y
    y += entry.height
    if (entry.kind === 'cue') {
      cueIndexOfRow[row] = rowOfCue.length
      rowOfCue.push(row)
    } else {
      cueIndexOfRow[row] = -1
    }
  })
  tops[count] = y
  const spans = entries.map((entry) => ({ start: entry.start, end: entry.end }))
  return {
    count,
    total: y,
    spans,
    top: (row) => tops[Math.min(count, Math.max(0, row))],
    height: (row) => entries[Math.min(count - 1, Math.max(0, row))].height,
    rowAt: (at) => {
      if (count === 0) return -1
      if (at <= 0) return 0
      if (at >= y) return count - 1
      let low = 0
      let high = count - 1
      while (low < high) {
        const mid = (low + high + 1) >> 1
        if (tops[mid] <= at) low = mid
        else high = mid - 1
      }
      return low
    },
    cueIndex: (row) => (row >= 0 && row < count ? cueIndexOfRow[row] : -1),
    cueRow: (cueIndex) => rowOfCue[cueIndex] ?? -1,
  }
}

/**
 * Radpositionen (med bråkdel) vid en y-position: heltalet är raden, bråkdelen hur långt ner i den. Utanför listan fortsätter den med
 * närmaste radens höjd, så att den är kontinuerlig och växer jämnt förbi ändarna.
 */
export function rowPosition(layout: RowLayout, y: number): number {
  if (layout.count === 0) return 0
  if (y <= 0) return y / layout.height(0)
  if (y >= layout.total) return layout.count + (y - layout.total) / layout.height(layout.count - 1)
  const row = layout.rowAt(y)
  return row + (y - layout.top(row)) / layout.height(row)
}

/**
 * Raderna som ska ritas (virtualisering): första raden och en förbi sista, med några extra rader över och under. Samma resultat som
 * den gamla `windowRange` för en uniform layout.
 */
export function windowRows(layout: RowLayout, scrollTop: number, viewportHeight: number, overscan = 6): { first: number; last: number } {
  const total = layout.count
  if (total <= 0) return { first: 0, last: 0 }
  const bottom = scrollTop + viewportHeight
  const rowAtBottom = layout.rowAt(bottom)
  // En rad som bara delvis syns räknas med (som ceil förut): sista raden är den första vars överkant ligger vid eller under nederkanten.
  const visibleEnd = rowAtBottom + (layout.top(rowAtBottom) < bottom ? 1 : 0)
  const first = Math.max(0, layout.rowAt(scrollTop) - overscan)
  const last = Math.min(total, visibleEnd + overscan)
  return { first: Math.min(first, total), last: Math.max(last, Math.min(first, total)) }
}

/** Scrollposition som gör raden synlig (eller samma som idag om den redan syns). */
export function scrollToRevealRow(layout: RowLayout, row: number, scrollTop: number, viewportHeight: number): number {
  const top = layout.top(row)
  const bottom = top + layout.height(row)
  if (top < scrollTop) return top
  if (bottom > scrollTop + viewportHeight) return Math.max(0, bottom - viewportHeight)
  return scrollTop
}

/** Radens mittlinje (px från listans överkant, efter scroll) där kopplingslinjen når raden. */
export function rowCenter(layout: RowLayout, row: number, scrollTop: number): number {
  return layout.top(row) - scrollTop + layout.height(row) / 2
}
