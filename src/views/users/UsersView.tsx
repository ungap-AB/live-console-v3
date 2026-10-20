import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import { currentLocale, type ChosenLocale } from '../../i18n'
import type { Domain, Role, UserAccount } from '../../data/types'
import { useResource } from '../../app/useResource'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Modal } from '../../components/Modal'
import { OverflowMenu } from '../../components/OverflowMenu'
import { RenameModal } from '../../components/RenameModal'
import { Toast } from '../../components/Toast'
import { EditIcon } from '../../components/icons'
import { formatDate, formatDateTime } from '../../app/time'
import './UsersView.css'
import { errorMessage, runOptimistic } from '../../app/optimistic'

const ROLES: Record<Role, { label: MessageDescriptor; description: MessageDescriptor }> = {
  rootAdmin: { label: msg`Root administrator`, description: msg`Manages the whole installation and all domains.` },
  domainAdmin: { label: msg`Domain administrator`, description: msg`Works operationally within their domain.` },
  operator: { label: msg`Operator`, description: msg`Creates projects, broadcasts and publishes on demand.` },
}

function roleLabel(role: Role): string {
  return i18n._(ROLES[role].label)
}

function roleDescription(role: Role): string {
  return i18n._(ROLES[role].description)
}

const ROLE_ORDER: Role[] = ['domainAdmin', 'operator']

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function isLastActiveAdmin(user: UserAccount, domainUsers: UserAccount[]): boolean {
  if (!user.roles.includes('domainAdmin') || user.status !== 'active') return false
  const activeAdmins = domainUsers.filter((u) => u.roles.includes('domainAdmin') && u.status === 'active')
  return activeAdmins.length === 1
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function isValidDomain(value: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value.trim())
}

export function UsersView({ currentDomainId, canManageDomains }: { currentDomainId: string; canManageDomains: boolean }) {
  const domainsResource = useResource(() => client.domains.list(), [])
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState<UserAccount | null>(null)
  const [renamingUser, setRenamingUser] = useState<UserAccount | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<UserAccount | null>(null)
  const [creatingDomain, setCreatingDomain] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [resendingInvite, setResendingInvite] = useState(false)
  const [viewingDomain, setViewingDomain] = useState<Domain | null>(null)
  const [confirmDeleteDomain, setConfirmDeleteDomain] = useState<Domain | null>(null)

  useEffect(() => {
    if (domainsResource.data) setDomains(domainsResource.data)
  }, [domainsResource.data])

  useEffect(() => {
    if (domains.length > 0 && (!selectedDomainId || !domains.some((domain) => domain.id === selectedDomainId))) {
      setSelectedDomainId(currentDomainId)
    }
  }, [currentDomainId, domains, selectedDomainId])

  const usersResource = useResource(
    () => (selectedDomainId ? client.users.listByDomain(selectedDomainId) : Promise.resolve([])),
    [selectedDomainId],
  )
  const [domainUsers, setDomainUsers] = useState<UserAccount[]>([])

  useEffect(() => {
    setDomainUsers(usersResource.data ?? [])
  }, [usersResource.data])

  function selectDomain(id: string) {
    if (!canManageDomains && id !== currentDomainId) return
    setSelectedDomainId(id)
    setSelectedUserId(null)
  }

  function selectUser(id: string) {
    setSelectedUserId(id)
  }

  // The list is deliberately light (no activity log) — full details are fetched
  // separately when something is selected, see PLAN-live-server-v3.md step 2.
  const userDetailResource = useResource(
    () => (selectedUserId ? client.users.get(selectedUserId) : Promise.resolve(undefined)),
    [selectedUserId],
  )
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserAccount | null>(null)

  useEffect(() => {
    setSelectedUserDetail(selectedUserId ? userDetailResource.data ?? null : null)
  }, [selectedUserId, userDetailResource.data])

  function replace(next: UserAccount) {
    setSelectedUserDetail(next)
    setDomainUsers((prev) =>
      prev.map((u) =>
        u.id === next.id
          ? { ...u, name: next.name, email: next.email, roles: next.roles, status: next.status, ssoEnabled: next.ssoEnabled }
          : u,
      ),
    )
  }

  async function withErrorToast(fn: () => Promise<void>) {
    try {
      await fn()
    } catch (err) {
      setToast(err instanceof Error ? err.message : t`Something went wrong.`)
    }
  }

  // UNG-105: the new name shows immediately; on failure it is restored and a toast shows the error.
  function patchUserName(id: string, name: string) {
    setSelectedUserDetail((prev) => (prev && prev.id === id ? { ...prev, name } : prev))
    setDomainUsers((prev) => prev.map((u) => (u.id === id ? { ...u, name } : u)))
  }

  function renameUser(user: UserAccount, name: string) {
    setRenamingUser(null)
    void runOptimistic({
      key: `user:${user.id}`,
      apply: () => {
        patchUserName(user.id, name)
        return () => patchUserName(user.id, user.name)
      },
      request: () => client.users.update(user.id, { name }),
      onSuccess: replace,
      onError: (err) => setToast(errorMessage(err)),
    })
  }

  async function toggleRole(user: UserAccount, role: Role, checked: boolean) {
    if (!checked || user.roles.includes('rootAdmin')) return
    const nextRoles = [role]
    await withErrorToast(async () => {
      const updated = await client.users.setRoles(user.id, nextRoles)
      replace(updated)
    })
  }

  async function disable(user: UserAccount) {
    await withErrorToast(async () => {
      const updated = await client.users.disable(user.id)
      replace(updated)
    })
    setConfirmDisable(null)
  }

  async function enable(user: UserAccount) {
    const updated = await client.users.enable(user.id)
    replace(updated)
  }

  async function remove(user: UserAccount) {
    await withErrorToast(async () => {
      await client.users.remove(user.id)
      setDomainUsers((prev) => prev.filter((u) => u.id !== user.id))
      setSelectedUserId(null)
      client.domains.list().then(setDomains)
    })
    setConfirmRemove(null)
  }

  async function sendPasswordReset(user: UserAccount) {
    await client.users.sendPasswordReset(user.id)
    const email = user.email
    setToast(t`A reset email has been sent to ${email}. The link is valid for one hour.`)
  }

  function onInvited(user: UserAccount) {
    replace(user)
    setInviting(false)
    const email = user.email
    setToast(t`Invitation sent to ${email}. The text is copied.`)
  }

  function onUserCreated(user: UserAccount) {
    setDomainUsers((prev) => [...prev, user])
    setDomains((prev) => prev.map((d) => (d.id === user.domainId ? { ...d, userCount: d.userCount + 1 } : d)))
    setCreatingUser(false)
    setSelectedUserId(user.id)
  }

  async function createDomain(host: string, org: string) {
    const created = await client.domains.create({ host, org })
    setDomains((prev) => [...prev, created])
    setSelectedDomainId(created.id)
    setCreatingDomain(false)
  }

  async function saveDomain(org: string, contractStart: string, contractEnd: string, muxEnvKey: string) {
    if (!viewingDomain) return
    const updated = await client.domains.update(viewingDomain.id, {
      org,
      contractStart,
      contractEnd,
      muxEnvKey,
    })
    setDomains((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setViewingDomain(updated)
    setToast(t`Domain updated.`)
  }

  function requestDeleteDomain() {
    if (!viewingDomain) return
    setConfirmDeleteDomain(viewingDomain)
    setViewingDomain(null)
  }

  async function deleteDomain(domain: Domain) {
    try {
      await client.domains.remove(domain.id)
      setDomains((prev) => prev.filter((d) => d.id !== domain.id))
      if (selectedDomainId === domain.id) setSelectedDomainId(null)
      const organization = domain.org
      setToast(t`${organization} removed.`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : t`Could not remove the domain.`)
    } finally {
      setConfirmDeleteDomain(null)
    }
  }

  const visibleUsers = [...domainUsers].sort((a, b) => a.name.localeCompare(b.name, i18n.locales))

  const selectedUser = selectedUserDetail
  const disableName = confirmDisable?.name ?? ''
  const removeName = confirmRemove?.name ?? ''
  const deleteOrganization = confirmDeleteDomain?.org ?? ''
  const deleteHost = confirmDeleteDomain?.host ?? ''
  const selectedDomain = domains.find((d) => d.id === selectedDomainId) ?? null

  return (
    <div class="view">
      <header>
        <div>
          <h1>{t`Users`}</h1>
        </div>
      </header>

      <div class="content">
        <div class="three">
          <section class="pane" aria-label={t`Domains`}>
            <div class="top">
              <h2>{t`Domains`}</h2>
              <button class="btn btn-sm" type="button" onClick={() => setCreatingDomain(true)}>
                {t`+ New`}
              </button>
            </div>
            <ul>
              {domains.map((d) => (
                <li key={d.id} class={`domain-row ${d.id === selectedDomainId ? 'sel' : ''}`}>
                  <button class="user-row dom" type="button" onClick={() => selectDomain(d.id)}>
                    <span class="nm">
                      {d.host}
                      <span class="org">{d.org}</span>
                    </span>
                    <span class="pill">{d.userCount}</span>
                  </button>
                  <button
                    class="ib domain-menu-btn"
                    type="button"
                    title={t`Details`}
                    aria-label={t`Details`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setViewingDomain(d)
                    }}
                  >
                    ⋯
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section class="pane" aria-label={t`Users`}>
            <div class="top">
              <h2>{t`Users`}</h2>
              <button class="btn btn-sm" type="button" disabled={!selectedDomainId} onClick={() => setCreatingUser(true)}>
                {t`+ New`}
              </button>
            </div>
            <ul>
              {usersResource.loading && domainUsers.length === 0 && <li class="none">{t`Loading…`}</li>}
              {!usersResource.loading && visibleUsers.length === 0 && (
                <li class="none">{t`The domain has no users.`}</li>
              )}
              {visibleUsers.map((u) => (
                <li key={u.id} class={u.id === selectedUserId ? 'sel' : ''}>
                  <button class="user-row" type="button" onClick={() => selectUser(u.id)}>
                    <span class="avatar">{initials(u.name)}</span>
                    <span class="uinfo">
                      <span class="un">{u.name}</span>
                      <span class="ue">{u.roles.map((r) => roleLabel(r)).join(', ')}</span>
                    </span>
                    {u.status === 'invited' && <StatusChip tone="warn">{t`Invited`}</StatusChip>}
                    {u.status === 'notinvited' && <StatusChip tone="neutral">{t`Not invited`}</StatusChip>}
                    {u.status === 'disabled' && <StatusChip tone="neutral">{t`Inactive`}</StatusChip>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section class="doc users-doc" aria-label={t`User details`}>
            {!selectedUserId ? (
              <div class="docnone">{t`Select a user in the list.`}</div>
            ) : !selectedUser ? (
              <div class="docnone">{t`Loading…`}</div>
            ) : (
              <UserDetail
                user={selectedUser}
                domain={selectedDomain}
                lastAdmin={isLastActiveAdmin(selectedUser, domainUsers)}
                onToggleRole={(role, checked) => toggleRole(selectedUser, role, checked)}
                onDisable={() => setConfirmDisable(selectedUser)}
                onEnable={() => enable(selectedUser)}
                onRemove={() => setConfirmRemove(selectedUser)}
                onInvite={() => {
                  setResendingInvite(false)
                  setInviting(true)
                }}
                onResendInvite={() => {
                  setResendingInvite(true)
                  setInviting(true)
                }}
                onSendPasswordReset={() => sendPasswordReset(selectedUser)}
                onRename={() => setRenamingUser(selectedUser)}
              />
            )}
          </section>
        </div>
      </div>

      {renamingUser && (
        <RenameModal
          title={t`Rename the user`}
          initialValue={renamingUser.name}
          onCancel={() => setRenamingUser(null)}
          onSave={(name) => renameUser(renamingUser, name)}
        />
      )}

      {confirmDisable && (
        <ConfirmModal
          title={t`Disable account?`}
          confirmLabel={t`Disable`}
          danger
          onCancel={() => setConfirmDisable(null)}
          onConfirm={() => disable(confirmDisable)}
        >
          <p>{t`Disable ${disableName}? The account cannot sign in but remains in the history.`}</p>
        </ConfirmModal>
      )}

      {confirmRemove && (
        <ConfirmModal
          title={t`Remove user?`}
          confirmLabel={t`Remove`}
          danger
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => remove(confirmRemove)}
        >
          <p>{t`Remove ${removeName} completely? From now on the history shows only the name, without an account.`}</p>
        </ConfirmModal>
      )}

      {creatingDomain && (
        <CreateDomainModal onCancel={() => setCreatingDomain(false)} onSave={createDomain} />
      )}

      {inviting && selectedDomain && selectedUser && (
        <InviteDialog
          domain={selectedDomain}
          user={selectedUser}
          resend={resendingInvite}
          onCancel={() => setInviting(false)}
          onSent={onInvited}
        />
      )}

      {creatingUser && selectedDomain && (
        <CreateUserDialog
          domain={selectedDomain}
          onCancel={() => setCreatingUser(false)}
          onCreated={onUserCreated}
        />
      )}

      {viewingDomain && (
        <DomainDetailsDialog
          domain={viewingDomain}
          onClose={() => setViewingDomain(null)}
          onSave={saveDomain}
          onRequestDelete={requestDeleteDomain}
        />
      )}

      {confirmDeleteDomain && (
        <ConfirmModal
          title={t`Delete domain?`}
          confirmLabel={t`Delete domain`}
          danger
          onCancel={() => setConfirmDeleteDomain(null)}
          onConfirm={() => deleteDomain(confirmDeleteDomain)}
        >
          <p>{t`${deleteOrganization} (${deleteHost}) is removed permanently. It cannot be undone.`}</p>
        </ConfirmModal>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

interface CreateDomainModalProps {
  onCancel: () => void
  onSave: (host: string, org: string) => void
}

function CreateDomainModal({ onCancel, onSave }: CreateDomainModalProps) {
  const [host, setHost] = useState('')
  const [org, setOrg] = useState('')
  const domainIsValid = isValidDomain(host)
  const organizationIsValid = org.trim().length > 0
  const canSave = domainIsValid && organizationIsValid

  return (
    <Modal title={t`New domain`} onClose={onCancel}>
      <div class="domain-form">
        <label>
          {t`Organization name`}
          <input
            class="rename-input"
            value={org}
            placeholder={t`e.g. Example Municipality`}
            autoFocus
            onInput={(e) => setOrg(e.currentTarget.value)}
          />
        </label>
        <label>
          {t`Domain`}
          <input
            class="rename-input"
            value={host}
            placeholder={t`e.g. example.com`}
            onInput={(e) => setHost(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) onSave(host.trim(), org.trim())
            }}
          />
        </label>
        {host.trim().length > 0 && !domainIsValid && <p class="note warn">{t`Enter a valid domain name, for example example.com.`}</p>}
        {org.length > 0 && !organizationIsValid && <p class="note warn">{t`Enter the organization name.`}</p>}
      </div>
      <div class="modal-actions">
        <span class="invite-pin-hint">{t`The PIN becomes valid only when the invitation has been sent`}</span>
        <button class="btn btn-sm" type="button" onClick={onCancel}>
          {t`Cancel`}
        </button>
        <button
          class="btn btn-sm btn-primary"
          type="button"
          disabled={!canSave}
          onClick={() => onSave(host.trim(), org.trim())}
        >
          {t`Create`}
        </button>
      </div>
    </Modal>
  )
}

interface CreateUserDialogProps {
  domain: Domain
  onCancel: () => void
  onCreated: (user: UserAccount) => void
}

function CreateUserDialog({ domain, onCancel, onCreated }: CreateUserDialogProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('operator')
  // UNG-306: the new user's language (the invitation email and the first login); default: the admin's own.
  const [language, setLanguage] = useState<ChosenLocale>(currentLocale)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSave = isValidEmail(email) && name.trim().length > 0 && !saving
  const host = domain.host

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const user = await client.domains.createUser(domain.id, { email: email.trim(), name: name.trim(), roles: [role], language })
      onCreated(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not create the user.`)
      setSaving(false)
    }
  }

  return (
    <Modal title={t`New user in ${host}`} onClose={onCancel}>
      <div class="domain-form">
        <label>
          {t`Name`}
          <input
            class="rename-input"
            value={name}
            placeholder={t`First and last name`}
            autoFocus
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <label>
          {t`Email`}
          <input
            class="rename-input"
            type="email"
            value={email}
            placeholder={t`name@example.com`}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </label>
        <label>
          {t`Permission`}
          <select class="rename-input" value={role} onChange={(e) => setRole(e.currentTarget.value as Role)}>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t`Language`}
          <select class="rename-input" value={language} onChange={(e) => setLanguage(e.currentTarget.value as ChosenLocale)}>
            <option value="sv" lang="sv">Svenska</option>
            <option value="en" lang="en">English</option>
          </select>
        </label>
        {error && <p class="note warn">{error}</p>}
      </div>
      <div class="modal-actions">
        <button class="btn btn-sm" type="button" onClick={onCancel}>
          {t`Cancel`}
        </button>
        <button class="btn btn-sm btn-primary" type="button" disabled={!canSave} onClick={save}>
          {saving ? t`Saving…` : t`Save`}
        </button>
      </div>
    </Modal>
  )
}

interface InviteDialogProps {
  domain: Domain
  user: UserAccount
  resend: boolean
  onCancel: () => void
  onSent: (user: UserAccount) => void
}

function InviteDialog({ domain, user, resend, onCancel, onSent }: InviteDialogProps) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (sending) return
    setSending(true)
    setError(null)
    try {
      const updated = await (resend ? client.users.resendInvite(user.id) : client.users.sendInvitation(user.id))
      onSent(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not send the invitation.`)
      setSending(false)
    }
  }

  const host = domain.host
  const email = user.email

  return (
    <Modal title={t`Invite to ${host}`} onClose={onCancel} wide>
      <div class="invite-dialog">
        <div class="invite-fields">
          <label>
            {t`Email`}
            <input class="rename-input" type="email" readOnly value={user.email} />
          </label>
          <label>
            {t`Name`}
            <input class="rename-input" readOnly value={user.name} />
          </label>
          <label>
            {t`Permission`}
            <input class="rename-input" readOnly value={user.roles.map((r) => roleLabel(r)).join(', ')} />
          </label>
        </div>
        <p class="note">
          {t`A welcome email with a one-time link is sent to ${email}. The link is valid for 7 days. When the recipient clicks it, a personal PIN is created that is shown only once.`}
          {resend && ' ' + t`A new invitation replaces the previous one: the old link and PIN stop working.`}
        </p>
        {error && <p class="note warn">{error}</p>}
      </div>
      <div class="modal-actions">
        <button class="btn btn-sm" type="button" onClick={onCancel}>
          {t`Cancel`}
        </button>
        <button class="btn btn-sm btn-primary" type="button" disabled={sending} onClick={() => void send()}>
          {sending ? t`Sending…` : t`Send invitation`}
        </button>
      </div>
    </Modal>
  )
}

interface DomainDetailsDialogProps {
  domain: Domain
  onClose: () => void
  onSave: (org: string, contractStart: string, contractEnd: string, muxEnvKey: string) => Promise<void>
  onRequestDelete: () => void
}

function DomainDetailsDialog({ domain, onClose, onSave, onRequestDelete }: DomainDetailsDialogProps) {
  const [org, setOrg] = useState(domain.org)
  const [contractStart, setContractStart] = useState(domain.contractStart?.slice(0, 10) ?? '')
  const [contractEnd, setContractEnd] = useState(domain.contractEnd?.slice(0, 10) ?? '')
  const [muxEnvKey, setMuxEnvKey] = useState(domain.muxEnvKey ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = org.trim().length > 0 && (
    org.trim() !== domain.org ||
    muxEnvKey.trim() !== (domain.muxEnvKey ?? '') ||
    contractStart !== (domain.contractStart?.slice(0, 10) ?? '') ||
    contractEnd !== (domain.contractEnd?.slice(0, 10) ?? '')
  )

  async function save() {
    if (!dirty || !contractStart || !contractEnd || contractEnd < contractStart) return
    setSaving(true)
    try {
      await onSave(org.trim(), `${contractStart}T00:00:00.000Z`, `${contractEnd}T00:00:00.000Z`, muxEnvKey.trim())
    } finally {
      setSaving(false)
    }
  }

  const statsResource = useResource(async () => {
    const [agendas, namelists, projects, recordings] = await Promise.all([
      client.agendas.list(),
      client.namelists.list(),
      client.projects.list(),
      client.recordings.list(),
    ])
    const domainProjectIds = new Set(projects.filter((p) => p.domainId === domain.id).map((p) => p.id))
    const domainRecordings = recordings.filter((r) => r.project && domainProjectIds.has(r.project.id))
    return {
      projects: projects.filter((p) => p.domainId === domain.id).length,
      agendas: agendas.filter((a) => a.domainId === domain.id).length,
      namelists: namelists.filter((n) => n.domainId === domain.id).length,
      recordings: domainRecordings.length,
      broadcasts: domainRecordings.filter((r) => r.kind === 'original').length,
    }
  }, [domain.id])
  const stats = statsResource.data

  return (
    <Modal
      title={domain.host}
      onClose={onClose}
      footer={
        <>
          <button
            class="btn btn-sm btn-danger"
            type="button"
            disabled={domain.userCount > 0}
            title={domain.userCount > 0 ? t`The domain still has users and cannot be removed.` : undefined}
            onClick={onRequestDelete}
          >
            {t`Delete domain`}
          </button>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={onClose}>
            {t`Close`}
          </button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!dirty || saving} onClick={save}>
            {saving ? t`Saving…` : t`Save`}
          </button>
        </>
      }
    >
      <label class="domain-org-field">
        {t`Organization name`}
        <input class="rename-input" value={org} onInput={(e) => setOrg(e.currentTarget.value)} />
      </label>
      <div class="domain-form">
        <label>
          {t`Contract period from`}
          <input class="rename-input" type="date" value={contractStart} onInput={(e) => setContractStart(e.currentTarget.value)} />
        </label>
        <label>
          {t`Contract period to`}
          <input class="rename-input" type="date" value={contractEnd} onInput={(e) => setContractEnd(e.currentTarget.value)} />
        </label>
      </div>
      {contractStart && contractEnd && contractEnd < contractStart && <p class="note warn">{t`The end date must be after the start date.`}</p>}
      <label class="domain-org-field">
        {t`Mux env key (the customer's own Mux account)`}
        <input
          class="rename-input"
          value={muxEnvKey}
          placeholder={t`Leave empty for ungap's default key`}
          onInput={(e) => setMuxEnvKey(e.currentTarget.value)}
        />
      </label>
      <div class="grid">
        <div>
          <div class="k">{t`Users`}</div>
          <div class="v">{domain.userCount}</div>
        </div>
        <div>
          <div class="k">{t`Projects`}</div>
          <div class="v">{stats ? stats.projects : '…'}</div>
        </div>
        <div>
          <div class="k">{t`Broadcasts made`}</div>
          <div class="v">{stats ? stats.broadcasts : '…'}</div>
        </div>
        <div>
          <div class="k">{t`Recordings`}</div>
          <div class="v">{stats ? stats.recordings : '…'}</div>
        </div>
        <div>
          <div class="k">{t`Agendas`}</div>
          <div class="v">{stats ? stats.agendas : '…'}</div>
        </div>
        <div>
          <div class="k">{t`Name lists`}</div>
          <div class="v">{stats ? stats.namelists : '…'}</div>
        </div>
      </div>
      <div class="block">
        <h3>{t`Contract period`}</h3>
        <div class="v">
          {formatDate(domain.contractStart)} – {formatDate(domain.contractEnd)}
        </div>
      </div>
    </Modal>
  )
}

interface UserDetailProps {
  user: UserAccount
  domain: Domain | null
  lastAdmin: boolean
  onToggleRole: (role: Role, checked: boolean) => void
  onDisable: () => void
  onEnable: () => void
  onRemove: () => void
  onInvite: () => void
  onResendInvite: () => void
  onSendPasswordReset: () => void
  onRename: () => void
}

function UserDetail({
  user: u,
  domain,
  lastAdmin,
  onToggleRole,
  onDisable,
  onEnable,
  onRemove,
  onInvite,
  onResendInvite,
  onSendPasswordReset,
  onRename,
}: UserDetailProps) {
  const adminHost = domain?.host ?? ''
  // Step A3: a user linked to an ungap account is administered in ungap Backoffice; here it is read-only.
  const managed = u.ssoEnabled
  return (
    <>
      <div class="head">
        <div class="idrow">
          <span class="avatar lg">{initials(u.name)}</span>
          <div>
            <h2>
              {u.name}
              {!managed && (
                <button class="ib" type="button" title={t`Rename the user`} aria-label={t`Rename the user`} onClick={onRename}>
                  <EditIcon />
                </button>
              )}
            </h2>
            <div class="mail">{u.email}</div>
          </div>
          {!managed && (
          <span class="head-actions">
            <OverflowMenu
              items={[
                u.status === 'disabled'
                  ? { label: t`Enable account`, onClick: onEnable }
                  : {
                      label: t`Disable account`,
                      disabled: lastAdmin,
                      title: lastAdmin ? t`The domain must have at least one active administrator` : undefined,
                      onClick: onDisable,
                    },
                {
                  label: t`Remove`,
                  danger: true,
                  disabled: lastAdmin,
                  title: lastAdmin ? t`The domain must have at least one active administrator` : undefined,
                  onClick: onRemove,
                },
              ]}
            />
          </span>
          )}
        </div>
        <div class="facts">
          <span>
            {u.status === 'notinvited' && t`Not invited`}
            {u.status === 'active' && t`Active`}
            {u.status === 'invited' && t`Invited – has not signed in`}
            {u.status === 'disabled' && t`Disabled`}
          </span>
          {domain && <span>{domain.org}</span>}
        </div>
        <div class="badges">
          {u.roles.map((r) => (
              <StatusChip key={r} tone={r === 'domainAdmin' ? 'accent' : 'neutral'}>
              {roleLabel(r)}
            </StatusChip>
          ))}
        </div>
        {managed ? (
          <p class="note">{t`Managed in ungap Backoffice: the user logs in with an ungap account, and name, roles and access are changed there.`}</p>
        ) : (
        <div class="tools">
          {u.status === 'notinvited' ? (
            <button class="btn btn-sm btn-primary" type="button" onClick={onInvite}>
              {t`Invite`}
            </button>
          ) : u.status === 'invited' ? (
            <button class="btn btn-sm" type="button" onClick={onResendInvite}>
              {t`Resend invitation`}
            </button>
          ) : (
            <button class="btn btn-sm" type="button" onClick={onSendPasswordReset}>
              {t`Reset link`}
            </button>
          )}
        </div>
        )}
      </div>

      <div class="body">
        <div class="grid">
          <div>
            <div class="k">{t`Last sign-in`}</div>
            <div class="v">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t`never`}</div>
          </div>
          <div>
            <div class="k">{t`Account created`}</div>
            <div class="v">{formatDateTime(u.createdAt)}</div>
          </div>
          <div>
            <div class="k">{t`Sign-in`}</div>
            <div class="v">{u.ssoEnabled ? t`ungap account` : t`email`}</div>
          </div>
          <div>
            <div class="k">{t`Domain`}</div>
            <div class="v">{domain?.host}</div>
          </div>
        </div>

        <div class="block">
          <h3>{t`Permissions`}</h3>
          <div class="roles">
            {u.roles.includes('rootAdmin') ? (
              <div class="role on locked" aria-label={t`Root administrator, locked`}>
                <span class="rt">
                  <b>{roleLabel('rootAdmin')}</b>
                  <span>{roleDescription('rootAdmin')} {t`The role cannot be changed here.`}</span>
                </span>
              </div>
            ) : (
              ROLE_ORDER.map((role) => {
                const on = u.roles.includes(role)
                const lock = managed || (role === 'domainAdmin' && lastAdmin)
                return (
                  <label key={role} class={`role ${on ? 'on' : ''}`}>
                    <input
                      type="radio"
                      checked={on}
                      disabled={lock}
                      onChange={(e) => onToggleRole(role, e.currentTarget.checked)}
                    />
                    <span class="rt">
                      <b>{roleLabel(role)}</b>
                      <span>{roleDescription(role)}</span>
                    </span>
                  </label>
                )
              })
            )}
          </div>
          {lastAdmin && domain && (
            <p class="note warn" style={{ marginTop: '10px' }}>
              {t`The only active administrator on ${adminHost}. Appoint another one before the role is removed.`}
            </p>
          )}
        </div>

        <div class="block">
          <h3>{t`Recent activity`}</h3>
          <ul class="log">
            {u.activity.map((entry) => (
              <li key={entry.occurredAt + entry.description}>
                <span class="t">{formatDateTime(entry.occurredAt)}</span>
                <span>{entry.description}</span>
              </li>
            ))}
          </ul>
        </div>

        {u.status === 'disabled' ? (
          <p class="note">
            {t`Disabled accounts cannot sign in but are kept in the history — earlier broadcasts and changes remain on the user.`}
          </p>
        ) : null}
      </div>
    </>
  )
}
