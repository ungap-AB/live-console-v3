import { Modal } from './Modal'
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
}

export function PickerModal({ title, items, selectedId, noneLabel = 'Ingen', onPick, onCancel }: PickerModalProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <ul class="picker-list">
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
