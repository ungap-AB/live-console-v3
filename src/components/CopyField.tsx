import { useState } from 'preact/hooks'
import './CopyField.css'

interface CopyFieldProps {
  label?: string
  value: string | null
  placeholder?: string
  monospace?: boolean
  mask?: boolean
}

export function CopyField({ label, value, placeholder = '–', monospace = false, mask = false }: CopyFieldProps) {
  const [copied, setCopied] = useState(false)

  function fallbackCopy(text: string): boolean {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.left = '-9999px'
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(field)
    return ok
  }

  async function copy() {
    if (value == null) return
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value)
      else if (!fallbackCopy(value)) return
    } catch {
      if (!fallbackCopy(value)) return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const displayValue =
    value == null ? placeholder : mask ? '•'.repeat(Math.min(value.length, 24)) : value

  return (
    <div class="copy-field">
      {label && <div class="copy-field-label">{label}</div>}
      <div class="copy-field-row">
        <span class={`copy-field-value ${monospace ? 'mono' : ''} ${value == null ? 'placeholder' : ''}`}>
          {displayValue}
        </span>
        <button
          class="ib"
          type="button"
          onClick={copy}
          disabled={value == null}
          title="Kopiera"
          aria-label={`Kopiera ${label ?? 'värde'}`}
        >
          {copied ? '✓' : '⧉'}
        </button>
      </div>
    </div>
  )
}
