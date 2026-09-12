import type { ComponentChildren, JSX } from 'preact'
import { useState } from 'preact/hooks'
import './SortableList.css'

interface SortableListProps<T> {
  items: T[]
  getId: (item: T) => string
  onReorder: (nextItems: T[]) => void
  renderItem: (item: T, index: number) => ComponentChildren
  disabled?: boolean
}

export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  disabled = false,
}: SortableListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function handleDrop(e: JSX.TargetedDragEvent<HTMLLIElement>, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setOverIndex(null)
      return
    }
    const next = items.slice()
    const [moved] = next.splice(dragIndex, 1)
    next.splice(index, 0, moved)
    onReorder(next)
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <ol class="sortable-list">
      {items.map((item, index) => (
        <li
          key={getId(item)}
          draggable={!disabled}
          class={[
            dragIndex === index ? 'dragging' : '',
            overIndex === index && dragIndex !== index ? 'over' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onDragStart={() => setDragIndex(index)}
          onDragOver={(e) => {
            e.preventDefault()
            setOverIndex(index)
          }}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={() => {
            setDragIndex(null)
            setOverIndex(null)
          }}
        >
          {!disabled && (
            <span class="grip" aria-hidden="true">
              ⠿
            </span>
          )}
          {renderItem(item, index)}
        </li>
      ))}
    </ol>
  )
}
