import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { routeHref, type RouteKey } from './router'
import './Shell.css'

interface NavItem {
  route: RouteKey
  label: string
  quickAction?: { label: string }
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Innehåll',
    items: [
      { route: 'projects', label: 'Projekt', quickAction: { label: 'Playout' } },
      { route: 'agendas', label: 'Dagordningar' },
      { route: 'namelists', label: 'Namnlistor' },
    ],
  },
  {
    label: 'Sändning',
    items: [
      { route: 'live', label: 'Live' },
      { route: 'archive', label: 'Videoarkiv' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { route: 'trash', label: 'Papperskorg' },
      { route: 'users', label: 'Användare' },
    ],
  },
]

interface ShellProps {
  active: RouteKey
  children: ComponentChildren
  onPlayoutShortcut?: () => void
  onLogout: () => void
}

export function Shell({ active, children, onPlayoutShortcut, onLogout }: ShellProps) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div class="shell">
      <button
        class="nav-toggle"
        aria-label="Öppna meny"
        aria-expanded={navOpen}
        onClick={() => setNavOpen((v) => !v)}
      >
        ☰
      </button>

      {navOpen && <div class="nav-scrim" onClick={() => setNavOpen(false)} />}

      <nav class={`rail ${navOpen ? 'open' : ''}`}>
        <div class="brand">Ungap Live</div>

        <div class="nav-groups">
          {NAV_GROUPS.map((group) => (
            <div class="nav-group" key={group.label}>
              <div class="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <div key={item.route} class="nav-row">
                  <a
                    href={routeHref(item.route)}
                    class={`nav-item ${active === item.route ? 'sel' : ''}`}
                    onClick={() => setNavOpen(false)}
                  >
                    {item.label}
                  </a>
                  {item.quickAction && (
                    <a
                      href={routeHref(item.route)}
                      class="nav-quick"
                      onClick={() => {
                        setNavOpen(false)
                        onPlayoutShortcut?.()
                      }}
                    >
                      {item.quickAction.label}
                    </a>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div class="nav-user">
          <div class="nav-user-name">Anders Mårtén</div>
          <div class="nav-user-domain">kalmar.se</div>
          <button class="btn btn-sm" type="button" onClick={onLogout}>
            Logga ut
          </button>
        </div>
      </nav>

      <main class="outlet">{children}</main>
    </div>
  )
}
