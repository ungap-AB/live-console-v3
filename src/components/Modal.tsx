import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'
import './Modal.css'

interface ModalProps {
  title: string
  subtitle?: ComponentChildren
  onClose: () => void
  children: ComponentChildren
  footer?: ComponentChildren
  wide?: boolean
  /** Extra klass på .mbody, för vyer som behöver egen flex-layout (t.ex. TrimDialog). */
  bodyClassName?: string
}

export function Modal({ title, subtitle, onClose, children, footer, wide = false, bodyClassName }: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div class="scrim" onClick={onClose}>
      <div
        class={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="mhead">
          <div>
            <h2>{title}</h2>
            {subtitle && <div class="msub">{subtitle}</div>}
          </div>
          <button class="ib" type="button" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </div>
        <div class={`mbody ${bodyClassName ?? ''}`}>{children}</div>
        {footer && <div class="mfoot">{footer}</div>}
      </div>
    </div>
  )
}
