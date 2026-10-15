import { t } from '@lingui/core/macro'
import { Modal } from '../components/Modal'
import { markActivity } from './activity'

// UNG-312: shown shortly before the logout after 2 h without activity. Any activity (or the button) keeps the session.
/** m:ss until the logout. The texts are shared with the status strip's inline warning (UNG-322). */
function inactivityCountdown(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function inactivityText(remainingMs: number): string {
  const countdown = inactivityCountdown(remainingMs)
  return t`You will be logged out in ${countdown} because there has been no activity in the console for almost 2 hours.`
}

export function stayLoggedInLabel(): string {
  return t`Stay logged in`
}

export function InactivityWarning({ remainingMs }: { remainingMs: number }) {
  const stay = () => markActivity()
  return (
    <Modal title={t`Are you still there?`} onClose={stay}>
      <p>{inactivityText(remainingMs)}</p>
      <div class="modal-actions">
        <button class="btn btn-sm btn-primary" type="button" onClick={stay}>
          {stayLoggedInLabel()}
        </button>
      </div>
    </Modal>
  )
}
