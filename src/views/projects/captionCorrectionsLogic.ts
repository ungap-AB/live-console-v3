import type { EditCue } from './captionEditOps.ts'

// UNG-166: orden operatören har ändrat under redigeringen, ord för ord (gammalt → nytt), så att de går att granska.

export interface WordChange {
  from: string
  to: string
}

const tokens = (text: string) => text.split(/\s+/).filter(Boolean)

/**
 * Jämför två texter ord för ord (längsta gemensamma följd) och ger varje sammanhängande ändring som gammalt → nytt. Tom sida betyder
 * infogat respektive borttaget.
 */
export function wordChanges(before: string, after: string): WordChange[] {
  const a = tokens(before)
  const b = tokens(after)
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const changes: WordChange[] = []
  let removed: string[] = []
  let added: string[] = []
  const flush = () => {
    if (removed.length > 0 || added.length > 0) changes.push({ from: removed.join(' '), to: added.join(' ') })
    removed = []
    added = []
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush()
      i++
      j++
    } else if (j < b.length && (i >= a.length || lengths[i][j + 1] >= lengths[i + 1][j])) {
      added.push(b[j++])
    } else {
      removed.push(a[i++])
    }
  }
  flush()
  return changes
}

export interface OwnCorrection extends WordChange {
  cueId: number
}

/**
 * Ändringarna i texten sedan det som lästes in, per replik (jämförda på id). Nya repliker och stora omläggningar (ord som flyttats mellan
 * repliker, sammanslagning, delning) räknas inte som rättningar: en ändring på fler än maxWords ord åt något håll hoppas över. Bara ersatta
 * ord räknas (gammalt → nytt); rena infogningar och borttagningar visas inte.
 */
export function ownCorrections(saved: readonly EditCue[], cues: readonly EditCue[], maxWords = 6): OwnCorrection[] {
  const before = new Map(saved.map((cue) => [cue.id, cue.text]))
  const result: OwnCorrection[] = []
  for (const cue of cues) {
    const original = before.get(cue.id)
    if (original === undefined || tokens(original).join(' ') === tokens(cue.text).join(' ')) continue
    for (const change of wordChanges(original, cue.text)) {
      if (!change.from || !change.to) continue
      if (tokens(change.from).length > maxWords || tokens(change.to).length > maxWords) continue
      result.push({ cueId: cue.id, ...change })
    }
  }
  return result
}
