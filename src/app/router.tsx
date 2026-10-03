import { useEffect, useState } from 'preact/hooks'
import { parseShareToken } from './shareLink'

export type RouteKey =
  | 'projects'
  | 'agendas'
  | 'namelists'
  | 'live'
  | 'archive'
  | 'trash'
  | 'users'

const KNOWN_ROUTES: RouteKey[] = [
  'projects',
  'agendas',
  'namelists',
  'live',
  'archive',
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

// Engångslänk från ett inbjudnings-/återställningsmejl: #/accept?token=… — fungerar även utloggad.
function parseCredentialToken(): string | null {
  const hash = window.location.hash.slice(1)
  if (!hash.startsWith('/accept')) return null
  return new URLSearchParams(hash.split('?')[1] ?? '').get('token')
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

export function useCredentialToken(): string | null {
  const [token, setToken] = useState<string | null>(parseCredentialToken())

  useEffect(() => {
    const onHashChange = () => setToken(parseCredentialToken())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return token
}
