export interface PublishStep {
  key: PublishStepKey
  label: string
}

export type PublishStepKey = 'save' | 'trim' | 'publish' | 'chapters'

// Efter så här många sekunder förklarar dialogen att det tar längre tid än vanligt (men att arbetet pågår).
export const SLOW_PUBLISH_SECONDS = 30

export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`
}

// UNG-106: stegen i publiceringen i den ordning konsolen utför dem. Spara och trimma tas bara med när de behövs.
export function buildPublishSteps(options: { saveDraft: boolean; trim: boolean }): PublishStep[] {
  const steps: PublishStep[] = []
  if (options.saveDraft) steps.push({ key: 'save', label: 'Sparar kapitel och tider' })
  if (options.trim) steps.push({ key: 'trim', label: 'Förbereder den trimmade videon' })
  steps.push({ key: 'publish', label: 'Publicerar och uppdaterar spelaren' })
  steps.push({ key: 'chapters', label: 'Hämtar kapitlen' })
  return steps
}
