import { msg, plural, t } from '@lingui/core/macro'
import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { useContext, useEffect, useMemo, useState } from 'preact/hooks'
import { client } from '../../data'
import type { MediaJob, Share } from '../../data/types'
import { downloadJobFile, downloadManuscriptFile, jobTitle } from '../../app/jobActions'
import { daysUntilPurge, purgeText } from '../../app/jobRetention'
import { notifyJobsChanged } from '../../app/jobsBus'
import { JobsContext } from '../../app/jobsContext'
import { shareEventText } from '../../app/shareEvents'
import { formatAgo, formatDateTime } from '../../app/time'
import { useResource } from '../../app/useResource'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Icon } from '../../components/Icon'
import { JobProgress } from '../../components/JobProgress'
import { ShareDialog } from '../../components/ShareDialog'
import { StatusChip, type ChipTone } from '../../components/StatusChip'
import './JobsView.css'

const SHARE_STATUS: Record<Share['status'], { label: MessageDescriptor; tone: ChipTone }> = {
  active: { label: msg`Active`, tone: 'accent' },
  expired: { label: msg`Expired`, tone: 'neutral' },
  revoked: { label: msg`Revoked`, tone: 'danger' },
}

interface JobsViewProps {
  onOpenProject: (projectId: string) => void
}

function lastDownloadText(iso: string): string {
  const when = formatDateTime(iso)
  return t`, last ${when}`
}

function isShareable(job: MediaJob): boolean {
  return job.kind === 'download' && job.state === 'done'
}

// UNG-100: Jobs — running and finished jobs in one place. Running jobs can be canceled. Finished downloads can be fetched
// or shared with external recipients (one or several at a time), and a shared job is marked on its row, where the share
// can also be followed up and revoked. Jobs disappear by themselves after seven days.
export function JobsView({ onOpenProject }: JobsViewProps) {
  const jobs = useContext(JobsContext)
  const shares = useResource(() => client.shares.list(), [])
  const [selected, setSelected] = useState<string[]>([])
  const [shareDialog, setShareDialog] = useState<string[] | null>(null)
  const [cancelTarget, setCancelTarget] = useState<MediaJob | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<Share | null>(null)
  const [openRows, setOpenRows] = useState<string[]>([])
  const [details, setDetails] = useState<Record<string, Share>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [manuscriptBusy, setManuscriptBusy] = useState<string | null>(null)

  const selectedCount = selected.length
  const active = jobs.filter((job) => job.state === 'processing')
  const finished = jobs.filter((job) => job.state !== 'processing')

  const sharesByRecording = useMemo(() => {
    const map = new Map<string, Share[]>()
    for (const share of shares.data ?? []) {
      for (const item of share.items) {
        const list = map.get(item.recordingId) ?? []
        if (!list.includes(share)) list.push(share)
        map.set(item.recordingId, list)
      }
    }
    return map
  }, [shares.data])

  // A job that disappears from the list must not stay selected.
  useEffect(() => {
    const shareable = new Set(jobs.filter(isShareable).map((job) => job.recordingId))
    setSelected((prev) => (prev.every((id) => shareable.has(id)) ? prev : prev.filter((id) => shareable.has(id))))
  }, [jobs])

  function setRowError(id: string, text: string) {
    setRowErrors((prev) => ({ ...prev, [id]: text }))
  }

  async function toggleRow(job: MediaJob) {
    if (openRows.includes(job.id)) {
      setOpenRows((prev) => prev.filter((id) => id !== job.id))
      return
    }
    setOpenRows((prev) => [...prev, job.id])
    for (const share of sharesByRecording.get(job.recordingId) ?? []) {
      if (details[share.id]) continue
      try {
        const full = await client.shares.get(share.id)
        setDetails((prev) => ({ ...prev, [share.id]: full }))
      } catch (error) {
        setRowError(job.id, error instanceof Error ? error.message : t`The log could not be loaded.`)
      }
    }
  }

  async function cancel(job: MediaJob) {
    setCancelTarget(null)
    setRowError(job.id, '')
    try {
      await client.jobs.cancel(job.id)
      notifyJobsChanged()
    } catch (error) {
      setRowError(job.id, error instanceof Error ? error.message : t`The job could not be canceled.`)
      notifyJobsChanged()
    }
  }

  async function download(job: MediaJob) {
    setRowError(job.id, '')
    try {
      await downloadJobFile(job)
    } catch (error) {
      setRowError(job.id, error instanceof Error ? error.message : t`The download failed.`)
    }
  }

  async function downloadManuscript(job: MediaJob) {
    setRowError(job.id, '')
    setManuscriptBusy(job.id)
    try {
      await downloadManuscriptFile(job)
    } catch (error) {
      setRowError(job.id, error instanceof Error ? error.message : t`The manuscript could not be created.`)
    } finally {
      setManuscriptBusy(null)
    }
  }

  async function revoke(share: Share) {
    setRevokeTarget(null)
    setMessage('')
    try {
      const updated = await client.shares.revoke(share.id)
      setDetails((prev) => ({ ...prev, [share.id]: updated }))
      shares.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t`The share could not be revoked.`)
    }
  }

  function toggleSelected(recordingId: string) {
    setSelected((prev) => (prev.includes(recordingId) ? prev.filter((id) => id !== recordingId) : [...prev, recordingId]))
  }

  function renderRow(job: MediaJob) {
    const shareable = isShareable(job)
    const related = sharesByRecording.get(job.recordingId) ?? []
    const activeShares = related.filter((share) => share.status === 'active').length
    const open = openRows.includes(job.id)
    const purge = purgeText(daysUntilPurge(job))
    const title = jobTitle(job)
    return (
      <li key={job.id} class={`jobs-row ${job.state}`}>
        <div class="dl-row jobs-row-main">
          {shareable ? (
            <input
              class="jobs-check"
              type="checkbox"
              aria-label={t`Select ${title} for sharing`}
              checked={selected.includes(job.recordingId)}
              onChange={() => toggleSelected(job.recordingId)}
            />
          ) : (
            <span class="jobs-check-space" aria-hidden="true" />
          )}
          <div class="dl-name">
            <span class="dl-icon"><Icon name={job.kind === 'download' ? 'download' : job.kind === 'captions' ? 'subtitles' : job.kind === 'speakers' ? 'record_voice_over' : 'upload'} size={18} /></span>
            <div class="jobs-text">
              <div class="dl-title">{jobTitle(job)}</div>
              {job.state === 'processing' && <JobProgress progress={job.progress} phase={job.phase} />}
              {job.state === 'error' && <div class="jobs-error">{job.errorMessage ?? t`Processing failed.`}</div>}
              {job.state === 'canceled' && <div class="jobs-note">{t`Canceled`}</div>}
              {rowErrors[job.id] && <div class="jobs-error" role="alert">{rowErrors[job.id]}</div>}
            </div>
          </div>
          <span class="dl-cell jobs-col-by">{job.startedByName ?? '–'}</span>
          <span class="dl-cell jobs-col-time">{formatAgo(job.completedAtUtc ?? job.createdAtUtc)}</span>
          <span class="dl-cell dl-muted jobs-col-purge">{purge || '–'}</span>
          <div class="dl-actions jobs-actions">
            {related.length > 0 && (
              <button class="jobs-share-chip" type="button" aria-expanded={open} onClick={() => void toggleRow(job)}>
                <StatusChip tone={activeShares > 0 ? 'accent' : 'neutral'}>
                  {activeShares > 0 ? plural(activeShares, { one: 'Shared · # active', other: 'Shared · # active' }) : t`Shared (ended)`}
                </StatusChip>
              </button>
            )}
            {job.state === 'processing' && (
              <button class="btn btn-sm" type="button" onClick={() => setCancelTarget(job)}>{t`Cancel`}</button>
            )}
            {shareable && (
              <>
                <button class="btn btn-sm" type="button" onClick={() => void download(job)}>{t`Download`}</button>
                <button class="btn btn-sm" type="button" onClick={() => setShareDialog([job.recordingId])}>{t`Share…`}</button>
              </>
            )}
            {job.kind === 'speakers' && job.state === 'done' && job.projectId && (
              <button class="btn btn-sm" type="button" disabled={manuscriptBusy === job.id} onClick={() => void downloadManuscript(job)}>
                {manuscriptBusy === job.id ? t`Creating…` : t`Download Word manuscript`}
              </button>
            )}
            {(job.kind === 'upload' || job.kind === 'captions') && job.state === 'done' && job.projectId && (
              <button class="btn btn-sm" type="button" onClick={() => onOpenProject(job.projectId!)}>{t`Open the project`}</button>
            )}
          </div>
        </div>
        {open && related.length > 0 && (
          <div class="jobs-shares">
            {related.map((share) => {
              const full = details[share.id] ?? share
              const sharedBy = full.createdByName
              const sharedAt = formatDateTime(full.createdAtUtc)
              const validUntil = formatDateTime(full.expiresAtUtc)
              return (
                <div key={share.id} class="jobs-share">
                  <div class="jobs-share-head">
                    <StatusChip tone={SHARE_STATUS[full.status].tone}>{i18n._(SHARE_STATUS[full.status].label)}</StatusChip>
                    <span>{t`Shared by ${sharedBy} ${sharedAt} · valid until ${validUntil}`}</span>
                  </div>
                  {full.message && <p class="jobs-quote">{full.message}</p>}
                  <dl>
                    <dt>{t`Recipients`}</dt>
                    <dd>{full.recipients.join(', ')}</dd>
                    <dt>{t`Files`}</dt>
                    <dd>
                      <ul>
                        {full.items.map((item) => (
                          <li key={item.id}>
                            {item.name} — {plural(item.downloadCount, { one: '# download', other: '# downloads' })}
                            {item.lastDownloadedAtUtc && lastDownloadText(item.lastDownloadedAtUtc)}
                          </li>
                        ))}
                      </ul>
                    </dd>
                    {full.events && (
                      <>
                        <dt>{t`Log`}</dt>
                        <dd>
                          <ul>
                            {full.events.map((event, index) => (
                              <li key={index}>
                                <span class="jobs-time">{formatDateTime(event.occurredAtUtc)}</span> {shareEventText(event)}
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </>
                    )}
                  </dl>
                  {full.status === 'active' && (
                    <button class="btn btn-sm btn-danger" type="button" onClick={() => setRevokeTarget(full)}>{t`Revoke`}</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </li>
    )
  }

  const list = (rows: MediaJob[]) => (
    <div class="dl jobs-list">
      <div class="dl-head" aria-hidden="true">
      <span class="jobs-check-space" />
      <span class="dl-name">{t`Jobs`}</span>
      <span class="jobs-col-by">{t`Started by`}</span>
      <span class="jobs-col-time">{t`Time`}</span>
      <span class="jobs-col-purge">{t`Disappears`}</span>
      <span class="jobs-col-actions" />
    </div>
      <ul class="dl-rows jobs-rows">{rows.map(renderRow)}</ul>
    </div>
  )

  return (
    <div class="view">
      <header>
        <div class="header-list-zone">
          <h1>{t`Jobs`}</h1>
          <span class="spacer" />
          <button
            class="btn btn-sm btn-primary"
            type="button"
            disabled={selected.length === 0}
            onClick={() => setShareDialog(selected)}
          >
            {selected.length > 0 ? t`Share selected (${selectedCount})` : t`Share selected`}
          </button>
        </div>
      </header>

      <div class="content jobs-content">
        <div class="jobs-body">
          {message && <p class="jobs-error" role="alert">{message}</p>}

          <section class="jobs-section jobs-section-active">
            <h2>{t`In progress`}</h2>
            {active.length === 0 ? <p class="jobs-empty">{t`No jobs in progress.`}</p> : list(active)}
          </section>

          <section class="jobs-section jobs-section-done">
            <h2>{t`Finished`}</h2>
            <p class="jobs-help">{t`Jobs disappear by themselves after 7 days. Finished downloads can be shared with external recipients, and a share is followed up and revoked on its row.`}</p>
            {finished.length === 0 ? <p class="jobs-empty">{t`No finished jobs.`}</p> : list(finished)}
          </section>
        </div>
      </div>

      {shareDialog && (
        <ShareDialog
          initialRecordingIds={shareDialog}
          onClose={() => setShareDialog(null)}
          onShared={() => {
            shares.reload()
            setSelected([])
          }}
        />
      )}
      {cancelTarget && (
        <ConfirmModal title={t`Cancel the job?`} confirmLabel={t`Cancel the job`} danger onCancel={() => setCancelTarget(null)} onConfirm={() => void cancel(cancelTarget)}>
          <p>
            {cancelTarget.kind === 'download'
              ? t`Preparing the download is stopped. You can start a new one at any time.`
              : cancelTarget.kind === 'captions'
                ? t`Creating captions is stopped and no draft is saved. You can start it again at any time.`
                : t`Processing the video is stopped and the uploaded file is removed from the project. You can upload it again.`}
          </p>
        </ConfirmModal>
      )}
      {revokeTarget && (
        <ConfirmModal title={t`Revoke the share?`} confirmLabel={t`Revoke`} danger onCancel={() => setRevokeTarget(null)} onConfirm={() => void revoke(revokeTarget)}>
          <p>{t`The link stops working immediately for all recipients. A download that has already started can continue for up to 15 minutes.`}</p>
        </ConfirmModal>
      )}
    </div>
  )
}
