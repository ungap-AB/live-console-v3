import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { Domain, UserAccount } from '../data/types'
import { Modal } from '../components/Modal'
import { GearIcon } from '../components/icons'
import { formatDate } from './time'
import { routeHref, type RouteKey } from './router'
import './Shell.css'

// Matchar AuthController.FakeUser / TrashPolicy.FakeCurrentUserId på
// servern — steg 1 har ingen riktig inloggad användare, se
// PLAN-live-server-v3.md.
const CURRENT_USER_ID = 'u1'

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
  showPlayoutShortcut: boolean
  onLogout: () => void
}

export function Shell({ active, children, onPlayoutShortcut, showPlayoutShortcut, onLogout }: ShellProps) {
  const [navOpen, setNavOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)
  const [currentDomain, setCurrentDomain] = useState<Domain | null>(null)
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)
  const [showAccount, setShowAccount] = useState(false)

  useEffect(() => {
    client.users.get(CURRENT_USER_ID).then((u) => u && setCurrentUser(u))
    client.channels.quota().then(setQuota)
  }, [])

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
                  {item.quickAction && showPlayoutShortcut && (
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
          <div class="nav-user-name">{currentUser?.name ?? '…'}</div>
          <div class="nav-user-domain">{currentDomain?.host ?? ''}</div>
          <div class="nav-user-row">
            <button class="btn btn-sm" type="button" onClick={onLogout}>
              Logga ut
            </button>
            <button
              class="ib nav-user-settings"
              type="button"
              title="Kontoinställningar"
              aria-label="Kontoinställningar"
              onClick={() => setShowAccount(true)}
            >
              <GearIcon />
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

      <main class="outlet">{children}</main>
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
  active: 'Aktiv',
  invited: 'Inbjuden',
  disabled: 'Inaktiverad',
}

function MyAccountDialog({ user, domain, quota, onClose, onSaved }: MyAccountDialogProps) {
  const [name, setName] = useState(user.name)
  const [saving, setSaving] = useState(false)
  const dirty = name.trim().length > 0 && name.trim() !== user.name

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
    </Modal>
  )
}
