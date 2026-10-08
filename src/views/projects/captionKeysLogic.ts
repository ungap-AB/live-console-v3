// UNG-171: mellanslag växlar spela/paus i undertextredigeraren. Rena regler för när tangenten ska fångas.

/** Vad fokus ligger på när tangenten trycks. */
export type SpaceTarget =
  | 'text' // textfält, textruta, lista med val, redigerbart innehåll: mellanslag skrivs som vanligt
  | 'video' // videons egna kontroller: webbläsaren växlar redan uppspelningen
  | 'playcontrol' // radens spelkontroller (radnummer, tid, spelkolumn): mellanslag växlar uppspelningen i stället för att klicka om
  | 'button' // övriga knappar och länkar: mellanslag aktiverar dem som vanligt
  | 'other'

/** Klassar elementet som har fokus. `matches` svarar på om elementet ligger i/är något som matchar en CSS-väljare. */
export function spaceTargetKind(tagName: string, isContentEditable: boolean, matches: (selector: string) => boolean): SpaceTarget {
  const tag = tagName.toUpperCase()
  if (isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'text'
  if (tag === 'VIDEO') return 'video'
  if (matches('.ce-time, .ce-playcol')) return 'playcontrol'
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || matches('button, a, [role="button"]')) return 'button'
  return 'other'
}

export interface SpaceKeyEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  repeat: boolean
}

/** Mellanslag växlar uppspelningen utanför fält, utan modifierartangent, när ingen annan dialog är öppen och utan upprepning. */
export function shouldTogglePlayback(event: SpaceKeyEvent, target: SpaceTarget, otherDialogOpen: boolean): boolean {
  if (event.key !== ' ' || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return false
  if (otherDialogOpen) return false
  return target === 'other' || target === 'playcontrol'
}
