import { t } from '@lingui/core/macro'
import { LanguageSwitch } from './LanguageSwitch'
import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { Domain, MediaJob, Role, UserAccount } from '../data/types'
import { Modal } from '../components/Modal'
import { Icon } from '../components/Icon'
import { JobStatusBlock } from '../components/JobStatusBlock'
import { Toast } from '../components/Toast'
import { downloadJobFile, downloadManuscriptFile } from './jobActions'
import { JobsContext } from './jobsContext'
import { countNewFinished, readJobsSeenAt, storeJobsSeenAt } from './jobsSeen'
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

function navGroups(): NavGroup[] {
  return [
  {
    label: t`Content`,
    items: [
      { route: 'projects', label: t`Projects`, icon: 'folder_open' },
      { route: 'agendas', label: t`Agendas`, icon: 'event_note' },
      { route: 'namelists', label: t`Name lists`, icon: 'group' },
      { route: 'jobs', label: t`Jobs`, icon: 'task_alt' },
    ],
  },
  {
    label: t`Broadcast`,
    items: [
      { route: 'live', label: t({ message: 'Live', context: 'navigation' }), icon: 'podcasts' },
      // Videoarkivet gömt tillsvidare (Anders, 2026-10-01) — inspelningar
      // ska alltid höra till ett projekt, inget fristående videobibliotek.
      // Routen/vyn finns kvar orörd, bara navigationsgenvägen bort.
    ],
  },
  {
    label: t`Administration`,
    items: [
      { route: 'trash', label: t`Trash`, icon: 'delete' },
      { route: 'users', label: t`Users`, icon: 'manage_accounts' },
    ],
  },
  ]
}

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
  /** UNG-322: framed by ungap Shell, which owns the menu, the account and logging out; only the content is shown. */
  embedded?: boolean
}

interface ShellToast {
  message: string
  actionLabel?: string
  onAction?: () => void
}

export function Shell({ active, children, projectsNavAction, onLogout, onOpenProject, onOpenProjectList, currentUserId, currentUserRoles, contentLocked = false, embedded = false }: ShellProps) {
  const [navOpen, setNavOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)
  const [currentDomain, setCurrentDomain] = useState<Domain | null>(null)
  const [showAccount, setShowAccount] = useState(false)
  const [toast, setToast] = useState<ShellToast | null>(null)
  // Stabil referens: Toasten startar om sin timer när onDismiss byter identitet, och jobbfältet renderar om ofta.
  const dismissToast = useCallback(() => setToast(null), [])
  // Toast när ett jobb jag startat blir klart; jobbfältet visar alla domänens jobb.
  const jobs = useJobs((job) => {
    // Ett jobb jag själv avbrutit ska inte ge någon toast.
    if (job.startedByUserId !== currentUserId || job.state === 'canceled') return
    setToast(describeFinishedJob(job, onOpenProject, (message) => setToast({ message })))
  })
  // UNG-100: "nya" klara jobb = de som blivit klara sedan senaste besöket i Jobb. Första gången sätts tidpunkten till nu,
  // så redan klara jobb inte blinkar fram som nya.
  const [seenAt, setSeenAt] = useState(() => {
    const stored = readJobsSeenAt(currentUserId)
    if (stored !== null) return stored
    const now = Date.now()
    storeJobsSeenAt(currentUserId, now)
    return now
  })
  useEffect(() => {
    if (active !== 'jobs') return
    const now = Date.now()
    setSeenAt(now)
    storeJobsSeenAt(currentUserId, now)
  }, [active, jobs, currentUserId])
  const activeJobs = jobs.filter((job) => job.state === 'processing').length
  const newFinished = active === 'jobs' ? 0 : countNewFinished(jobs, seenAt)
  const isRootAdmin = currentUserRoles.includes('rootAdmin')
  const visibleGroups = navGroups()
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isRootAdmin || ['projects', 'agendas', 'namelists', 'jobs', 'trash'].includes(item.route)),
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
    <div class={`shell${embedded ? ' embedded' : ''}`}>
      {!embedded && (
      <>
      <button
        class="nav-toggle"
        aria-label={t`Open menu`}
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
                    {item.route === 'jobs' && activeJobs > 0 && <span class="nav-badge nav-badge-active" title={t`${activeJobs} in progress`}>{activeJobs}</span>}
                    {item.route === 'jobs' && activeJobs === 0 && newFinished > 0 && <span class="nav-badge nav-badge-new" title={t`${newFinished} done`}>{newFinished}</span>}
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

        <JobStatusBlock jobs={jobs} newFinished={newFinished} />

        <div class="nav-user">
          <div class="nav-user-identity">
            <Icon name="account_circle" size={28} />
            <div class="nav-user-text">
              <div class="nav-user-toprow">
                <span class="nav-user-name">{currentUser?.name ?? '…'}</span>
                <button
                  class="ib nav-user-settings"
                  type="button"
                  title={t`Account settings`}
                  aria-label={t`Account settings`}
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
              {t`Log out`}
            </button>
          </div>
        </div>
      </nav>
      </>
      )}

      {showAccount && currentUser && (
        <MyAccountDialog
          user={currentUser}
          domain={currentDomain}
          onClose={() => setShowAccount(false)}
          onSaved={onAccountSaved}
        />
      )}

      <main class={`outlet${contentLocked ? ' content-locked' : ''}`}>
        <JobsContext.Provider value={jobs}>{children}</JobsContext.Provider>
      </main>

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
  const name = job.projectName ?? job.recordingName ?? t`the recording`
  if (job.state === 'error') {
    if (job.kind === 'download') return { message: t`The download for ${name} failed.` }
    if (job.kind === 'captions') return { message: t`The captions for ${name} failed.` }
    if (job.kind === 'speakers') return { message: t`The speaker change analysis for ${name} failed.` }
    return { message: t`The processing for ${name} failed.` }
  }
  if (job.kind === 'captions') {
    return {
      message: t`The caption draft for ${name} is ready and waiting for review.`,
      actionLabel: job.projectId ? t`Open the project` : undefined,
      onAction: job.projectId ? () => onOpenProject(job.projectId!) : undefined,
    }
  }
  if (job.kind === 'speakers') {
    return {
      message: t`The speaker changes for ${name} are analysed. The Word transcript can be downloaded with speakers.`,
      actionLabel: job.projectId ? t`Download Word transcript` : undefined,
      onAction: job.projectId
        ? () => { downloadManuscriptFile(job).catch((error) => showMessage(error instanceof Error ? error.message : t`The transcript could not be created.`)) }
        : undefined,
    }
  }
  if (job.kind === 'download') {
    return {
      message: t`The download of ${name} is ready.`,
      actionLabel: t`Download`,
      onAction: () => {
        downloadJobFile(job).catch((error) => showMessage(error instanceof Error ? error.message : t`The download failed.`))
      },
    }
  }
  return {
    message: t`The video for ${name} is processed and waiting for review.`,
    actionLabel: job.projectId ? t`Open the project` : undefined,
    onAction: job.projectId ? () => onOpenProject(job.projectId!) : undefined,
  }
}

interface MyAccountDialogProps {
  user: UserAccount
  domain: Domain | null
  onClose: () => void
  onSaved: (user: UserAccount) => void
}

function statusLabels(): Record<UserAccount['status'], string> {
  return {
    notinvited: t`Not invited`,
    active: t`Active`,
    invited: t`Invited`,
    disabled: t`Disabled`,
  }
}

function themeOptions(): { value: ThemePreference; label: string }[] {
  return [
    { value: 'light', label: t`Light` },
    { value: 'dark', label: t`Dark` },
    { value: 'auto', label: t`Auto` },
  ]
}

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
      title={t`My account`}
      onClose={onClose}
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onClose}>
            {t`Close`}
          </button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!dirty || saving} onClick={save}>
            {saving ? t`Saving…` : t`Save`}
          </button>
        </>
      }
    >
      <label class="account-name-field">
        {t`Name`}
        <input class="rename-input" value={name} autoFocus onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <div class="grid">
        <div>
          <div class="k">{t`Email`}</div>
          <div class="v">{user.email}</div>
        </div>
        <div>
          <div class="k">{t`Status`}</div>
          <div class="v">{statusLabels()[user.status]}</div>
        </div>
        <div>
          <div class="k">{t`Organisation`}</div>
          <div class="v">{domain?.host ?? '–'}</div>
        </div>
      </div>
      <div class="block">
        <h3>{t`Contract period`}</h3>
        <div class="v">
          {formatDate(domain?.contractStart)} – {formatDate(domain?.contractEnd)}
        </div>
      </div>
      <div class="block">
        <h3>{t`Language`}</h3>
        {/* UNG-306: saved on the account, so the console is in this language on every computer. */}
        <LanguageSwitch onChange={(locale) => void client.auth.setLanguage(locale).catch(() => undefined)} />
      </div>
      <div class="block">
        <h3>{t`Appearance`}</h3>
        <div class="theme-seg">
          {themeOptions().map((option) => (
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
