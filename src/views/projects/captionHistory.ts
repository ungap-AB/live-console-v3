// UNG-143: ångra och gör om för redigeraren som en stack av oföränderliga listor. Ingen känner till vad listan innehåller.
export interface History<T> {
  past: readonly T[]
  future: readonly T[]
}

export const MAX_HISTORY = 100

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] }
}

/** Spara värdet som gällde FÖRE en ändring. En ny ändring tömmer "gör om". */
export function record<T>(history: History<T>, previous: T, limit = MAX_HISTORY): History<T> {
  const past = [...history.past, previous]
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] }
}

export function undo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = history.past[history.past.length - 1]
  if (history.past.length === 0) return null
  return { value, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } }
}

export function redo<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  if (history.future.length === 0) return null
  const [value, ...rest] = history.future
  return { value, history: { past: [...history.past, current], future: rest } }
}
