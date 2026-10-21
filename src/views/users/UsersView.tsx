import { t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { Domain } from '../../data/types'
import { useResource } from '../../app/useResource'
import { Modal } from '../../components/Modal'
import { Toast } from '../../components/Toast'
import './UsersView.css'
import { canNavigate, navigate } from '../../app/embed'

// Steps A7/A7b: ungap accounts are administered in ungap Presenter's Organisation view (Backoffice's customer
// administration framed there; Backoffice org id = Live domain id). Framed in Presenter the console asks the shell to go
// there; standalone it links to Presenter.
const PRESENTER_URL = (import.meta.env.VITE_PRESENTER_URL ?? (import.meta.env.DEV ? 'https://localhost:5180' : '')).replace(/\/+$/, '')

// Organisations and people live in ungap Backoffice; Live's domains are its projection. What the root administrator
// sets here is Live's own setting per domain: the customer's Mux env key (UNG-20).
export function UsersView() {
  const domainsResource = useResource(() => client.domains.list(), [])
  const [domains, setDomains] = useState<Domain[]>([])
  const [viewingDomain, setViewingDomain] = useState<Domain | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (domainsResource.data) setDomains(domainsResource.data)
  }, [domainsResource.data])

  async function saveMuxEnvKey(muxEnvKey: string) {
    if (!viewingDomain) return
    const updated = await client.domains.setMuxEnvKey(viewingDomain.id, muxEnvKey)
    setDomains((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    setViewingDomain(updated)
    setToast(t`Domain updated.`)
  }

  return (
    <div class="view">
      <header>
        <div>
          <h1>{t`Domains`}</h1>
        </div>
      </header>

      <div class="content">
        <div class="domains-only">
          {/* ADR 001: everyone logs in with an ungap account; people are invited and managed in ungap Presenter. */}
          <p class="users-backoffice-note">
            {t`Organisations and people with an ungap account are managed in ungap Presenter under Organisation.`}{' '}
            {canNavigate() ? (
              <button class="btn btn-sm" type="button" onClick={() => navigate('organisation')}>
                {t`Open Organisation`}
              </button>
            ) : (
              PRESENTER_URL && (
                <a href={`${PRESENTER_URL}/#/organisation`} target="_blank" rel="noopener noreferrer">
                  {t`Open ungap Presenter`}
                </a>
              )
            )}
          </p>
          <section class="pane" aria-label={t`Domains`}>
            <ul>
              {domainsResource.loading && domains.length === 0 && <li class="none">{t`Loading…`}</li>}
              {domains.map((d) => (
                <li key={d.id} class="domain-row">
                  <button class="user-row dom" type="button" onClick={() => setViewingDomain(d)}>
                    <span class="nm">
                      {d.host}
                      <span class="org">{d.org}</span>
                    </span>
                    {d.muxEnvKey && <span class="pill">{t`Own Mux key`}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {viewingDomain && (
        <DomainDetailsDialog domain={viewingDomain} onClose={() => setViewingDomain(null)} onSave={saveMuxEnvKey} />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

interface DomainDetailsDialogProps {
  domain: Domain
  onClose: () => void
  onSave: (muxEnvKey: string) => Promise<void>
}

function DomainDetailsDialog({ domain, onClose, onSave }: DomainDetailsDialogProps) {
  const [muxEnvKey, setMuxEnvKey] = useState(domain.muxEnvKey ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = muxEnvKey.trim() !== (domain.muxEnvKey ?? '')

  async function save() {
    if (!dirty) return
    setSaving(true)
    setError(null)
    try {
      await onSave(muxEnvKey.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Something went wrong.`)
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
      projects: domainProjectIds.size,
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
          <button class="btn btn-sm" type="button" onClick={onClose}>
            {t`Close`}
          </button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!dirty || saving} onClick={save}>
            {saving ? t`Saving…` : t`Save`}
          </button>
        </>
      }
    >
      <div class="grid">
        <div>
          <div class="k">{t`Organisation`}</div>
          <div class="v">{domain.org}</div>
        </div>
      </div>
      <label class="domain-org-field">
        {t`Mux env key (the customer's own Mux account)`}
        <input
          class="rename-input"
          value={muxEnvKey}
          placeholder={t`Leave empty for ungap's default key`}
          onInput={(e) => setMuxEnvKey(e.currentTarget.value)}
        />
      </label>
      {error && <p class="note warn">{error}</p>}
      <div class="grid">
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
    </Modal>
  )
}
