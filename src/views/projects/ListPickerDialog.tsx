import { useState } from 'preact/hooks'
import { Modal } from '../../components/Modal'
import { formatShortDate } from '../../app/time'
import { filterLists, type ListUsageFilter, type PickableList } from './createProjectLists'

interface ListPickerDialogProps {
  title: string
  lists: readonly PickableList[]
  loading: boolean
  onPick: (id: string) => void
  onCancel: () => void
}

// UNG-287: välj en annan dagordning eller namnlista än förslaget i Nytt projekt. Sök i namnet och filtrera på använd/oanvänd, så att det
// fungerar även med många listor.
export function ListPickerDialog({ title, lists, loading, onPick, onCancel }: ListPickerDialogProps) {
  const [query, setQuery] = useState('')
  const [usage, setUsage] = useState<ListUsageFilter>('all')
  const shown = filterLists(lists, query, usage)

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={<button class="btn btn-sm" type="button" onClick={onCancel}>Tillbaka</button>}
    >
      <div class="lp-filters">
        <input
          class="rename-input"
          type="search"
          placeholder="Sök på namn"
          aria-label="Sök på namn"
          value={query}
          autoFocus
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <select aria-label="Visa" value={usage} onChange={(event) => setUsage(event.currentTarget.value as ListUsageFilter)}>
          <option value="all">Alla</option>
          <option value="unused">Oanvända</option>
          <option value="used">Använda</option>
        </select>
      </div>
      {loading && <p class="cp-note">Hämtar…</p>}
      {!loading && shown.length === 0 && <p class="cp-note">Inget matchar.</p>}
      <ul class="lp-list">
        {shown.map((list) => (
          <li key={list.id}>
            <button class="lp-row" type="button" onClick={() => onPick(list.id)}>
              <span class="lp-name">{list.name}</span>
              <span class="lp-meta">
                {formatShortDate(list.changedAt)} · {list.usedInProjects === 0 ? 'Oanvänd' : `Används i ${list.usedInProjects} projekt`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
