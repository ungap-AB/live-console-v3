import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../data'
import type { CreatedShare, MediaJob } from '../data/types'
import { mailErrorText, parseRecipients } from '../app/shareRecipients'
import { CopyField } from './CopyField'
import { Modal } from './Modal'
import './ShareDialog.css'

const MAX_RECIPIENTS = 100
const MAX_MESSAGE = 1000

interface Candidate {
  recordingId: string
  name: string
  detail?: string
}

interface ShareDialogProps {
  /** Filerna som är förvalda (där "Dela…" klickades, eller de som valts i Jobb-vyn). */
  initialRecordingIds?: string[]
  onClose: () => void
  /** Anropas när delningen skapats, så att listor bakom dialogen kan hämtas om. */
  onShared?: () => void
}

// Klara nedladdningar som går att dela: varje inspelning en gång (nyaste jobbet), eftersom MP4-filen är en per
// inspelning. Filerna ligger kvar i sju dagar, lika länge som jobben visas.
function candidatesFrom(jobs: MediaJob[]): Candidate[] {
  const seen = new Set<string>()
  const result: Candidate[] = []
  for (const job of jobs) {
    if (job.kind !== 'download' || job.state !== 'done' || seen.has(job.recordingId)) continue
    seen.add(job.recordingId)
    result.push({
      recordingId: job.recordingId,
      name: job.recordingName ?? job.projectName ?? t`Recording`,
      detail: job.projectName && job.projectName !== job.recordingName ? job.projectName : undefined,
    })
  }
  return result
}

// UNG-80 steg 4: dela en eller flera färdiga nedladdningar via en länk som gäller i sju dagar. Mottagarna får ett
// mejl, och länken visas här en gång så att operatören kan skicka den själv. Delningen loggas och kan återkallas.
export function ShareDialog({ initialRecordingIds, onClose, onShared }: ShareDialogProps) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [selected, setSelected] = useState<string[]>(initialRecordingIds ?? [])
  const [recipientsText, setRecipientsText] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedShare | null>(null)

  useEffect(() => {
    let cancelled = false
    client.jobs.list().then(
      (jobs) => {
        if (cancelled) return
        const list = candidatesFrom(jobs)
        // Filerna man valt ska alltid gå att välja, även om jobbraden hunnit rensas — servern kontrollerar dem ändå.
        for (const id of initialRecordingIds ?? []) {
          if (!list.some((c) => c.recordingId === id)) list.unshift({ recordingId: id, name: t`Selected recording` })
        }
        setCandidates(list)
      },
      () => { if (!cancelled) setCandidates([]) },
    )
    return () => { cancelled = true }
  }, [initialRecordingIds?.join('|')])

  const { valid, invalid } = parseRecipients(recipientsText)
  const tooMany = valid.length > MAX_RECIPIENTS
  const canSubmit = !busy && selected.length > 0 && valid.length > 0 && invalid.length === 0 && !tooMany

  function toggle(recordingId: string) {
    setSelected((prev) => (prev.includes(recordingId) ? prev.filter((id) => id !== recordingId) : [...prev, recordingId]))
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const result = await client.shares.create({
        recordingIds: selected,
        recipients: valid,
        message: message.trim() || undefined,
      })
      setCreated(result)
      onShared?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : t`The share could not be created.`)
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    const failed = created.recipients.filter((recipient) => !recipient.sent)
    return (
      <Modal
        title={t`The share is created`}
        onClose={onClose}
        footer={<button class="btn btn-sm btn-primary" type="button" onClick={onClose}>{t`Close`}</button>}
      >
        <p class="share-note">
          {failed.length === 0
            ? plural(created.recipients.length, { one: 'An email with the link has been sent to the recipient.', other: 'An email with the link has been sent to # recipients.' })
            : t`The email went to ${created.recipients.length - failed.length} of ${created.recipients.length} recipients.`}
        </p>
        <ul class="share-recipients">
          {created.recipients.map((recipient) => (
            <li key={recipient.address} class={recipient.sent ? 'ok' : 'failed'}>
              <span aria-hidden="true">{recipient.sent ? '✓' : '✗'}</span> {recipient.address}
              {!recipient.sent && <span class="share-fail-reason"> — {mailErrorText(recipient.errorCode)}</span>}
            </li>
          ))}
        </ul>
        <CopyField label={t`Link`} value={created.link} monospace />
        <p class="share-note">
          {t`The link is valid for 7 days and is only shown now. Copy it if you want to send it yourself. You find the share and can revoke it under Downloads.`}
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title={t`Share download`}
      onClose={onClose}
      wide
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onClose}>{t`Cancel`}</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? t`Sharing…` : t`Share and send`}
          </button>
        </>
      }
    >
      <section class="share-section">
        <h3>{t`Files`}</h3>
        {candidates === null && <p class="share-note" role="status">{t`Fetching finished downloads…`}</p>}
        {candidates?.length === 0 && (
          <p class="share-note">{t`There are no finished downloads to share. Prepare a download first; the file is kept for 7 days.`}</p>
        )}
        {candidates && candidates.length > 0 && (
          <ul class="share-files">
            {candidates.map((candidate) => (
              <li key={candidate.recordingId}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(candidate.recordingId)}
                    onChange={() => toggle(candidate.recordingId)}
                  />
                  <span>
                    {candidate.name}
                    {candidate.detail && <span class="share-detail"> · {candidate.detail}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="share-section">
        <h3>{t`Recipients`}</h3>
        <textarea
          rows={3}
          aria-label={t`Recipients`}
          placeholder={t`Email addresses, separated by comma or line break`}
          value={recipientsText}
          onInput={(event) => setRecipientsText(event.currentTarget.value)}
        />
        <p class={`share-note${invalid.length > 0 || tooMany ? ' share-problem' : ''}`}>
          {invalid.length > 0
            ? t`Invalid address: ${invalid.join(', ')}`
            : tooMany
              ? t`At most ${MAX_RECIPIENTS} recipients at a time.`
              : valid.length === 0
                ? t`Anyone with the link can download the files, so only send it to the right people.`
                : plural(valid.length, { one: '# recipient', other: '# recipients' })}
        </p>
      </section>

      <section class="share-section">
        <h3>{t`Message (optional)`}</h3>
        <textarea
          rows={3}
          maxLength={MAX_MESSAGE}
          aria-label={t`Message`}
          placeholder={t`Shown in the email and on the download page`}
          value={message}
          onInput={(event) => setMessage(event.currentTarget.value)}
        />
      </section>

      <p class="share-note">{t`The link is valid for 7 days. You can revoke it under Downloads, and every download is logged.`}</p>
      {error && <p class="share-note share-problem" role="alert">{error}</p>}
    </Modal>
  )
}
