import { useEffect, useState } from 'preact/hooks'

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
