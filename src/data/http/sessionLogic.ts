/**
 * Whether an answer means the signed-in session has ended (UNG-128): a 401 to a call made while signed in. An ended
 * session gives 401 without a JSON body (the authentication layer), removed users/domains 401 with their own code. 403
 * (no permission, or a refused cookie request) is something else and never logs out. Not signed in, there is nothing
 * to lose.
 */
export function isSessionLost(status: number, _code: string, signedIn: boolean): boolean {
  return status === 401 && signedIn
}

/** UNG-312: logged out after this long without activity, with a warning shown this long before. */
export const INACTIVITY_LIMIT_MS = 2 * 60 * 60 * 1000
export const INACTIVITY_WARNING_MS = 2 * 60 * 1000

export type InactivityPhase = { phase: 'active' } | { phase: 'warning'; remainingMs: number } | { phase: 'expired' }

export function inactivityPhase(lastActivityAt: number, now: number, limitMs = INACTIVITY_LIMIT_MS, warningMs = INACTIVITY_WARNING_MS): InactivityPhase {
  const remainingMs = lastActivityAt + limitMs - now
  if (remainingMs <= 0) return { phase: 'expired' }
  if (remainingMs <= warningMs) return { phase: 'warning', remainingMs }
  return { phase: 'active' }
}
