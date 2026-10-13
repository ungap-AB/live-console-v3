import { t } from '@lingui/core/macro'
import type { AfterReason, PublicMode, Visibility } from '../../data/types'

export const MODES: PublicMode[] = ['before', 'live', 'after', 'ondemand']

// Mode names are product terms and the same in every language.
export const MODE_LABEL: Record<PublicMode, string> = {
  before: 'Before',
  live: 'Live',
  after: 'After',
  ondemand: 'Ondemand',
}

// Confirmation is required when the change removes or alters something the audience already sees.
// Other changes (including all visibility changes) go through without confirmation for now.
const CONFIRMED: ReadonlySet<string> = new Set([
  'live>after',
  'ondemand>after',
  'after>live',
  'ondemand>live',
  // Live → Before is no longer an allowed transition — an aborted test
  // must always be reviewed in After first, see After → Before below.
  'after>before',
  // Not in the spec: leaving Ondemand always unpublishes the recording, so
  // Ondemand → Before also requires confirmation.
  'ondemand>before',
])

export function requiresConfirmation(from: PublicMode, to: PublicMode): boolean {
  return from !== to && CONFIRMED.has(`${from}>${to}`)
}

export interface ConfirmationCopy {
  title: string
  body: string
  confirmLabel: string
  /** The target mode is After: the dialog shows the After message in an editable field. */
  editsAfterText: boolean
  danger: boolean
}

// The text says concretely what happens for the audience — never just "Are you sure?".
export function confirmationCopy(from: PublicMode, to: PublicMode): ConfirmationCopy | null {
  if (!requiresConfirmation(from, to)) return null
  if (from === 'live' && to === 'after') {
    return {
      title: t`End the live broadcast?`,
      body: t`The audience stops seeing the broadcast and sees the After message below instead.`,
      confirmLabel: t`Go to After`,
      editsAfterText: true,
      danger: false,
    }
  }
  if (from === 'ondemand' && to === 'after') {
    return {
      title: t`Unpublish the recording?`,
      body: t`The recording is removed from the player. The audience sees the After message below until you publish again.`,
      confirmLabel: t`Unpublish`,
      editsAfterText: true,
      danger: true,
    }
  }
  if (from === 'after' && to === 'live') {
    return {
      title: t`Go back to Live?`,
      body: t`The audience sees the live broadcast again instead of the After message.`,
      confirmLabel: t`Go to Live`,
      editsAfterText: false,
      danger: false,
    }
  }
  if (from === 'ondemand' && to === 'live') {
    return {
      title: t`Go back to Live?`,
      body: t`The recording is removed from the player and the audience sees the live broadcast instead.`,
      confirmLabel: t`Go to Live`,
      editsAfterText: false,
      danger: true,
    }
  }
  if (from === 'ondemand' && to === 'before') {
    return {
      title: t`Unpublish the recording?`,
      body: t`The recording is removed from the player and the audience sees the Before message instead.`,
      confirmLabel: t`Go to Before`,
      editsAfterText: false,
      danger: true,
    }
  }
  if (from === 'after' && to === 'before') {
    return {
      title: t`Cancel and go to Before?`,
      body: t`The history from the broadcast/test is kept for the archive, but the After review ends and the audience sees the Before message.`,
      confirmLabel: t`Go to Before`,
      editsAfterText: false,
      danger: true,
    }
  }
  return {
    title: t`Go back to Before?`,
    body: t`The ongoing broadcast is cut off for the audience, who see the Before message instead.`,
    confirmLabel: t`Go to Before`,
    editsAfterText: false,
    danger: true,
  }
}

// The server has its own routes for publishing: PUT /public-mode only changes mode,
// while publish/unpublish/return to live also handle the recording, chapters and
// manifest. So the target decides which steps run.
export type ModeChangeStep = 'close' | 'publish' | 'unpublish' | 'returnToLive' | 'setMode'

export function modeChangePlan(from: PublicMode, to: PublicMode, published = true): ModeChangeStep[] {
  if (from === to) return []
  // Before → Ondemand means "I have a finished video": go to the Ondemand view to
  // upload/review, publish nothing (the audience must not see anything until the
  // operator presses Publish). A closed player is required for trimming.
  if (from === 'before' && to === 'ondemand') return ['close', 'setMode']
  if (to === 'ondemand') return ['publish']
  if (from === 'ondemand') {
    // Uploaded video that was never published: nothing to unpublish.
    if (to === 'before' && !published) return ['setMode']
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

// What the audience sees, derived from visibility and mode.
export function audienceSees(visibility: Visibility, mode: PublicMode): string {
  if (visibility === 'closed') return t`Nothing (closed)`
  switch (mode) {
    case 'before':
      return t`The Before message`
    case 'live':
      return t`The live broadcast`
    case 'after':
      return t`The After message`
    case 'ondemand':
      return t`The recording`
  }
}
