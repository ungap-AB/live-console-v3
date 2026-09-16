import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { SortableList } from './SortableList'
import { CheckIcon, DeleteIcon, EditIcon, CancelIcon } from './icons'

interface EditableItemListProps<T> {
  items: T[]
  getId: (item: T) => string
  getLabel: (item: T) => string
  onReorder: (nextItems: T[]) => void | Promise<void>
  /** Returnera det nya objektets id för att öppna det i redigeringsläge direkt (som Dagordningar/Namnlistor redan gjorde innan utbrytningen). */
  onAdd: () => string | void | Promise<string | void>
  onRename: (id: string, label: string) => void | Promise<void>
  onRemove: (id: string) => void | Promise<void>
  addLabel: string
  disabled?: boolean
  /** Agenda-punkter numreras (1. 2. 3. …), namnlistor gör det inte. */
  numbered?: boolean
  /** Extra innehåll per rad, t.ex. Playout-vyns spela ut-knapp. Visas bara i läsläge. */
  renderExtra?: (item: T) => ComponentChildren
  getItemClassName?: (item: T) => string
  hint?: string
}

// Bruten ut ur AgendasView/NameListsView (de var identiska förutom vilket
// fält som var "etiketten") — nu även återanvänd av Playout-vyn (bild 4 i
// UI-refinementet) med en extra play-knapp via renderExtra. Se
// SortableList.css för radlayouten (.no/.txt/.rowbtns/.addrow/.hint), redan
// medvetet delad innan den här utbrytningen gjordes.
export function EditableItemList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  onAdd,
  onRename,
  onRemove,
  addLabel,
  disabled = false,
  numbered = false,
  renderExtra,
  getItemClassName,
  hint,
}: EditableItemListProps<T>) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const confirmTimeoutRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(confirmTimeoutRef.current), [])

  // Ett nyss tillagt objekt finns inte i `items` förrän förälderns state
  // hunnit uppdateras (nästa render) — vänta in det innan redigeringsläget
  // öppnas, annars saknas draft-texten att fylla i.
  useEffect(() => {
    if (!pendingEditId) return
    const item = items.find((it) => getId(it) === pendingEditId)
    if (item) {
      setEditingId(pendingEditId)
      setDraft(getLabel(item))
      setPendingEditId(null)
    }
  }, [items, pendingEditId])

  async function handleAdd() {
    const newId = await onAdd()
    if (newId) setPendingEditId(newId)
  }

  function startEdit(item: T) {
    setEditingId(getId(item))
    setDraft(getLabel(item))
  }

  async function saveEdit(id: string) {
    if (!draft.trim()) return
    await onRename(id, draft.trim())
    setEditingId(null)
  }

  function requestRemove(id: string) {
    window.clearTimeout(confirmTimeoutRef.current)
    setConfirmingId(id)
    confirmTimeoutRef.current = window.setTimeout(() => setConfirmingId(null), 4000)
  }

  async function confirmRemove(id: string) {
    window.clearTimeout(confirmTimeoutRef.current)
    setConfirmingId(null)
    await onRemove(id)
    if (editingId === id) setEditingId(null)
  }

  return (
    <>
      <SortableList
        items={items}
        getId={getId}
        disabled={disabled}
        onReorder={onReorder}
        getItemClassName={getItemClassName}
        renderItem={(item, i) => {
          const id = getId(item)
          return editingId === id ? (
            <>
              {numbered && <span class="no">{i + 1}</span>}
              <span class="txt">
                <input
                  value={draft}
                  placeholder="Namn"
                  aria-label="Namn"
                  autoFocus
                  onInput={(e) => setDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              </span>
              <span class="rowbtns">
                <button class="ib" type="button" title="Spara" aria-label="Spara" onClick={() => saveEdit(id)}>
                  <CheckIcon />
                </button>
                <button
                  class="ib"
                  type="button"
                  title="Avbryt"
                  aria-label="Avbryt"
                  onClick={() => setEditingId(null)}
                >
                  <CancelIcon />
                </button>
              </span>
            </>
          ) : (
            <>
              {numbered && <span class="no">{i + 1}</span>}
              <span class="txt">
                <b>{getLabel(item)}</b>
              </span>
              {renderExtra?.(item)}
              <span class="rowbtns">
                <button
                  class="ib"
                  type="button"
                  title="Redigera"
                  aria-label="Redigera"
                  onClick={() => startEdit(item)}
                >
                  <EditIcon />
                </button>
                {confirmingId === id ? (
                  <button
                    class="ib del confirm"
                    type="button"
                    title="Bekräfta borttagning"
                    aria-label="Bekräfta borttagning"
                    onClick={() => confirmRemove(id)}
                  >
                    <CheckIcon />
                  </button>
                ) : (
                  <button
                    class="ib del"
                    type="button"
                    title="Ta bort"
                    aria-label="Ta bort"
                    onClick={() => requestRemove(id)}
                  >
                    <DeleteIcon />
                  </button>
                )}
              </span>
            </>
          )
        }}
      />
      <div class="addrow">
        <button class="btn btn-sm" type="button" onClick={() => void handleAdd()}>
          {addLabel}
        </button>
      </div>
      {hint && <p class="hint">{hint}</p>}
    </>
  )
}
