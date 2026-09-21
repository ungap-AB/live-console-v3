import type { AfterReason, PublicMode, Visibility } from '../../data/types'

export const MODES: PublicMode[] = ['before', 'live', 'after', 'ondemand']

export const MODE_LABEL: Record<PublicMode, string> = {
  before: 'Before',
  live: 'Live',
  after: 'After',
  ondemand: 'Ondemand',
}

// Bekräftelse krävs när bytet tar bort eller ändrar något publiken redan ser.
// Övriga byten (inklusive alla synlighetsbyten) går utan bekräftelse tills vidare.
const CONFIRMED: ReadonlySet<string> = new Set([
  'live>after',
  'ondemand>after',
  'after>live',
  'ondemand>live',
  'live>before',
  // Inte i specen: att lämna Ondemand avpublicerar alltid inspelningen, så
  // även Ondemand → Before kräver bekräftelse.
  'ondemand>before',
])

export function requiresConfirmation(from: PublicMode, to: PublicMode): boolean {
  return from !== to && CONFIRMED.has(`${from}>${to}`)
}

export interface ConfirmationCopy {
  title: string
  body: string
  confirmLabel: string
  /** Målläget är After: dialogen visar After-meddelandet i ett redigerbart fält. */
  editsAfterText: boolean
  danger: boolean
}

// Texten säger konkret vad som händer för publiken — aldrig bara "Är du säker?".
export function confirmationCopy(from: PublicMode, to: PublicMode): ConfirmationCopy | null {
  if (!requiresConfirmation(from, to)) return null
  if (from === 'live' && to === 'after') {
    return {
      title: 'Avsluta livesändningen?',
      body: 'Publiken slutar se sändningen och ser i stället After-meddelandet nedan.',
      confirmLabel: 'Gå till After',
      editsAfterText: true,
      danger: false,
    }
  }
  if (from === 'ondemand' && to === 'after') {
    return {
      title: 'Avpublicera inspelningen?',
      body: 'Inspelningen tas bort från spelaren. Publiken ser After-meddelandet nedan tills du publicerar igen.',
      confirmLabel: 'Avpublicera',
      editsAfterText: true,
      danger: true,
    }
  }
  if (from === 'after' && to === 'live') {
    return {
      title: 'Gå tillbaka till Live?',
      body: 'Publiken ser åter livesändningen i stället för After-meddelandet.',
      confirmLabel: 'Gå till Live',
      editsAfterText: false,
      danger: false,
    }
  }
  if (from === 'ondemand' && to === 'live') {
    return {
      title: 'Gå tillbaka till Live?',
      body: 'Inspelningen tas bort från spelaren och publiken ser livesändningen i stället.',
      confirmLabel: 'Gå till Live',
      editsAfterText: false,
      danger: true,
    }
  }
  if (from === 'ondemand' && to === 'before') {
    return {
      title: 'Avpublicera inspelningen?',
      body: 'Inspelningen tas bort från spelaren och publiken ser Before-meddelandet i stället.',
      confirmLabel: 'Gå till Before',
      editsAfterText: false,
      danger: true,
    }
  }
  return {
    title: 'Gå tillbaka till Before?',
    body: 'Den pågående sändningen bryts för publiken, som i stället ser Before-meddelandet.',
    confirmLabel: 'Gå till Before',
    editsAfterText: false,
    danger: true,
  }
}

// Servern har egna vägar för publicering: PUT /public-mode byter bara läge,
// medan publicera/avpublicera/återgå till live också hanterar inspelning,
// kapitel och manifest. Därför avgör målet vilka steg som körs.
export type ModeChangeStep = 'publish' | 'unpublish' | 'returnToLive' | 'setMode'

export function modeChangePlan(from: PublicMode, to: PublicMode): ModeChangeStep[] {
  if (from === to) return []
  if (to === 'ondemand') return ['publish']
  if (from === 'ondemand') {
    if (to === 'live') return ['returnToLive']
    if (to === 'after') return ['unpublish']
    return ['unpublish', 'setMode']
  }
  return ['setMode']
}

export function afterReasonFor(from: PublicMode, to: PublicMode): AfterReason | undefined {
  if (to !== 'after') return undefined
  return from === 'ondemand' ? 'ondemandUnpublished' : 'liveFinished'
}

// Vad publiken ser, härlett ur synlighet och läge.
export function audienceSees(visibility: Visibility, mode: PublicMode): string {
  if (visibility === 'closed') return 'Inget (stängd)'
  switch (mode) {
    case 'before':
      return 'Before-meddelandet'
    case 'live':
      return 'Livesändningen'
    case 'after':
      return 'After-meddelandet'
    case 'ondemand':
      return 'Inspelningen'
  }
}
