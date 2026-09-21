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
  return {
    title: 'Gå tillbaka till Before?',
    body: 'Den pågående sändningen bryts för publiken, som i stället ser Before-meddelandet.',
    confirmLabel: 'Gå till Before',
    editsAfterText: false,
    danger: true,
  }
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
