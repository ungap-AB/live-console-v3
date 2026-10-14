// UNG-312: when the operator was last active, for the logout after 2 h of inactivity. Keyboard, mouse and touch count,
// and so does the open project's broadcast (Live with a signal, new chapters): an operator who just watches a broadcast
// is not logged out in the middle of it. The console's own background polling does not count.

let lastActivityAt = Date.now()
const holds = new Set<symbol>()

export function markActivity(now = Date.now()) {
  lastActivityAt = Math.max(lastActivityAt, now)
}

/** Counts as continuous activity until the returned release is called (e.g. while the open project is Live with a signal). */
export function holdActivity(): () => void {
  const hold = Symbol('activity')
  holds.add(hold)
  return () => {
    if (holds.delete(hold)) markActivity()
  }
}

export function lastActivity(now = Date.now()): number {
  return holds.size > 0 ? now : lastActivityAt
}
