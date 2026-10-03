import { useState } from 'preact/hooks'
import { client } from '../../data'
import type { MediaJob, Share } from '../../data/types'
import { downloadJobFile } from '../../app/jobActions'
import { shareEventText } from '../../app/shareEvents'
import { formatDateTime } from '../../app/time'
import { useResource } from '../../app/useResource'
import { ConfirmModal } from '../../components/ConfirmModal'
import { ShareDialog } from '../../components/ShareDialog'
import { StatusChip, type ChipTone } from '../../components/StatusChip'
import './SharesView.css'

const STATUS: Record<Share['status'], { label: string; tone: ChipTone }> = {
  active: { label: 'Aktiv', tone: 'accent' },
  expired: { label: 'Utgången', tone: 'neutral' },
  revoked: { label: 'Återkallad', tone: 'danger' },
}

// Klara nedladdningar, en per inspelning (nyaste jobbet). Filerna ligger kvar i sju dagar.
function readyDownloads(jobs: MediaJob[]): MediaJob[] {
  const seen = new Set<string>()
  return jobs.filter((job) => {
    if (job.kind !== 'download' || job.state !== 'done' || seen.has(job.recordingId)) return false
    seen.add(job.recordingId)
    return true
  })
}

function summary(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '–') : `${names[0]} +${names.length - 1}`
}

// UNG-80 steg 4: "Nedladdningar" — klara filer att ladda ner eller dela, och delningarna med status, mottagare,
// antal nedladdningar och logg. En delning kan återkallas (gäller direkt för nya klick).
export function SharesView() {
  const jobs = useResource(() => client.jobs.list(), [])
  const shares = useResource(() => client.shares.list(), [])
  const [dialogFor, setDialogFor] = useState<{ recordingId?: string } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, Share>>({})
  const [confirmRevoke, setConfirmRevoke] = useState<Share | null>(null)
  const [message, setMessage] = useState('')
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({})

  const downloads = readyDownloads(jobs.data ?? [])

  async function toggle(share: Share) {
    if (openId === share.id) {
      setOpenId(null)
      return
    }
    setOpenId(share.id)
    if (!details[share.id]) {
      try {
        const full = await client.shares.get(share.id)
        setDetails((prev) => ({ ...prev, [share.id]: full }))
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Loggen kunde inte hämtas.')
      }
    }
  }

  async function revoke(share: Share) {
    setConfirmRevoke(null)
    setMessage('')
    try {
      const updated = await client.shares.revoke(share.id)
      setDetails((prev) => ({ ...prev, [share.id]: updated }))
      shares.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delningen kunde inte återkallas.')
    }
  }

  async function download(job: MediaJob) {
    setDownloadErrors((prev) => ({ ...prev, [job.id]: '' }))
    try {
      await downloadJobFile(job)
    } catch (error) {
      setDownloadErrors((prev) => ({ ...prev, [job.id]: error instanceof Error ? error.message : 'Nedladdningen misslyckades.' }))
    }
  }

  return (
    <div class="view">
      <header>
        <div class="header-list-zone">
          <h1>Nedladdningar</h1>
          <span class="spacer" />
          <button class="btn btn-sm btn-primary" type="button" onClick={() => setDialogFor({})}>
            + Ny delning
          </button>
        </div>
      </header>

      <div class="content">
        <div class="shares-body">
          {message && <p class="shares-error" role="alert">{message}</p>}

          <section>
            <h2>Klara nedladdningar</h2>
            <p class="shares-note">Filerna sparas i 7 dagar efter att de förberetts. Förbered nya under respektive projekt.</p>
            {jobs.loading && !jobs.data ? (
              <p class="shares-note" role="status">Hämtar…</p>
            ) : downloads.length === 0 ? (
              <p class="shares-empty">Det finns inga klara nedladdningar just nu.</p>
            ) : (
              <ul class="shares-rows">
                {downloads.map((job) => (
                  <li key={job.id} class="shares-row">
                    <div class="shares-main">
                      <div class="shares-title">{job.recordingName ?? job.projectName ?? 'Inspelning'}</div>
                      <div class="shares-meta">
                        {job.projectName && job.projectName !== job.recordingName ? `${job.projectName} · ` : ''}
                        klar {formatDateTime(job.completedAtUtc ?? job.createdAtUtc)}
                      </div>
                      {downloadErrors[job.id] && <div class="shares-error">{downloadErrors[job.id]}</div>}
                    </div>
                    <div class="shares-actions">
                      <button class="btn btn-sm" type="button" onClick={() => void download(job)}>Ladda ner</button>
                      <button class="btn btn-sm" type="button" onClick={() => setDialogFor({ recordingId: job.recordingId })}>Dela…</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Delningar</h2>
            <p class="shares-note">Länkarna gäller i 7 dagar. Loggen sparas i tolv månader efter att en delning gått ut.</p>
            {shares.loading && !shares.data ? (
              <p class="shares-note" role="status">Hämtar…</p>
            ) : (shares.data ?? []).length === 0 ? (
              <p class="shares-empty">Du har inte delat något än.</p>
            ) : (
              <ul class="shares-rows">
                {(shares.data ?? []).map((share) => {
                  const full = details[share.id] ?? share
                  const open = openId === share.id
                  const total = full.items.reduce((sum, item) => sum + item.downloadCount, 0)
                  return (
                    <li key={share.id} class="shares-row shares-share">
                      <button class="shares-summary" type="button" aria-expanded={open} onClick={() => void toggle(share)}>
                        <div class="shares-main">
                          <div class="shares-title">{summary(share.items.map((item) => item.name))}</div>
                          <div class="shares-meta">
                            Till {summary(share.recipients)} · {share.createdByName} · {formatDateTime(share.createdAtUtc)} · {total}{' '}
                            {total === 1 ? 'nedladdning' : 'nedladdningar'}
                          </div>
                        </div>
                        <StatusChip tone={STATUS[full.status].tone}>{STATUS[full.status].label}</StatusChip>
                      </button>
                      {open && (
                        <div class="shares-detail">
                          {full.message && <p class="shares-quote">{full.message}</p>}
                          <dl>
                            <dt>Gäller till</dt>
                            <dd>{formatDateTime(full.expiresAtUtc)}</dd>
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
                                        <span class="shares-time">{formatDateTime(event.occurredAtUtc)}</span> {shareEventText(event)}
                                      </li>
                                    ))}
                                  </ul>
                                </dd>
                              </>
                            )}
                          </dl>
                          {full.status === 'active' && (
                            <button class="btn btn-sm btn-danger" type="button" onClick={() => setConfirmRevoke(full)}>
                              Återkalla
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {dialogFor && (
        <ShareDialog
          initialRecordingId={dialogFor.recordingId}
          onClose={() => setDialogFor(null)}
          onShared={() => shares.reload()}
        />
      )}
      {confirmRevoke && (
        <ConfirmModal
          title="Återkalla delningen?"
          confirmLabel="Återkalla"
          danger
          onCancel={() => setConfirmRevoke(null)}
          onConfirm={() => void revoke(confirmRevoke)}
        >
          <p>
            Länken slutar fungera direkt för alla mottagare. En nedladdning som redan har startat kan fortsätta i upp till 15 minuter.
          </p>
        </ConfirmModal>
      )}
    </div>
  )
}
