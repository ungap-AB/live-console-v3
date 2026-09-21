import { useState } from 'preact/hooks'
import { ConfirmModal } from '../../components/ConfirmModal'
import type { PublicMode } from '../../data/types'
import { confirmationCopy } from './projectMode'

interface ModeChangeDialogProps {
  from: PublicMode
  to: PublicMode
  afterText: string
  onCancel: () => void
  /** afterText är satt när målläget är After — sparas tillsammans med lägesbytet. */
  onConfirm: (afterText?: string) => void
}

export function ModeChangeDialog({ from, to, afterText, onCancel, onConfirm }: ModeChangeDialogProps) {
  const copy = confirmationCopy(from, to)
  const [draft, setDraft] = useState(afterText)
  if (!copy) return null

  return (
    <ConfirmModal
      title={copy.title}
      confirmLabel={copy.confirmLabel}
      danger={copy.danger}
      onCancel={onCancel}
      onConfirm={() => onConfirm(copy.editsAfterText ? draft : undefined)}
    >
      <p>{copy.body}</p>
      {copy.editsAfterText && (
        <div class="mode-dialog-field">
          <label for="mode-dialog-after-text">After-meddelande</label>
          <textarea
            id="mode-dialog-after-text"
            rows={3}
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
          />
        </div>
      )}
    </ConfirmModal>
  )
}
