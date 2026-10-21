import { useEffect, useState } from 'preact/hooks'
import { parseShareToken } from './shareLink'

export type RouteKey =
  | 'projects'
  | 'agendas'
  | 'namelists'
  | 'live'
  | 'archive'
  | 'jobs'
  | 'trash'
  | 'users'

const KNOWN_ROUTES: RouteKey[] = [
  'projects',
  'agendas',
  'namelists',
  'live',
  'archive',
  'jobs',
  'trash',
  'users',
]

function parseHash(): RouteKey {
  const segment = window.location.hash.slice(1).split('/').filter(Boolean)[0]
  return (KNOWN_ROUTES as string[]).includes(segment ?? '')
    ? (segment as RouteKey)
    : 'projects'
}

export function useRoute(): RouteKey {
  const [route, setRoute] = useState<RouteKey>(parseHash())

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route
}

export function routeHref(route: RouteKey): string {
  return `#/${route}`
}


/**
 * Where the ungap login returns to when it did not end in a session (ADR 001): #/sso?error=<code>&return=<hash>. The
 * login's page to go back to is the return hash; login_required means Keycloak has no session (silent login, framed).
 */
export function readSsoReturn(): { error: string; returnHash: string } | null {
  const hash = window.location.hash.slice(1)
  if (!hash.startsWith('/sso')) return null
  const params = new URLSearchParams(hash.split('?')[1] ?? '')
  const back = params.get('return') ?? ''
  return { error: params.get('error') ?? 'login_failed', returnHash: back.startsWith('#') && !back.startsWith('#/sso') ? back : '' }
}

export function useShareToken(): string | null {
  const [token, setToken] = useState<string | null>(() => parseShareToken(window.location.hash))

  useEffect(() => {
    const onHashChange = () => setToken(parseShareToken(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return token
}

