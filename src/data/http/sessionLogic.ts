// Koder som kan följa med ett 401 utan att sessionen är ogiltig (fel PIN vid inloggning, ogiltig engångslänk m.m.).
const NOT_A_SESSION_PROBLEM = new Set(['invalid_credentials', 'invalid_setup_token', 'invalid_credential_link'])

/**
 * Om ett svar betyder att den inloggade sessionen är ogiltig (UNG-128): ett 401 på ett anrop som skickade en token. Ett
 * utgånget token ger 401 utan JSON-kropp (JWT-mellanvaran), ogiltiga användare/domäner ger 401 med egen kod. 403 (saknar
 * behörighet) är något annat och loggar aldrig ut. Utan token (inloggning, engångslänkar) finns ingen session att tappa.
 */
export function isSessionLost(status: number, code: string, sentToken: boolean): boolean {
  return status === 401 && sentToken && !NOT_A_SESSION_PROBLEM.has(code)
}

/** When a token became valid and when it expires (ms since epoch), read from the JWT without checking the signature. */
export function tokenLifetime(token: string): { validFrom: number; expiresAt: number } | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
    const { nbf, iat, exp } = JSON.parse(json) as { nbf?: number; iat?: number; exp?: number }
    const from = nbf ?? iat
    if (typeof exp !== 'number' || typeof from !== 'number') return null
    return { validFrom: from * 1000, expiresAt: exp * 1000 }
  } catch {
    return null
  }
}

/**
 * UNG-312: the short-lived token is renewed once half its lifetime has passed. A token that cannot be read (from before
 * UNG-312) is never renewed; it keeps working until it expires.
 */
export function renewalDue(token: string, now: number): boolean {
  const lifetime = tokenLifetime(token)
  if (!lifetime) return false
  return now >= lifetime.validFrom + (lifetime.expiresAt - lifetime.validFrom) / 2
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
