import { useEffect, useRef, useState } from 'preact/hooks'
import { renewAuthTokenIfDue, setRenewalGuard } from '../data/http/fetchJson'
import { inactivityPhase, type InactivityPhase } from '../data/http/sessionLogic'
import { lastActivity, markActivity } from './activity'

const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const
// Every second, so the warning can count down; hidden tabs are throttled by the browser, which is fine.
const TICK_MS = 1000

/**
 * UNG-312: logs out after 2 h without activity (see activity.ts), with a warning shortly before. While signed in it
 * also renews the short-lived token on a timer, so the session survives views that make no requests. Time is wall-clock
 * time, so a computer that slept past the limit is logged out as soon as it wakes.
 */
export function useInactivityLogout(enabled: boolean, onExpired: () => void): InactivityPhase {
  const [state, setState] = useState<InactivityPhase>({ phase: 'active' })
  const onExpiredRef = useRef(onExpired)
  onExpiredRef.current = onExpired

  useEffect(() => {
    if (!enabled) {
      setState({ phase: 'active' })
      return
    }
    markActivity()
    const current = () => inactivityPhase(lastActivity(), Date.now())
    setRenewalGuard(() => current().phase !== 'expired')

    let expired = false
    const check = () => {
      if (expired) return
      const next = current()
      if (next.phase === 'expired') {
        expired = true
        onExpiredRef.current()
        return
      }
      setState((previous) => (previous.phase === next.phase && next.phase === 'active' ? previous : next))
      void renewAuthTokenIfDue()
    }
    const onActivity = () => {
      const wasWarning = current().phase === 'warning'
      markActivity()
      if (wasWarning) check()
    }

    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { capture: true, passive: true })
    document.addEventListener('visibilitychange', check)
    const interval = window.setInterval(check, TICK_MS)
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true })
      document.removeEventListener('visibilitychange', check)
      window.clearInterval(interval)
      setRenewalGuard(() => true)
    }
  }, [enabled])

  return state
}
