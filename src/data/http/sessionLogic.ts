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
