import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { Domain, Role, UserAccount } from '../data/types'
import { Modal } from '../components/Modal'
import { Icon } from '../components/Icon'
import { formatDate } from './time'
import { routeHref, type RouteKey } from './router'
import { getStoredThemePreference, setThemePreference, type ThemePreference } from './theme'
import logoLightUrl from '../images/ungap-presenter-2026-black.png'
import logoDarkUrl from '../images/ungap-presenter-2026-white.png'
import './Shell.css'

interface NavItem {
  route: RouteKey
  label: string
  icon: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Innehåll',
    items: [
      { route: 'projects', label: 'Projekt', icon: 'folder_open' },
      { route: 'agendas', label: 'Dagordningar', icon: 'event_note' },
      { route: 'namelists', label: 'Namnlistor', icon: 'group' },
    ],
  },
  {
    label: 'Sändning',
    items: [
      { route: 'live', label: 'Live', icon: 'podcasts' },
      { route: 'archive', label: 'Videoarkiv', icon: 'video_library' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { route: 'trash', label: 'Papperskorg', icon: 'delete' },
      { route: 'users', label: 'Användare', icon: 'manage_accounts' },
    ],
  },
]

interface ShellProps {
  active: RouteKey
  children: ComponentChildren
  /** Kontextuell knapp bredvid "Projekt" i navmenyn — "+ Ny" i listläge, "Playout" när en sändning är öppen. Null döljer knappen (t.ex. på andra vyer). */
  projectsNavAction: { label: string; onClick: () => void } | null
  onLogout: () => void
  currentUserId: string
  currentUserRoles: Role[]
  contentLocked?: boolean
}

export function Shell({ active, children, projectsNavAction, onLogout, currentUserId, currentUserRoles, contentLocked = false }: ShellProps) {
  const [navOpen, setNavOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)
  const [currentDomain, setCurrentDomain] = useState<Domain | null>(null)
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)
  const [showAccount, setShowAccount] = useState(false)
  const isRootAdmin = currentUserRoles.includes('rootAdmin')
  const visibleGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isRootAdmin || ['projects', 'agendas', 'namelists', 'trash'].includes(item.route)),
    }))
    .filter((group) => group.items.length > 0)

  useEffect(() => {
    client.users.get(currentUserId).then((u) => u && setCurrentUser(u))
    client.channels.quota().then(setQuota)
  }, [currentUserId])

  useEffect(() => {
    if (!currentUser) return
    client.domains.list().then((all) => setCurrentDomain(all.find((d) => d.id === currentUser.domainId) ?? null))
  }, [currentUser?.domainId])

  function onAccountSaved(updated: UserAccount) {
    setCurrentUser(updated)
    setShowAccount(false)
  }

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
        <div class="brand">
          <img class="brand-logo theme-light-only" src={logoLightUrl} alt="Ungap" />
          <img class="brand-logo theme-dark-only" src={logoDarkUrl} alt="Ungap" />
        </div>

        <div class="nav-groups">
          {visibleGroups.map((group) => (
            <div class="nav-group" key={group.label}>
              <div class="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <div key={item.route} class="nav-row">
                  <a
                    href={routeHref(item.route)}
                    class={`nav-item ${active === item.route ? 'sel' : ''}`}
                    onClick={() => setNavOpen(false)}
                  >
                    <Icon name={item.icon} size={18} />
                    {item.label}
                  </a>
                  {item.route === 'projects' && projectsNavAction && (
                    <button
                      type="button"
                      class="nav-quick"
                      onClick={() => {
                        setNavOpen(false)
                        projectsNavAction.onClick()
                      }}
                    >
                      {projectsNavAction.label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div class="nav-user">
          <div class="nav-user-identity">
            <Icon name="account_circle" size={28} />
            <div class="nav-user-text">
              <div class="nav-user-toprow">
                <span class="nav-user-name">{currentUser?.name ?? '…'}</span>
                <button
                  class="ib nav-user-settings"
                  type="button"
                  title="Kontoinställningar"
                  aria-label="Kontoinställningar"
                  onClick={() => setShowAccount(true)}
                >
                  <Icon name="settings" size={17} />
                </button>
              </div>
              <div class="nav-user-domain">{currentDomain?.host ?? ''}</div>
            </div>
          </div>
          <div class="nav-user-row">
            <button class="btn btn-sm" type="button" onClick={onLogout}>
              Logga ut
            </button>
          </div>
        </div>
      </nav>

      {showAccount && currentUser && (
        <MyAccountDialog
          user={currentUser}
          domain={currentDomain}
          quota={quota}
          onClose={() => setShowAccount(false)}
          onSaved={onAccountSaved}
        />
      )}

      <main class={`outlet${contentLocked ? ' content-locked' : ''}`}>{children}</main>
    </div>
  )
}

interface MyAccountDialogProps {
  user: UserAccount
  domain: Domain | null
  quota: { used: number; limit: number } | null
  onClose: () => void
  onSaved: (user: UserAccount) => void
}

const STATUS_LABEL: Record<UserAccount['status'], string> = {
  notinvited: 'Ej inbjuden',
  active: 'Aktiv',
  invited: 'Inbjuden',
  disabled: 'Inaktiverad',
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Ljust' },
  { value: 'dark', label: 'Mörkt' },
  { value: 'auto', label: 'Auto' },
]

function MyAccountDialog({ user, domain, quota, onClose, onSaved }: MyAccountDialogProps) {
  const [name, setName] = useState(user.name)
  const [saving, setSaving] = useState(false)
  const [theme, setTheme] = useState<ThemePreference>(getStoredThemePreference)
  const dirty = name.trim().length > 0 && name.trim() !== user.name

  function chooseTheme(value: ThemePreference) {
    setTheme(value)
    setThemePreference(value)
  }

  async function save() {
    if (!dirty) return
    setSaving(true)
    try {
      const updated = await client.users.update(user.id, { name: name.trim() })
      onSaved(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Mitt konto"
      onClose={onClose}
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onClose}>
            Stäng
          </button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
        </>
      }
    >
      <label class="account-name-field">
        Namn
        <input class="rename-input" value={name} autoFocus onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <div class="grid">
        <div>
          <div class="k">E-post</div>
          <div class="v">{user.email}</div>
        </div>
        <div>
          <div class="k">Status</div>
          <div class="v">{STATUS_LABEL[user.status]}</div>
        </div>
        <div>
          <div class="k">Domän</div>
          <div class="v">{domain?.host ?? '–'}</div>
        </div>
      </div>
      <div class="block">
        <h3>Avtalsperiod</h3>
        <div class="v">
          {formatDate(domain?.contractStart)} – {formatDate(domain?.contractEnd)}
        </div>
      </div>
      <div class="block">
        <h3>Kvarvarande kvot (live-resurser)</h3>
        <div class="v">{quota ? `${quota.limit - quota.used} av ${quota.limit} lediga` : '…'}</div>
      </div>
      <div class="block">
        <h3>Utseende</h3>
        <div class="theme-seg">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={theme === option.value}
              onClick={() => chooseTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
