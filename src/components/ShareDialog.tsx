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
  /** Filen som är förvald (där "Dela…" klickades). */
  initialRecordingId?: string
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
      name: job.recordingName ?? job.projectName ?? 'Inspelning',
      detail: job.projectName && job.projectName !== job.recordingName ? job.projectName : undefined,
    })
  }
  return result
}

// UNG-80 steg 4: dela en eller flera färdiga nedladdningar via en länk som gäller i sju dagar. Mottagarna får ett
// mejl, och länken visas här en gång så att operatören kan skicka den själv. Delningen loggas och kan återkallas.
export function ShareDialog({ initialRecordingId, onClose, onShared }: ShareDialogProps) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [selected, setSelected] = useState<string[]>(initialRecordingId ? [initialRecordingId] : [])
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
        // Filen man klickade på ska alltid gå att välja, även om jobbraden hunnit rensas — servern kontrollerar den ändå.
        if (initialRecordingId && !list.some((c) => c.recordingId === initialRecordingId)) {
          list.unshift({ recordingId: initialRecordingId, name: 'Vald inspelning' })
        }
        setCandidates(list)
      },
      () => { if (!cancelled) setCandidates([]) },
    )
    return () => { cancelled = true }
  }, [initialRecordingId])

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
      setError(err instanceof Error ? err.message : 'Delningen kunde inte skapas.')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    const failed = created.recipients.filter((recipient) => !recipient.sent)
    return (
      <Modal
        title="Delningen är skapad"
        onClose={onClose}
        footer={<button class="btn btn-sm btn-primary" type="button" onClick={onClose}>Stäng</button>}
      >
        <p class="share-note">
          {failed.length === 0
            ? `Ett mejl med länken har skickats till ${created.recipients.length === 1 ? 'mottagaren' : `${created.recipients.length} mottagare`}.`
            : `Mejlet gick till ${created.recipients.length - failed.length} av ${created.recipients.length} mottagare.`}
        </p>
        <ul class="share-recipients">
          {created.recipients.map((recipient) => (
            <li key={recipient.address} class={recipient.sent ? 'ok' : 'failed'}>
              <span aria-hidden="true">{recipient.sent ? '✓' : '✗'}</span> {recipient.address}
              {!recipient.sent && <span class="share-fail-reason"> — {mailErrorText(recipient.errorCode)}</span>}
            </li>
          ))}
        </ul>
        <CopyField label="Länk" value={created.link} monospace />
        <p class="share-note">
          Länken gäller i 7 dagar och visas bara nu. Kopiera den om du vill skicka den själv. Du hittar delningen och kan
          återkalla den under Nedladdningar.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title="Dela nedladdning"
      onClose={onClose}
      wide
      footer={
        <>
          <button class="btn btn-sm" type="button" onClick={onClose}>Avbryt</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? 'Delar…' : 'Dela och skicka'}
          </button>
        </>
      }
    >
      <section class="share-section">
        <h3>Filer</h3>
        {candidates === null && <p class="share-note" role="status">Hämtar klara nedladdningar…</p>}
        {candidates?.length === 0 && (
          <p class="share-note">Det finns inga klara nedladdningar att dela. Förbered en nedladdning först; filen sparas i 7 dagar.</p>
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
        <h3>Mottagare</h3>
        <textarea
          rows={3}
          aria-label="Mottagare"
          placeholder="E-postadresser, åtskilda av komma eller radbrytning"
          value={recipientsText}
          onInput={(event) => setRecipientsText(event.currentTarget.value)}
        />
        <p class={`share-note${invalid.length > 0 || tooMany ? ' share-problem' : ''}`}>
          {invalid.length > 0
            ? `Ogiltig adress: ${invalid.join(', ')}`
            : tooMany
              ? `Högst ${MAX_RECIPIENTS} mottagare åt gången.`
              : valid.length === 0
                ? 'Alla med länken kan hämta filerna, så skicka den bara till rätt personer.'
                : valid.length === 1
                  ? '1 mottagare'
                  : `${valid.length} mottagare`}
        </p>
      </section>

      <section class="share-section">
        <h3>Meddelande (valfritt)</h3>
        <textarea
          rows={3}
          maxLength={MAX_MESSAGE}
          aria-label="Meddelande"
          placeholder="Visas i mejlet och på nedladdningssidan"
          value={message}
          onInput={(event) => setMessage(event.currentTarget.value)}
        />
      </section>

      <p class="share-note">Länken gäller i 7 dagar. Du kan återkalla den under Nedladdningar, och varje nedladdning loggas.</p>
      {error && <p class="share-note share-problem" role="alert">{error}</p>}
    </Modal>
  )
}
