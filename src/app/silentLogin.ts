// ADR 001: framed in ungap Presenter, the console logs in silently (prompt=none). At most two silent logins per 30 s in
// this frame: one that finds no Keycloak session and, after Presenter's login in the whole window, the one that succeeds.
// If the session cookie never comes back (blocked), that ends the loop.
const SILENT_KEY = 'ungap-live-silent-logins'
const WINDOW_MS = 30_000

export function claimSilentLogin(storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage, now = Date.now()): boolean {
  try {
    const recent = (JSON.parse(storage.getItem(SILENT_KEY) ?? '[]') as number[]).filter((at) => now - at < WINDOW_MS)
    if (recent.length >= 2) return false
    storage.setItem(SILENT_KEY, JSON.stringify([...recent, now]))
    return true
  } catch {
    return false
  }
}

export function resetSilentLogins(storage: Pick<Storage, 'removeItem'> = sessionStorage): void {
  try {
    storage.removeItem(SILENT_KEY)
  } catch {
    // Nothing to reset.
  }
}
