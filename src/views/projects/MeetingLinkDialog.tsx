import { t } from '@lingui/core/macro'
import { useState } from 'preact/hooks'
import { client } from '../../data'
import type { MeetingLinkState } from '../../data/types'
import { Modal } from '../../components/Modal'
import { parseMeetingId } from './meetingLink'

interface MeetingLinkDialogProps {
  projectId: string
  current: string | null
  onLinked: (state: MeetingLinkState) => void
  onClose: () => void
}

// UNG-338: link the project to a meeting in ungap Meeting by its id. Until Presenter can list the organisation's meetings
// (shared login), the id is pasted from the secretary view.
export function MeetingLinkDialog({ projectId, current, onLinked, onClose }: MeetingLinkDialogProps) {
  const [input, setInput] = useState(current ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const meetingId = parseMeetingId(input)

  async function save() {
    if (busy) return
    if (!meetingId) {
      setError(t`Paste the meeting's ID or the address of the meeting in ungap Meeting.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      onLinked(await client.projects.setMeetingLink(projectId, meetingId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t`Link ungap Meeting`}
      onClose={onClose}
      closeDisabled={busy}
      footer={(
        <>
          <button class="btn btn-sm" type="button" disabled={busy} onClick={onClose}>{t`Cancel`}</button>
          <button class="btn btn-sm btn-primary" type="button" disabled={busy || !input.trim()} onClick={() => void save()}>
            {busy ? t`Linking…` : t`Link`}
          </button>
        </>
      )}
    >
      <p>{t`The meeting's agenda items and speakers are played out in this project when the secretary opens an item or gives the floor in ungap Meeting.`} {t`It can take up to half a minute after linking before ungap Meeting starts sending.`}</p>
      <label class="fk-field">
        <span>{t`Meeting ID or address`}</span>
        <input
          type="text"
          value={input}
          placeholder="https://…/#meeting/…"
          autoFocus
          onInput={(event) => { setInput(event.currentTarget.value); setError('') }}
          onKeyDown={(event) => { if (event.key === 'Enter') void save() }}
        />
        <span class="fk-help">{t`Open the meeting in ungap Meeting and copy the address, or the ID at the end of it.`}</span>
      </label>
      {error && <p class="form-error" role="alert">{error}</p>}
    </Modal>
  )
}
