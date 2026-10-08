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
  const title = facts.wasPublished ? 'Ondemand uppdaterad' : 'Ondemand publicerad'
  const intro = closed
    ? 'Inspelningen är publicerad, men projektet är stängt så tittarna ser den inte än.'
    : facts.wasPublished
      ? 'Ändringarna syns nu för tittarna.'
      : 'Inspelningen syns nu för tittarna.'
  const chapters = facts.chapterCount === 0 ? 'Inga kapitel' : facts.chapterCount === 1 ? '1 kapitel' : `${facts.chapterCount} kapitel`
  const captions = facts.captions
    ? `Undertexter: ${facts.captions.label} (${facts.captions.cueCount.toLocaleString('sv-SE')} repliker)`
    : 'Inga undertexter'
  return { title, intro, facts: [chapters, captions], closed }
}

/** Texten när ett steg misslyckats. Steget visas med sin etikett så operatören ser var det stannade. */
export function failedCopy(stepLabel: string): { title: string; text: string } {
  return {
    title: 'Publiceringen avbröts',
    text: `Steget ”${stepLabel}” misslyckades. Felmeddelandet visades som en notis. Ondemand är inte uppdaterat, så du kan försöka igen.`,
  }
}

export function stepLabel(steps: readonly { key: PublishStepKey; label: string }[], key: PublishStepKey): string {
  return steps.find((step) => step.key === key)?.label ?? 'Publicerar'
}
