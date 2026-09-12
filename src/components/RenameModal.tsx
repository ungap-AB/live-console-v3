import { useState } from 'preact/hooks'
import { Modal } from './Modal'

interface RenameModalProps {
  title?: string
  initialValue: string
  onCancel: () => void
  onSave: (value: string) => void
}

export function RenameModal({ title = 'Byt namn', initialValue, onCancel, onSave }: RenameModalProps) {
  const [value, setValue] = useState(initialValue)
  const trimmed = value.trim()

  return (
    <Modal title={title} onClose={onCancel}>
      <input
        class="rename-input"
        value={value}
        autoFocus
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && trimmed) onSave(trimmed)
        }}
      />
      <div class="modal-actions">
        <button class="btn btn-sm" type="button" onClick={onCancel}>
          Avbryt
        </button>
        <button
          class="btn btn-sm btn-primary"
          type="button"
          disabled={!trimmed}
          onClick={() => onSave(trimmed)}
        >
          Spara
        </button>
      </div>
    </Modal>
  )
}
