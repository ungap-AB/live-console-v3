import { allowedShellOrigins, relayReturnTo } from './embed'

// Step A6: ungap Presenter's login relay. `#/sso-relay?returnTo=<shell address>` starts the console's ungap login in the
// whole window and, once logged in (or refused), sends the window back to the shell. The return address must be an
// allowed shell origin, checked when the relay starts and again before going back.

const RELAY_KEY = 'ungap.console.sso-relay'
const shellOrigins = () => allowedShellOrigins(import.meta.env.VITE_SHELL_ORIGINS, import.meta.env.DEV)

/** True when this address is a relay request with an allowed return address (stored for after the login). */
export function takeRelayRequest(hash: string = window.location.hash, allowed: readonly string[] = shellOrigins()): boolean {
  if (!hash.startsWith('#/sso-relay')) return false
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  const returnTo = relayReturnTo(new URLSearchParams(hash.split('?')[1] ?? '').get('returnTo'), allowed)
  if (!returnTo) return false
  try {
    sessionStorage.setItem(RELAY_KEY, returnTo)
    return true
  } catch {
    return false
  }
}

/** The shell address this tab's relay returns to, read once (checked again). */
export function takePendingRelay(allowed: readonly string[] = shellOrigins()): string | null {
  try {
    const value = sessionStorage.getItem(RELAY_KEY)
    sessionStorage.removeItem(RELAY_KEY)
    return relayReturnTo(value, allowed)
  } catch {
    return null
  }
}
