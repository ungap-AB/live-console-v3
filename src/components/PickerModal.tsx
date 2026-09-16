import { Modal } from './Modal'
import { PlusIcon } from './icons'
import './PickerModal.css'

interface PickerItem {
  id: string
  name: string
}

interface PickerModalProps {
  title: string
  items: PickerItem[]
  selectedId: string | null
  noneLabel?: string
  onPick: (id: string | null) => void
  onCancel: () => void
  /** Visar ett "Ny lista"-alternativ överst som skapar en tom lista och kopplar in den direkt. */
  createNewLabel?: string
  onCreateNew?: () => void
}

export function PickerModal({
  title,
  items,
  selectedId,
  noneLabel = 'Ingen',
  onPick,
  onCancel,
  createNewLabel,
  onCreateNew,
}: PickerModalProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <ul class="picker-list">
        {onCreateNew && createNewLabel && (
          <li>
            <button type="button" class="picker-create" onClick={onCreateNew}>
              <PlusIcon />
              {createNewLabel}
            </button>
          </li>
        )}
        <li>
          <button type="button" class={selectedId === null ? 'sel' : ''} onClick={() => onPick(null)}>
            {noneLabel}
          </button>
        </li>
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" class={selectedId === item.id ? 'sel' : ''} onClick={() => onPick(item.id)}>
              {item.name}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
