import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { client } from '../../data'
import type { TrashItem, TrashItemType } from '../../data/types'
import { useResource } from '../../app/useResource'
import { Toast } from '../../components/Toast'
import { AgendaIcon, NameListIcon, ProjectIcon, RecordingIcon, SearchIcon } from '../../components/icons'
import './TrashView.css'

const TYPE_META: Record<TrashItemType, { label: string; icon: () => JSX.Element }> = {
  project: { label: 'Projekt', icon: ProjectIcon },
  agenda: { label: 'Dagordning', icon: AgendaIcon },
  namelist: { label: 'Namnlista', icon: NameListIcon },
  recording: { label: 'Inspelning', icon: RecordingIcon },
}

const TYPE_ORDER: TrashItemType[] = ['project', 'agenda', 'namelist', 'recording']

function daysLeft(purgeAt: string): number {
  const ms = new Date(purgeAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

function leftText(days: number): string {
  if (days === 0) return 'Rensas idag'
  if (days === 1) return 'Rensas imorgon'
  return `Rensas om ${days} dagar`
}

function urgency(days: number): 'urgent' | 'soon' | '' {
  if (days <= 2) return 'urgent'
  if (days <= 7) return 'soon'
  return ''
}

function formatPurgeDate(purgeAt: string): string {
  return new Date(purgeAt).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDeletedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

// retentionDays kan vara bråkdelar av en dag i utvecklingsmiljön (kort
// gallringstid för att testa purge-flödet), så visa i lämplig enhet istället
// för att alltid anta hela dagar.
function formatRetentionPeriod(days: number): string {
  if (days >= 1) {
    const rounded = Math.round(days)
    return rounded === 1 ? '1 dag' : `${rounded} dagar`
  }
  const totalMinutes = Math.round(days * 24 * 60)
  if (totalMinutes >= 60) {
    const hours = Math.round(totalMinutes / 60)
    return hours === 1 ? '1 timme' : `${hours} timmar`
  }
  return totalMinutes === 1 ? '1 minut' : `${totalMinutes} minuter`
}

interface Pending {
  item: TrashItem
  settled: boolean
}

export function TrashView() {
  const resource = useResource(() => client.trash.list(), [])
  const [items, setItems] = useState<TrashItem[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'alla' | TrashItemType>('alla')
  const [retentionDays, setRetentionDays] = useState<number | null>(null)
  const [toastItem, setToastItem] = useState<TrashItem | null>(null)
  const pendingRef = useRef<Pending | null>(null)

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

  const counts: Record<string, number> = { alla: items.length }
  for (const t of TYPE_ORDER) counts[t] = items.filter((i) => i.type === t).length

  function requestRestore(item: TrashItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    pendingRef.current = { item, settled: false }
    setToastItem(item)
  }

  function undoRestore() {
    const p = pendingRef.current
    if (!p || p.settled) return
    p.settled = true
    setItems((prev) => [p.item, ...prev])
    setToastItem(null)
  }

  function commitRestore() {
    const p = pendingRef.current
    if (!p || p.settled) return
    p.settled = true
    client.trash.restore(p.item.id)
    setToastItem(null)
  }

  return (
    <div class="view">
      <header>
        <div>
          <h1>Papperskorg</h1>
          <div class="sub">Borttaget material som ännu går att återställa</div>
        </div>
      </header>

      <div class="content">
        <section class="pane">
          <div class="top">
            <div class="search">
              <SearchIcon />
              <input
                type="search"
                placeholder="Sök i papperskorgen"
                aria-label="Sök i papperskorgen"
                value={query}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
            <div class="chips">
              <button type="button" aria-pressed={filter === 'alla'} onClick={() => setFilter('alla')}>
                Alla {counts.alla ? counts.alla : ''}
              </button>
              {TYPE_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={filter === t}
                  onClick={() => setFilter(t)}
                >
                  {TYPE_META[t].label}
                  {counts[t] ? ` ${counts[t]}` : ''}
                </button>
              ))}
            </div>
            <span class="count">
              {resource.loading
                ? 'Laddar…'
                : visible.length === items.length
                  ? `${items.length} poster`
                  : `${visible.length} av ${items.length} poster`}
            </span>
          </div>

          <ul class="rows">
            {!resource.loading && visible.length === 0 && (
              <li>
                <div class="empty">
                  <p>{items.length ? 'Ingen post matchar filtret.' : 'Papperskorgen är tom.'}</p>
                  {items.length === 0 && (
                    <p>Borttagna projekt, dagordningar, namnlistor och inspelningar hamnar här.</p>
                  )}
                </div>
              </li>
            )}
            {visible.map((i) => {
              const left = daysLeft(i.purgeAt)
              const u = urgency(left)
              const Icon = TYPE_META[i.type].icon
              return (
                <li key={i.id} class={u === 'urgent' ? 'soon' : ''}>
                  <span class="icon">
                    <Icon />
                  </span>
                  <span class="main">
                    <span class="nm">{i.name}</span>
                    <span class="meta">
                      <span class="type">{TYPE_META[i.type].label}</span>
                      <span>{i.detail}</span>
                      <span class="dot">·</span>
                      <span>
                        Borttagen {formatDeletedDate(i.deletedAt)} av {i.deletedBy.name}
                      </span>
                    </span>
                  </span>
                  <span class={`purge ${u}`}>
                    <span class="left">{leftText(left)}</span>
                    <span class="date">{formatPurgeDate(i.purgeAt)}</span>
                  </span>
                  <button class="btn btn-sm" type="button" onClick={() => requestRestore(i)}>
                    Återställ
                  </button>
                </li>
              )
            })}
          </ul>

          <div class="foot">
            Poster rensas automatiskt {retentionDays !== null ? formatRetentionPeriod(retentionDays) : '…'} efter att
            de tagits bort. Efter det går de inte att återställa.
          </div>
        </section>
      </div>

      {toastItem && (
        <Toast
          message={`${toastItem.name} återställd`}
          actionLabel="Ångra"
          onAction={undoRestore}
          onDismiss={commitRestore}
          durationMs={6000}
        />
      )}
    </div>
  )
}
