import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { Domain, MediaJob, Role, UserAccount } from '../data/types'
import { Modal } from '../components/Modal'
import { Icon } from '../components/Icon'
import { JobTray } from '../components/JobTray'
import { Toast } from '../components/Toast'
import { downloadJobFile } from './jobActions'
import { useJobs } from './useJobs'
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
      { route: 'shares', label: 'Nedladdningar', icon: 'download' },
    ],
  },
  {
    label: 'Sändning',
    items: [
      { route: 'live', label: 'Live', icon: 'podcasts' },
      // Videoarkivet gömt tillsvidare (Anders, 2026-10-01) — inspelningar
      // ska alltid höra till ett projekt, inget fristående videobibliotek.
      // Routen/vyn finns kvar orörd, bara navigationsgenvägen bort.
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
  /** Kontextuell knapp bredvid "Projekt" i navmenyn — "+ Ny" i listläge, "Livesändning"/"Ondemand" när ett projekt är öppet. Null döljer knappen (t.ex. på andra vyer). */
  projectsNavAction: { label: string; onClick: () => void } | null
  onLogout: () => void
  /** Öppnar ett projekt i Projekt-vyn (jobbfältets "Öppna projektet"). */
  onOpenProject: (projectId: string) => void
  /** "Projekt" i menyn: tillbaka till projektlistan, även om ett projekt är öppet (UNG-18). */
  onOpenProjectList: () => void
  currentUserId: string
  currentUserRoles: Role[]
  contentLocked?: boolean
}

interface ShellToast {
  message: string
  actionLabel?: string
  onAction?: () => void
}

export function Shell({ active, children, projectsNavAction, onLogout, onOpenProject, onOpenProjectList, currentUserId, currentUserRoles, contentLocked = false }: ShellProps) {
  const [navOpen, setNavOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)
  const [currentDomain, setCurrentDomain] = useState<Domain | null>(null)
  const [showAccount, setShowAccount] = useState(false)
  const [toast, setToast] = useState<ShellToast | null>(null)
  // Stabil referens: Toasten startar om sin timer när onDismiss byter identitet, och jobbfältet renderar om ofta.
  const dismissToast = useCallback(() => setToast(null), [])
  // Toast när ett jobb jag startat blir klart; jobbfältet visar alla domänens jobb.
  const jobs = useJobs((job) => {
    if (job.startedByUserId !== currentUserId) return
    setToast(describeFinishedJob(job, onOpenProject, (message) => setToast({ message })))
  })
  const isRootAdmin = currentUserRoles.includes('rootAdmin')
  const visibleGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isRootAdmin || ['projects', 'agendas', 'namelists', 'shares', 'trash'].includes(item.route)),
    }))
    .filter((group) => group.items.length > 0)

  useEffect(() => {
    client.users.get(currentUserId).then((u) => u && setCurrentUser(u))
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
          <img class="brand-logo theme-light-only" src={logoLightUrl} alt="ungap" />
          <img class="brand-logo theme-dark-only" src={logoDarkUrl} alt="ungap" />
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
                    onClick={() => {
                      setNavOpen(false)
                      if (item.route === 'projects') onOpenProjectList()
                    }}
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

        <JobTray jobs={jobs} onOpenProject={onOpenProject} />

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
          onClose={() => setShowAccount(false)}
          onSaved={onAccountSaved}
        />
      )}

      <main class={`outlet${contentLocked ? ' content-locked' : ''}`}>{children}</main>

      {toast && (
        <Toast
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          onDismiss={dismissToast}
          durationMs={10000}
        />
      )}
    </div>
  )
}

function describeFinishedJob(
  job: MediaJob,
  onOpenProject: (projectId: string) => void,
  showMessage: (message: string) => void,
): ShellToast {
  const name = job.projectName ?? job.recordingName ?? 'inspelningen'
  if (job.state === 'error') {
    return { message: `${job.kind === 'download' ? 'Nedladdningen' : 'Bearbetningen'} av ${name} misslyckades.` }
  }
  if (job.kind === 'download') {
    return {
      message: `Nedladdningen av ${name} är klar.`,
      actionLabel: 'Ladda ner',
      onAction: () => {
        downloadJobFile(job).catch((error) => showMessage(error instanceof Error ? error.message : 'Nedladdningen misslyckades.'))
      },
    }
  }
  return {
    message: `Videon för ${name} är bearbetad och väntar på granskning.`,
    actionLabel: job.projectId ? 'Öppna projektet' : undefined,
    onAction: job.projectId ? () => onOpenProject(job.projectId!) : undefined,
  }
}

interface MyAccountDialogProps {
  user: UserAccount
  domain: Domain | null
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

function MyAccountDialog({ user, domain, onClose, onSaved }: MyAccountDialogProps) {
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
