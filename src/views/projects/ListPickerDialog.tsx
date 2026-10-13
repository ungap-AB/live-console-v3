import { plural, t } from '@lingui/core/macro'
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

// UNG-287: choose an agenda or name list other than the suggestion in New project. Search in the name and filter on used/unused, so it
// works with many lists too.
export function ListPickerDialog({ title, lists, loading, onPick, onCancel }: ListPickerDialogProps) {
  const [query, setQuery] = useState('')
  const [usage, setUsage] = useState<ListUsageFilter>('all')
  const shown = filterLists(lists, query, usage)

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={<button class="btn btn-sm" type="button" onClick={onCancel}>{t`Back`}</button>}
    >
      <div class="lp-filters">
        <input
          class="rename-input"
          type="search"
          placeholder={t`Search by name`}
          aria-label={t`Search by name`}
          value={query}
          autoFocus
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <select aria-label={t`Show`} value={usage} onChange={(event) => setUsage(event.currentTarget.value as ListUsageFilter)}>
          <option value="all">{t`All`}</option>
          <option value="unused">{t`Unused lists`}</option>
          <option value="used">{t`Used lists`}</option>
        </select>
      </div>
      {loading && <p class="cp-note">{t`Fetching…`}</p>}
      {!loading && shown.length === 0 && <p class="cp-note">{t`Nothing matches.`}</p>}
      <ul class="lp-list">
        {shown.map((list) => (
          <li key={list.id}>
            <button class="lp-row" type="button" onClick={() => onPick(list.id)}>
              <span class="lp-name">{list.name}</span>
              <span class="lp-meta">
                {formatShortDate(list.changedAt)} · {list.usedInProjects === 0 ? t`Unused` : plural(list.usedInProjects, { one: 'Used in # project', other: 'Used in # projects' })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
