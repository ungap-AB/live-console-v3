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
  /** Extra kontroller (t.ex. filtrera/sortera) i samma rad som "Lägg till"-knappen, till vänster om den. */
  toolbarExtra?: ComponentChildren
  /** Extra kontroller som ska ligga efter "Lägg till"-knappen. */
  toolbarExtraAfter?: ComponentChildren
  /** Visas istället för listan när items är tom av ett annat skäl än att den faktiskt är tom (t.ex. ett aktivt filter utan träffar). */
  emptyMessage?: string
  /** Playout-specifik radinteraktion utan penn-/papperskorgsknappar. */
  compactInteractions?: boolean
  /** Dölj standardknappen för att låta en yttre meny starta samma åtgärd. */
  hideAddButton?: boolean
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
  toolbarExtra,
  toolbarExtraAfter,
  emptyMessage,
  compactInteractions = false,
  hideAddButton = false,
}: EditableItemListProps<T>) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [pendingEditId, setPendingEditId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const confirmTimeoutRef = useRef<number | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Håller alltid det senaste draft-värdet tillgängligt synkront (utan att
  // vänta på Preacts state-flush) — TAB/Lägg till-genvägarna behöver kunna
  // spara det som just skrevs innan de hoppar vidare till nästa rad.
  const draftRef = useRef('')
  draftRef.current = draft

  useEffect(() => () => window.clearTimeout(confirmTimeoutRef.current), [])

  useEffect(() => {
    if (!compactInteractions) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Backspace' || !selectedId || editingId) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT') return
      requestRemove(selectedId)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [compactInteractions, editingId, selectedId])

  // `autoFocus` är inte alltid pålitligt för ett fält som byts in i en
  // redan monterad rad (inte sidladdning) — sätt fokus imperativt istället
  // varje gång redigeringsläget faktiskt öppnas för en rad.
  useEffect(() => {
    if (editingId) inputRef.current?.focus()
  }, [editingId])

  // Ett nyss tillagt objekt finns inte i `items` förrän förälderns state
  // hunnit uppdateras (nästa render) — vänta in det innan redigeringsläget
  // öppnas. Fältet ska vara tomt (inte serverns platshållartitel som
  // "Ny punkt"/"Ny person") så man skriver in den riktiga titeln direkt.
  useEffect(() => {
    if (!pendingEditId) return
    const item = items.find((it) => getId(it) === pendingEditId)
    if (item) {
      setEditingId(pendingEditId)
      setDraft('')
      setPendingEditId(null)
    }
  }, [items, pendingEditId])

  // Sparar en pågående redigering (om någon) innan vi går vidare till att
  // lägga till en ny rad — annars tappas den bort tyst.
  async function saveCurrentEditIfAny() {
    if (!editingId) return
    if (draftRef.current.trim()) await onRename(editingId, draftRef.current.trim())
    setEditingId(null)
  }

  async function handleAdd() {
    await saveCurrentEditIfAny()
    const newId = await onAdd()
    if (newId) setPendingEditId(newId)
  }

  function startEdit(item: T) {
    setEditingId(getId(item))
    setDraft(getLabel(item))
  }

  async function saveEdit(id: string) {
    if (!draftRef.current.trim()) return
    await onRename(id, draftRef.current.trim())
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
      <div class="addrow">
        {toolbarExtra}
        {!hideAddButton && (
          <button class="btn btn-sm" type="button" onClick={() => void handleAdd()}>
            {addLabel}
          </button>
        )}
        {toolbarExtraAfter}
      </div>
      {items.length === 0 && emptyMessage ? (
        <p class="hint">{emptyMessage}</p>
      ) : (
      <SortableList
        items={items}
        getId={getId}
        disabled={disabled}
        onReorder={onReorder}
        getItemClassName={(item) => [getItemClassName?.(item) ?? '', compactInteractions && getId(item) === selectedId ? 'selected' : ''].filter(Boolean).join(' ')}
        onItemClick={compactInteractions ? (item) => setSelectedId(getId(item)) : undefined}
        renderItem={(item, i) => {
          const id = getId(item)
          return editingId === id ? (
            <>
              {numbered && <span class="no">{i + 1}</span>}
              <span class="txt">
                <input
                  ref={inputRef}
                  value={draft}
                  placeholder="Namn"
                  aria-label="Namn"
                  onInput={(e) => setDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(id)
                    if (e.key === 'Escape') setEditingId(null)
                    if (e.key === 'Tab' && !e.shiftKey) {
                      // Snabbinmatning: TAB sparar raden och hoppar direkt
                      // till en ny tom rad, som i ett kalkylark.
                      e.preventDefault()
                      void (async () => {
                        await saveEdit(id)
                        await handleAdd()
                      })()
                    }
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
                <b onDblClick={compactInteractions ? () => startEdit(item) : undefined}>{getLabel(item)}</b>
              </span>
              {renderExtra?.(item)}
              {!compactInteractions && <span class="rowbtns">
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
              </span>}
            </>
          )
        }}
      />
      )}
      {hint && <p class="hint">{hint}</p>}
    </>
  )
}
