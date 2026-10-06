import { useContext, useEffect, useMemo, useState } from 'preact/hooks'
import { client } from '../../data'
import type { MediaJob, Share } from '../../data/types'
import { downloadJobFile, jobTitle } from '../../app/jobActions'
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

const SHARE_STATUS: Record<Share['status'], { label: string; tone: ChipTone }> = {
  active: { label: 'Aktiv', tone: 'accent' },
  expired: { label: 'Utgången', tone: 'neutral' },
  revoked: { label: 'Återkallad', tone: 'danger' },
}

interface JobsViewProps {
  onOpenProject: (projectId: string) => void
}

function isShareable(job: MediaJob): boolean {
  return job.kind === 'download' && job.state === 'done'
}

// UNG-100: Jobb — pågående och klara jobb på ett ställe. Pågående jobb kan avbrytas. Klara nedladdningar kan hämtas eller
// delas med externa (ett eller flera i taget), och ett delat jobb markeras direkt på raden, där delningen också går att
// följa upp och återkalla. Jobb försvinner av sig själva efter sju dagar.
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

  // Ett jobb som försvinner ur listan ska inte ligga kvar som valt.
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
        setRowError(job.id, error instanceof Error ? error.message : 'Loggen kunde inte hämtas.')
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
      setRowError(job.id, error instanceof Error ? error.message : 'Jobbet kunde inte avbrytas.')
      notifyJobsChanged()
    }
  }

  async function download(job: MediaJob) {
    setRowError(job.id, '')
    try {
      await downloadJobFile(job)
    } catch (error) {
      setRowError(job.id, error instanceof Error ? error.message : 'Nedladdningen misslyckades.')
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
      setMessage(error instanceof Error ? error.message : 'Delningen kunde inte återkallas.')
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
    return (
      <li key={job.id} class={`jobs-row ${job.state}`}>
        <div class="jobs-row-main">
          {shareable ? (
            <input
              class="jobs-check"
              type="checkbox"
              aria-label={`Välj ${jobTitle(job)} för delning`}
              checked={selected.includes(job.recordingId)}
              onChange={() => toggleSelected(job.recordingId)}
            />
          ) : (
            <span class="jobs-check-space" aria-hidden="true" />
          )}
          <Icon name={job.kind === 'download' ? 'download' : job.kind === 'captions' ? 'subtitles' : 'upload'} size={18} />
          <div class="jobs-text">
            <div class="jobs-title">{jobTitle(job)}</div>
            <div class="jobs-meta">
              {job.startedByName ? `${job.startedByName} · ` : ''}
              {formatAgo(job.completedAtUtc ?? job.createdAtUtc)}
              {purge ? ` · ${purge}` : ''}
            </div>
            {job.state === 'processing' && <JobProgress progress={job.progress} phase={job.phase} />}
            {job.state === 'error' && <div class="jobs-error">{job.errorMessage ?? 'Bearbetningen misslyckades.'}</div>}
            {job.state === 'canceled' && <div class="jobs-note">Avbrutet</div>}
            {rowErrors[job.id] && <div class="jobs-error" role="alert">{rowErrors[job.id]}</div>}
          </div>
          <div class="jobs-actions">
            {related.length > 0 && (
              <button class="jobs-share-chip" type="button" aria-expanded={open} onClick={() => void toggleRow(job)}>
                <StatusChip tone={activeShares > 0 ? 'accent' : 'neutral'}>
                  {activeShares > 0 ? `Delad · ${activeShares} aktiv${activeShares === 1 ? '' : 'a'}` : 'Delad (avslutad)'}
                </StatusChip>
              </button>
            )}
            {job.state === 'processing' && (
              <button class="btn btn-sm" type="button" onClick={() => setCancelTarget(job)}>Avbryt</button>
            )}
            {shareable && (
              <>
                <button class="btn btn-sm" type="button" onClick={() => void download(job)}>Ladda ner</button>
                <button class="btn btn-sm" type="button" onClick={() => setShareDialog([job.recordingId])}>Dela…</button>
              </>
            )}
            {(job.kind === 'upload' || job.kind === 'captions') && job.state === 'done' && job.projectId && (
              <button class="btn btn-sm" type="button" onClick={() => onOpenProject(job.projectId!)}>Öppna projektet</button>
            )}
          </div>
        </div>
        {open && related.length > 0 && (
          <div class="jobs-shares">
            {related.map((share) => {
              const full = details[share.id] ?? share
              return (
                <div key={share.id} class="jobs-share">
                  <div class="jobs-share-head">
                    <StatusChip tone={SHARE_STATUS[full.status].tone}>{SHARE_STATUS[full.status].label}</StatusChip>
                    <span>
                      Delad av {full.createdByName} {formatDateTime(full.createdAtUtc)} · gäller till {formatDateTime(full.expiresAtUtc)}
                    </span>
                  </div>
                  {full.message && <p class="jobs-quote">{full.message}</p>}
                  <dl>
                    <dt>Mottagare</dt>
                    <dd>{full.recipients.join(', ')}</dd>
                    <dt>Filer</dt>
                    <dd>
                      <ul>
                        {full.items.map((item) => (
                          <li key={item.id}>
                            {item.name} — {item.downloadCount} {item.downloadCount === 1 ? 'nedladdning' : 'nedladdningar'}
                            {item.lastDownloadedAtUtc && `, senast ${formatDateTime(item.lastDownloadedAtUtc)}`}
                          </li>
                        ))}
                      </ul>
                    </dd>
                    {full.events && (
                      <>
                        <dt>Logg</dt>
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
                    <button class="btn btn-sm btn-danger" type="button" onClick={() => setRevokeTarget(full)}>Återkalla</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </li>
    )
  }

  return (
    <div class="view">
      <header>
        <div class="header-list-zone">
          <h1>Jobb</h1>
          <span class="spacer" />
          <button
            class="btn btn-sm btn-primary"
            type="button"
            disabled={selected.length === 0}
            onClick={() => setShareDialog(selected)}
          >
            {selected.length > 0 ? `Dela valda (${selected.length})` : 'Dela valda'}
          </button>
        </div>
      </header>

      <div class="content">
        <div class="jobs-body">
          {message && <p class="jobs-error" role="alert">{message}</p>}

          <section>
            <h2>Pågår</h2>
            {active.length === 0 ? <p class="jobs-empty">Inga jobb pågår.</p> : <ul class="jobs-rows">{active.map(renderRow)}</ul>}
          </section>

          <section>
            <h2>Klara</h2>
            <p class="jobs-help">Jobb försvinner av sig själva efter 7 dagar. Klara nedladdningar går att dela med externa, och en delning följs upp och återkallas på raden.</p>
            {finished.length === 0 ? <p class="jobs-empty">Inga klara jobb.</p> : <ul class="jobs-rows">{finished.map(renderRow)}</ul>}
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
        <ConfirmModal title="Avbryta jobbet?" confirmLabel="Avbryt jobbet" danger onCancel={() => setCancelTarget(null)} onConfirm={() => void cancel(cancelTarget)}>
          <p>
            {cancelTarget.kind === 'download'
              ? 'Förberedelsen av nedladdningen stoppas. Du kan starta en ny när som helst.'
              : cancelTarget.kind === 'captions'
                ? 'Skapandet av undertexter stoppas och inget utkast sparas. Du kan starta det igen när som helst.'
                : 'Bearbetningen av videon stoppas och den uppladdade filen tas bort från projektet. Du kan ladda upp den igen.'}
          </p>
        </ConfirmModal>
      )}
      {revokeTarget && (
        <ConfirmModal title="Återkalla delningen?" confirmLabel="Återkalla" danger onCancel={() => setRevokeTarget(null)} onConfirm={() => void revoke(revokeTarget)}>
          <p>Länken slutar fungera direkt för alla mottagare. En nedladdning som redan har startat kan fortsätta i upp till 15 minuter.</p>
        </ConfirmModal>
      )}
    </div>
  )
}
