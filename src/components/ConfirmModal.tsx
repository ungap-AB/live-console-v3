import type { ComponentChildren } from 'preact'
import { Modal } from './Modal'

interface ConfirmModalProps {
  title: string
  children: ComponentChildren
  confirmLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmModal({
  title,
  children,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      {children}
      <div class="modal-actions">
        <button class="btn btn-sm" type="button" onClick={onCancel}>
          Avbryt
        </button>
        <button
          class={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
          type="button"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
