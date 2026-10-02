import { useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { useDismiss } from '../app/useDismiss'
import { Icon } from './Icon'
import './OverflowMenu.css'

interface OverflowMenuItem {
  label: string
  onClick?: () => void | Promise<void>
  copyValue?: string
  danger?: boolean
  disabled?: boolean
  title?: string
  content?: ComponentChildren
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

  useDismiss(open, ref, () => setOpen(false))

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
            item.content ? (
              <div key={item.label} class="overflow-menu-content" role="menuitem">
                {item.content}
              </div>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                class={item.danger ? 'danger' : ''}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  setOpen(false)
                  if (item.copyValue) {
                    void navigator.clipboard.writeText(item.copyValue)
                  } else {
                    void item.onClick?.()
                  }
                }}
              >
                {item.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  )
}
