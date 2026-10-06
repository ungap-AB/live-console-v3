import type { CaptionCorrection, CaptionDraft, CaptionGeneration } from '../../data/types'

export type AutoCaptionsPhase = 'idle' | 'running' | 'failed' | 'draft'

/**
 * Vad panelen ska visa. Ett pågående jobb går före ett utkast (en ny generering pågår), ett misslyckat jobb visas bara
 * om det är nyare än utkastet — annars är det utkastet som gäller. Ett avbrutet jobb är som inget jobb alls.
 */
export function autoCaptionsPhase(generation: Pick<CaptionGeneration, 'job' | 'draft'>): AutoCaptionsPhase {
  const { job, draft } = generation
  if (job?.state === 'processing') return 'running'
  if (job?.state === 'error' && (!draft || job.createdAtUtc > draft.createdAtUtc)) return 'failed'
  if (draft) return 'draft'
  return 'idle'
}

export interface CorrectionGroup {
  original: string
  replacement: string
  count: number
  /** Första förekomsten i sekunder från videons start. */
  firstTime: number
}

/** Samlar identiska rättningar (samma namn rättat många gånger) så listan går att läsa. Ordnad efter första förekomst. */
export function groupCorrections(corrections: readonly CaptionCorrection[]): CorrectionGroup[] {
  const groups = new Map<string, CorrectionGroup>()
  for (const item of [...corrections].sort((a, b) => a.time - b.time)) {
    const key = `${item.original}\u0000${item.replacement}`
    const existing = groups.get(key)
    if (existing) existing.count += 1
    else groups.set(key, { original: item.original, replacement: item.replacement, count: 1, firstTime: item.time })
  }
  return [...groups.values()]
}

/** Ungefärlig väntetid i klartext, för hjälptexten före start. Uppmätt: ca 4–5 minuter per timme video. */
export function estimatedWaitText(videoDurationSeconds: number | undefined): string {
  if (!videoDurationSeconds || videoDurationSeconds <= 0) return 'några minuter'
  const minutes = Math.max(2, Math.round((videoDurationSeconds / 3600) * 5))
  return minutes <= 1 ? 'någon minut' : `ungefär ${minutes} minuter`
}

/**
 * Varför utkastet inte går att godkänna (annars null). Stale gäller bara äldre utkast som skapades på den trimmade videons
 * tidslinje (före mastern på originalets tidslinje): de kan inte räknas om och ska ersättas av en ny generering.
 */
export function approveBlockedReason(draft: Pick<CaptionDraft, 'stale'>): string | null {
  return draft.stale ? 'Utkastet är skapat på ett äldre sätt och kan inte godkännas eller redigeras. Skapa nya undertexter.' : null
}

export type DraftState = 'unreviewed' | 'published' | 'changed'

/** Utkastets läge: aldrig publicerat, publicerat och oförändrat, eller publicerat med ändringar som inte är publicerade. */
export function draftState(draft: Pick<CaptionDraft, 'approvedAtUtc' | 'unpublishedChanges'>): DraftState {
  if (!draft.approvedAtUtc) return 'unreviewed'
  return draft.unpublishedChanges ? 'changed' : 'published'
}
