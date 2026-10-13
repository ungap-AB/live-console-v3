import { plural, t } from '@lingui/core/macro'
import { formatNumber } from '../../i18n/index.ts'
import type { PublishStepKey } from './publishProgress.ts'

// UNG-181: kvittot när publiceringen av ondemand är klar (eller har misslyckats). Rena funktioner för vad dialogen säger.

export interface PublishedFacts {
  /** Var ondemand redan publicerat innan det här flödet började (publicera ändringar)? */
  wasPublished: boolean
  visibility: 'open' | 'closed'
  chapterCount: number
  captions: { label: string; cueCount: number } | null
}

export interface PublishedCopy {
  title: string
  intro: string
  facts: string[]
  /** Projektet är stängt: tittarna ser inte inspelningen förrän det öppnas. Dialogen erbjuder då att öppna det. */
  closed: boolean
}

export function publishedCopy(facts: PublishedFacts): PublishedCopy {
  const closed = facts.visibility === 'closed'
  const title = facts.wasPublished ? t`On demand updated` : t`On demand published`
  const intro = closed
    ? t`The recording is published, but the project is closed, so viewers cannot see it yet.`
    : facts.wasPublished
      ? t`Viewers can now see the changes.`
      : t`Viewers can now see the recording.`
  const chapterCount = facts.chapterCount
  const chapters = plural(chapterCount, { 0: 'No chapters', one: '# chapter', other: '# chapters' })
  const captions = facts.captions ? captionsFact(facts.captions.label, facts.captions.cueCount) : t`No captions`
  return { title, intro, facts: [chapters, captions], closed }
}

function captionsFact(label: string, cueCount: number): string {
  const cues = formatNumber(cueCount)
  return plural(cueCount, { one: `Captions: ${label} (${cues} line)`, other: `Captions: ${label} (${cues} lines)` })
}

/** Texten när ett steg misslyckats. Steget visas med sin etikett så operatören ser var det stannade. */
export function failedCopy(stepLabel: string): { title: string; text: string } {
  return {
    title: t`Publishing was stopped`,
    text: t`The step “${stepLabel}” failed. The error message was shown as a notification. On demand has not been updated, so you can try again.`,
  }
}

export function stepLabel(steps: readonly { key: PublishStepKey; label: string }[], key: PublishStepKey): string {
  return steps.find((step) => step.key === key)?.label ?? t`Publishing`
}
