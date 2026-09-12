import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Domain, Role, UserAccount } from '../../data/types'
import { useResource } from '../../app/useResource'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Toast } from '../../components/Toast'
import { SearchIcon } from '../../components/icons'
import { formatDateTime } from '../../app/time'
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
  const [query, setQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmDisable, setConfirmDisable] = useState<UserAccount | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<UserAccount | null>(null)

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
    setQuery('')
    setSelectedUserId(null)
  }

  function selectUser(id: string) {
    setSelectedUserId(id)
  }

  function replace(next: UserAccount) {
    setDomainUsers((prev) => prev.map((u) => (u.id === next.id ? next : u)))
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

  const q = query.trim().toLowerCase()
  const visibleUsers = domainUsers
    .filter((u) => !q || (u.name + ' ' + u.email).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  const selectedUser = domainUsers.find((u) => u.id === selectedUserId) ?? null
  const selectedDomain = domains.find((d) => d.id === selectedDomainId) ?? null

  return (
    <div class="view">
      <header>
        <div>
          <h1>Användare</h1>
          <div class="sub">Domäner, konton och behörigheter</div>
        </div>
      </header>

      <div class="content">
        <div class="three">
          <section class="pane" aria-label="Domäner">
            <div class="top">
              <h2>Domäner</h2>
              <button
                class="btn btn-sm"
                type="button"
                onClick={() => setToast('Öppnar formulär för att lägga till en domän.')}
              >
                Ny
              </button>
            </div>
            <ul>
              {domains.map((d) => (
                <li key={d.id} class={d.id === selectedDomainId ? 'sel' : ''}>
                  <button class="user-row dom" type="button" onClick={() => selectDomain(d.id)}>
                    <span class="nm">
                      {d.host}
                      <span class="org">{d.org}</span>
                    </span>
                    <span class="pill">{d.userCount}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section class="pane" aria-label="Användare">
            <div class="top">
              <div class="search">
                <SearchIcon />
                <input
                  type="search"
                  placeholder="Sök användare"
                  aria-label="Sök användare"
                  value={query}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                />
              </div>
              <button
                class="btn btn-sm"
                type="button"
                onClick={() =>
                  selectedDomain &&
                  setToast(
                    `Bjud in användare till ${selectedDomain.host}. Inbjudan skickas per e-post och kontot står som Inbjuden tills den accepteras.`,
                  )
                }
              >
                Bjud in
              </button>
            </div>
            <ul>
              {usersResource.loading && domainUsers.length === 0 && <li class="none">Laddar…</li>}
              {!usersResource.loading && visibleUsers.length === 0 && (
                <li class="none">{q ? 'Ingen användare matchar sökningen.' : 'Domänen har inga användare.'}</li>
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

          <section class="doc" aria-label="Användarens detaljer">
            {!selectedUser ? (
              <div class="docnone">Välj en användare i listan.</div>
            ) : (
              <UserDetail
                user={selectedUser}
                domain={selectedDomain}
                lastAdmin={isLastActiveAdmin(selectedUser, domainUsers)}
                onToggleRole={(role, checked) => toggleRole(selectedUser, role, checked)}
                onDisable={() => setConfirmDisable(selectedUser)}
                onEnable={() => enable(selectedUser)}
                onRemove={() => setConfirmRemove(selectedUser)}
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

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
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
        <div class="badges">
          {u.status === 'active' && <StatusChip tone="live">Aktiv</StatusChip>}
          {u.status === 'invited' && <StatusChip tone="warn">Inbjuden – har inte loggat in</StatusChip>}
          {u.status === 'disabled' && <StatusChip tone="neutral">Inaktiverad</StatusChip>}
          {u.roles.map((r) => (
            <StatusChip key={r} tone={r === 'admin' ? 'accent' : 'neutral'}>
              {ROLES[r].label}
            </StatusChip>
          ))}
          {domain && <StatusChip tone="neutral">{domain.org}</StatusChip>}
        </div>
        <div class="tools">
          {u.status === 'invited' ? (
            <button class="btn btn-sm" type="button" onClick={onResendInvite}>
              Skicka om inbjudan
            </button>
          ) : (
            <button class="btn btn-sm" type="button" onClick={onSendPasswordReset}>
              Skicka återställningslänk
            </button>
          )}
          {u.status === 'disabled' ? (
            <button class="btn btn-sm btn-primary" type="button" onClick={onEnable}>
              Aktivera konto
            </button>
          ) : (
            <button
              class="btn btn-sm"
              type="button"
              disabled={lastAdmin}
              title={lastAdmin ? 'Domänen måste ha minst en aktiv administratör' : undefined}
              onClick={onDisable}
            >
              Inaktivera konto
            </button>
          )}
          <span class="spacer" />
          <button
            class="btn btn-sm btn-danger"
            type="button"
            disabled={lastAdmin}
            title={lastAdmin ? 'Domänen måste ha minst en aktiv administratör' : undefined}
            onClick={onRemove}
          >
            Ta bort
          </button>
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
