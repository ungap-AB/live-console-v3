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
  // Kapitelradens knappar (UNG-231) räknas hit: ett klick på dem lämnar fokus kvar, och mellanslag ska ändå växla uppspelningen.
  if (matches('.ce-time, .ce-playcol, .ce-chrow')) return 'playcontrol'
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

// UNG-184: en placering som gjorts med ett klick i vågformen. Mellanslag provlyssnar den: spelar från placeringen, och när man pausar
// flyttar spelhuvudet tillbaka dit, så att man kan höra samma ställe om och om igen medan man finjusterar. Utan placering växlar
// mellanslag uppspelningen som vanligt. Placeringen avslutas när man väljer ett annat sätt att spela upp (se CaptionEditor.seekTo).
export type SpaceAction =
  | { kind: 'toggle' }
  | { kind: 'playFrom'; time: number }
  | { kind: 'pauseBack'; time: number }

export function spaceAction(anchor: number | null, paused: boolean): SpaceAction {
  if (anchor === null) return { kind: 'toggle' }
  return paused ? { kind: 'playFrom', time: anchor } : { kind: 'pauseBack', time: anchor }
}

// UNG-219: Tab och Skift+Tab går från den AKTIVA raden (den replik som videon står på och som är markerad), inte från den textruta som
// senast hade fokus. Medan videon spelar rör sig den aktiva raden men fokus ligger kvar i en tidigare ruta; Tab ska då fortsätta från den
// rad operatören ser. Rena regler så att alla genvägar använder samma definition.

/**
 * Raden Tab utgår från: den aktiva raden (videons replik) om det finns en, annars den fokuserade textrutans rad (om fokus ligger i en),
 * annars den valda raden.
 */
export function tabOriginIndex(activeIndex: number, selectedIndex: number, focusedIndex: number | null): number {
  if (activeIndex >= 0) return activeIndex
  if (focusedIndex !== null) return focusedIndex
  return selectedIndex
}

/** Raden Tab landar på. Stannar kvar vid första och sista raden (ingen runtgång). -1 om det inte finns några rader. */
export function tabTargetIndex(origin: number, backwards: boolean, count: number): number {
  if (count <= 0) return -1
  return Math.min(count - 1, Math.max(0, origin + (backwards ? -1 : 1)))
}

/** Vad fokus ligger på när Tab trycks: en textruta (hanteras av rutan själv), en yta i redigeraren (video, vågform, listans bakgrund), eller något annat. */
export type TabTarget = 'text' | 'surface' | 'other'

export function tabTargetKind(tagName: string, matches: (selector: string) => boolean): TabTarget {
  const tag = tagName.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return 'text'
  if (tag === 'BODY' || tag === 'HTML') return 'surface'
  // Kapitelraden (UNG-231) är också en yta: Tab därifrån hoppar mellan kapitel/repliker som från listan.
  if (matches('video, .ce-wave, .ce-wave-slot, .ce-list, .ce-chrow')) return 'surface'
  return 'other'
}

export interface TabKeyEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

/**
 * Tab fångas på en yta i redigeraren (efter ett klick i videon eller vågformen), inte när fokus ligger på en knapp, ett fält eller i en
 * annan dialog (de äger sin egen tabbordning), och inte med modifierartangent.
 */
export function shouldCaptureTab(event: TabKeyEvent, target: TabTarget, otherDialogOpen: boolean): boolean {
  if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return false
  if (otherDialogOpen) return false
  return target === 'surface'
}
