import type { CueKind, PlayoutState, PublicMode, TimelineEvent } from '../../data/types.ts'

// UNG-333. Before is a rehearsal mode: a play-out moves the current item/name (shown as a marking in the console only) but is
// never stored on the timeline and never reaches the audience. Same rule as the server (ProjectStore.RehearseCue), so the
// optimistic update never gets out of step.

export function isRehearsal(publicMode: PublicMode): boolean {
  return publicMode === 'before'
}

/** The server answered with a rehearsal receipt (ProjectStore.RehearseCue ids start with "rh"), not a stored timeline event. */
export function isRehearsalEvent(event: TimelineEvent): boolean {
  return event.id.startsWith('rh')
}

/** The playout after a rehearsal cue. The timeline is left untouched, so nothing shows as done and nothing is counted. */
export function applyRehearsalCue(playout: PlayoutState, kind: CueKind, refId: string | null, label: string): PlayoutState {
  const event: TimelineEvent | null = refId ? { id: `rh-${refId}`, kind, refId, label, occurredAt: new Date().toISOString(), offsetSeconds: null } : null
  if (kind === 'agendaItem') {
    // A new item hides the name, as in Live (UNG-112).
    return { ...playout, rehearsal: true, currentAgendaItemId: refId, currentAgendaItem: event, currentPersonId: null, currentPerson: null }
  }
  if (kind === 'person') {
    return { ...playout, rehearsal: true, currentPersonId: refId, currentPerson: event }
  }
  return { ...playout, rehearsal: true }
}
