import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { client } from '../../data'
import type { TrashItem, TrashItemType } from '../../data/types'
import { useResource } from '../../app/useResource'
import { AgendaIcon, NameListIcon, ProjectIcon, RecordingIcon, SearchIcon } from '../../components/icons'
import './TrashView.css'

const TYPE_META: Record<TrashItemType, { label: MessageDescriptor; icon: () => JSX.Element }> = {
  project: { label: msg`Project`, icon: ProjectIcon },
  agenda: { label: msg`Agenda`, icon: AgendaIcon },
  namelist: { label: msg`Name list`, icon: NameListIcon },
  recording: { label: msg`Recording`, icon: RecordingIcon },
}

const TYPE_ORDER: TrashItemType[] = ['project', 'agenda', 'namelist', 'recording']

function daysLeft(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

// The text in the Purged column (the heading already says what it is about).
function leftText(days: number): string {
  if (days === 0) return t`today`
  if (days === 1) return t`tomorrow`
  return t`in ${days} days`
}

function urgency(days: number): 'urgent' | 'soon' | '' {
  if (days <= 2) return 'urgent'
  if (days <= 7) return 'soon'
  return ''
}

function formatPurgeDate(purgeAt: string): string {
  return new Date(purgeAt).toLocaleDateString(i18n.locales, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDeletedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(i18n.locales, { day: 'numeric', month: 'short', year: 'numeric' })
}

// retentionDays can be fractions of a day in development (a short retention
// period for testing the purge flow), so show a fitting unit instead of
// always assuming whole days.
function formatRetentionPeriod(days: number): string {
  if (days >= 1) {
    const rounded = Math.round(days)
    return plural(rounded, { one: '# day', other: '# days' })
  }
  const totalMinutes = Math.round(days * 24 * 60)
  if (totalMinutes >= 60) {
    const hours = Math.round(totalMinutes / 60)
    return plural(hours, { one: '# hour', other: '# hours' })
  }
  return plural(totalMinutes, { one: '# minute', other: '# minutes' })
}

export function TrashView() {
  const resource = useResource(() => client.trash.list(), [])
  const [items, setItems] = useState<TrashItem[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'alla' | TrashItemType>('alla')
  const [retentionDays, setRetentionDays] = useState<number | null>(null)

  useEffect(() => {
    if (resource.data) setItems(resource.data)
  }, [resource.data])

  useEffect(() => {
    client.trash.policy().then((p) => setRetentionDays(p.retentionDays))
  }, [])

  const q = query.trim().toLowerCase()
  const visible = items
    .filter((i) => filter === 'alla' || i.type === filter)
    .filter((i) => !q || (i.name + ' ' + i.detail).toLowerCase().includes(q))
    .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())

  const shown = visible.length
  const counts: Record<string, number> = { alla: items.length }
  for (const type of TYPE_ORDER) counts[type] = items.filter((i) => i.type === type).length

  const period = retentionDays !== null ? formatRetentionPeriod(retentionDays) : '…'

  async function restore(item: TrashItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      await client.trash.restore(item.id)
    } catch {
      setItems((prev) => [item, ...prev])
    }
  }

  return (
    <div class="view">
      <header>
        <div>
          <h1>{t`Trash`}</h1>
        </div>
      </header>

      <div class="content">
        <section class="trash-pane">
          <div class="trash-top">
            <div class="search">
              <SearchIcon />
              <input
                type="search"
                placeholder={t`Search the trash`}
                aria-label={t`Search the trash`}
                value={query}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
            <div class="chips">
              <button type="button" aria-pressed={filter === 'alla'} onClick={() => setFilter('alla')}>
                {t`All`} {counts.alla ? counts.alla : ''}
              </button>
              {TYPE_ORDER.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={filter === type}
                  onClick={() => setFilter(type)}
                >
                  {i18n._(TYPE_META[type].label)}
                  {counts[type] ? ` ${counts[type]}` : ''}
                </button>
              ))}
            </div>
            <span class="count">
              {resource.loading
                ? t`Loading…`
                : visible.length === items.length
                  ? plural(items.length, { one: '# item', other: '# items' })
                  : plural(items.length, { one: `${shown} of # item`, other: `${shown} of # items` })}
            </span>
          </div>

          {!resource.loading && visible.length === 0 ? (
            <div class="empty">
              <p>{items.length ? t`No item matches the filter.` : t`The trash is empty.`}</p>
              {items.length === 0 && (
                <p>{t`Deleted projects, agendas, name lists and recordings end up here.`}</p>
              )}
            </div>
          ) : (
            <div class="dl trash-list">
              <div class="dl-head" aria-hidden="true">
                <span class="dl-name">{t`Name`}</span>
                <span class="trash-col-type">{t`Type`}</span>
                <span class="trash-col-detail">{t`Contents`}</span>
                <span class="trash-col-deleted">{t`Deleted`}</span>
                <span class="trash-col-purge">{t`Purged`}</span>
                <span class="trash-col-actions" />
              </div>
              <ul class="dl-rows">
                {visible.map((i) => {
                  const left = daysLeft(i.purgeAt)
                  const u = urgency(left)
                  const Icon = TYPE_META[i.type].icon
                  const deletedOn = formatDeletedDate(i.deletedAt)
                  const deletedBy = i.deletedBy.name
                  return (
                    <li key={i.id} class={`dl-row${u === 'urgent' ? ' soon' : ''}`}>
                      <span class="dl-name">
                        <span class="dl-icon"><Icon /></span>
                        <span class="dl-title" title={i.name}>{i.name}</span>
                      </span>
                      <span class="dl-cell trash-col-type"><span class="type">{i18n._(TYPE_META[i.type].label)}</span></span>
                      <span class="dl-cell dl-muted trash-col-detail" title={i.detail}>{i.detail}</span>
                      <span class="dl-cell trash-col-deleted" title={t`Deleted ${deletedOn} by ${deletedBy}`}>
                        {formatDeletedDate(i.deletedAt)} <span class="dl-muted">· {i.deletedBy.name}</span>
                      </span>
                      <span class={`dl-cell trash-col-purge purge ${u}`} title={formatPurgeDate(i.purgeAt)}>{leftText(left)}</span>
                      <span class="dl-actions trash-col-actions">
                        <button class="btn btn-sm" type="button" onClick={() => restore(i)}>
                          {t`Restore`}
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div class="trash-foot">
            {t`Items are purged automatically ${period} after they were deleted. After that they cannot be restored.`}
          </div>
        </section>
      </div>
    </div>
  )
}
