import { t } from '@lingui/core/macro'
import { Modal } from '../components/Modal'
import { markActivity } from './activity'

// UNG-312: shown shortly before the logout after 2 h without activity. Any activity (or the button) keeps the session.
export function InactivityWarning({ remainingMs }: { remainingMs: number }) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const stay = () => markActivity()
  return (
    <Modal title={t`Are you still there?`} onClose={stay}>
      <p>{t`You will be logged out in ${countdown} because there has been no activity in the console for almost 2 hours.`}</p>
      <div class="modal-actions">
        <button class="btn btn-sm btn-primary" type="button" onClick={stay}>
          {t`Stay logged in`}
        </button>
      </div>
    </Modal>
  )
}
