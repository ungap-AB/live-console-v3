import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from './Icon'
import './OverflowMenu.css'

interface OverflowMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  title?: string
}

interface OverflowMenuProps {
  items: OverflowMenuItem[]
  label?: string
}

// Generaliserad från .used-by-menu (AgendasView) — samma "..."-mönster
// återanvänds nu för objektnivåns destruktiva åtgärder (Radera projekt,
// Flytta till papperskorgen, Riv resurs), se granskningen 2026-09-17.
export function OverflowMenu({ items, label = 'Fler alternativ' }: OverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div class="overflow-menu" ref={ref}>
      <button
        class="ib"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more_vert" />
      </button>
      {open && (
        <div class="overflow-menu-list" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              class={item.danger ? 'danger' : ''}
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
