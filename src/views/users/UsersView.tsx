import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Domain, Role, UserAccount } from '../../data/types'
import { useResource } from '../../app/useResource'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Modal } from '../../components/Modal'
import { CopyField } from '../../components/CopyField'
import { OverflowMenu } from '../../components/OverflowMenu'
import { Toast } from '../../components/Toast'
import { formatDate, formatDateTime } from '../../app/time'
import './UsersView.css'

const ROLES: Record<Role, { label: string; description: string }> = {
  admin: { label: 'Administratör', description: 'Hanterar användare, domäner och live-resurser.' },
  operator: { label: 'Operatör', description: 'Skapar projekt, sänder och publicerar ondemand.' },
  editor: {
    label: 'Redaktör',
    description: 'Hanterar dagordningar, namnlistor och videoarkiv utan att sända.',
  },
  reviewer: {
    label: 'Granskare',
    description: 'Kan bara öppna granskningslänkar och godkänna före publicering.',
  },
}

const ROLE_ORDER: Role[] = ['admin', 'operator', 'editor', 'reviewer']

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function isLastActiveAdmin(user: UserAccount, domainUsers: UserAccount[]): boolean {
  if (!user.roles.includes('admin') || user.status !== 'active') return false
  const activeAdmins = domainUsers.filter((u) => u.roles.includes('admin') && u.status === 'active')
  return activeAdmins.length === 1
}

export function UsersView() {
  const domainsResource = useResource(() => client.domains.list(), [])
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState<UserAccount | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<UserAccount | null>(null)
  const [creatingDomain, setCreatingDomain] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [viewingDomain, setViewingDomain] = useState<Domain | null>(null)
  const [confirmDeleteDomain, setConfirmDeleteDomain] = useState<Domain | null>(null)

  useEffect(() => {
    if (domainsResource.data) setDomains(domainsResource.data)
  }, [domainsResource.data])

  useEffect(() => {
    if (!selectedDomainId && domains.length > 0) setSelectedDomainId(domains[0].id)
  }, [domains, selectedDomainId])

  const usersResource = useResource(
    () => (selectedDomainId ? client.users.listByDomain(selectedDomainId) : Promise.resolve([])),
    [selectedDomainId],
  )
  const [domainUsers, setDomainUsers] = useState<UserAccount[]>([])

  useEffect(() => {
    setDomainUsers(usersResource.data ?? [])
  }, [usersResource.data])

  useEffect(() => {
    if (!selectedUserId && domainUsers.length > 0) setSelectedUserId(domainUsers[0].id)
  }, [domainUsers, selectedUserId])

  function selectDomain(id: string) {
    setSelectedDomainId(id)
    setSelectedUserId(null)
  }

  function selectUser(id: string) {
    setSelectedUserId(id)
  }

  // Listan är medvetet lätt (ingen aktivitetslogg) — full detalj hämtas
  // separat när något väljs, se PLAN-live-server-v3.md Steg 2.
  const userDetailResource = useResource(
    () => (selectedUserId ? client.users.get(selectedUserId) : Promise.resolve(undefined)),
    [selectedUserId],
  )
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserAccount | null>(null)

  useEffect(() => {
    setSelectedUserDetail(userDetailResource.data ?? null)
  }, [userDetailResource.data])

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
      setToast(err instanceof Error ? err.message : 'Något gick fel.')
    }
  }

  async function toggleRole(user: UserAccount, role: Role, checked: boolean) {
    const nextRoles = checked ? [...user.roles, role] : user.roles.filter((r) => r !== role)
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

  async function resendInvite(user: UserAccount) {
    await client.users.resendInvite(user.id)
    setToast(`Inbjudan skickad på nytt till ${user.email}.`)
  }

  async function sendPasswordReset(user: UserAccount) {
    await client.users.sendPasswordReset(user.id)
    setToast(`Återställningslänk skickad till ${user.email}. Länken hanteras utanför Ungap Live.`)
  }

  function onInvited(user: UserAccount) {
    setDomainUsers((prev) => [...prev, user])
    setDomains((prev) => prev.map((d) => (d.id === user.domainId ? { ...d, userCount: d.userCount + 1 } : d)))
    setInviting(false)
    setToast(`Inbjudan skickad till ${user.email}.`)
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
    setCreatingDomain(false)
  }

  async function saveDomain(org: string) {
    if (!viewingDomain) return
    const updated = await client.domains.update(viewingDomain.id, { org })
    setDomains((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setViewingDomain(updated)
    setToast('Domän uppdaterad.')
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
      setToast(`${domain.org} borttagen.`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Kunde inte ta bort domänen.')
    } finally {
      setConfirmDeleteDomain(null)
    }
  }

  const visibleUsers = [...domainUsers].sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  const selectedUser = selectedUserDetail
  const selectedDomain = domains.find((d) => d.id === selectedDomainId) ?? null

  return (
    <div class="view">
      <header>
        <div>
          <h1>Användare</h1>
        </div>
        <span class="spacer" />
        <button class="btn btn-sm" type="button" disabled={!selectedDomainId} onClick={() => setCreatingUser(true)}>
          + Ny
        </button>
      </header>

      <div class="content">
        <div class="three">
          <section class="pane" aria-label="Domäner">
            <div class="top">
              <h2>Domäner</h2>
              <button class="btn btn-sm" type="button" onClick={() => setCreatingDomain(true)}>
                Ny
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
                    title="Detaljer"
                    aria-label="Detaljer"
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

          <section class="pane" aria-label="Användare">
            <ul>
              {usersResource.loading && domainUsers.length === 0 && <li class="none">Laddar…</li>}
              {!usersResource.loading && visibleUsers.length === 0 && (
                <li class="none">Domänen har inga användare.</li>
              )}
              {visibleUsers.map((u) => (
                <li key={u.id} class={u.id === selectedUserId ? 'sel' : ''}>
                  <button class="user-row" type="button" onClick={() => selectUser(u.id)}>
                    <span class="avatar">{initials(u.name)}</span>
                    <span class="uinfo">
                      <span class="un">{u.name}</span>
                      <span class="ue">{u.roles.map((r) => ROLES[r].label).join(', ')}</span>
                    </span>
                    {u.status === 'invited' && <StatusChip tone="warn">Inbjuden</StatusChip>}
                    {u.status === 'disabled' && <StatusChip tone="neutral">Inaktiv</StatusChip>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section class="doc users-doc" aria-label="Användarens detaljer">
            {!selectedUserId ? (
              <div class="docnone">Välj en användare i listan.</div>
            ) : !selectedUser ? (
              <div class="docnone">Laddar…</div>
            ) : (
              <UserDetail
                user={selectedUser}
                domain={selectedDomain}
                lastAdmin={isLastActiveAdmin(selectedUser, domainUsers)}
                onToggleRole={(role, checked) => toggleRole(selectedUser, role, checked)}
                onDisable={() => setConfirmDisable(selectedUser)}
                onEnable={() => enable(selectedUser)}
                onRemove={() => setConfirmRemove(selectedUser)}
                onInvite={() => setInviting(true)}
                onResendInvite={() => resendInvite(selectedUser)}
                onSendPasswordReset={() => sendPasswordReset(selectedUser)}
              />
            )}
          </section>
        </div>
      </div>

      {confirmDisable && (
        <ConfirmModal
          title="Inaktivera konto?"
          confirmLabel="Inaktivera"
          danger
          onCancel={() => setConfirmDisable(null)}
          onConfirm={() => disable(confirmDisable)}
        >
          <p>Inaktivera {confirmDisable.name}? Kontot kan inte logga in men finns kvar i historiken.</p>
        </ConfirmModal>
      )}

      {confirmRemove && (
        <ConfirmModal
          title="Ta bort användare?"
          confirmLabel="Ta bort"
          danger
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => remove(confirmRemove)}
        >
          <p>
            Ta bort {confirmRemove.name} helt? Historiken visar hädanefter bara namnet, utan konto.
          </p>
        </ConfirmModal>
      )}

      {creatingDomain && (
        <CreateDomainModal onCancel={() => setCreatingDomain(false)} onSave={createDomain} />
      )}

      {inviting && selectedDomain && (
        <InviteDialog domain={selectedDomain} onCancel={() => setInviting(false)} onSent={onInvited} />
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
          title="Radera domän?"
          confirmLabel="Radera domän"
          danger
          onCancel={() => setConfirmDeleteDomain(null)}
          onConfirm={() => deleteDomain(confirmDeleteDomain)}
        >
          <p>
            {confirmDeleteDomain.org} ({confirmDeleteDomain.host}) tas bort permanent. Det går inte att
            ångra.
          </p>
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
  const canSave = host.trim().length > 0 && org.trim().length > 0

  return (
    <Modal title="Ny domän" onClose={onCancel}>
      <div class="domain-form">
        <label>
          Domän
          <input
            class="rename-input"
            value={host}
            placeholder="t.ex. exempel.se"
            autoFocus
            onInput={(e) => setHost(e.currentTarget.value)}
          />
        </label>
        <label>
          Organisationens namn
          <input
            class="rename-input"
            value={org}
            placeholder="t.ex. Exempel kommun"
            onInput={(e) => setOrg(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) onSave(host.trim(), org.trim())
            }}
          />
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-sm" type="button" onClick={onCancel}>
          Avbryt
        </button>
        <button
          class="btn btn-sm btn-primary"
          type="button"
          disabled={!canSave}
          onClick={() => onSave(host.trim(), org.trim())}
        >
          Skapa
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSave = email.trim().length > 0 && name.trim().length > 0 && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const user = await client.domains.invite(domain.id, { email: email.trim(), name: name.trim(), roles: [role] })
      onCreated(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skapa användaren.')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Ny användare i ${domain.host}`} onClose={onCancel}>
      <div class="domain-form">
        <label>
          Namn
          <input
            class="rename-input"
            value={name}
            placeholder="För- och efternamn"
            autoFocus
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <label>
          E-post
          <input
            class="rename-input"
            type="email"
            value={email}
            placeholder="namn@exempel.se"
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </label>
        <label>
          Behörighet
          <select class="rename-input" value={role} onChange={(e) => setRole(e.currentTarget.value as Role)}>
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROLES[r].label}
              </option>
            ))}
          </select>
        </label>
        {error && <p class="note warn">{error}</p>}
      </div>
      <div class="modal-actions">
        <button class="btn btn-sm" type="button" onClick={onCancel}>
          Avbryt
        </button>
        <button class="btn btn-sm btn-primary" type="button" disabled={!canSave} onClick={save}>
          {saving ? 'Sparar…' : 'Spara'}
        </button>
      </div>
    </Modal>
  )
}

interface InviteDialogProps {
  domain: Domain
  onCancel: () => void
  onSent: (user: UserAccount) => void
}

function InviteDialog({ domain, onCancel, onSent }: InviteDialogProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('operator')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invite] = useState(() => ({
    pin: String(Math.floor(100000 + Math.random() * 900000)),
  }))

  const canSend = email.trim().length > 0 && name.trim().length > 0 && !sending
  // Länken är till Ungap Live Console självt (inte en fejkad separat
  // inbjudningssida) — den öppnar bara inloggningen som redan finns.
  const link = `${window.location.origin}${window.location.pathname}`
  const message = `Hej${name.trim() ? ' ' + name.trim() : ''}!\n\nDu har blivit inbjuden att skapa ett konto på Ungap Live Console för ${domain.org} (${domain.host}).\n\nGå till länken nedan och logga in. Ange PIN-koden nedan om du blir ombedd om den:\n${link}\n\nPIN-kod: ${invite.pin}\n\nLänken slutar gälla om 14 dagar. Om du inte förväntade dig det här meddelandet kan du bortse från det.`

  async function send() {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      const user = await client.domains.invite(domain.id, { email: email.trim(), name: name.trim(), roles: [role] })
      onSent(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skicka inbjudan.')
      setSending(false)
    }
  }

  return (
    <Modal title={`Bjud in till ${domain.host}`} onClose={onCancel} wide>
      <div class="invite-dialog">
        <div class="invite-fields">
          <label>
            E-post
            <input
              class="rename-input"
              type="email"
              value={email}
              placeholder="namn@exempel.se"
              autoFocus
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
          </label>
          <label>
            Namn
            <input
              class="rename-input"
              value={name}
              placeholder="För- och efternamn"
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </label>
          <label>
            Roll
            <select class="rename-input" value={role} onChange={(e) => setRole(e.currentTarget.value as Role)}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLES[r].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label class="invite-message-label">Meddelande till mottagaren</label>
        <textarea class="invite-message" readOnly rows={7} value={message} />

        <CopyField label="Länk" value={link} monospace />
        <CopyField label="PIN-kod" value={invite.pin} monospace />

        {error && <p class="note warn">{error}</p>}
      </div>
      <div class="modal-actions">
        <button class="btn btn-sm" type="button" onClick={onCancel}>
          Avbryt
        </button>
        <button class="btn btn-sm btn-primary" type="button" disabled={!canSend} onClick={send}>
          {sending ? 'Skickar…' : 'Skicka'}
        </button>
      </div>
    </Modal>
  )
}

interface DomainDetailsDialogProps {
  domain: Domain
  onClose: () => void
  onSave: (org: string) => Promise<void>
  onRequestDelete: () => void
}

function DomainDetailsDialog({ domain, onClose, onSave, onRequestDelete }: DomainDetailsDialogProps) {
  const [org, setOrg] = useState(domain.org)
  const [saving, setSaving] = useState(false)
  const dirty = org.trim().length > 0 && org.trim() !== domain.org

  async function save() {
    if (!dirty) return
    setSaving(true)
    try {
      await onSave(org.trim())
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
            title={domain.userCount > 0 ? 'Domänen har användare kvar och kan inte tas bort.' : undefined}
            onClick={onRequestDelete}
          >
            Radera domän
          </button>
          <span class="spacer" />
          <button class="btn btn-sm" type="button" onClick={onClose}>
            Stäng
          </button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Sparar…' : 'Spara'}
          </button>
        </>
      }
    >
      <label class="domain-org-field">
        Organisationens namn
        <input class="rename-input" value={org} onInput={(e) => setOrg(e.currentTarget.value)} />
      </label>
      <div class="grid">
        <div>
          <div class="k">Användare</div>
          <div class="v">{domain.userCount}</div>
        </div>
        <div>
          <div class="k">Projekt</div>
          <div class="v">{stats ? stats.projects : '…'}</div>
        </div>
        <div>
          <div class="k">Gjorda sändningar</div>
          <div class="v">{stats ? stats.broadcasts : '…'}</div>
        </div>
        <div>
          <div class="k">Inspelningar</div>
          <div class="v">{stats ? stats.recordings : '…'}</div>
        </div>
        <div>
          <div class="k">Dagordningar</div>
          <div class="v">{stats ? stats.agendas : '…'}</div>
        </div>
        <div>
          <div class="k">Namnlistor</div>
          <div class="v">{stats ? stats.namelists : '…'}</div>
        </div>
      </div>
      <div class="block">
        <h3>Avtalsperiod</h3>
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
}: UserDetailProps) {
  return (
    <>
      <div class="head">
        <div class="idrow">
          <span class="avatar lg">{initials(u.name)}</span>
          <div>
            <h2>{u.name}</h2>
            <div class="mail">{u.email}</div>
          </div>
        </div>
        <div class="facts">
          <span>
            {u.status === 'active' && 'Aktiv'}
            {u.status === 'invited' && 'Inbjuden – har inte loggat in'}
            {u.status === 'disabled' && 'Inaktiverad'}
          </span>
          {domain && <span>{domain.org}</span>}
        </div>
        <div class="badges">
          {u.roles.map((r) => (
            <StatusChip key={r} tone={r === 'admin' ? 'accent' : 'neutral'}>
              {ROLES[r].label}
            </StatusChip>
          ))}
        </div>
        <div class="tools">
          {u.status === 'invited' ? (
            <button class="btn btn-sm" type="button" onClick={onResendInvite}>
              Skicka om inbjudan
            </button>
          ) : (
            <button class="btn btn-sm" type="button" onClick={onSendPasswordReset}>
              Återställningslänk
            </button>
          )}
          <button class="btn btn-sm btn-primary" type="button" onClick={onInvite}>
            Bjud in
          </button>
          <span class="spacer" />
          <OverflowMenu
            items={[
              u.status === 'disabled'
                ? { label: 'Aktivera konto', onClick: onEnable }
                : {
                    label: 'Inaktivera konto',
                    disabled: lastAdmin,
                    title: lastAdmin ? 'Domänen måste ha minst en aktiv administratör' : undefined,
                    onClick: onDisable,
                  },
              {
                label: 'Ta bort',
                danger: true,
                disabled: lastAdmin,
                title: lastAdmin ? 'Domänen måste ha minst en aktiv administratör' : undefined,
                onClick: onRemove,
              },
            ]}
          />
        </div>
      </div>

      <div class="body">
        <div class="grid">
          <div>
            <div class="k">Senaste inloggning</div>
            <div class="v">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'aldrig'}</div>
          </div>
          <div>
            <div class="k">Konto skapat</div>
            <div class="v">{formatDateTime(u.createdAt)}</div>
          </div>
          <div>
            <div class="k">Inloggning</div>
            <div class="v">{u.ssoEnabled ? 'SSO' : 'e-post'}</div>
          </div>
          <div>
            <div class="k">Domän</div>
            <div class="v">{domain?.host}</div>
          </div>
        </div>

        <div class="block">
          <h3>Behörigheter</h3>
          <div class="roles">
            {ROLE_ORDER.map((role) => {
              const on = u.roles.includes(role)
              const lock = role === 'admin' && lastAdmin
              return (
                <label key={role} class={`role ${on ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={lock}
                    onChange={(e) => onToggleRole(role, e.currentTarget.checked)}
                  />
                  <span class="rt">
                    <b>{ROLES[role].label}</b>
                    <span>{ROLES[role].description}</span>
                  </span>
                </label>
              )
            })}
          </div>
          {lastAdmin && domain && (
            <p class="note warn" style={{ marginTop: '10px' }}>
              Enda aktiva administratören på {domain.host}. Utse en till innan rollen tas bort.
            </p>
          )}
        </div>

        <div class="block">
          <h3>Senaste aktivitet</h3>
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
            Inaktiverade konton kan inte logga in men behålls i historiken — tidigare sändningar och
            ändringar står kvar på användaren.
          </p>
        ) : (
          u.roles.length === 1 &&
          u.roles[0] === 'reviewer' && (
            <p class="note">
              Granskare når bara granskningslänkar. De ser varken projektlistan eller videoarkivet.
            </p>
          )
        )}
      </div>
    </>
  )
}
