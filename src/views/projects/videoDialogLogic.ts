// UNG-132: flikarna i dialogen "Video och undertexter". Alla tre flikar finns alltid (en flik som inte går att använda just nu visar
// en förklaring i stället för att döljas), men förvald flik är den första som går att använda, eller den som öppnade dialogen.

export type VideoTab = 'captions' | 'upload' | 'download'

export const VIDEO_TABS: readonly { id: VideoTab; label: string }[] = [
  { id: 'captions', label: 'Undertexter' },
  { id: 'upload', label: 'Ladda upp' },
  { id: 'download', label: 'Ladda ner' },
]

export interface VideoTabFlags {
  captionsEnabled: boolean
  uploadEnabled: boolean
  downloadEnabled: boolean
}

export function defaultVideoTab(flags: VideoTabFlags, requested?: VideoTab): VideoTab {
  if (requested) return requested
  if (flags.captionsEnabled) return 'captions'
  if (flags.uploadEnabled) return 'upload'
  if (flags.downloadEnabled) return 'download'
  return 'captions'
}

/** Dialogen går att öppna när något av de tre går att göra. */
export function videoActionsAvailable(flags: VideoTabFlags): boolean {
  return flags.captionsEnabled || flags.uploadEnabled || flags.downloadEnabled
}
