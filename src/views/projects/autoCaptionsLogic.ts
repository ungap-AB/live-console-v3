import { t } from '@lingui/core/macro'
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
  if (!videoDurationSeconds || videoDurationSeconds <= 0) return t`a few minutes`
  const minutes = Math.max(2, Math.round((videoDurationSeconds / 3600) * 5))
  return minutes <= 1 ? t`a minute or so` : t`about ${minutes} minutes`
}

// UNG-213: uppskattning medan jobbet går. Grov regel per ljudtimme: ca 5 minuter för ljud och transkribering (se estimatedWaitText) och
// ca 11 minuter till för talarbyten (uppmätt RTF 0,19 på x86 med två vCPU, UNG-202). Långa möten kan avvika, därför "ungefär".
const TRANSCRIBE_MINUTES_PER_HOUR = 5
const SPEAKERS_MINUTES_PER_HOUR = 11
/** Först över så här mycket framsteg extrapoleras en återstående tid: ljudsteget (0 till 10 %) står still och hoppar. */
const EXTRAPOLATE_FROM_PERCENT = 15

export function estimatedTotalMinutes(videoDurationSeconds: number | undefined, includeSpeakers: boolean): number | null {
  if (!videoDurationSeconds || videoDurationSeconds <= 0) return null
  const perHour = TRANSCRIBE_MINUTES_PER_HOUR + (includeSpeakers ? SPEAKERS_MINUTES_PER_HOUR : 0)
  return Math.max(2, Math.round((videoDurationSeconds / 3600) * perHour))
}

const minutesText = (minutes: number) => (minutes <= 1 ? t`about 1 minute` : t`about ${minutes} minutes`)

export interface JobEstimateInput {
  videoDurationSeconds: number | undefined
  includeSpeakers: boolean
  /** Jobbets start (ISO). */
  startedAtUtc: string
  /** Framsteg 0 till 100, om känt. */
  progress: number | undefined
  nowMs: number
}

/** "Beräknad tid: ungefär 12 minuter, startade 11:39. Ungefär 7 minuter kvar." Den sista meningen först när framsteget räcker för att extrapolera. */
export function jobEstimateText(input: JobEstimateInput): string {
  const started = new Date(input.startedAtUtc)
  const total = estimatedTotalMinutes(input.videoDurationSeconds, input.includeSpeakers)
  const clock = `${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`
  const duration = total === null ? t`a few minutes` : minutesText(total)
  let text = t`Estimated time: ${duration}, started ${clock}.`
  const progress = input.progress
  if (progress !== undefined && progress >= EXTRAPOLATE_FROM_PERCENT && progress < 100) {
    const elapsedMinutes = Math.max(0, (input.nowMs - started.getTime()) / 60_000)
    const remaining = Math.round((elapsedMinutes * (100 - progress)) / progress)
    text += ' ' + (remaining < 1 ? t`Done in a little while.` : remaining <= 1 ? t`About 1 minute left.` : t`About ${remaining} minutes left.`)
  }
  return text
}

/**
 * Varför utkastet inte går att godkänna (annars null). Stale gäller bara äldre utkast som skapades på den trimmade videons
 * tidslinje (före mastern på originalets tidslinje): de kan inte räknas om och ska ersättas av en ny generering.
 */
export function approveBlockedReason(draft: Pick<CaptionDraft, 'stale'>): string | null {
  return draft.stale ? t`The draft was created in an older way and cannot be approved or edited. Create new captions.` : null
}

export type DraftState = 'unreviewed' | 'published' | 'changed'

/** Utkastets läge: aldrig publicerat, publicerat och oförändrat, eller publicerat med ändringar som inte är publicerade. */
export function draftState(draft: Pick<CaptionDraft, 'approvedAtUtc' | 'unpublishedChanges'>): DraftState {
  if (!draft.approvedAtUtc) return 'unreviewed'
  return draft.unpublishedChanges ? 'changed' : 'published'
}
